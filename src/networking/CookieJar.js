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

import fs from 'node:fs';

/**
 * Represents an individual HTTP cookie.
 */
export class Cookie {
  /**
   * @param {object} options
   * @param {string} options.name
   * @param {string} options.value
   * @param {string} [options.domain]
   * @param {string} [options.path='/']
   * @param {number|null} [options.expires=null] - Unix timestamp in seconds
   * @param {boolean} [options.secure=false]
   * @param {boolean} [options.httpOnly=false]
   */
  constructor({ name, value, domain = '', path = '/', expires = null, secure = false, httpOnly = false }) {
    this.name = name;
    this.value = value;
    this.domain = domain.toLowerCase();
    this.path = path || '/';
    this.expires = expires;
    this.secure = secure;
    this.httpOnly = httpOnly;
  }

  /**
   * Checks if this cookie is expired.
   * @param {number} [now] - Current timestamp in seconds.
   * @returns {boolean}
   */
  isExpired(now = Math.floor(Date.now() / 1000)) {
    return this.expires !== null && this.expires < now;
  }

  /**
   * Checks if this cookie matches a given hostname and path.
   * @param {string} host - Target hostname.
   * @param {string} path - Target path.
   * @returns {boolean}
   */
  matches(host, path = '/') {
    const cleanHost = host.toLowerCase();
    const cleanDomain = this.domain.startsWith('.') ? this.domain.slice(1) : this.domain;

    // Domain matching
    if (this.domain) {
      if (cleanHost !== cleanDomain && !cleanHost.endsWith(`.${cleanDomain}`)) {
        return false;
      }
    }

    // Path matching
    if (!path.startsWith(this.path)) {
      return false;
    }

    return true;
  }
}

/**
 * CookieJar for storing, parsing, and retrieving HTTP cookies across requests.
 * Compatible with Netscape cookie files and Set-Cookie response headers.
 */
export class CookieJar {
  constructor() {
    /** @type {Cookie[]} */
    this.cookies = [];
  }

  /**
   * Adds or updates a cookie in the jar.
   * Accepts a Cookie instance, a cookie object, or (name, value, domain, options).
   *
   * @param {Cookie|string|object} cookieOrName
   * @param {string} [value]
   * @param {string} [domain='']
   * @param {object} [options={}]
   */
  setCookie(cookieOrName, value = '', domain = '', options = {}) {
    let cookie;
    if (cookieOrName instanceof Cookie) {
      cookie = cookieOrName;
    } else if (typeof cookieOrName === 'object' && cookieOrName !== null && 'name' in cookieOrName) {
      cookie = new Cookie(cookieOrName);
    } else {
      cookie = new Cookie({
        name: String(cookieOrName),
        value: String(value),
        domain: domain ? (domain.startsWith('.') ? domain : `.${domain}`) : '',
        path: options.path || '/',
        expires: options.expires ? Math.floor(new Date(options.expires).getTime() / 1000) : null,
        secure: options.secure ?? false,
        httpOnly: options.httpOnly ?? false
      });
    }
    // Remove previous instance if name, domain, and path match
    this.cookies = this.cookies.filter(
      (c) => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path)
    );
    this.cookies.push(cookie);
  }

  /**
   * Parses a Set-Cookie header string and adds cookie to jar.
   * @param {string} setCookieHeader
   * @param {string} requestUrl - The URL of the request that produced this Set-Cookie.
   */
  parseSetCookie(setCookieHeader, requestUrl) {
    if (!setCookieHeader) return;
    const parts = setCookieHeader.split(';').map((s) => s.trim());
    if (parts.length === 0 || !parts[0]) return;

    const [firstPart, ...attrs] = parts;
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx === -1) return;

    const name = firstPart.slice(0, eqIdx).trim();
    const value = firstPart.slice(eqIdx + 1).trim();

    let domain = '';
    let path = '/';
    let expires = null;
    let secure = false;
    let httpOnly = false;

    if (requestUrl) {
      try {
        const u = new URL(requestUrl);
        domain = u.hostname;
        path = u.pathname || '/';
      } catch {
        // Leave defaults
      }
    }

    for (const attr of attrs) {
      const aEq = attr.indexOf('=');
      const aName = (aEq !== -1 ? attr.slice(0, aEq) : attr).trim().toLowerCase();
      const aVal = aEq !== -1 ? attr.slice(aEq + 1).trim() : '';

      if (aName === 'domain') {
        domain = aVal;
      } else if (aName === 'path') {
        path = aVal;
      } else if (aName === 'secure') {
        secure = true;
      } else if (aName === 'httponly') {
        httpOnly = true;
      } else if (aName === 'max-age') {
        const seconds = parseInt(aVal, 10);
        if (!Number.isNaN(seconds)) {
          expires = Math.floor(Date.now() / 1000) + seconds;
        }
      } else if (aName === 'expires') {
        const parsed = Date.parse(aVal);
        if (!Number.isNaN(parsed)) {
          expires = Math.floor(parsed / 1000);
        }
      }
    }

    this.setCookie(new Cookie({ name, value, domain, path, expires, secure, httpOnly }));
  }

  /**
   * Generates a Cookie header value for a given URL.
   * @param {string} targetUrl
   * @returns {string} Semicolon-separated name=value cookie string.
   */
  getCookieHeader(targetUrl) {
    if (!targetUrl) return '';
    try {
      const u = new URL(targetUrl);
      const host = u.hostname;
      const path = u.pathname || '/';
      const now = Math.floor(Date.now() / 1000);

      // Clean expired
      this.cookies = this.cookies.filter((c) => !c.isExpired(now));

      const matching = this.cookies.filter((c) => c.matches(host, path));
      return matching.map((c) => `${c.name}=${c.value}`).join('; ');
    } catch {
      return '';
    }
  }

  /**
   * Loads cookies from a Netscape format cookie file.
   * @param {string} filePath - Absolute path to cookie file.
   */
  loadFromFile(filePath) {
    if (!fs.existsSync(filePath)) {
      return;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const parts = trimmed.split('\t');
      if (parts.length >= 7) {
        const [domain, , path, secureStr, expiresStr, name, value] = parts;
        this.setCookie(
          new Cookie({
            name,
            value,
            domain,
            path,
            expires: parseInt(expiresStr, 10) || null,
            secure: secureStr.toUpperCase() === 'TRUE'
          })
        );
      }
    }
  }

  /**
   * Exports cookies into Netscape cookie file format.
   * @returns {string} Netscape cookie file content.
   */
  exportNetscape() {
    const lines = ['# Netscape HTTP Cookie File', '# http://curl.haxx.se/rfc/cookie_spec.html', ''];
    for (const c of this.cookies) {
      const includeSubdomains = c.domain.startsWith('.') ? 'TRUE' : 'FALSE';
      const secure = c.secure ? 'TRUE' : 'FALSE';
      const expires = c.expires !== null ? String(c.expires) : '0';
      lines.push(`${c.domain}\t${includeSubdomains}\t${c.path}\t${secure}\t${expires}\t${c.name}\t${c.value}`);
    }
    return lines.join('\n');
  }
}
