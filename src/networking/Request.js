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

import { HTTPHeaderDict } from '../utils/networking.js';

/**
 * Encapsulates an HTTP request, matching yt-dlp's Request class.
 */
export class Request {
  /**
   * @param {string} url - Target URL.
   * @param {object} [options]
   * @param {string} [options.method='GET'] - HTTP method.
   * @param {HTTPHeaderDict|Record<string, string>} [options.headers] - Request headers.
   * @param {any} [options.data=null] - Request body (string, Buffer, FormData, JSON).
   * @param {object} [options.extensions] - Additional options (proxies, impersonate, timeout).
   */
  constructor(url, options = {}) {
    this.url = url;
    this.method = (options.method || (options.data ? 'POST' : 'GET')).toUpperCase();
    this.headers = new HTTPHeaderDict(options.headers);
    this.data = options.data !== undefined ? options.data : null;
    this.extensions = options.extensions || {};
  }
}

/**
 * Convenience constructor for HEAD requests.
 */
export class HEADRequest extends Request {
  constructor(url, options = {}) {
    super(url, { ...options, method: 'HEAD' });
  }
}
