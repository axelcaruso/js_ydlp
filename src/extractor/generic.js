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

import { InfoExtractor } from './common.js';
import { determine_ext, determine_protocol, urljoin } from '../utils/networking.js';
import { clean_html, unescapeHTML } from '../utils/common.js';

/**
 * Generic fallback extractor for direct media URLs and arbitrary HTML5 video pages.
 * 1:1 with yt-dlp GenericIE.
 */
export class GenericIE extends InfoExtractor {
  static IE_NAME = 'generic';
  static IE_DESC = 'Generic HTML5 and direct media extractor';
  static _VALID_URL = /.+/;
  static _WEIGHT = 10; // Low priority fallback

  async _real_extract(url) {
    const ext = determine_ext(url);
    const mediaExtensions = new Set(['mp4', 'webm', 'mkv', 'flv', 'ogg', 'ogv', 'mp3', 'm4a', 'aac', 'wav', 'opus']);

    // 1. Direct media URL detection
    if (mediaExtensions.has(ext)) {
      const u = new URL(url);
      const filename = u.pathname.split('/').pop() || 'video';
      const id = filename.replace(/\.[^.]+$/, '') || 'media';

      return {
        id,
        title: id,
        url,
        ext,
        protocol: determine_protocol(url),
        formats: [
          {
            format_id: 'direct',
            url,
            ext,
            protocol: determine_protocol(url)
          }
        ]
      };
    }

    // 2. Webpage HTML scraping
    const webpage = await this._download_webpage(url, 'generic', 'Downloading webpage HTML');

    // Title resolution
    let title = this._html_search_meta(['og:title', 'twitter:title'], webpage, 'title', null);
    if (!title) {
      title = this._search_regex(/<title[^>]*>([^<]+)<\/title>/i, webpage, 'title', 'Untitled video', false);
    }
    title = clean_html(unescapeHTML(title));

    // Description resolution
    const description = this._html_search_meta(['og:description', 'twitter:description', 'description'], webpage, 'description');

    // Thumbnail resolution
    const thumbnail = this._html_search_meta(['og:image', 'twitter:image'], webpage, 'thumbnail');

    // Extract formats from HTML5 video and source tags
    const formats = [];
    const sourceRegex = /<(?:video|source)[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match;

    while ((match = sourceRegex.exec(webpage)) !== null) {
      const rawSrc = match[1];
      const videoSrc = urljoin(url, rawSrc);
      const videoExt = determine_ext(videoSrc);

      formats.push({
        format_id: `http-${videoExt}`,
        url: videoSrc,
        ext: videoExt,
        protocol: determine_protocol(videoSrc)
      });
    }

    // Check og:video
    const ogVideo = this._html_search_meta(['og:video', 'og:video:url', 'og:video:secure_url'], webpage, 'og:video');
    if (ogVideo) {
      const videoSrc = urljoin(url, ogVideo);
      const videoExt = determine_ext(videoSrc);
      if (!formats.some((f) => f.url === videoSrc)) {
        formats.push({
          format_id: `og-${videoExt}`,
          url: videoSrc,
          ext: videoExt,
          protocol: determine_protocol(videoSrc)
        });
      }
    }

    this._sort_formats(formats);

    const u = new URL(url);
    const videoId = u.pathname.replace(/[^a-zA-Z0-9_-]/g, '_') || 'video';

    return {
      id: videoId,
      title,
      description,
      thumbnail,
      formats,
      webpage_url: url
    };
  }
}
