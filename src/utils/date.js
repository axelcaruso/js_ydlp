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
 * Parses an ISO 8601 string or date into unix timestamp in seconds.
 * @param {string|number|Date} dateVal - Date candidate.
 * @returns {number|null} Unix timestamp in seconds, or null if invalid.
 */
export function parse_iso8601(dateVal) {
  if (!dateVal) return null;
  if (typeof dateVal === 'number') {
    return dateVal > 1e11 ? Math.floor(dateVal / 1000) : Math.floor(dateVal);
  }
  if (dateVal instanceof Date) {
    return Math.floor(dateVal.getTime() / 1000);
  }
  const parsed = Date.parse(dateVal);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.floor(parsed / 1000);
}

/**
 * Normalizes any date string or timestamp into a YYYYMMDD string.
 * 1:1 with yt-dlp unified_strdate.
 *
 * @param {string|number|Date} dateVal - Input date representation.
 * @returns {string|null} Normalized date string "YYYYMMDD" or null.
 */
export function unified_strdate(dateVal) {
  if (!dateVal) return null;

  // Direct match for YYYYMMDD
  if (typeof dateVal === 'string' && /^\d{8}$/.test(dateVal)) {
    return dateVal;
  }

  // Handle YYYY-MM-DD or YYYY/MM/DD
  if (typeof dateVal === 'string') {
    const ymdMatch = dateVal.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (ymdMatch) {
      const year = ymdMatch[1];
      const month = ymdMatch[2].padStart(2, '0');
      const day = ymdMatch[3].padStart(2, '0');
      return `${year}${month}${day}`;
    }
  }

  const timestamp = parse_iso8601(dateVal);
  if (timestamp === null) return null;

  const d = new Date(timestamp * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');

  return `${year}${month}${day}`;
}

/**
 * Converts a date representation into a Unix timestamp in seconds.
 * 1:1 with yt-dlp unified_timestamp.
 *
 * @param {string|number|Date} dateVal - Input date representation.
 * @returns {number|null} Unix timestamp in seconds or null.
 */
export function unified_timestamp(dateVal) {
  return parse_iso8601(dateVal);
}

/**
 * Formats a duration in seconds to standard time format (HH:MM:SS or MM:SS).
 * @param {number|null} seconds - Duration in seconds.
 * @returns {string} Formatted duration string.
 */
export function formatSeconds(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return '00:00';
  }
  const total = Math.floor(Math.max(0, seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');

  if (hrs > 0) {
    const hh = String(hrs).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}
