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

import { Request } from '../networking/Request.js';
import { ExtractorError, NO_DEFAULT, clean_html, unescapeHTML } from '../utils/common.js';
import { HTTPHeaderDict } from '../utils/networking.js';

/**
 * Base class for all Information Extractors.
 * 1:1 architecture matching yt-dlp InfoExtractor.
 */
export class InfoExtractor {
  /**
   * Name of this extractor.
   * @type {string}
   */
  static IE_NAME = 'generic';

  /**
   * Human-readable description.
   * @type {string}
   */
  static IE_DESC = '';

  /**
   * Regular expression matching URLs handled by this extractor.
   * @type {RegExp|string}
   */
  static _VALID_URL = '';

  /**
   * Extractor priority weight (higher = tried earlier).
   * @type {number}
   */
  static _WEIGHT = 100;

  /**
   * @param {import('../YoutubeDL.js').YoutubeDL} [ydl=null]
   */
  constructor(ydl = null) {
    this.ydl = ydl;
  }

  /**
   * Checks whether this extractor handles the given URL.
   * @param {string} url
   * @returns {boolean}
   */
  static suitable(url) {
    if (!this._VALID_URL) return false;
    const regex = typeof this._VALID_URL === 'string' ? new RegExp(this._VALID_URL) : this._VALID_URL;
    return regex.test(url);
  }

  /**
   * Extractor name getter.
   */
  get ie_key() {
    return this.constructor.IE_NAME;
  }

  /**
   * Sends an HTTP request through the central RequestDirector or native fetch.
   * @param {Request|string} reqOrUrl
   * @param {object} [options]
   * @returns {Promise<import('../networking/Response.js').Response>}
   */
  async _request(reqOrUrl, options = {}) {
    if (this.ydl && this.ydl.director) {
      return await this.ydl.director.send(reqOrUrl, options);
    }
    const req = typeof reqOrUrl === 'string' ? new Request(reqOrUrl, options) : reqOrUrl;
    const fetchRes = await fetch(req.url, {
      method: req.method,
      headers: req.headers.toObject(),
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.data
    });
    const text = await fetchRes.text();
    return {
      status: fetchRes.status,
      ok: fetchRes.ok,
      url: fetchRes.url,
      headers: new HTTPHeaderDict(fetchRes.headers),
      text: async () => text,
      json: async () => JSON.parse(text)
    };
  }

  /**
   * Downloads webpage content as text.
   * 1:1 with yt-dlp _download_webpage.
   *
   * @param {string|Request} urlOrReq - Webpage URL or Request.
   * @param {string} [videoId] - Identifier for logging and errors.
   * @param {string} [note='Downloading webpage'] - Status message.
   * @param {string} [errnote='Unable to download webpage'] - Error message.
   * @returns {Promise<string>}
   */
  async _download_webpage(urlOrReq, videoId = '', note = 'Downloading webpage', errnote = 'Unable to download webpage') {
    if (this.ydl && this.ydl.to_screen && note) {
      this.ydl.to_screen(`[${this.ie_key}] ${videoId ? `${videoId}: ` : ''}${note}`);
    }
    try {
      const res = await this._request(urlOrReq);
      return await res.text();
    } catch (err) {
      throw new ExtractorError(`${errnote}: ${err.message}`, err);
    }
  }

  /**
   * Downloads JSON from a URL or API endpoint.
   * 1:1 with yt-dlp _download_json.
   *
   * @param {string|Request} urlOrReq
   * @param {string} [videoId='']
   * @param {string} [note='Downloading JSON metadata']
   * @param {any} [data=null]
   * @param {Record<string, string>} [headers]
   * @returns {Promise<any>}
   */
  async _download_json(urlOrReq, videoId = '', note = 'Downloading JSON metadata', data = null, headers = {}) {
    if (this.ydl && this.ydl.to_screen && note) {
      this.ydl.to_screen(`[${this.ie_key}] ${videoId ? `${videoId}: ` : ''}${note}`);
    }
    try {
      const req = typeof urlOrReq === 'string'
        ? new Request(urlOrReq, { data, headers, method: data ? 'POST' : 'GET' })
        : urlOrReq;
      const res = await this._request(req);
      return await res.json();
    } catch (err) {
      throw new ExtractorError(`Unable to download JSON metadata: ${err.message}`, err);
    }
  }

  /**
   * Parses JSON string into object with error wrapping.
   * @param {string} jsonString
   * @param {string} [videoId='']
   * @param {(obj: any) => any} [transformFunc]
   * @returns {any}
   */
  _parse_json(jsonString, videoId = '', transformFunc = null) {
    try {
      const parsed = JSON.parse(jsonString);
      return transformFunc ? transformFunc(parsed) : parsed;
    } catch (err) {
      throw new ExtractorError(`Failed to parse JSON for ${videoId}: ${err.message}`);
    }
  }

  /**
   * Searches a string using regular expressions with fallback and fatal flag support.
   * 1:1 with yt-dlp _search_regex.
   *
   * @param {RegExp|string|Array<RegExp|string>} pattern - Pattern(s) to match.
   * @param {string} string - Input text.
   * @param {string} name - Field name for error reporting.
   * @param {any} [defaultValue=NO_DEFAULT] - Fallback value if match fails.
   * @param {boolean} [fatal=true] - If true, throws ExtractorError on match failure.
   * @param {string} [flags=''] - Regex flags if pattern is string.
   * @param {number|string} [group=1] - Match group to return.
   * @returns {string|null}
   */
  _search_regex(pattern, string, name, defaultValue = NO_DEFAULT, fatal = true, flags = '', group = 1) {
    if (!string) {
      if (defaultValue !== NO_DEFAULT) return defaultValue;
      if (fatal) throw new ExtractorError(`Could not find ${name}`);
      return null;
    }

    const patterns = Array.isArray(pattern) ? pattern : [pattern];

    for (const p of patterns) {
      const regex = typeof p === 'string' ? new RegExp(p, flags) : p;
      const m = string.match(regex);
      if (m) {
        if (typeof group === 'string') {
          return m.groups && m.groups[group] !== undefined ? m.groups[group] : null;
        }
        return m[group] !== undefined ? m[group] : m[0];
      }
    }

    if (defaultValue !== NO_DEFAULT) {
      return defaultValue;
    }
    if (fatal) {
      throw new ExtractorError(`Unable to extract ${name}`);
    }
    return null;
  }

  /**
   * Searches HTML with unescaping and clean-up.
   * 1:1 with yt-dlp _html_search_regex.
   */
  _html_search_regex(pattern, string, name, defaultValue = NO_DEFAULT, fatal = true, flags = '', group = 1) {
    const res = this._search_regex(pattern, string, name, defaultValue, fatal, flags, group);
    return res ? unescapeHTML(clean_html(res)) : res;
  }

  /**
   * Extracts content of a <meta> tag by name or property attribute.
   * 1:1 with yt-dlp _html_search_meta.
   *
   * @param {string|string[]} name - Meta attribute value, e.g. 'description' or 'og:title'.
   * @param {string} html - Webpage HTML.
   * @param {string} [displayName='metadata']
   * @param {any} [defaultValue=null]
   * @param {boolean} [fatal=false]
   * @returns {string|null}
   */
  _html_search_meta(name, html, displayName = 'metadata', defaultValue = null, fatal = false) {
    if (!html) return defaultValue;
    const names = Array.isArray(name) ? name : [name];

    for (const n of names) {
      const escaped = n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const pattern = new RegExp(
        `<meta[^>]+(?:name|property|itemprop)=["']${escaped}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property|itemprop)=["']${escaped}["']`,
        'i'
      );
      const m = html.match(pattern);
      if (m) {
        return unescapeHTML((m[1] || m[2]).trim());
      }
    }

    if (fatal) {
      throw new ExtractorError(`Unable to extract ${displayName}`);
    }
    return defaultValue;
  }

  /**
   * Sorts video/audio formats based on quality, resolution, bitrate, and format_id.
   * 1:1 with yt-dlp _sort_formats.
   *
   * @param {object[]} formats - Array of format objects.
   * @param {string[]} [fieldPreference] - Optional fields to prioritize.
   */
  _sort_formats(formats, fieldPreference = null) {
    if (!Array.isArray(formats) || formats.length === 0) {
      return;
    }

    formats.sort((a, b) => {
      // 1. Preference score
      const prefA = a.preference || 0;
      const prefB = b.preference || 0;
      if (prefA !== prefB) return prefA - prefB;

      // 2. Resolution (height, width)
      const resA = (a.height || 0) * 10000 + (a.width || 0);
      const resB = (b.height || 0) * 10000 + (b.width || 0);
      if (resA !== resB) return resA - resB;

      // 3. Bitrate (tbr, vbr, abr)
      const tbrA = a.tbr || (a.vbr || 0) + (a.abr || 0);
      const tbrB = b.tbr || (b.vbr || 0) + (b.abr || 0);
      if (tbrA !== tbrB) return tbrA - tbrB;

      // 4. FPS
      const fpsA = a.fps || 0;
      const fpsB = b.fps || 0;
      if (fpsA !== fpsB) return fpsA - fpsB;

      // 5. Filesize
      const sizeA = a.filesize || a.filesize_approx || 0;
      const sizeB = b.filesize || b.filesize_approx || 0;
      return sizeA - sizeB;
    });
  }

  /**
   * Main entry method for extraction.
   * @param {string} url
   * @returns {Promise<object>} Video or playlist metadata dictionary.
   */
  async extract(url) {
    const info = await this._real_extract(url);
    if (!info) {
      throw new ExtractorError(`Extractor ${this.ie_key} returned no info`);
    }
    if (!info.extractor) {
      info.extractor = this.ie_key;
    }
    if (!info.extractor_key) {
      info.extractor_key = this.constructor.IE_NAME;
    }
    return info;
  }

  /**
   * Subclass-implemented extraction method.
   * @param {string} url
   * @returns {Promise<object>}
   */
  async _real_extract(url) {
    throw new Error('Subclasses must implement _real_extract');
  }
}
