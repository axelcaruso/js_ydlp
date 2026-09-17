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
   * Extracts audio from a media file to a standalone audio file.
   *
   * @param {string} inputPath - Input media file.
   * @param {string} outputPath - Output audio file.
   * @param {object} [options]
   * @param {string} [options.acodec] - Audio codec ('copy', 'libmp3lame', 'aac', etc.).
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

    const args = [
      '-y',
      '-i', inputPath,
      '-vn',
      '-c:a', acodec,
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
}
