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

import { InfoExtractor } from './common.js';
import { GenericIE } from './generic.js';
import { YoutubeIE } from './youtube/video.js';
import { TikTokIE } from './tiktok.js';

export * from './common.js';
export * from './generic.js';
export * from './youtube/index.js';
export * from './tiktok.js';

/**
 * List of all registered Information Extractor classes.
 * Order represents default resolution priority.
 */
export const EXTRACTORS = [YoutubeIE, TikTokIE, GenericIE];

/**
 * Yields extractor classes sorted by descending priority weight.
 * 1:1 with yt-dlp gen_extractor_classes.
 *
 * @returns {Array<typeof InfoExtractor>}
 */
export function gen_extractor_classes() {
  return [...EXTRACTORS].sort((a, b) => (b._WEIGHT || 0) - (a._WEIGHT || 0));
}

/**
 * Resolves the appropriate extractor class for a given URL or name.
 * 1:1 with yt-dlp get_info_extractor.
 *
 * @param {string} urlOrName
 * @returns {typeof InfoExtractor}
 */
export function get_info_extractor(urlOrName) {
  // Direct name lookup
  const byName = EXTRACTORS.find((ie) => ie.IE_NAME.toLowerCase() === urlOrName.toLowerCase());
  if (byName) return byName;

  // URL matching in priority order
  for (const ie of gen_extractor_classes()) {
    if (ie.suitable(urlOrName)) {
      return ie;
    }
  }

  return GenericIE;
}
