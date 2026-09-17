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
 * Encapsulates an HTTP response, matching yt-dlp's Response abstractions.
 */
export class Response {
  /**
   * @param {object} options
   * @param {number} options.status - HTTP status code.
   * @param {string} options.url - Final response URL.
   * @param {HTTPHeaderDict|Record<string, string>|Headers} [options.headers]
   * @param {ReadableStream|import('node:stream').Readable|null} [options.body]
   * @param {string|null} [options.rawText]
   */
  constructor({ status, url, headers, body = null, rawText = null }) {
    this.status = status;
    this.statusText = status >= 200 && status < 300 ? 'OK' : 'Error';
    this.ok = status >= 200 && status < 300;
    this.url = url;
    this.headers = new HTTPHeaderDict(headers);
    this.body = body;
    this._rawText = rawText;
  }

  /**
   * Reads and decodes the response body as text.
   * @returns {Promise<string>}
   */
  async text() {
    if (this._rawText !== null) {
      return this._rawText;
    }
    if (!this.body) {
      return '';
    }

    // If Web ReadableStream
    if (typeof this.body.getReader === 'function') {
      const reader = this.body.getReader();
      const decoder = new TextDecoder();
      let result = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
      }
      result += decoder.decode();
      this._rawText = result;
      return result;
    }

    // If Node stream
    const chunks = [];
    for await (const chunk of this.body) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const buf = Buffer.concat(chunks);
    this._rawText = buf.toString('utf8');
    return this._rawText;
  }

  /**
   * Reads and parses response body as JSON.
   * @returns {Promise<any>}
   */
  async json() {
    const raw = await this.text();
    return JSON.parse(raw);
  }
}

export class HTTPError extends Error {
  /**
   * @param {number} status
   * @param {string} msg
   * @param {Response} [response]
   */
  constructor(status, msg, response = null) {
    super(`HTTP Error ${status}: ${msg}`);
    this.name = 'HTTPError';
    this.status = status;
    this.response = response;
  }
}
