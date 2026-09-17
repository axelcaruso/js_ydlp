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
import fs from 'node:fs';

/**
 * Base class for all file downloaders.
 * 1:1 with yt-dlp FileDownloader.
 */
export class FileDownloader {
  /**
   * @param {import('../YoutubeDL.js').YoutubeDL} ydl - YoutubeDL main engine instance.
   * @param {object} [params] - Downloader configuration options.
   */
  constructor(ydl, params = {}) {
    this.ydl = ydl;
    this.params = params;
    this._progressHooks = params.progress_hooks || params.progressHooks || [];
  }

  /**
   * Computes the temporary download filename (.part).
   * @param {string} filename - Target output filename.
   * @returns {string} Temporary filename.
   */
  temp_name(filename) {
    return `${filename}.part`;
  }

  /**
   * Adds a progress hook callback.
   * @param {(status: object) => void} hook
   */
  add_progress_hook(hook) {
    if (typeof hook === 'function') {
      this._progressHooks.push(hook);
    }
  }

  /**
   * Invokes all registered progress hooks with current status.
   * @param {object} statusDict
   */
  _hook_progress(statusDict) {
    for (const hook of this._progressHooks) {
      try {
        hook(statusDict);
      } catch (err) {
        // Suppress hook errors to prevent breaking download stream
        if (this.ydl && this.ydl.report_warning) {
          this.ydl.report_warning(`Progress hook error: ${err.message}`);
        }
      }
    }
  }

  /**
   * Prepares parent directories for output file.
   * @param {string} filepath
   */
  _make_parent_dirs(filepath) {
    const dir = path.dirname(filepath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Abstract download method to be implemented by subclasses.
   * @param {string} filename - Target output file.
   * @param {object} infoDict - Format and video info dictionary.
   * @returns {Promise<boolean>} True if download succeeded.
   */
  async real_download(filename, infoDict) {
    throw new Error('Subclasses must implement real_download');
  }

  /**
   * Entry point for initiating download.
   * @param {string} filename - Target output file.
   * @param {object} infoDict - Format and video info dictionary.
   * @returns {Promise<boolean>}
   */
  async download(filename, infoDict) {
    this._make_parent_dirs(filename);
    return await this.real_download(filename, infoDict);
  }
}
