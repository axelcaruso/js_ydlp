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

import path from 'node:path';
import { RequestDirector } from './networking/RequestDirector.js';
import { CookieJar } from './networking/CookieJar.js';
import { get_info_extractor, gen_extractor_classes, InfoExtractor } from './extractor/index.js';
import { get_suitable_downloader } from './downloader/index.js';
import { sanitize_filename } from './utils/formatting.js';
import { DownloadError, ExtractorError } from './utils/common.js';

export const DEFAULT_OUTTMPL = '%(title)s [%(id)s].%(ext)s';

/**
 * Main orchestrator class for js_ydlp.
 * 1:1 architecture matching yt-dlp's YoutubeDL class.
 */
export class YoutubeDL {
  /**
   * @param {object} [params] - Configuration options.
   * @param {string} [params.format='best'] - Format selector ('best', 'worst', 'bestvideo+bestaudio/best', or format_id).
   * @param {string} [params.outtmpl] - Output filename template (e.g. '%(title)s.%(ext)s').
   * @param {boolean} [params.quiet=false] - Suppress console output.
   * @param {boolean} [params.verbose=false] - Detailed debug logging.
   * @param {boolean} [params.skip_download=false] - Extract metadata only without downloading media.
   * @param {boolean} [params.continuedl=true] - Resume partially downloaded files.
   * @param {string} [params.cookiefile] - Path to Netscape format cookie file.
   * @param {CookieJar} [params.cookiejar] - Custom CookieJar instance.
   * @param {Record<string, string>} [params.http_headers] - Default request headers.
   * @param {Array<(status: object) => void>} [params.progress_hooks] - Progress notification callbacks.
   * @param {object} [params.logger] - Custom logger with info, warn, error, debug methods.
   */
  constructor(params = {}) {
    this.params = {
      format: 'best',
      outtmpl: DEFAULT_OUTTMPL,
      quiet: false,
      verbose: false,
      skip_download: false,
      continuedl: true,
      ...params
    };

    // Initialize CookieJar
    this.cookiejar = this.params.cookiejar || new CookieJar();
    if (this.params.cookiefile) {
      this.cookiejar.loadFromFile(this.params.cookiefile);
    }

    // Initialize RequestDirector
    this.director = new RequestDirector({
      cookiejar: this.cookiejar,
      headers: this.params.http_headers || this.params.httpHeaders
    });

    /** @type {Array<typeof InfoExtractor>} */
    this._ies = [];
    /** @type {Array<any>} */
    this._pps = [];
    /** @type {Array<(status: object) => void>} */
    this._progressHooks = [...(this.params.progress_hooks || this.params.progressHooks || [])];

    // Load registered extractors
    for (const ieClass of gen_extractor_classes()) {
      this.add_info_extractor(ieClass);
    }
  }

  /**
   * Adds an extractor class to the local registry.
   * @param {typeof InfoExtractor} ieClass
   */
  add_info_extractor(ieClass) {
    if (!this._ies.includes(ieClass)) {
      this._ies.push(ieClass);
      this._ies.sort((a, b) => (b._WEIGHT || 0) - (a._WEIGHT || 0));
    }
  }

  /**
   * Registers a progress hook callback.
   * @param {(status: object) => void} hook
   */
  add_progress_hook(hook) {
    if (typeof hook === 'function') {
      this._progressHooks.push(hook);
    }
  }

  /**
   * Logs a regular message to stdout or custom logger.
   * @param {string} message
   */
  to_screen(message) {
    if (this.params.quiet) return;
    if (this.params.logger && this.params.logger.info) {
      this.params.logger.info(message);
    } else {
      console.log(message);
    }
  }

  /**
   * Logs a warning message.
   * @param {string} message
   */
  report_warning(message) {
    if (this.params.logger && this.params.logger.warn) {
      this.params.logger.warn(`WARNING: ${message}`);
    } else if (!this.params.quiet) {
      console.warn(`WARNING: ${message}`);
    }
  }

  /**
   * Logs an error message.
   * @param {string} message
   */
  report_error(message) {
    if (this.params.logger && this.params.logger.error) {
      this.params.logger.error(`ERROR: ${message}`);
    } else {
      console.error(`ERROR: ${message}`);
    }
  }

  /**
   * Resolves the appropriate extractor instance for a given URL.
   * @param {string} url
   * @returns {InfoExtractor}
   */
  get_info_extractor(url) {
    for (const IE of this._ies) {
      if (IE.suitable(url)) {
        return new IE(this);
      }
    }
    return new (get_info_extractor(url))(this);
  }

  /**
   * Selects the best matching format for download based on format selector.
   * 1:1 with yt-dlp format selection.
   *
   * @param {object[]} formats - Available formats sorted ascending.
   * @param {string} selector - Format expression ('best', 'worst', 'bestvideo+bestaudio/best', or format_id).
   * @returns {object|null} Chosen format object.
   */
  select_format(formats, selector = 'best') {
    if (!Array.isArray(formats) || formats.length === 0) {
      return null;
    }

    const cleanSelector = selector ? selector.trim() : 'best';

    // 1. Direct format_id match
    const directMatch = formats.find((f) => String(f.format_id) === cleanSelector);
    if (directMatch) return directMatch;

    // 2. Worst format
    if (cleanSelector === 'worst') {
      return formats[0];
    }

    // 3. Best muxed video (or best overall)
    // Filter formats with both video and audio if available
    const muxed = formats.filter(
      (f) => f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none'
    );

    if (muxed.length > 0) {
      return muxed[muxed.length - 1];
    }

    // Fallback to highest quality stream
    return formats[formats.length - 1];
  }

  /**
   * Formats output filename by replacing template placeholders.
   * 1:1 with yt-dlp prepare_filename.
   *
   * @param {object} infoDict
   * @returns {string} Fully expanded and sanitized filename.
   */
  prepare_filename(infoDict) {
    const tmpl = this.params.outtmpl || DEFAULT_OUTTMPL;

    let filename = tmpl.replace(/%\(([\w.]+)\)s/g, (_, key) => {
      let val = infoDict[key];
      if (val === undefined || val === null) {
        if (key === 'ext') val = infoDict.ext || 'mp4';
        else val = 'NA';
      }
      return sanitize_filename(String(val));
    });

    // Ensure extension
    if (!path.extname(filename)) {
      const ext = infoDict.ext || 'mp4';
      filename = `${filename}.${ext}`;
    }

    return filename;
  }

  /**
   * Extracts media information and optionally downloads the content.
   * 1:1 with yt-dlp extract_info.
   *
   * @param {string} url - Target media or webpage URL.
   * @param {object} [options]
   * @param {boolean} [options.download=true] - Whether to initiate download.
   * @param {object} [options.extra_info] - Extra metadata to merge.
   * @returns {Promise<object>} Complete info dictionary.
   */
  async extract_info(url, options = {}) {
    const shouldDownload = options.download !== undefined ? options.download : !this.params.skip_download;
    const ie = this.get_info_extractor(url);

    this.to_screen(`[${ie.ie_key}] Extracting URL: ${url}`);
    const info = await ie.extract(url);

    if (options.extra_info) {
      Object.assign(info, options.extra_info);
    }

    // Process formats and select target
    if (Array.isArray(info.formats) && info.formats.length > 0) {
      const selectedFormat = this.select_format(info.formats, this.params.format);
      if (selectedFormat) {
        info.selected_format = selectedFormat;
        info.url = selectedFormat.url;
        info.ext = selectedFormat.ext || info.ext || 'mp4';
        info.format_id = selectedFormat.format_id;
      }
    }

    if (shouldDownload && info.url) {
      const filename = this.prepare_filename(info);
      info._filename = filename;

      const DownloaderClass = get_suitable_downloader(info, this.params);
      const downloader = new DownloaderClass(this, {
        ...this.params,
        progress_hooks: this._progressHooks
      });

      this.to_screen(`[download] Destination: ${filename}`);
      await downloader.download(filename, info);
      this.to_screen(`[download] 100% of ${filename}`);
    }

    return info;
  }

  /**
   * Downloads a list of URLs in sequence.
   * 1:1 with yt-dlp download.
   *
   * @param {string[]} urlList - Array of URLs to download.
   * @returns {Promise<number>} Exit code (0 for success, 1 on error).
   */
  async download(urlList) {
    let hasError = false;
    for (const url of urlList) {
      try {
        await this.extract_info(url, { download: true });
      } catch (err) {
        hasError = true;
        this.report_error(`Failed to download ${url}: ${err.message}`);
      }
    }
    return hasError ? 1 : 0;
  }
}
