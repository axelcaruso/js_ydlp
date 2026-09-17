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
    clientVersion: '21.26.364',
    androidSdkVersion: 30,
    userAgent: 'com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip',
    osName: 'Android',
    osVersion: '11',
    platform: 'MOBILE'
  },
  IOS: {
    clientName: 'IOS',
    clientVersion: '21.26.4',
    deviceMake: 'Apple',
    deviceModel: 'iPhone16,2',
    userAgent: 'com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    osName: 'iPhone',
    osVersion: '18.3.2.22D82',
    platform: 'MOBILE'
  },
  WEB: {
    clientName: 'WEB',
    clientVersion: '2.20260708.00.00',
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

export const INNERTUBE_CLIENT_IDS = {
  WEB: '1',
  MWEB: '2',
  ANDROID: '3',
  IOS: '5',
  TVHTML5: '7',
  WEB_EMBEDDED_PLAYER: '56',
  WEB_REMIX: '67',
  VISIONOS: '101'
};

export const DEFAULT_INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

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
    this.innertubeApiKey = DEFAULT_INNERTUBE_KEY;
  }

  /**
   * Calls a YouTube Innertube API endpoint.
   *
   * @param {string} endpoint - API path, e.g. 'player', 'next', 'browse'.
   * @param {string} clientName - Innertube client identifier ('ANDROID', 'IOS', 'WEB', etc.).
   * @param {object} payload - Request payload data.
   * @param {Record<string, string>} [headers] - Additional HTTP headers.
   * @param {string} [apiKey] - Optional custom Innertube API key.
   * @returns {Promise<any>}
   */
  async _call_innertube(endpoint, clientName = 'ANDROID', payload = {}, headers = {}, apiKey = null) {
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

    const key = apiKey || this.innertubeApiKey || DEFAULT_INNERTUBE_KEY;
    const targetUrl = `${this.apiBase}/${endpoint}?key=${encodeURIComponent(key)}&prettyPrint=false`;

    const clientNum = INNERTUBE_CLIENT_IDS[clientConfig.clientName] || clientConfig.clientName;
    const reqHeaders = {
      'Content-Type': 'application/json',
      'X-YouTube-Client-Name': clientNum,
      'X-YouTube-Client-Version': clientConfig.clientVersion,
      'User-Agent': clientConfig.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ...headers
    };

    if (clientName === 'WEB' || clientName === 'TV_EMBEDDED') {
      reqHeaders.Origin = 'https://www.youtube.com';
    }

    const req = new Request(targetUrl, {
      method: 'POST',
      headers: reqHeaders,
      data: body
    });

    return await this._download_json(req, payload.videoId || '', `Calling Innertube ${endpoint} (${clientName})`);
  }
}
