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

import { YoutubeDL, DEFAULT_OUTTMPL } from './YoutubeDL.js';

export { YoutubeDL, DEFAULT_OUTTMPL };
export * from './utils/index.js';
export * from './networking/index.js';
export * from './downloader/index.js';
export * from './extractor/index.js';
export * from './postprocessor/index.js';

/**
 * High-level one-liner to download video or audio from any supported URL.
 *
 * @param {string|string[]} urlOrUrls - Single URL or list of URLs.
 * @param {object} [options] - Configuration options passed to YoutubeDL instance.
 * @returns {Promise<{ success: boolean, code: number, files: string[], info: object[] }>}
 */
export async function download(urlOrUrls, options = {}) {
  const ydl = new YoutubeDL(options);
  const code = await ydl.download(urlOrUrls);
  return {
    success: code === 0,
    code,
    files: ydl.lastResult?.files || [],
    info: ydl.lastResult?.info || []
  };
}

/**
 * Extracts metadata and format list for a URL without downloading media.
 *
 * @param {string} url - Target URL.
 * @param {object} [options] - Configuration options passed to YoutubeDL instance.
 * @returns {Promise<object>} Extracted media info dictionary.
 */
export async function extractInfo(url, options = {}) {
  const ydl = new YoutubeDL({ ...options, skip_download: true });
  return ydl.extract_info(url, { download: false });
}

/**
 * Alias for extractInfo.
 * @param {string} url
 * @param {object} [options]
 */
export async function getInfo(url, options = {}) {
  return extractInfo(url, options);
}

/**
 * Downloads a video's music/audio track with embedded ID3 metadata, album cover, and lyrics.
 *
 * @param {string} url - Media URL.
 * @param {object} [options] - Music extraction options.
 * @returns {Promise<{ filename: string, info: object, artist: string, title: string, album: string, genre: string|null, year: string|null, lyrics: string|null, synced_lyrics: string|null, lrc_file: string|null }>}
 */
export async function downloadMusic(url, options = {}) {
  const ydl = new YoutubeDL(options);
  return ydl.extract_audio(url, options);
}

/**
 * Alias for downloadMusic / extract_audio.
 * @param {string} url
 * @param {object} [options]
 */
export async function extractAudio(url, options = {}) {
  return downloadMusic(url, options);
}

/**
 * Inspects all available video and audio streams, resolutions, and codecs for a URL.
 *
 * @param {string|object} urlOrInfo - Video URL or info dict.
 * @param {boolean} [print=false] - Whether to print the formatted table to console.
 * @returns {Promise<Array<object>>}
 */
export async function listFormats(urlOrInfo, print = false) {
  const ydl = new YoutubeDL({ quiet: !print });
  const info = (typeof urlOrInfo === 'string')
    ? await ydl.extract_info(urlOrInfo, { download: false })
    : urlOrInfo;
  return ydl.list_formats(info, print);
}

/**
 * Downloads video stream and music/audio stream as separate files.
 *
 * @param {string} url - Media URL.
 * @param {object} [options] - Separate download options.
 * @returns {Promise<{ video: object, audio: object }>}
 */
export async function downloadSeparate(url, options = {}) {
  const ydl = new YoutubeDL(options);
  return ydl.download_separate(url, options);
}

/**
 * Downloads a video thumbnail or image URL directly to disk.
 *
 * @param {string|object} urlOrInfo - Image URL or media info object.
 * @param {string} [targetPath] - Target file path.
 * @returns {Promise<{ filename: string, bytes: number }>}
 */
export async function downloadImage(urlOrInfo, targetPath = null) {
  const ydl = new YoutubeDL();
  return ydl.download_image(urlOrInfo, targetPath);
}

/**
 * Fetches plain and synchronized lyrics for a track.
 *
 * @param {string|object} urlOrInfo - Video URL, media info object, or track name.
 * @param {object} [options]
 * @returns {Promise<object|null>}
 */
export async function getLyrics(urlOrInfo, options = {}) {
  const ydl = new YoutubeDL();
  return ydl.get_lyrics(urlOrInfo, options);
}

/**
 * Resolves rich music metadata (genre, album, release year) for a track.
 *
 * @param {string|object} urlOrInfo - Video URL or media info object.
 * @returns {Promise<object|null>}
 */
export async function getMetadata(urlOrInfo) {
  const ydl = new YoutubeDL();
  return ydl.get_music_metadata(urlOrInfo);
}

/**
 * Factory and unified namespace for js_ydlp.
 * Callable as `ydlp(options)` or used as an object with static helper methods.
 *
 * @param {object} [options]
 * @returns {YoutubeDL}
 */
export function ydlp(options = {}) {
  return new YoutubeDL(options);
}

Object.assign(ydlp, {
  YoutubeDL,
  DEFAULT_OUTTMPL,
  download,
  extractInfo,
  getInfo,
  downloadMusic,
  extractAudio,
  listFormats,
  downloadSeparate,
  downloadImage,
  getLyrics,
  getMetadata
});

export default ydlp;
