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
 * Sentinel value indicating the absence of a default.
 */
export const NO_DEFAULT = Symbol('NO_DEFAULT');

/**
 * Identity function.
 * @template T
 * @param {T} x
 * @returns {T}
 */
export function IDENTITY(x) {
  return x;
}

/**
 * Converts a value to integer or returns default if invalid.
 * @param {any} val - The value to convert.
 * @param {any} [defaultVal=null] - Default return value on failure.
 * @param {number} [scale=1] - Optional multiplier factor.
 * @returns {number|null}
 */
export function int_or_none(val, defaultVal = null, scale = 1) {
  if (val === null || val === undefined || val === '') {
    return defaultVal;
  }
  const parsed = parseInt(val, 10);
  if (Number.isNaN(parsed)) {
    return defaultVal;
  }
  return Math.floor(parsed * scale);
}

/**
 * Converts a value to float or returns default if invalid.
 * @param {any} val - The value to convert.
 * @param {any} [defaultVal=null] - Default return value on failure.
 * @param {number} [scale=1] - Optional multiplier factor.
 * @returns {number|null}
 */
export function float_or_none(val, defaultVal = null, scale = 1) {
  if (val === null || val === undefined || val === '') {
    return defaultVal;
  }
  const parsed = parseFloat(val);
  if (Number.isNaN(parsed)) {
    return defaultVal;
  }
  return parsed * scale;
}

/**
 * Converts a value to string or returns default if null or undefined.
 * @param {any} val - The value to convert.
 * @param {any} [defaultVal=null] - Default return value.
 * @returns {string|null}
 */
export function str_or_none(val, defaultVal = null) {
  if (val === null || val === undefined) {
    return defaultVal;
  }
  return String(val);
}

/**
 * Strips whitespace from a string or returns default.
 * @param {any} val - The string to strip.
 * @param {any} [defaultVal=null] - Default return value.
 * @returns {string|null}
 */
export function strip_or_none(val, defaultVal = null) {
  if (val === null || val === undefined) {
    return defaultVal;
  }
  const str = String(val).trim();
  return str.length > 0 ? str : defaultVal;
}

/**
 * Validates whether a value is a valid HTTP/HTTPS or data URL.
 * @param {any} val - The URL candidate.
 * @returns {string|null}
 */
export function url_or_none(val) {
  if (!val || typeof val !== 'string') {
    return null;
  }
  try {
    const parsed = new URL(val);
    if (['http:', 'https:', 'data:', 'ftp:'].includes(parsed.protocol)) {
      return val;
    }
  } catch {
    // Return null if invalid URL
  }
  return null;
}

/**
 * Safely tries a getter callback or returns default on error.
 * 1:1 with yt-dlp try_get.
 * @template T
 * @param {any} src - Source object.
 * @param {(obj: any) => T | Array<(obj: any) => T>} getter - Function or array of functions.
 * @param {Function} [expectedType] - Constructor of expected type (e.g. String, Number).
 * @returns {T|null}
 */
export function try_get(src, getter, expectedType) {
  const getters = Array.isArray(getter) ? getter : [getter];
  for (const fn of getters) {
    try {
      const val = fn(src);
      if (val !== undefined && val !== null) {
        if (!expectedType || (val instanceof expectedType || val.constructor === expectedType)) {
          return val;
        }
      }
    } catch {
      // Continue to next getter
    }
  }
  return null;
}

/**
 * Safely calls a function, returning a default value if an error is thrown.
 * @template T
 * @param {() => T} func - Function to execute.
 * @param {any} [defaultVal=null] - Fallback value on throw.
 * @returns {T|null}
 */
export function try_call(func, defaultVal = null) {
  try {
    const res = func();
    return res !== undefined ? res : defaultVal;
  } catch {
    return defaultVal;
  }
}

/**
 * Filters an object by keeping key-value pairs that satisfy a condition.
 * By default, keeps values that are not null, undefined, or empty strings.
 * @param {Record<string, any>} dict - The dictionary to filter.
 * @param {(value: any, key: string) => boolean} [condition] - Filter condition.
 * @returns {Record<string, any>}
 */
export function filter_dict(dict, condition) {
  if (!dict || typeof dict !== 'object') {
    return {};
  }
  const result = {};
  const filterFn = condition || ((val) => val !== null && val !== undefined && val !== '');

  for (const [k, v] of Object.entries(dict)) {
    if (filterFn(v, k)) {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Joins non-empty string components with a delimiter.
 * @param {string} delimiter - Delimiter string.
 * @param {...any} items - Elements to join.
 * @returns {string}
 */
export function join_nonempty(delimiter, ...items) {
  return items
    .flat(Infinity)
    .filter((x) => x !== null && x !== undefined && String(x).trim().length > 0)
    .map((x) => String(x))
    .join(delimiter);
}

/**
 * Ensures a value is an Array unless it already is.
 * @param {any} val - Value to wrap.
 * @returns {any[]}
 */
export function variadic(val) {
  if (val === null || val === undefined) {
    return [];
  }
  return Array.isArray(val) ? val : [val];
}

/**
 * Removes HTML tags and extracts plain text.
 * @param {string} html - HTML string.
 * @returns {string}
 */
export function clean_html(html) {
  if (!html) return '';
  return String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Unescapes standard HTML entities into plain characters.
 * @param {string} text - HTML entity encoded string.
 * @returns {string}
 */
export function unescapeHTML(text) {
  if (!text) return '';
  const map = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' '
  };
  return String(text)
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (match) => map[match] || match)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Escapes characters for safe inclusion in HTML.
 * @param {string} text - Input text.
 * @returns {string}
 */
export function escapeHTML(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parses duration strings in HH:MM:SS, MM:SS, or seconds into total seconds.
 * @param {string|number} durationStr - Duration string or number.
 * @returns {number|null} Total seconds or null.
 */
export function parse_duration(durationStr) {
  if (typeof durationStr === 'number') {
    return durationStr;
  }
  if (!durationStr || typeof durationStr !== 'string') {
    return null;
  }
  const clean = durationStr.trim();
  // ISO 8601 duration: PT1H2M3S
  const isoMatch = clean.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/);
  if (isoMatch) {
    const days = parseFloat(isoMatch[1] || '0');
    const hours = parseFloat(isoMatch[2] || '0');
    const minutes = parseFloat(isoMatch[3] || '0');
    const seconds = parseFloat(isoMatch[4] || '0');
    return days * 86400 + hours * 3600 + minutes * 60 + seconds;
  }

  const parts = clean.split(':').map((p) => parseFloat(p));
  if (parts.some((p) => Number.isNaN(p))) {
    const parsedNum = parseFloat(clean);
    return Number.isNaN(parsedNum) ? null : parsedNum;
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return null;
}

/**
 * Converts a MIME type string to a file extension.
 * @param {string} mime - MIME type.
 * @returns {string|null}
 */
export function mimetype2ext(mime) {
  if (!mime || typeof mime !== 'string') return null;
  const clean = mime.toLowerCase().split(';')[0].trim();
  const map = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
    'video/quicktime': 'mov',
    'video/x-flv': 'flv',
    'video/x-msvideo': 'avi',
    'video/x-matroska': 'mkv',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/webm': 'opus',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
    'application/vnd.apple.mpegurl': 'm3u8',
    'application/x-mpegurl': 'm3u8',
    'application/dash+xml': 'mpd',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };
  return map[clean] || null;
}

/**
 * Custom error hierarchy matching yt-dlp.
 */
export class YoutubeDLError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'YoutubeDLError';
  }
}

export class ExtractorError extends YoutubeDLError {
  constructor(msg, cause = null) {
    super(msg);
    this.name = 'ExtractorError';
    this.cause = cause;
  }
}

export class DownloadError extends YoutubeDLError {
  constructor(msg, cause = null) {
    super(msg);
    this.name = 'DownloadError';
    this.cause = cause;
  }
}

export class PostProcessingError extends YoutubeDLError {
  constructor(msg) {
    super(msg);
    this.name = 'PostProcessingError';
  }
}
