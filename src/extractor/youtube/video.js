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

import { YoutubeBaseInfoExtractor } from './base.js';
import { traverse_obj } from '../../utils/traversal.js';
import { int_or_none, mimetype2ext, ExtractorError } from '../../utils/common.js';
import { determine_protocol } from '../../utils/networking.js';

/**
 * YouTube video information extractor.
 * 1:1 with yt-dlp YoutubeIE.
 */
export class YoutubeIE extends YoutubeBaseInfoExtractor {
  static IE_NAME = 'youtube';
  static IE_DESC = 'YouTube.com';
  static _VALID_URL = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|(?:embed|v|shorts|live)\/)|youtu\.be\/)(?<id>[a-zA-Z0-9_-]{11})/;
  static _WEIGHT = 100;

  /**
   * Extracts the 11-character video ID from a YouTube URL.
   * @param {string} url
   * @returns {string|null}
   */
  _extract_id(url) {
    const match = url.match(this.constructor._VALID_URL);
    return match && match.groups ? match.groups.id : null;
  }

  /**
   * Parses codec information from a mimeType string.
   * @param {string} mimeType
   * @returns {{ vcodec: string, acodec: string }}
   */
  _parse_codecs_from_mime(mimeType) {
    if (!mimeType) return { vcodec: 'none', acodec: 'none' };
    const codecsMatch = mimeType.match(/codecs="([^"]+)"/);
    if (!codecsMatch) {
      if (mimeType.startsWith('video/')) return { vcodec: 'unknown', acodec: 'none' };
      if (mimeType.startsWith('audio/')) return { vcodec: 'none', acodec: 'unknown' };
      return { vcodec: 'none', acodec: 'none' };
    }

    const codecs = codecsMatch[1].split(',').map((c) => c.trim());
    if (mimeType.startsWith('video/')) {
      return {
        vcodec: codecs[0] || 'unknown',
        acodec: codecs[1] || 'none'
      };
    }
    return {
      vcodec: 'none',
      acodec: codecs[0] || 'unknown'
    };
  }

  /**
   * Main extractor execution for YouTube video URLs.
   * @param {string} url
   * @returns {Promise<object>}
   */
  async _real_extract(url) {
    const videoId = this._extract_id(url);
    if (!videoId) {
      throw new ExtractorError(`Could not extract video ID from ${url}`);
    }

    // Extract visitorData session token from webpage to bypass YouTube bot detection
    let visitorData = null;
    let apiKey = null;

    try {
      const webpageUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const webpage = await this._download_webpage(webpageUrl, videoId, 'Downloading webpage', false);
      if (webpage) {
        const ytcfgMatch = webpage.match(/ytcfg\.set\s*\(\s*({.+?})\s*\)\s*;/);
        if (ytcfgMatch) {
          try {
            const cfg = JSON.parse(ytcfgMatch[1]);
            visitorData = cfg.VISITOR_DATA || null;
            apiKey = cfg.INNERTUBE_API_KEY || null;
          } catch {}
        }
      }
    } catch {}

    // Call Innertube player endpoint with client fallback cascade
    const payload = {
      videoId,
      contentCheckOk: true,
      racyCheckOk: true
    };

    const clients = ['ANDROID', 'IOS', 'WEB'];
    let playerResponse = null;
    let lastError = null;

    for (const client of clients) {
      try {
        const res = await this._call_innertube('player', client, payload, {}, apiKey, visitorData);
        const status = res?.playabilityStatus?.status;
        if (status === 'OK') {
          playerResponse = res;
          break;
        }
        lastError = res?.playabilityStatus?.reason || res?.playabilityStatus?.messages?.join(', ') || status;
      } catch (err) {
        lastError = err.message;
      }
    }

    if (!playerResponse) {
      throw new ExtractorError(`[youtube] ${videoId}: ${lastError || 'Video unavailable'}`);
    }

    const videoDetails = playerResponse.videoDetails || {};
    const title = videoDetails.title || 'YouTube Video';
    const channel = videoDetails.author || null;
    const channelId = videoDetails.channelId || null;
    const duration = int_or_none(videoDetails.lengthSeconds);
    const viewCount = int_or_none(videoDetails.viewCount);
    const description = videoDetails.shortDescription || '';
    const thumbnails = traverse_obj(videoDetails, ['thumbnail', 'thumbnails']) || [];

    const formats = [];
    const streamingData = playerResponse.streamingData || {};
    const rawFormats = [
      ...(streamingData.formats || []),
      ...(streamingData.adaptiveFormats || [])
    ];

    for (const fmt of rawFormats) {
      let formatUrl = fmt.url;

      // Handle signature cipher if present
      if (!formatUrl && (fmt.signatureCipher || fmt.cipher)) {
        const cipherStr = fmt.signatureCipher || fmt.cipher;
        const params = new URLSearchParams(cipherStr);
        const rawUrl = params.get('url');
        const s = params.get('s');
        const sp = params.get('sp') || 'sig';

        if (rawUrl) {
          if (s) {
            // Decipher signature if solver has operations
            const sig = this.sigSolver.decipher(s, []);
            formatUrl = `${rawUrl}&${sp}=${encodeURIComponent(sig)}`;
          } else {
            formatUrl = rawUrl;
          }
        }
      }

      if (!formatUrl) continue;

      const mimeType = fmt.mimeType || '';
      const { vcodec, acodec } = this._parse_codecs_from_mime(mimeType);
      const ext = mimetype2ext(mimeType) || 'mp4';

      formats.push({
        format_id: String(fmt.itag),
        url: formatUrl,
        ext,
        width: fmt.width || null,
        height: fmt.height || null,
        fps: fmt.fps || null,
        vcodec,
        acodec,
        tbr: fmt.bitrate ? Math.round(fmt.bitrate / 1000) : null,
        filesize: int_or_none(fmt.contentLength),
        format_note: fmt.qualityLabel || fmt.quality || null,
        protocol: determine_protocol(formatUrl)
      });
    }

    this._sort_formats(formats);

    const captions = traverse_obj(playerResponse, ['captions', 'playerCaptionsTracklistRenderer', 'captionTracks']) || [];

    return {
      id: videoId,
      title,
      description,
      channel,
      channel_id: channelId,
      uploader: channel,
      uploader_id: channelId,
      duration,
      view_count: viewCount,
      thumbnails,
      formats,
      captions,
      webpage_url: `https://www.youtube.com/watch?v=${videoId}`
    };
  }
}
