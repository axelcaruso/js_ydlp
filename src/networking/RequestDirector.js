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

import { CookieJar } from './CookieJar.js';
import { Request } from './Request.js';
import { Response, HTTPError } from './Response.js';
import { HTTPHeaderDict } from '../utils/networking.js';

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * RequestDirector coordinates HTTP requests, cookie tracking, retries, and header management.
 * 1:1 Vanilla JS architecture matching yt-dlp RequestDirector.
 */
export class RequestDirector {
  /**
   * @param {object} [options]
   * @param {CookieJar} [options.cookiejar]
   * @param {Record<string, string>} [options.headers]
   * @param {number} [options.maxRetries=3]
   * @param {number} [options.timeout=20000]
   */
  constructor(options = {}) {
    this.cookiejar = options.cookiejar || new CookieJar();
    this.defaultHeaders = new HTTPHeaderDict({
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-us,en;q=0.5',
      'Sec-Fetch-Mode': 'navigate',
      ...options.headers
    });
    this.maxRetries = options.maxRetries ?? 3;
    this.timeout = options.timeout ?? 20000;
  }

  /**
   * Executes an HTTP Request or URL string.
   *
   * @param {Request|string} reqOrUrl - Request instance or target URL string.
   * @param {object} [options] - Additional request options.
   * @returns {Promise<Response>}
   */
  async send(reqOrUrl, options = {}) {
    const req = typeof reqOrUrl === 'string' ? new Request(reqOrUrl, options) : reqOrUrl;

    const mergedHeaders = new HTTPHeaderDict(this.defaultHeaders);
    mergedHeaders.update(req.headers);

    // Attach Cookie header from CookieJar
    const cookieStr = this.cookiejar.getCookieHeader(req.url);
    if (cookieStr && !mergedHeaders.has('Cookie')) {
      mergedHeaders.set('Cookie', cookieStr);
    }

    let retries = 0;
    let lastError = null;

    while (retries <= this.maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), req.extensions.timeout || this.timeout);

        let body = req.data;
        if (body && typeof body === 'object' && !(body instanceof Uint8Array) && !(body instanceof URLSearchParams) && typeof body.pipe !== 'function') {
          body = JSON.stringify(body);
          if (!mergedHeaders.has('Content-Type')) {
            mergedHeaders.set('Content-Type', 'application/json');
          }
        }

        const fetchOptions = {
          method: req.method,
          headers: mergedHeaders.toObject(),
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
          signal: controller.signal,
          redirect: options.redirect || req.extensions.redirect || 'follow'
        };

        const res = await fetch(req.url, fetchOptions);
        clearTimeout(timeoutId);

        // Store Set-Cookie headers
        const setCookie = res.headers.get('set-cookie');
        if (setCookie) {
          this.cookiejar.parseSetCookie(setCookie, res.url || req.url);
        }

        const responseHeaders = new HTTPHeaderDict();
        res.headers.forEach((val, key) => responseHeaders.set(key, val));

        const responseObj = new Response({
          status: res.status,
          url: res.url || req.url,
          headers: responseHeaders,
          body: res.body
        });

        if (!res.ok && res.status >= 500 && retries < this.maxRetries) {
          // Transient server error: retry with backoff
          retries++;
          await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, retries), 5000)));
          continue;
        }

        return responseObj;
      } catch (err) {
        lastError = err;
        retries++;
        if (retries <= this.maxRetries) {
          await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, retries), 5000)));
          continue;
        }
        throw new HTTPError(0, `Request failed after ${retries} attempts: ${err.message}`, null);
      }
    }

    throw lastError;
  }
}
