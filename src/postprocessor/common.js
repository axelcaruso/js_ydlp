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
 * Base class for all post-processors.
 * 1:1 with yt-dlp PostProcessor.
 */
export class PostProcessor {
  /**
   * @param {import('../YoutubeDL.js').YoutubeDL} [ydl=null]
   */
  constructor(ydl = null) {
    this.ydl = ydl;
    this._configuration_args = [];
  }

  /**
   * Post-processor key name.
   */
  get pp_key() {
    return this.constructor.name;
  }

  /**
   * Executes post-processing step on a downloaded file.
   *
   * @param {object} info - Media info dictionary.
   * @returns {Promise<[string[], object]>} Tuple of files to delete and updated info dictionary.
   */
  async run(info) {
    return [[], info];
  }
}
