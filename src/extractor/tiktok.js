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

import crypto from 'node:crypto';
import { InfoExtractor } from './common.js';
import { traverse_obj } from '../utils/traversal.js';
import { int_or_none, ExtractorError, determine_ext } from '../utils/index.js';
import { Request } from '../networking/Request.js';
import { CookieJar } from '../networking/CookieJar.js';

/**
 * TikTok video information extractor.
 * 1:1 architectural port of yt-dlp TikTokIE with native WAF challenge solver
 * and automatic unwatermarked stream extraction.
 */
export class TikTokIE extends InfoExtractor {
  static IE_NAME = 'tiktok';
  static IE_DESC = 'TikTok.com';
  static _VALID_URL = /https?:\/\/(?:(?:www|m)\.)?tiktok\.com\/(?:embed|(?:share|@(?<user_id>[\w.-]+)?)\/video)\/(?<id>\d+)|https?:\/\/(?:vm|vt)\.tiktok\.com\/(?<short_id>[\w.-]+)|https?:\/\/(?:www\.)?tiktok\.com\/t\/(?<t_id>[\w.-]+)/;
  static _WEIGHT = 90;

  constructor(ydl = null) {
    super(ydl);
  }

  /**
   * Solves TikTok's SHA-256 Proof-of-Work WAF challenge.
   * Matches yt-dlp _solve_challenge_and_set_cookies implementation.
   *
   * @param {string} webpage - HTML containing the challenge.
   * @returns {string|null} Solved cookie string.
   */
  _solve_challenge(webpage) {
    const csMatch = webpage.match(/<p[^>]+\bid="cs"[^>]*class="([^"]+)"/);
    const wciMatch = webpage.match(/<p[^>]+\bid="wci"[^>]*class="([^"]+)"/);
    const rciMatch = webpage.match(/<p[^>]+\bid="rci"[^>]*class="([^"]*)"/);
    const rsMatch = webpage.match(/<p[^>]+\bid="rs"[^>]*class="([^"]*)"/);

    if (!csMatch) {
      return null;
    }

    const rawCs = csMatch[1];
    const b64Data = rawCs.endsWith('===') ? rawCs : rawCs + '===';
    let challengeData;
    try {
      challengeData = JSON.parse(Buffer.from(b64Data, 'base64').toString('utf8'));
    } catch {
      return null;
    }

    const expectedDigest = Buffer.from(challengeData.v?.c || '', 'base64');
    const baseA = Buffer.from(challengeData.v?.a || '', 'base64');

    if (!expectedDigest.length || !baseA.length) {
      return null;
    }

    let solvedNumber = null;
    for (let i = 0; i <= 1000000; i++) {
      const testHash = crypto.createHash('sha256').update(baseA).update(String(i)).digest();
      if (testHash.equals(expectedDigest)) {
        solvedNumber = i;
        break;
      }
    }

    if (solvedNumber === null) {
      throw new ExtractorError('Unable to solve TikTok JS challenge within 1,000,000 iterations');
    }

    challengeData.d = Buffer.from(String(solvedNumber)).toString('base64');
    const wciValue = Buffer.from(JSON.stringify(challengeData)).toString('base64');
    const wciName = wciMatch ? wciMatch[1] : '_wafchallengeid';
    const rciName = rciMatch ? rciMatch[1] : null;
    const rciValue = rsMatch ? rsMatch[1] : null;

    let cookieStr = `${wciName}=${wciValue}`;
    if (rciName && rciValue) {
      cookieStr += `; ${rciName}=${rciValue}`;
    }

    // Set cookie into director's CookieJar
    const expireTime = Date.now() + 120000;
    this.cookiejar.setCookie(wciName, wciValue, '.tiktok.com', { expires: new Date(expireTime) });
    if (rciName && rciValue) {
      this.cookiejar.setCookie(rciName, rciValue, '.tiktok.com', { expires: new Date(expireTime) });
    }

    return cookieStr;
  }

  /**
   * Resolves short links (vm.tiktok.com, vt.tiktok.com, tiktok.com/t/) to canonical video URL.
   *
   * @param {string} url - Short URL.
   * @returns {Promise<string>} Canonical URL.
   */
  async _resolve_short_url(url) {
    const res = await this.director.send(url, {
      method: 'HEAD',
      redirect: 'manual'
    });

    const location = res.headers.get('location');
    if (location) {
      return location.startsWith('http') ? location : `https://www.tiktok.com${location}`;
    }
    if (res.url && res.url !== url) {
      return res.url;
    }
    return url;
  }

  /**
   * Extracts JSON hydration data from HTML webpage.
   * Checks __UNIVERSAL_DATA_FOR_REHYDRATION__ and SIGI_STATE.
   *
   * @param {string} html - HTML string.
   * @param {string} videoId - Video ID.
   * @returns {object|null} Extracted video itemStruct.
   */
  _extract_item_struct(html, videoId) {
    // 1. Universal Data for Rehydration
    const uniMatch = html.match(/<script[^>]+\bid="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]+?)<\/script>/);
    if (uniMatch) {
      try {
        const d = JSON.parse(uniMatch[1]);
        const defaultScope = d['__DEFAULT_SCOPE__'] || {};
        const videoDetail = defaultScope['webapp.video-detail'];
        if (videoDetail?.statusCode === 0 && videoDetail?.itemInfo?.itemStruct) {
          return videoDetail.itemInfo.itemStruct;
        }
      } catch {}
    }

    // 2. SIGI_STATE
    const sigiMatch = html.match(/<script[^>]+\bid="(?:SIGI_STATE|sigi-persisted-data)"[^>]*>([\s\S]+?)<\/script>/);
    if (sigiMatch) {
      try {
        const sigi = JSON.parse(sigiMatch[1]);
        const itemModule = sigi.ItemModule || {};
        if (itemModule[videoId]) {
          return itemModule[videoId];
        }
        const firstKey = Object.keys(itemModule)[0];
        if (firstKey && itemModule[firstKey]) {
          return itemModule[firstKey];
        }
      } catch {}
    }

    return null;
  }

  /**
   * Extracts media formats from TikTok video data dictionary.
   * Prioritizes unwatermarked streams (playAddr, bitrateInfo) over watermarked (downloadAddr).
   * 1:1 with yt-dlp _extract_web_formats.
   *
   * @param {object} itemStruct - TikTok video dictionary.
   * @returns {Array<object>} List of media formats.
   */
  _extract_web_formats(itemStruct) {
    const video = itemStruct.video || {};
    const formats = [];
    const width = int_or_none(video.width);
    const height = int_or_none(video.height);

    const commonHeaders = {
      Referer: 'https://www.tiktok.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    };

    // 1. Unwatermarked adaptive bitrates from bitrateInfo
    if (Array.isArray(video.bitrateInfo)) {
      for (const b of video.bitrateInfo) {
        const playAddr = b.PlayAddr || {};
        const urls = playAddr.UrlList || [];
        const quality = b.GearName || 'adaptive';
        const bitrate = int_or_none(b.Bitrate);
        const codecType = (b.CodecType || '').toLowerCase();
        const isHevc = codecType.includes('265') || codecType.includes('hvc') || codecType.includes('bytevc1') || (playAddr.UrlKey || '').includes('bytevc1');
        const vcodec = isHevc ? 'hevc' : 'h264';
        const itemWidth = int_or_none(playAddr.Width) || width || null;
        const itemHeight = int_or_none(playAddr.Height) || height || null;

        for (let i = 0; i < urls.length; i++) {
          const u = urls[i];
          if (!u) continue;
          formats.push({
            format_id: `${quality}${urls.length > 1 ? `_${i}` : ''}`,
            url: u,
            ext: 'mp4',
            vcodec,
            acodec: 'aac',
            width: itemWidth,
            height: itemHeight,
            tbr: bitrate ? Math.round(bitrate / 1000) : null,
            filesize: int_or_none(playAddr.DataSize),
            format_note: isHevc ? 'Direct playback (HEVC, No watermark)' : 'Direct playback (H.264, No watermark)',
            preference: isHevc ? 1 : 1.5, // Prefer native H.264 over HEVC for broad player compatibility
            http_headers: commonHeaders
          });
        }
      }
    }

    // 2. Unwatermarked primary playback address (playAddr)
    if (video.playAddr) {
      const primaryCodec = (video.codecType || '').toLowerCase();
      const isPrimaryHevc = primaryCodec.includes('265') || primaryCodec.includes('hvc') || primaryCodec.includes('bytevc1');
      formats.push({
        format_id: 'play',
        url: video.playAddr,
        ext: 'mp4',
        vcodec: isPrimaryHevc ? 'hevc' : 'h264',
        acodec: 'aac',
        width: width || null,
        height: height || null,
        format_note: 'Direct video (No watermark)',
        preference: 2, // Highest priority: default format selected
        http_headers: commonHeaders
      });
    }

    // 3. Watermarked fallback download address (downloadAddr)
    if (video.downloadAddr) {
      formats.push({
        format_id: 'download_watermarked',
        url: video.downloadAddr,
        ext: 'mp4',
        vcodec: 'h264',
        acodec: 'aac',
        width: width || null,
        height: height || null,
        format_note: 'Watermarked download',
        preference: -2, // Explicitly deprioritized matching yt-dlp
        http_headers: commonHeaders
      });
    }

    // 4. Standalone audio track from music object
    const music = itemStruct.music || {};
    const audioUrl = music.playUrl || music.play_url;
    if (audioUrl) {
      formats.push({
        format_id: 'audio',
        url: audioUrl,
        ext: 'm4a',
        vcodec: 'none',
        acodec: 'aac',
        tbr: 128,
        format_note: 'Music track',
        preference: 0,
        http_headers: commonHeaders
      });
    }

    this._sort_formats(formats);
    return formats;
  }

  /**
   * Main extractor execution for TikTok URLs.
   *
   * @param {string} url - TikTok URL.
   * @returns {Promise<object>} Extracted media information dictionary.
   */
  async _real_extract(url) {
    let resolvedUrl = url;
    if (url.includes('vm.tiktok.com') || url.includes('vt.tiktok.com') || url.includes('/t/')) {
      this.to_screen(`[tiktok] Resolving short URL: ${url}`);
      resolvedUrl = await this._resolve_short_url(url);
    }

    const match = resolvedUrl.match(this.constructor._VALID_URL);
    if (!match) {
      throw new ExtractorError(`Could not parse TikTok video URL: ${url}`);
    }

    const videoId = match.groups?.id || match.groups?.short_id || match.groups?.t_id;
    if (!videoId) {
      throw new ExtractorError(`Could not extract video ID from ${url}`);
    }

    const canonicalUrl = `https://www.tiktok.com/@${match.groups?.user_id || '_'}/video/${videoId}`;

    // 1. Fetch webpage
    this.to_screen(`[tiktok] ${videoId}: Downloading webpage`);
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    };

    const req1 = new Request(canonicalUrl, { headers: defaultHeaders });
    let webpage = await this._download_webpage(req1, videoId, 'Downloading webpage');
    let itemStruct = this._extract_item_struct(webpage, videoId);

    // 2. Solve WAF Challenge if present and retry
    if (!itemStruct && webpage.includes('id="cs"')) {
      this.to_screen(`[tiktok] ${videoId}: Solving JS proof-of-work challenge`);
      const cookieStr = this._solve_challenge(webpage);

      this.to_screen(`[tiktok] ${videoId}: Retrying with challenge cookie`);
      const req2 = new Request(canonicalUrl, {
        headers: {
          ...defaultHeaders,
          Cookie: cookieStr
        }
      });
      webpage = await this._download_webpage(req2, videoId, 'Downloading webpage with challenge cookie');
      itemStruct = this._extract_item_struct(webpage, videoId);
    }

    if (!itemStruct) {
      throw new ExtractorError(`[tiktok] ${videoId}: Unable to extract video data (post may be private, removed or geo-restricted)`);
    }

    const author = itemStruct.author || {};
    const music = itemStruct.music || {};
    const stats = itemStruct.stats || {};
    const video = itemStruct.video || {};

    const formats = this._extract_web_formats(itemStruct);

    const thumbnails = [];
    if (video.cover) thumbnails.push({ id: 'cover', url: video.cover });
    if (video.originCover) thumbnails.push({ id: 'originCover', url: video.originCover });
    if (video.dynamicCover) thumbnails.push({ id: 'dynamicCover', url: video.dynamicCover });

    return {
      id: videoId,
      title: itemStruct.desc || `TikTok video #${videoId}`,
      description: itemStruct.desc || '',
      uploader: author.uniqueId || author.nickname || 'tiktok',
      uploader_id: author.id || null,
      channel: author.nickname || null,
      channel_id: author.secUid || null,
      channel_url: author.uniqueId ? `https://www.tiktok.com/@${author.uniqueId}` : null,
      uploader_url: author.uniqueId ? `https://www.tiktok.com/@${author.uniqueId}` : null,
      duration: int_or_none(video.duration),
      timestamp: int_or_none(itemStruct.createTime),
      view_count: int_or_none(stats.playCount),
      like_count: int_or_none(stats.diggCount),
      comment_count: int_or_none(stats.commentCount),
      repost_count: int_or_none(stats.shareCount),
      save_count: int_or_none(stats.collectCount),
      track: music.title || null,
      artist: music.authorName || null,
      album: music.album || null,
      thumbnails,
      formats,
      webpage_url: canonicalUrl,
      http_headers: {
        Referer: 'https://www.tiktok.com/'
      }
    };
  }
}
