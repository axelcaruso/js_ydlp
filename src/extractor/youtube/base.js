/**
 * js_ydlp - High-performance 1:1 Vanilla JavaScript port of yt-dlp
 *
 * Copyright (c) 2026 Axel Caruso and js_ydlp contributors.
 * Derived from and inspired by yt-dlp (https://github.com/yt-dlp/yt-dlp).
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * ====================================================================
 * OPEN AI STATEMENT:
 * This project openly supports, embraces, and encourages the use of
 * Artificial Intelligence (AI) and AI-assisted tooling in design,
 * development, testing, and maintenance.
 * ====================================================================
 */

import { InfoExtractor } from '../common.js';
import { PoTokenProvider } from './pot.js';
import { YoutubeSigSolver } from './sig.js';
import { Request } from '../../networking/Request.js';

export const INNERTUBE_CLIENTS = {
  ANDROID: {
    clientName: 'ANDROID',
    clientVersion: '19.29.37',
    androidSdkVersion: 30,
    osName: 'Android',
    osVersion: '12',
    platform: 'MOBILE'
  },
  IOS: {
    clientName: 'IOS',
    clientVersion: '19.29.1',
    deviceModel: 'iPhone14,3',
    osName: 'iOS',
    osVersion: '17.5.1',
    platform: 'MOBILE'
  },
  WEB: {
    clientName: 'WEB',
    clientVersion: '2.20240101.00.00',
    osName: 'Windows',
    osVersion: '10.0',
    platform: 'DESKTOP'
  },
  TV_EMBEDDED: {
    clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    clientVersion: '2.0',
    platform: 'TV'
  }
};

/**
 * Base extractor for YouTube services handling Innertube API queries.
 * 1:1 with yt-dlp YoutubeBaseInfoExtractor.
 */
export class YoutubeBaseInfoExtractor extends InfoExtractor {
  static IE_NAME = 'youtube';

  constructor(ydl = null) {
    super(ydl);
    this.potProvider = new PoTokenProvider();
    this.sigSolver = new YoutubeSigSolver();
    this.apiBase = 'https://www.youtube.com/youtubei/v1';
  }

  /**
   * Calls a YouTube Innertube API endpoint.
   *
   * @param {string} endpoint - API path, e.g. 'player', 'next', 'browse'.
   * @param {string} clientName - Innertube client identifier ('ANDROID', 'IOS', 'WEB', etc.).
   * @param {object} payload - Request payload data.
   * @param {Record<string, string>} [headers] - Additional HTTP headers.
   * @returns {Promise<any>}
   */
  async _call_innertube(endpoint, clientName = 'ANDROID', payload = {}, headers = {}) {
    const clientConfig = INNERTUBE_CLIENTS[clientName] || INNERTUBE_CLIENTS.ANDROID;
    const body = {
      context: {
        client: {
          hl: 'en',
          gl: 'US',
          ...clientConfig
        },
        user: {
          lockedSafetyMode: false
        }
      },
      ...payload
    };

    const poToken = this.potProvider.getPlayerPoToken();
    if (poToken && body.context && body.context.serviceIntegrityDimensions) {
      body.context.serviceIntegrityDimensions.poToken = poToken;
    }

    const targetUrl = `${this.apiBase}/${endpoint}?prettyPrint=false`;
    const req = new Request(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': clientConfig.clientName,
        'X-YouTube-Client-Version': clientConfig.clientVersion,
        'Origin': 'https://www.youtube.com',
        ...headers
      },
      data: body
    });

    return await this._download_json(req, payload.videoId || '', `Calling Innertube ${endpoint} (${clientName})`);
  }
}
