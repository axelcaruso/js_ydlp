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

import { spawn } from 'node:child_process';
import { PostProcessor } from './common.js';
import { PostProcessingError } from '../utils/common.js';

/**
 * FFmpeg post-processor for audio/video muxing and format conversion.
 * 1:1 with yt-dlp FFmpegPostProcessor.
 */
export class FFmpegPostProcessor extends PostProcessor {
  /**
   * Checks whether ffmpeg executable is installed and reachable.
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return new Promise((resolve) => {
      const proc = spawn('ffmpeg', ['-version']);
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });
  }

  /**
   * Merges separate video and audio streams into a single container.
   *
   * @param {string} videoPath - Input video file.
   * @param {string} audioPath - Input audio file.
   * @param {string} outputPath - Output container file.
   * @returns {Promise<string>} Output file path.
   */
  async mergeFiles(videoPath, audioPath, outputPath) {
    const available = await this.isAvailable();
    if (!available) {
      throw new PostProcessingError('FFmpeg is required for merging but was not found in PATH');
    }

    const args = [
      '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-c', 'copy',
      outputPath
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: 'ignore' });
      proc.on('error', (err) => reject(new PostProcessingError(`FFmpeg execution error: ${err.message}`)));
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new PostProcessingError(`FFmpeg failed with exit code ${code}`));
        }
      });
    });
  }

  /**
   * Extracts audio from a media file to a standalone audio file with optional metadata and cover art embedding.
   *
   * @param {string} inputPath - Input media file.
   * @param {string} outputPath - Output audio file.
   * @param {object} [options]
   * @param {string} [options.acodec] - Audio codec ('copy', 'libmp3lame', 'aac', etc.).
   * @param {string} [options.coverPath] - Path to cover art image (jpg/png/webp) to embed.
   * @param {Record<string, string>} [options.metadata] - Metadata key-values (artist, title, album, etc.).
   * @param {string} [options.bitrate='192k'] - Audio bitrate for mp3 encoding.
   * @returns {Promise<string>} Output file path.
   */
  async extractAudio(inputPath, outputPath, options = {}) {
    const available = await this.isAvailable();
    if (!available) {
      throw new PostProcessingError('FFmpeg is required for audio extraction but was not found in PATH');
    }

    let acodec = options.acodec;
    if (!acodec) {
      if (outputPath.endsWith('.mp3')) {
        acodec = 'libmp3lame';
      } else if (outputPath.endsWith('.m4a') || outputPath.endsWith('.aac')) {
        acodec = 'copy';
      } else {
        acodec = 'copy';
      }
    }

    const args = ['-y', '-i', inputPath];

    if (options.coverPath) {
      args.push('-i', options.coverPath);
      args.push('-map', '0:a');
      args.push('-map', '1:0');
      args.push('-c:v', 'mjpeg');
      args.push('-id3v2_version', '3');
      args.push('-metadata:s:v', 'title=Album cover');
      args.push('-metadata:s:v', 'comment=Cover (front)');
    } else {
      args.push('-vn');
    }

    args.push('-c:a', acodec);
    if (outputPath.endsWith('.mp3') && acodec === 'libmp3lame') {
      args.push('-b:a', options.bitrate || '192k');
    }

    const metadata = { ...options.metadata };
    if (options.lyrics && !metadata.lyrics) {
      metadata.lyrics = options.lyrics;
    }

    if (Object.keys(metadata).length > 0) {
      for (const [key, value] of Object.entries(metadata)) {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          args.push('-metadata', `${key}=${String(value)}`);
        }
      }
    }

    args.push(outputPath);

    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: 'ignore' });
      proc.on('error', (err) => reject(new PostProcessingError(`FFmpeg execution error: ${err.message}`)));
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new PostProcessingError(`FFmpeg failed with exit code ${code}`));
        }
      });
    });
  }

  /**
   * Embeds metadata tags and cover art image into an existing audio file.
   *
   * @param {string} audioPath - Path to existing audio file.
   * @param {object} [options]
   * @param {string} [options.coverPath] - Path to cover image.
   * @param {Record<string, string>} [options.metadata] - Metadata tags (artist, title, album, etc.).
   * @returns {Promise<string>} Output file path.
   */
  async embedMetadata(audioPath, options = {}) {
    const tmpOut = `${audioPath}.tmp_tagged.${audioPath.split('.').pop()}`;
    await this.extractAudio(audioPath, tmpOut, options);
    const fs = await import('node:fs');
    fs.unlinkSync(audioPath);
    fs.renameSync(tmpOut, audioPath);
    return audioPath;
  }

  /**
   * Recodes a video to universal H.264 (AVC) + AAC with yuv420p for 100% universal player compatibility.
   *
   * @param {string} inputPath - Input video path.
   * @param {string} outputPath - Output recoded video path.
   * @param {object} [options]
   * @param {string} [options.vcodec='libx264'] - Video codec.
   * @param {string} [options.acodec='aac'] - Audio codec.
   * @param {string} [options.pix_fmt='yuv420p'] - Pixel format.
   * @param {string} [options.preset='fast'] - x264 preset.
   * @param {string|number} [options.crf='22'] - Constant rate factor quality.
   * @returns {Promise<string>} Output path.
   */
  async recodeVideo(inputPath, outputPath, options = {}) {
    const available = await this.isAvailable();
    if (!available) {
      throw new PostProcessingError('FFmpeg is required for video recoding but was not found in PATH');
    }

    const vcodec = options.vcodec || 'libx264';
    const acodec = options.acodec || 'aac';
    const pixFmt = options.pix_fmt || 'yuv420p';
    const preset = options.preset || 'fast';
    const crf = options.crf !== undefined ? String(options.crf) : '22';

    const args = [
      '-y',
      '-i', inputPath,
      '-c:v', vcodec,
      '-pix_fmt', pixFmt,
      '-preset', preset,
      '-crf', crf,
      '-c:a', acodec,
      '-b:a', options.bitrate || '128k',
      '-movflags', '+faststart',
      outputPath
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: 'ignore' });
      proc.on('error', (err) => reject(new PostProcessingError(`FFmpeg execution error: ${err.message}`)));
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new PostProcessingError(`FFmpeg video recoding failed with exit code ${code}`));
        }
      });
    });
  }

  /**
   * In-place converts a video file to universal H.264 if not already compatible.
   *
   * @param {string} videoPath
   * @param {object} [options]
   * @returns {Promise<string>}
   */
  async ensureUniversalVideo(videoPath, options = {}) {
    const ext = videoPath.split('.').pop() || 'mp4';
    const tmpOut = `${videoPath}.tmp_h264.${ext}`;
    await this.recodeVideo(videoPath, tmpOut, options);
    const fs = await import('node:fs');
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
    fs.renameSync(tmpOut, videoPath);
    return videoPath;
  }
}
