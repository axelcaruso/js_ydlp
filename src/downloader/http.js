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
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { FileDownloader } from './common.js';
import { Request } from '../networking/Request.js';
import { DownloadError } from '../utils/common.js';

/**
 * Standard HTTP/HTTPS stream downloader with resume support and progress tracking.
 * 1:1 with yt-dlp HttpFD.
 */
export class HttpFD extends FileDownloader {
  /**
   * Executes HTTP download for a media file.
   *
   * @param {string} filename - Target path on disk.
   * @param {object} infoDict - Media info containing 'url' and optional 'http_headers'.
   * @returns {Promise<boolean>} True if download succeeded.
   */
  async real_download(filename, infoDict) {
    const url = infoDict.url;
    if (!url) {
      throw new DownloadError('No URL provided in info dictionary');
    }

    const tmpfilename = this.temp_name(filename);
    let resumeLen = 0;
    const canResume = this.params.continuedl !== false;

    if (canResume && fs.existsSync(tmpfilename)) {
      resumeLen = fs.statSync(tmpfilename).size;
    }

    const reqHeaders = { ...(infoDict.http_headers || {}) };
    if (resumeLen > 0) {
      reqHeaders['Range'] = `bytes=${resumeLen}-`;
    }

    const director = this.ydl ? this.ydl.director : null;
    let response;

    const req = new Request(url, { headers: reqHeaders });
    if (director) {
      response = await director.send(req);
    } else {
      const fetchRes = await fetch(url, {
        headers: reqHeaders,
        redirect: 'follow'
      });
      response = {
        status: fetchRes.status,
        headers: {
          get: (k) => fetchRes.headers.get(k)
        },
        body: fetchRes.body
      };
    }

    if (response.status !== 200 && response.status !== 206) {
      throw new DownloadError(`HTTP download failed with status ${response.status}`);
    }

    const isPartial = response.status === 206;
    const openMode = isPartial && resumeLen > 0 ? 'a' : 'w';
    if (!isPartial) {
      resumeLen = 0;
    }

    const rawContentLength = response.headers.get('content-length');
    const contentLength = rawContentLength ? parseInt(rawContentLength, 10) : null;
    const totalBytes = contentLength !== null ? contentLength + resumeLen : null;

    let downloadedBytes = resumeLen;
    const startTime = Date.now();
    let lastProgressTime = startTime;
    let lastDownloaded = downloadedBytes;

    const fileStream = fs.createWriteStream(tmpfilename, { flags: openMode });

    // Progress reporting transform/consumer
    const trackingStream = new Writable({
      write: (chunk, encoding, callback) => {
        downloadedBytes += chunk.length;
        const now = Date.now();
        const deltaMs = now - lastProgressTime;

        // Emit progress every 250ms or at completion
        if (deltaMs >= 250 || (totalBytes && downloadedBytes >= totalBytes)) {
          const deltaBytes = downloadedBytes - lastDownloaded;
          const speed = deltaMs > 0 ? Math.floor((deltaBytes / deltaMs) * 1000) : null;
          const remainingBytes = totalBytes ? totalBytes - downloadedBytes : null;
          const eta = speed && remainingBytes ? Math.ceil(remainingBytes / speed) : null;
          const percentage = totalBytes ? (downloadedBytes / totalBytes) * 100 : null;

          this._hook_progress({
            status: 'downloading',
            filename,
            tmpfilename,
            downloadedBytes,
            totalBytes,
            speed,
            eta,
            elapsed: Math.floor((now - startTime) / 1000),
            percentage
          });

          lastProgressTime = now;
          lastDownloaded = downloadedBytes;
        }

        fileStream.write(chunk, encoding, callback);
      },
      final: (callback) => {
        fileStream.end(callback);
      }
    });

    try {
      // If Web ReadableStream
      if (typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await new Promise((resolve, reject) => {
            trackingStream.write(Buffer.from(value), (err) => (err ? reject(err) : resolve()));
          });
        }
        await new Promise((resolve, reject) => {
          trackingStream.end((err) => (err ? reject(err) : resolve()));
        });
      } else {
        // Node stream
        await pipeline(response.body, trackingStream);
      }

      // Rename .part file to final destination
      if (fs.existsSync(filename)) {
        fs.unlinkSync(filename);
      }
      fs.renameSync(tmpfilename, filename);

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      this._hook_progress({
        status: 'finished',
        filename,
        downloadedBytes,
        totalBytes: downloadedBytes,
        elapsed,
        percentage: 100
      });

      return true;
    } catch (err) {
      this._hook_progress({
        status: 'error',
        filename,
        error: err.message
      });
      throw new DownloadError(`Error during stream write: ${err.message}`, err);
    }
  }
}
