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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { YoutubeDL } from '../src/YoutubeDL.js';
import { InfoExtractor } from '../src/extractor/common.js';

test('Obligatory build test: List resolutions/codecs, choose format, and download video and music separately', async (t) => {
  const tmpDir = path.resolve('test/tmp_sep_test');
  fs.mkdirSync(tmpDir, { recursive: true });

  const mockVideoData = Buffer.alloc(16384, 'V'); // 16 KB mock video payload
  const mockAudioData = Buffer.alloc(8192, 'A');  // 8 KB mock audio payload
  const mockImageData = Buffer.alloc(4096, 'I');  // 4 KB mock image payload

  // 1. Setup local HTTP media server
  const server = http.createServer((req, res) => {
    if (req.url === '/stream_video.mp4') {
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': mockVideoData.length
      });
      res.end(mockVideoData);
    } else if (req.url === '/stream_audio.m4a') {
      res.writeHead(200, {
        'Content-Type': 'audio/mp4',
        'Content-Length': mockAudioData.length
      });
      res.end(mockAudioData);
    } else if (req.url === '/thumbnail.jpg') {
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': mockImageData.length
      });
      res.end(mockImageData);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // 2. Custom mock extractor providing multi-format video & audio streams with resolutions and codecs
  class MultiStreamMockIE extends InfoExtractor {
    static IE_NAME = 'multistream_mock';
    static _VALID_URL = /http:\/\/127\.0\.0\.1:[0-9]+\/video_media/;

    async _real_extract(url) {
      return {
        id: 'test_track_001',
        title: 'Cyberpunk Odyssey - Main Theme',
        uploader: 'Synthetic Soundscapes',
        duration: 240,
        thumbnail: `${baseUrl}/thumbnail.jpg`,
        thumbnails: [
          { url: `${baseUrl}/thumbnail.jpg`, width: 1920, height: 1080 }
        ],
        formats: [
          {
            format_id: '137',
            url: `${baseUrl}/stream_video.mp4`,
            ext: 'mp4',
            width: 1920,
            height: 1080,
            fps: 60,
            vcodec: 'avc1.64002a',
            acodec: 'none',
            tbr: 4500,
            filesize: mockVideoData.length,
            format_note: '1080p60 Full HD'
          },
          {
            format_id: '136',
            url: `${baseUrl}/stream_video.mp4`,
            ext: 'mp4',
            width: 1280,
            height: 720,
            fps: 30,
            vcodec: 'avc1.4d401f',
            acodec: 'none',
            tbr: 2200,
            filesize: mockVideoData.length,
            format_note: '720p HD'
          },
          {
            format_id: '140',
            url: `${baseUrl}/stream_audio.m4a`,
            ext: 'm4a',
            width: null,
            height: null,
            fps: null,
            vcodec: 'none',
            acodec: 'mp4a.40.2',
            tbr: 128,
            filesize: mockAudioData.length,
            format_note: 'medium (AAC stereo)'
          },
          {
            format_id: '251',
            url: `${baseUrl}/stream_audio.m4a`,
            ext: 'webm',
            width: null,
            height: null,
            fps: null,
            vcodec: 'none',
            acodec: 'opus',
            tbr: 160,
            filesize: mockAudioData.length,
            format_note: 'high (Opus stereo)'
          }
        ]
      };
    }
  }

  const ydl = new YoutubeDL({
    quiet: false
  });
  ydl._ies.unshift(MultiStreamMockIE);

  try {
    const targetUrl = `${baseUrl}/video_media`;

    // 3. Extract metadata and list formats with resolutions and codecs
    const info = await ydl.extract_info(targetUrl, { download: false });
    assert.equal(info.title, 'Cyberpunk Odyssey - Main Theme');
    assert.equal(info.formats.length, 4);

    const formatRows = ydl.list_formats(info, true);
    assert.equal(formatRows.length, 4);

    // Verify format rows contain proper resolution, vcodec, and acodec
    const f1080 = formatRows.find((r) => r.format_id === '137');
    assert.ok(f1080);
    assert.equal(f1080.resolution, '1920x1080');
    assert.equal(f1080.vcodec, 'avc1.64002a');
    assert.equal(f1080.acodec, 'none');

    const fAudio = formatRows.find((r) => r.format_id === '140');
    assert.ok(fAudio);
    assert.equal(fAudio.resolution, 'audio only');
    assert.equal(fAudio.vcodec, 'none');
    assert.equal(fAudio.acodec, 'mp4a.40.2');

    // 4. Download video stream and audio stream (music) separately
    const videoDest = path.join(tmpDir, 'downloaded_video.mp4');
    const audioDest = path.join(tmpDir, 'downloaded_music.m4a');

    const separateResult = await ydl.download_separate(targetUrl, {
      videoFormat: 'bestvideo',
      audioFormat: 'bestaudio',
      videoOuttmpl: videoDest,
      audioOuttmpl: audioDest
    });

    assert.ok(fs.existsSync(videoDest));
    assert.ok(fs.existsSync(audioDest));
    assert.equal(fs.statSync(videoDest).size, mockVideoData.length);
    assert.equal(fs.statSync(audioDest).size, mockAudioData.length);
    assert.equal(separateResult.video.selected_format.format_id, '137');
    assert.equal(separateResult.audio.selected_format.format_id, '251'); // bestaudio = highest tbr (160k)

    // 5. Test choosing a specific format by ID or custom predicate
    const customVideoDest = path.join(tmpDir, 'custom_720p.mp4');
    const customAudioDest = path.join(tmpDir, 'custom_aac.m4a');
    await ydl.download_separate(targetUrl, {
      videoFormat: '136', // Choose 720p specifically
      audioFormat: '140', // Choose AAC specifically
      videoOuttmpl: customVideoDest,
      audioOuttmpl: customAudioDest
    });

    assert.ok(fs.existsSync(customVideoDest));
    assert.ok(fs.existsSync(customAudioDest));

    // 6. Test downloading image / thumbnail
    const imageDest = path.join(tmpDir, 'downloaded_thumbnail.jpg');
    const imageResult = await ydl.download_image(info, imageDest);
    assert.ok(fs.existsSync(imageDest));
    assert.equal(fs.statSync(imageDest).size, mockImageData.length);
    assert.equal(imageResult.bytes, mockImageData.length);

    // Direct image URL download
    const directImageDest = path.join(tmpDir, 'direct_image.jpg');
    await ydl.download_image(`${baseUrl}/thumbnail.jpg`, directImageDest);
    assert.ok(fs.existsSync(directImageDest));
    assert.equal(fs.statSync(directImageDest).size, mockImageData.length);

  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
