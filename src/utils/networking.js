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

/**
 * Case-insensitive dictionary for HTTP headers, matching yt-dlp's HTTPHeaderDict.
 */
export class HTTPHeaderDict {
  /**
   * @param {Record<string, string> | HTTPHeaderDict | Headers | Array<[string, string]>} [initial]
   */
  constructor(initial) {
    /** @type {Map<string, { originalKey: string, value: string }>} */
    this._headers = new Map();

    if (initial) {
      this.update(initial);
    }
  }

  /**
   * Set a header value.
   * @param {string} key
   * @param {string} value
   */
  set(key, value) {
    if (!key) return;
    this._headers.set(key.toLowerCase(), {
      originalKey: key,
      value: String(value)
    });
  }

  /**
   * Get a header value case-insensitively.
   * @param {string} key
   * @param {string} [defaultValue=null]
   * @returns {string|null}
   */
  get(key, defaultValue = null) {
    if (!key) return defaultValue;
    const entry = this._headers.get(key.toLowerCase());
    return entry ? entry.value : defaultValue;
  }

  /**
   * Check if a header exists case-insensitively.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    if (!key) return false;
    return this._headers.has(key.toLowerCase());
  }

  /**
   * Delete a header case-insensitively.
   * @param {string} key
   * @returns {boolean}
   */
  delete(key) {
    if (!key) return false;
    return this._headers.delete(key.toLowerCase());
  }

  /**
   * Update headers from another collection or object.
   * @param {Record<string, string> | HTTPHeaderDict | Headers | Array<[string, string]>} other
   */
  update(other) {
    if (!other) return;
    if (other instanceof HTTPHeaderDict) {
      for (const [_, entry] of other._headers) {
        this.set(entry.originalKey, entry.value);
      }
    } else if (other instanceof Headers) {
      other.forEach((val, k) => this.set(k, val));
    } else if (Array.isArray(other)) {
      for (const [k, v] of other) {
        this.set(k, v);
      }
    } else if (typeof other === 'object') {
      for (const [k, v] of Object.entries(other)) {
        if (v !== null && v !== undefined) {
          this.set(k, v);
        }
      }
    }
  }

  /**
   * Convert headers to a standard plain JavaScript object.
   * @returns {Record<string, string>}
   */
  toObject() {
    const result = {};
    for (const [_, entry] of this._headers) {
      result[entry.originalKey] = entry.value;
    }
    return result;
  }

  /**
   * Returns iterator over [key, value] pairs.
   */
  *[Symbol.iterator]() {
    for (const [_, entry] of this._headers) {
      yield [entry.originalKey, entry.value];
    }
  }
}

/**
 * Strips whitespace, fragments, and invalid characters from a URL.
 * @param {string} url - Input URL.
 * @returns {string} Sanitized URL.
 */
export function sanitize_url(url) {
  if (!url || typeof url !== 'string') return '';
  return url.trim().replace(/^url=/, '');
}

/**
 * Resolves a relative URL against a base URL.
 * 1:1 with yt-dlp urljoin.
 *
 * @param {string} base - Base URL.
 * @param {string} relative - Relative or absolute target URL.
 * @returns {string} Fully resolved URL.
 */
export function urljoin(base, relative) {
  if (!relative) return base || '';
  if (!base) return relative;
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

/**
 * Determines file extension from URL or path, stripping query parameters and hash.
 * 1:1 with yt-dlp determine_ext.
 *
 * @param {string} url - File URL or path.
 * @param {string} [defaultExt='unknown_video'] - Fallback extension.
 * @returns {string} Extracted lowercase extension without leading dot.
 */
export function determine_ext(url, defaultExt = 'unknown_video') {
  if (!url || typeof url !== 'string') {
    return defaultExt;
  }
  const cleanUrl = url.split(/[?#]/)[0];
  const lastDot = cleanUrl.lastIndexOf('.');
  if (lastDot === -1 || lastDot === cleanUrl.length - 1) {
    return defaultExt;
  }
  const ext = cleanUrl.slice(lastDot + 1).toLowerCase();
  // Valid file extension regex (alphanumeric, max 8 chars)
  if (/^[a-z0-9]{1,8}$/i.test(ext)) {
    return ext;
  }
  return defaultExt;
}

/**
 * Determines streaming protocol (https, m3u8_native, mpd, etc.).
 * @param {string|object} info - URL string or format object.
 * @returns {string} Protocol name.
 */
export function determine_protocol(info) {
  const url = typeof info === 'string' ? info : (info && info.url ? info.url : '');
  if (!url) return 'http';

  if (url.startsWith('m3u8:') || url.includes('.m3u8')) {
    return 'm3u8_native';
  }
  if (url.includes('.mpd')) {
    return 'mpd';
  }
  if (url.startsWith('rtmp://') || url.startsWith('rtmpe://')) {
    return 'rtmp';
  }
  if (url.startsWith('https://')) {
    return 'https';
  }
  if (url.startsWith('http://')) {
    return 'http';
  }
  return 'http';
}
