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
 * Formats a number of bytes into a human-readable string with binary units (KiB, MiB, etc.).
 * @param {number|null} bytes - Total bytes.
 * @returns {string} Human readable string, e.g. "15.40MiB", or "N/A" if null.
 */
export function format_bytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) {
    return 'N/A';
  }
  const num = Number(bytes);
  if (num < 1024) {
    return `${num.toFixed(2)}B`;
  }
  const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let exp = Math.floor(Math.log(num) / Math.log(1024));
  if (exp > units.length) exp = units.length;
  const val = num / Math.pow(1024, exp);
  return `${val.toFixed(2)}${units[exp - 1]}`;
}

/**
 * Parses human-readable file size strings (e.g. "1.5GiB", "200kB") into raw bytes.
 * @param {string|number} sizeStr - String describing filesize.
 * @returns {number|null} Total bytes or null.
 */
export function parse_filesize(sizeStr) {
  if (typeof sizeStr === 'number') {
    return sizeStr;
  }
  if (!sizeStr || typeof sizeStr !== 'string') {
    return null;
  }
  const m = sizeStr.trim().match(/^([0-9.]+)\s*([a-zA-Z]+)?$/);
  if (!m) return null;

  const num = parseFloat(m[1]);
  if (Number.isNaN(num)) return null;
  const unit = (m[2] || 'B').toUpperCase();

  const binaryUnits = {
    B: 1,
    KIB: 1024,
    MIB: 1024 ** 2,
    GIB: 1024 ** 3,
    TIB: 1024 ** 4,
    PIB: 1024 ** 5,
    KB: 1000,
    MB: 1000 ** 2,
    GB: 1000 ** 3,
    TB: 1000 ** 4,
    PB: 1000 ** 5,
    K: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3
  };

  const mult = binaryUnits[unit] || 1;
  return Math.floor(num * mult);
}

/**
 * Sanitizes a filename to prevent forbidden filesystem characters and Windows reserved names.
 * 1:1 with yt-dlp sanitize_filename.
 *
 * @param {string} s - Candidate filename.
 * @param {object} [options]
 * @param {boolean} [options.restricted=false] - If true, restricts to ASCII letters and digits.
 * @param {boolean} [options.is_id=false] - If true, leaves IDs untouched unless invalid.
 * @returns {string} Sanitized string safe for file creation.
 */
export function sanitize_filename(s, options = {}) {
  if (!s) return '';
  let str = String(s);

  // Reserved characters for Windows, Linux, and MacOS
  // \ / : * ? " < > |
  str = str.replace(/[\\/:*?"<>|\x00-\x1F\x7F]/g, '_');

  if (options.restricted) {
    str = str.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  // Strip leading and trailing dots and spaces
  str = str.replace(/^[\s.]+|[\s.]+$/g, '');

  // Handle Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  const winReserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
  if (winReserved.test(str)) {
    str = `_${str}`;
  }

  return str || '_';
}

/**
 * Formats a number with metric suffix (e.g. 1500 -> "1.50k").
 * @param {number|null} num - Number to format.
 * @param {number} [factor=1000] - Factor (1000 or 1024).
 * @returns {string}
 */
export function format_decimal_suffix(num, factor = 1000) {
  if (num === null || num === undefined || Number.isNaN(num)) {
    return 'N/A';
  }
  const n = Number(num);
  if (Math.abs(n) < factor) {
    return String(n);
  }
  const units = factor === 1024 ? ['Ki', 'Mi', 'Gi', 'Ti'] : ['k', 'M', 'G', 'T'];
  let exp = Math.floor(Math.log(Math.abs(n)) / Math.log(factor));
  if (exp > units.length) exp = units.length;
  const val = n / Math.pow(factor, exp);
  return `${val.toFixed(2)}${units[exp - 1]}`;
}
