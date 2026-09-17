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
import path from 'node:path';
import { RequestDirector } from './networking/RequestDirector.js';
import { CookieJar } from './networking/CookieJar.js';
import { get_info_extractor, gen_extractor_classes, InfoExtractor } from './extractor/index.js';
import { get_suitable_downloader } from './downloader/index.js';
import { sanitize_filename, format_bytes } from './utils/formatting.js';
import { determine_ext } from './utils/networking.js';
import { DownloadError, ExtractorError } from './utils/common.js';
import { LyricsProvider } from './utils/lyrics.js';
import { FFmpegPostProcessor } from './postprocessor/ffmpeg.js';

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
    const rawParams = { ...params };
    const normalized = {
      format: rawParams.format || 'best',
      outtmpl: rawParams.output || rawParams.outtmpl || rawParams.out || DEFAULT_OUTTMPL,
      quiet: rawParams.quiet ?? false,
      verbose: rawParams.verbose ?? false,
      skip_download: rawParams.skipDownload ?? rawParams.skip_download ?? false,
      continuedl: rawParams.continueDl ?? rawParams.continuedl ?? true,
      cookiefile: rawParams.cookieFile || rawParams.cookiefile || null,
      cookiejar: rawParams.cookieJar || rawParams.cookiejar || null,
      http_headers: rawParams.httpHeaders || rawParams.http_headers || null,
      recode_video: rawParams.recodeVideo || rawParams.recode_video || (rawParams.ensureH264 || rawParams.ensure_h264 ? 'mp4' : null),
      auto_recode_hevc: rawParams.autoRecodeHevc ?? rawParams.auto_recode_hevc ?? true,
      prefer_h264: rawParams.preferH264 ?? rawParams.prefer_h264 ?? true,
      ...rawParams
    };

    if (rawParams.output && !rawParams.outtmpl) normalized.outtmpl = rawParams.output;
    if (rawParams.out && !rawParams.outtmpl) normalized.outtmpl = rawParams.out;
    this.params = normalized;

    // Initialize CookieJar
    this.cookiejar = this.params.cookiejar || new CookieJar();
    if (this.params.cookiefile) {
      this.cookiejar.loadFromFile(this.params.cookiefile);
    }

    // Initialize RequestDirector
    this.director = new RequestDirector({
      cookiejar: this.cookiejar,
      headers: this.params.http_headers
    });

    /** @type {Array<typeof InfoExtractor>} */
    this._ies = [];
    /** @type {Array<any>} */
    this._pps = [];
    /** @type {Array<(status: object) => void>} */
    const rawHooks = this.params.progress_hooks || this.params.progressHooks || [];
    const hooks = Array.isArray(rawHooks) ? rawHooks : [rawHooks];
    if (typeof this.params.onProgress === 'function') {
      hooks.push(this.params.onProgress);
    }
    this._progressHooks = [...hooks];

    // Load registered extractors
    for (const ieClass of gen_extractor_classes()) {
      this.add_info_extractor(ieClass);
    }
  }

  /**
   * Sets format selector fluently and returns this instance.
   * @param {string} fmt
   * @returns {this}
   */
  format(fmt) {
    this.params.format = fmt;
    return this;
  }

  /**
   * Sets output filename template fluently and returns this instance.
   * @param {string} tmpl
   * @returns {this}
   */
  output(tmpl) {
    this.params.outtmpl = tmpl;
    return this;
  }

  /**
   * Registers a progress callback fluently and returns this instance.
   * @param {(status: object) => void} fn
   * @returns {this}
   */
  onProgress(fn) {
    this.add_progress_hook(fn);
    return this;
  }

  /**
   * Event listener shorthand (e.g. .on('progress', cb)).
   * @param {string} event
   * @param {Function} fn
   * @returns {this}
   */
  on(event, fn) {
    if (event === 'progress' && typeof fn === 'function') {
      this.add_progress_hook(fn);
    }
    return this;
  }

  /**
   * Sets cookie file path fluently and returns this instance.
   * @param {string} filePath
   * @returns {this}
   */
  cookieFile(filePath) {
    this.params.cookiefile = filePath;
    this.cookiejar.loadFromFile(filePath);
    return this;
  }

  /**
   * Enables automatic video recoding to universal H.264/AAC.
   * @param {string|boolean} [codec='mp4']
   * @returns {this}
   */
  recode(codec = 'mp4') {
    this.params.recode_video = codec;
    return this;
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
   * Alias for add_progress_hook.
   * @param {(status: object) => void} hook
   */
  addProgressHook(hook) {
    return this.add_progress_hook(hook);
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

    if (typeof selector === 'function') {
      return formats.find(selector) || null;
    }

    const cleanSelector = selector ? selector.trim() : 'best';

    // 1. Direct format_id match
    const directMatch = formats.find((f) => String(f.format_id) === cleanSelector);
    if (directMatch) return directMatch;

    // 2. Worst format overall
    if (cleanSelector === 'worst') {
      return formats[0];
    }

    // 3. Best audio only (music track)
    if (cleanSelector === 'bestaudio') {
      const audioOnly = formats.filter(
        (f) => (!f.vcodec || f.vcodec === 'none') && f.acodec && f.acodec !== 'none'
      );
      if (audioOnly.length > 0) {
        return [...audioOnly].sort((a, b) => (a.tbr || a.abr || 0) - (b.tbr || b.abr || 0)).pop();
      }
    }

    // 4. Worst audio only
    if (cleanSelector === 'worstaudio') {
      const audioOnly = formats.filter(
        (f) => (!f.vcodec || f.vcodec === 'none') && f.acodec && f.acodec !== 'none'
      );
      if (audioOnly.length > 0) {
        return [...audioOnly].sort((a, b) => (a.tbr || a.abr || 0) - (b.tbr || b.abr || 0))[0];
      }
    }

    // 5. Best video only
    if (cleanSelector === 'bestvideo') {
      const videoOnly = formats.filter((f) => f.vcodec && f.vcodec !== 'none');
      if (videoOnly.length > 0) {
        return [...videoOnly].sort((a, b) => {
          const resA = (a.height || 0) * 10000 + (a.width || 0);
          const resB = (b.height || 0) * 10000 + (b.width || 0);
          if (resA !== resB) return resA - resB;
          return (a.tbr || 0) - (b.tbr || 0);
        }).pop();
      }
    }

    // 6. Worst video only
    if (cleanSelector === 'worstvideo') {
      const videoOnly = formats.filter((f) => f.vcodec && f.vcodec !== 'none');
      if (videoOnly.length > 0) {
        return [...videoOnly].sort((a, b) => {
          const resA = (a.height || 0) * 10000 + (a.width || 0);
          const resB = (b.height || 0) * 10000 + (b.width || 0);
          if (resA !== resB) return resA - resB;
          return (a.tbr || 0) - (b.tbr || 0);
        })[0];
      }
    }

    // 7. Best muxed video (with both video and audio)
    const muxed = formats.filter(
      (f) => f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none'
    );

    if (muxed.length > 0 && cleanSelector === 'best') {
      return [...muxed].sort((a, b) => {
        const resA = (a.height || 0) * 10000 + (a.width || 0);
        const resB = (b.height || 0) * 10000 + (b.width || 0);
        if (resA !== resB) return resA - resB;
        return (a.tbr || 0) - (b.tbr || 0);
      }).pop();
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
    const tmpl = infoDict.outtmpl || this.params.outtmpl || DEFAULT_OUTTMPL;

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

      // Auto-recode HEVC or requested codec to universal H.264 (yuv420p + aac) for maximum player compatibility
      const isHevc = info.selected_format?.vcodec === 'hevc' || info.vcodec === 'hevc';
      const shouldRecodeH264 = Boolean(
        this.params.recode_video === 'mp4' ||
        this.params.recode_video === 'h264' ||
        this.params.recode_video === true ||
        this.params.ensure_h264 === true ||
        this.params.compat_codec === true ||
        (isHevc && this.params.auto_recode_hevc !== false)
      );

      if (shouldRecodeH264 && fs.existsSync(filename)) {
        const ffmpeg = new FFmpegPostProcessor();
        if (await ffmpeg.isAvailable()) {
          this.to_screen(`[ffmpeg] Converting ${path.basename(filename)} to universal H.264/AAC for player compatibility...`);
          await ffmpeg.ensureUniversalVideo(filename, {
            vcodec: 'libx264',
            acodec: 'aac',
            preset: this.params.recode_preset || 'fast',
            crf: this.params.recode_crf || 22
          });
          this.to_screen(`[ffmpeg] 100% universal H.264 conversion complete: ${path.basename(filename)}`);
        }
      }
    }

    return info;
  }

  /**
   * Downloads a list of URLs (or single URL) in sequence.
   * 1:1 with yt-dlp download.
   *
   * @param {string|string[]} urlList - Single URL or array of URLs to download.
   * @returns {Promise<number>} Exit code (0 for success, 1 on error).
   */
  async download(urlList) {
    const urls = Array.isArray(urlList) ? urlList : [urlList];
    let hasError = false;
    const downloadedFiles = [];
    const downloadedInfos = [];

    for (const url of urls) {
      try {
        const info = await this.extract_info(url, { download: true });
        downloadedInfos.push(info);
        if (info._filename) downloadedFiles.push(info._filename);
      } catch (err) {
        hasError = true;
        this.report_error(`Failed to download ${url}: ${err.message}`);
      }
    }

    const code = hasError ? 1 : 0;
    this.last_result = {
      success: !hasError,
      code,
      files: downloadedFiles,
      info: downloadedInfos
    };
    this.lastResult = this.last_result;
    return code;
  }

  /**
   * Formats and prints or returns a structured table of all available streams.
   * Equivalent to `yt-dlp -F` / `--list-formats`.
   * Displays format ID, extension, resolution, FPS, filesize, video codec, and audio codec.
   *
   * @param {object} infoDict - Info dictionary returned by extract_info.
   * @param {boolean} [print=true] - Whether to print to stdout / screen logger.
   * @returns {Array<{format_id: string, ext: string, resolution: string, fps: number|null, filesize: string, vcodec: string, acodec: string, note: string, raw: object}>}
   */
  list_formats(infoDict, print = true) {
    if (!infoDict || !Array.isArray(infoDict.formats) || infoDict.formats.length === 0) {
      if (print) this.to_screen(`[info] No formats found for ${infoDict?.title || 'media'}`);
      return [];
    }

    const rows = infoDict.formats.map((f) => {
      const width = f.width;
      const height = f.height;
      let res = 'audio only';
      if (width && height) {
        res = `${width}x${height}`;
      } else if (height) {
        res = `${height}p`;
      } else if (f.vcodec && f.vcodec !== 'none') {
        res = 'video only';
      }

      const fpsStr = f.fps ? String(f.fps) : '-';
      const sizeStr = f.filesize ? format_bytes(f.filesize) : (f.tbr ? `~${Math.round(f.tbr)}k` : 'unknown');
      const vcodec = f.vcodec || 'none';
      const acodec = f.acodec || 'none';
      const note = f.format_note || '';

      return {
        format_id: String(f.format_id),
        ext: f.ext || 'unknown',
        resolution: res,
        fps: f.fps || null,
        filesize: sizeStr,
        vcodec,
        acodec,
        note,
        raw: f
      };
    });

    if (print) {
      this.to_screen(`[info] Available formats for ${infoDict.title || infoDict.id}:`);
      this.to_screen('ID     EXT   RESOLUTION   FPS  FILESIZE    VCODEC          ACODEC          MORE INFO');
      this.to_screen('-----------------------------------------------------------------------------------------');
      for (const r of rows) {
        const idCol = r.format_id.padEnd(6);
        const extCol = r.ext.padEnd(5);
        const resCol = r.resolution.padEnd(12);
        const fpsCol = r.fps ? String(r.fps).padEnd(4) : '-   ';
        const sizeCol = r.filesize.padEnd(11);
        const vcodecCol = r.vcodec.padEnd(15);
        const acodecCol = r.acodec.padEnd(15);
        this.to_screen(`${idCol} ${extCol} ${resCol} ${fpsCol} ${sizeCol} ${vcodecCol} ${acodecCol} ${r.note}`);
      }
    }

    return rows;
  }

  /**
   * Downloads a video stream and its music/audio stream separately.
   * Useful when downloading pristine adaptive streams without merging, or extracting audio track separately.
   *
   * @param {string} url - Target URL.
   * @param {object} [options]
   * @param {string|Function} [options.videoFormat='bestvideo'] - Format selector for video.
   * @param {string|Function} [options.audioFormat='bestaudio'] - Format selector for audio.
   * @param {string} [options.videoOuttmpl] - Output template or filename for video.
   * @param {string} [options.audioOuttmpl] - Output template or filename for audio.
   * @returns {Promise<{video: object, audio: object}>}
   */
  async download_separate(url, options = {}) {
    const videoSelector = options.videoFormat || options.video_format || 'bestvideo';
    const audioSelector = options.audioFormat || options.audio_format || 'bestaudio';
    const videoOuttmpl = options.videoOuttmpl || options.video_outtmpl || options.videoOutput || null;
    const audioOuttmpl = options.audioOuttmpl || options.audio_outtmpl || options.audioOutput || null;

    // Extract once without download
    const info = await this.extract_info(url, { download: false });
    if (!info.formats || info.formats.length === 0) {
      throw new Error(`No formats available for ${url}`);
    }

    // 1. List formats with resolutions & codecs
    this.list_formats(info, true);

    // 2. Select video format
    const chosenVideo = this.select_format(info.formats, videoSelector);
    if (!chosenVideo) {
      throw new Error(`Could not find matching video format for selector: ${videoSelector}`);
    }

    // 3. Select audio format
    const chosenAudio = this.select_format(info.formats, audioSelector);
    if (!chosenAudio) {
      throw new Error(`Could not find matching audio format for selector: ${audioSelector}`);
    }

    this.to_screen(`[download_separate] Selected video format: ${chosenVideo.format_id} (${chosenVideo.width}x${chosenVideo.height}, codec: ${chosenVideo.vcodec})`);
    this.to_screen(`[download_separate] Selected audio format: ${chosenAudio.format_id} (codec: ${chosenAudio.acodec}, bitrate: ${chosenAudio.tbr || 'unknown'}k)`);

    // Download video stream
    const videoInfo = {
      ...info,
      selected_format: chosenVideo,
      url: chosenVideo.url,
      ext: chosenVideo.ext || 'mp4',
      format_id: chosenVideo.format_id
    };
    const videoFilename = videoOuttmpl
      ? videoOuttmpl
      : this.prepare_filename({ ...videoInfo, title: `${info.title}_video` });

    const VideoDownloaderClass = get_suitable_downloader(videoInfo, this.params);
    const videoDownloader = new VideoDownloaderClass(this, {
      ...this.params,
      progress_hooks: this._progressHooks
    });
    this.to_screen(`[download] Downloading video stream to: ${videoFilename}`);
    await videoDownloader.download(videoFilename, videoInfo);
    videoInfo._filename = videoFilename;

    // Download audio stream (music)
    const audioInfo = {
      ...info,
      selected_format: chosenAudio,
      url: chosenAudio.url,
      ext: chosenAudio.ext || 'm4a',
      format_id: chosenAudio.format_id
    };
    const audioFilename = audioOuttmpl
      ? audioOuttmpl
      : this.prepare_filename({ ...audioInfo, title: `${info.title}_music` });

    const AudioDownloaderClass = get_suitable_downloader(audioInfo, this.params);
    const audioDownloader = new AudioDownloaderClass(this, {
      ...this.params,
      progress_hooks: this._progressHooks
    });
    this.to_screen(`[download] Downloading music/audio stream to: ${audioFilename}`);
    await audioDownloader.download(audioFilename, audioInfo);
    audioInfo._filename = audioFilename;

    return {
      video: videoInfo,
      audio: audioInfo
    };
  }

  /**
   * Downloads an image from a URL or video thumbnail.
   *
   * @param {string|object} urlOrInfo - Image URL or media info dictionary containing thumbnails.
   * @param {string} [targetPath] - Output file path or filename.
   * @returns {Promise<{ filename: string, bytes: number }>}
   */
  async download_image(urlOrInfo, targetPath = null) {
    let imageUrl = null;
    let baseName = 'image';

    if (typeof urlOrInfo === 'string') {
      imageUrl = urlOrInfo;
      const u = new URL(imageUrl);
      baseName = sanitize_filename(u.pathname.split('/').pop() || 'image');
    } else if (urlOrInfo && typeof urlOrInfo === 'object') {
      baseName = sanitize_filename(urlOrInfo.title || urlOrInfo.id || 'thumbnail');
      if (Array.isArray(urlOrInfo.thumbnails) && urlOrInfo.thumbnails.length > 0) {
        const sortedThumbs = [...urlOrInfo.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
        imageUrl = sortedThumbs[0].url;
      } else if (urlOrInfo.thumbnail) {
        imageUrl = urlOrInfo.thumbnail;
      }
    }

    if (!imageUrl) {
      throw new Error('No valid image URL found to download.');
    }

    const ext = determine_ext(imageUrl) || 'jpg';
    let filename = targetPath;
    if (!filename) {
      filename = `${baseName}.${ext}`;
    }

    this.to_screen(`[image] Downloading image from: ${imageUrl}`);
    this.to_screen(`[image] Destination: ${filename}`);

    const res = await this.director.send(imageUrl);
    if (!res.ok) {
      throw new Error(`Failed to download image (HTTP ${res.status}): ${imageUrl}`);
    }
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
    fs.writeFileSync(filename, buffer);
    this.to_screen(`[image] 100% of ${filename} (${format_bytes(buffer.length)})`);

    return {
      filename,
      bytes: buffer.length
    };
  }

  /**
   * Fetches lyrics for a track or video URL.
   * Searches open lyrics databases (LRCLIB) and falls back to YouTube caption tracks.
   *
   * @param {string|object} urlOrInfo - Video URL, media info object, or search query.
   * @param {object} [options]
   * @param {string} [options.artist] - Explicit artist name.
   * @param {string} [options.title] - Explicit track title.
   * @param {string} [options.album] - Explicit album name.
   * @returns {Promise<{ plainLyrics: string|null, syncedLyrics: string|null, artist: string, title: string, source: string }|null>}
   */
  async get_lyrics(urlOrInfo, options = {}) {
    const lyricsProvider = new LyricsProvider({ director: this.director });

    if (typeof urlOrInfo === 'string') {
      if (urlOrInfo.startsWith('http://') || urlOrInfo.startsWith('https://')) {
        const info = await this.extract_info(urlOrInfo, { download: false });
        return lyricsProvider.getLyrics(info, options);
      }
      return lyricsProvider.getLyrics({ title: urlOrInfo }, options);
    }

    if (urlOrInfo && typeof urlOrInfo === 'object') {
      return lyricsProvider.getLyrics(urlOrInfo, options);
    }

    return null;
  }

  /**
   * Fetches music metadata (genre, release date, album, artist, title) for a track.
   *
   * @param {string|object} urlOrInfo
   * @param {object} [options]
   * @returns {Promise<{ genre: string|null, year: string|null, releaseDate: string|null, album: string|null, artist: string, title: string, source: string }|null>}
   */
  async get_music_metadata(urlOrInfo, options = {}) {
    const lyricsProvider = new LyricsProvider({ director: this.director });
    if (typeof urlOrInfo === 'string') {
      if (urlOrInfo.startsWith('http://') || urlOrInfo.startsWith('https://')) {
        const info = await this.extract_info(urlOrInfo, { download: false });
        return lyricsProvider.fetchMusicMetadata({ artist: options.artist || info.artist, title: options.title || info.title, info });
      }
      return lyricsProvider.fetchMusicMetadata({ artist: options.artist, title: urlOrInfo, info: {} });
    }
    if (urlOrInfo && typeof urlOrInfo === 'object') {
      return lyricsProvider.fetchMusicMetadata({ artist: options.artist || urlOrInfo.artist, title: options.title || urlOrInfo.title, info: urlOrInfo });
    }
    return null;
  }

  /**
   * Downloads a media URL and extracts its audio track (music) with embedded thumbnail, metadata, and lyrics.
   * Equivalent to yt-dlp -x --embed-thumbnail --add-metadata.
   *
   * @param {string} url - Media URL.
   * @param {object} [options]
   * @param {string} [options.outtmpl] - Target audio filename or template (e.g. 'music.mp3' or 'music.m4a').
   * @param {string} [options.format='mp3'] - Output audio format ('mp3', 'm4a', 'wav', 'opus').
   * @param {string} [options.acodec] - Target audio codec ('copy', 'libmp3lame', etc.).
   * @param {string} [options.artist] - Custom artist name (defaults to parsed video artist or uploader).
   * @param {string} [options.title] - Custom song title (defaults to parsed title).
   * @param {string} [options.album] - Custom album name.
   * @param {string} [options.genre] - Custom genre name (auto-searched if omitted).
   * @param {string|number} [options.year] - Release year.
   * @param {boolean} [options.fetch_metadata=true] - Whether to search online databases for genre and album info.
   * @param {string} [options.cover] - Custom cover image URL or local path.
   * @param {boolean} [options.embed_thumbnail=true] - Whether to embed cover art image.
   * @param {boolean} [options.embed_lyrics=true] - Whether to search and embed lyrics into audio file tags.
   * @param {boolean} [options.write_lrc=false] - Whether to save synchronized .lrc file alongside audio.
   * @param {string|boolean} [options.lyrics] - Custom lyrics string or boolean flag to trigger search.
   * @param {Record<string, string>} [options.metadata] - Additional ID3 metadata tags.
   * @returns {Promise<{ filename: string, info: object, artist: string, title: string, album: string, genre: string|null, year: string|null, lyrics: string|null, synced_lyrics: string|null, lrc_file: string|null }>}
   */
  async extract_audio(urlOrInfo, options = {}) {
    const rawOpts = { ...options };
    const opts = {
      outtmpl: rawOpts.output || rawOpts.outtmpl || rawOpts.out || '%(title)s.mp3',
      fetch_metadata: rawOpts.fetchMetadata ?? rawOpts.fetch_metadata ?? true,
      embed_thumbnail: rawOpts.embedThumbnail ?? rawOpts.embed_thumbnail ?? true,
      embed_lyrics: rawOpts.embedLyrics ?? rawOpts.embed_lyrics ?? true,
      write_lrc: rawOpts.writeLrc ?? rawOpts.write_lrc ?? false,
      embed_metadata: rawOpts.embedMetadata ?? rawOpts.embed_metadata ?? true,
      cover: rawOpts.cover || rawOpts.coverPath || null,
      artist: rawOpts.artist,
      title: rawOpts.title,
      album: rawOpts.album,
      genre: rawOpts.genre,
      year: rawOpts.year || rawOpts.date,
      lyrics: rawOpts.lyrics,
      acodec: rawOpts.acodec,
      metadata: rawOpts.metadata || {},
      ...rawOpts
    };

    const targetPath = opts.outtmpl;
    const isDirectAudioExt = targetPath.endsWith('.mp3') || targetPath.endsWith('.m4a') || targetPath.endsWith('.aac') || targetPath.endsWith('.opus') || targetPath.endsWith('.wav');

    // 1. Extract metadata
    const info = (urlOrInfo && typeof urlOrInfo === 'object')
      ? urlOrInfo
      : await this.extract_info(urlOrInfo, { download: false });
    const url = info.webpage_url || (typeof urlOrInfo === 'string' ? urlOrInfo : '');

    // 2. Parse artist and title from metadata or title string
    let artist = opts.artist || info.artist;
    let title = opts.title || info.track;

    if (!artist && info.title && info.title.includes(' - ')) {
      const parts = info.title.split(' - ');
      artist = parts[0].trim();
      if (!title) {
        title = parts.slice(1).join(' - ').split('|')[0].trim();
      }
    }

    if (!artist) {
      artist = info.uploader || info.channel || 'Unknown Artist';
    }
    if (!title) {
      title = info.title || 'Unknown Title';
    }
    let album = opts.album || info.album || title;
    let genre = opts.genre || info.genre || null;
    let year = opts.year || info.release_year || null;

    // Search rich music metadata (genre, official album, release year)
    if (opts.fetch_metadata !== false) {
      try {
        const lyricsProvider = new LyricsProvider({ director: this.director });
        const musicMeta = await lyricsProvider.fetchMusicMetadata({ artist, title, info });
        if (musicMeta) {
          if (!genre && musicMeta.genre) genre = musicMeta.genre;
          if ((!album || album === title) && musicMeta.album) album = musicMeta.album;
          if (!year && musicMeta.year) year = musicMeta.year;
          this.to_screen(`[extract_audio] Music metadata found: Genre: ${genre || 'N/A'} | Album: ${album || 'N/A'} | Year: ${year || 'N/A'}`);
        }
      } catch (err) {
        this.report_warning(`Could not fetch rich music metadata: ${err.message}`);
      }
    }

    this.to_screen(`[extract_audio] Artist: ${artist} | Title: ${title}${genre ? ` | Genre: ${genre}` : ''}`);

    // 3. Download thumbnail for cover art embedding
    let tmpCoverFile = null;
    if (opts.embed_thumbnail !== false) {
      const sortedThumbs = Array.isArray(info.thumbnails)
        ? [...info.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0))
        : [];
      const thumbUrl = opts.cover || sortedThumbs[0]?.url || info.thumbnail;
      if (thumbUrl) {
        tmpCoverFile = path.resolve(`temp_cover_${Date.now()}_${info.id}.jpg`);
        try {
          this.to_screen(`[extract_audio] Downloading cover art from: ${thumbUrl}`);
          await this.download_image(thumbUrl, tmpCoverFile);
        } catch (err) {
          this.report_warning(`Could not download thumbnail for embedding: ${err.message}`);
          tmpCoverFile = null;
        }
      }
    }

    // 4. Fetch lyrics if requested or enabled
    let lyricsResult = null;
    let lrcFilePath = null;
    const shouldFetchLyrics = Boolean(
      opts.lyrics || opts.embed_lyrics === true || opts.write_lrc === true
    );

    if (shouldFetchLyrics) {
      if (typeof opts.lyrics === 'string' && opts.lyrics.trim() !== '') {
        lyricsResult = {
          plainLyrics: opts.lyrics,
          syncedLyrics: null,
          artist,
          title,
          source: 'custom'
        };
      } else {
        this.to_screen(`[extract_audio] Searching lyrics for: ${artist} - ${title}`);
        const lyricsProvider = new LyricsProvider({ director: this.director });
        lyricsResult = await lyricsProvider.getLyrics(info, { artist, title, album });
        if (lyricsResult && (lyricsResult.plainLyrics || lyricsResult.syncedLyrics)) {
          this.to_screen(`[extract_audio] Lyrics found from ${lyricsResult.source}`);
        } else {
          this.to_screen('[extract_audio] No lyrics found');
        }
      }
    }

    const metadataTags = {
      artist,
      title,
      album,
      ...(genre ? { genre } : {}),
      ...(year ? { date: String(year) } : {}),
      ...opts.metadata
    };

    if (lyricsResult) {
      if (opts.embed_lyrics !== false && (lyricsResult.plainLyrics || lyricsResult.syncedLyrics)) {
        metadataTags.lyrics = lyricsResult.plainLyrics || lyricsResult.syncedLyrics;
      }
    }

    let tmpVideoFile = null;

    try {
      // Check if an audio-only stream is already available with a direct URL
      const audioOnlyFormat = info.formats?.find(
        (f) => (!f.vcodec || f.vcodec === 'none') && f.acodec && f.acodec !== 'none' && f.url
      );

      if (audioOnlyFormat && (targetPath.endsWith(`.${audioOnlyFormat.ext}`) || !isDirectAudioExt)) {
        const destFilename = opts.outtmpl || this.prepare_filename({ ...info, ext: audioOnlyFormat.ext });
        fs.mkdirSync(path.dirname(path.resolve(destFilename)), { recursive: true });
        const DownloaderClass = get_suitable_downloader(audioOnlyFormat, this.params);
        const downloader = new DownloaderClass(this, { ...this.params, progress_hooks: this._progressHooks });
        await downloader.download(destFilename, audioOnlyFormat);

        if (tmpCoverFile || Object.keys(metadataTags).length > 0) {
          const ffmpeg = new FFmpegPostProcessor();
          await ffmpeg.embedMetadata(destFilename, { coverPath: tmpCoverFile, metadata: metadataTags });
        }

        if (opts.write_lrc && lyricsResult && (lyricsResult.syncedLyrics || lyricsResult.plainLyrics)) {
          lrcFilePath = destFilename.replace(/\.[^.]+$/, '') + '.lrc';
          fs.writeFileSync(lrcFilePath, lyricsResult.syncedLyrics || lyricsResult.plainLyrics, 'utf8');
          this.to_screen(`[extract_audio] Saved lyrics to: ${lrcFilePath}`);
        }

        return {
          filename: destFilename,
          info,
          artist,
          title,
          album,
          genre: metadataTags.genre || null,
          year: metadataTags.date || null,
          lyrics: lyricsResult?.plainLyrics || null,
          synced_lyrics: lyricsResult?.syncedLyrics || null,
          lrc_file: lrcFilePath
        };
      }

      // Otherwise, download the best format with audio (preferring audio-only for speed)
      const bestWithAudio = this.select_format(info.formats, 'bestaudio') || this.select_format(info.formats, 'best') || info.formats?.[0];
      if (!bestWithAudio) {
        throw new Error(`No format with audio available for ${url}`);
      }

      tmpVideoFile = path.resolve(`temp_${Date.now()}_${info.id}.${bestWithAudio.ext || 'mp4'}`);
      const DownloaderClass = get_suitable_downloader(bestWithAudio, this.params);
      const downloader = new DownloaderClass(this, { ...this.params, progress_hooks: this._progressHooks });

      this.to_screen(`[download] Downloading stream for audio extraction: ${bestWithAudio.format_id}`);
      await downloader.download(tmpVideoFile, bestWithAudio);

      // Resolve final audio path
      let finalAudioPath = opts.outtmpl;
      if (!finalAudioPath) {
        finalAudioPath = this.prepare_filename({ ...info, ext: 'mp3' });
      } else if (finalAudioPath.includes('%(')) {
        finalAudioPath = this.prepare_filename({ ...info, ext: 'mp3', outtmpl: finalAudioPath });
      }
      fs.mkdirSync(path.dirname(path.resolve(finalAudioPath)), { recursive: true });

      const ffmpeg = new FFmpegPostProcessor();
      this.to_screen(`[extract_audio] Extracting audio with cover art, metadata & lyrics to: ${finalAudioPath}`);
      await ffmpeg.extractAudio(tmpVideoFile, finalAudioPath, {
        acodec: opts.acodec,
        coverPath: tmpCoverFile,
        metadata: metadataTags
      });

      if (opts.write_lrc && lyricsResult && (lyricsResult.syncedLyrics || lyricsResult.plainLyrics)) {
        lrcFilePath = finalAudioPath.replace(/\.[^.]+$/, '') + '.lrc';
        fs.writeFileSync(lrcFilePath, lyricsResult.syncedLyrics || lyricsResult.plainLyrics, 'utf8');
        this.to_screen(`[extract_audio] Saved lyrics to: ${lrcFilePath}`);
      }

      this.to_screen(`[extract_audio] 100% of ${finalAudioPath}`);
      return {
        filename: finalAudioPath,
        info,
        artist,
        title,
        album,
        genre: metadataTags.genre || null,
        year: metadataTags.date || null,
        lyrics: lyricsResult?.plainLyrics || null,
        synced_lyrics: lyricsResult?.syncedLyrics || null,
        lrc_file: lrcFilePath
      };
    } finally {
      // Clean up temporary video and cover files
      try {
        if (tmpVideoFile && fs.existsSync(tmpVideoFile)) fs.unlinkSync(tmpVideoFile);
      } catch {}
      try {
        if (tmpCoverFile && fs.existsSync(tmpCoverFile)) fs.unlinkSync(tmpCoverFile);
      } catch {}
    }
  }

  // =========================================================================
  // Modern & Idiomatic camelCase Aliases
  // =========================================================================

  /**
   * Alias for extract_info.
   * @param {string} url
   * @param {object} [options]
   */
  extractInfo(url, options) {
    return this.extract_info(url, options);
  }

  /**
   * Alias for list_formats.
   * @param {object} infoDict
   * @param {boolean} [print=true]
   */
  listFormats(infoDict, print = true) {
    return this.list_formats(infoDict, print);
  }

  /**
   * Alias for download_separate.
   * @param {string} url
   * @param {object} [options]
   */
  downloadSeparate(url, options = {}) {
    return this.download_separate(url, options);
  }

  /**
   * Alias for download_image.
   * @param {string|object} urlOrInfo
   * @param {string} [targetPath]
   */
  downloadImage(urlOrInfo, targetPath = null) {
    return this.download_image(urlOrInfo, targetPath);
  }

  /**
   * Alias for extract_audio.
   * @param {string|object} urlOrInfo
   * @param {object} [options]
   */
  extractAudio(urlOrInfo, options = {}) {
    return this.extract_audio(urlOrInfo, options);
  }

  /**
   * Intuitive alias for extract_audio (download music with embedded tags & cover).
   * @param {string|object} urlOrInfo
   * @param {object} [options]
   */
  downloadMusic(urlOrInfo, options = {}) {
    return this.extract_audio(urlOrInfo, options);
  }

  /**
   * Intuitive alias for extract_audio.
   * @param {string|object} urlOrInfo
   * @param {object} [options]
   */
  downloadAudio(urlOrInfo, options = {}) {
    return this.extract_audio(urlOrInfo, options);
  }

  /**
   * Alias for get_lyrics.
   * @param {string|object} urlOrInfo
   * @param {object} [options]
   */
  getLyrics(urlOrInfo, options = {}) {
    return this.get_lyrics(urlOrInfo, options);
  }

  /**
   * Alias for get_music_metadata.
   * @param {string|object} urlOrInfo
   * @param {object} [options]
   */
  getMusicMetadata(urlOrInfo, options = {}) {
    return this.get_music_metadata(urlOrInfo, options);
  }

  /**
   * Intuitive alias for get_music_metadata.
   * @param {string|object} urlOrInfo
   * @param {object} [options]
   */
  getMetadata(urlOrInfo, options = {}) {
    return this.get_music_metadata(urlOrInfo, options);
  }

  /**
   * Alias for select_format.
   * @param {Array} formats
   * @param {string|Function} selector
   */
  selectFormat(formats, selector) {
    return this.select_format(formats, selector);
  }

  /**
   * Alias for prepare_filename.
   * @param {object} infoDict
   */
  prepareFilename(infoDict) {
    return this.prepare_filename(infoDict);
  }
}
