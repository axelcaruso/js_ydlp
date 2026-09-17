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
import os from 'node:os';
import ydlp, {
  YoutubeDL,
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
} from '../src/index.js';

test('Intuitive API: Top-level exports and default ydlp object exist', () => {
  assert.equal(typeof ydlp, 'function');
  assert.equal(typeof ydlp.download, 'function');
  assert.equal(typeof ydlp.extractInfo, 'function');
  assert.equal(typeof ydlp.downloadMusic, 'function');
  assert.equal(typeof ydlp.listFormats, 'function');
  assert.equal(typeof ydlp.downloadSeparate, 'function');
  assert.equal(typeof ydlp.downloadImage, 'function');
  assert.equal(typeof ydlp.getLyrics, 'function');
  assert.equal(typeof ydlp.getMetadata, 'function');
  assert.equal(typeof ydlp.YoutubeDL, 'function');

  assert.equal(typeof download, 'function');
  assert.equal(typeof extractInfo, 'function');
  assert.equal(typeof getInfo, 'function');
  assert.equal(typeof downloadMusic, 'function');
  assert.equal(typeof extractAudio, 'function');
  assert.equal(typeof listFormats, 'function');
  assert.equal(typeof downloadSeparate, 'function');
  assert.equal(typeof downloadImage, 'function');
  assert.equal(typeof getLyrics, 'function');
  assert.equal(typeof getMetadata, 'function');
});

test('Intuitive API: ydlp(options) factory returns configured YoutubeDL instance', () => {
  const client = ydlp({ output: 'videos/%(title)s.%(ext)s', quiet: true });
  assert.ok(client instanceof YoutubeDL);
  assert.equal(client.params.outtmpl, 'videos/%(title)s.%(ext)s');
  assert.equal(client.params.quiet, true);
});

test('Intuitive API: Fluent builder methods and option normalization', () => {
  const client = new YoutubeDL({ output: 'out/%(id)s.%(ext)s', skipDownload: true })
    .format('bestvideo+bestaudio')
    .output('custom/%(title)s.%(ext)s');

  assert.equal(client.params.format, 'bestvideo+bestaudio');
  assert.equal(client.params.outtmpl, 'custom/%(title)s.%(ext)s');
  assert.equal(client.params.skip_download, true);

  let hookCalled = false;
  client.onProgress(() => { hookCalled = true; });
  assert.equal(client._progressHooks.length, 1);
  client._progressHooks[0]({});
  assert.equal(hookCalled, true);
});

test('Intuitive API: camelCase aliases on YoutubeDL instance match snake_case methods', () => {
  const ydl = new YoutubeDL({ quiet: true });
  assert.equal(typeof ydl.extractInfo, 'function');
  assert.equal(typeof ydl.listFormats, 'function');
  assert.equal(typeof ydl.downloadSeparate, 'function');
  assert.equal(typeof ydl.downloadImage, 'function');
  assert.equal(typeof ydl.extractAudio, 'function');
  assert.equal(typeof ydl.downloadMusic, 'function');
  assert.equal(typeof ydl.downloadAudio, 'function');
  assert.equal(typeof ydl.getLyrics, 'function');
  assert.equal(typeof ydl.getMusicMetadata, 'function');
  assert.equal(typeof ydl.getMetadata, 'function');
  assert.equal(typeof ydl.selectFormat, 'function');
  assert.equal(typeof ydl.prepareFilename, 'function');
});

test('Intuitive API: End-to-end one-liner download() and extractInfo() execution', async () => {
  const fakeContent = Buffer.from('API_TEST_VIDEO_STREAM_999');

  const server = http.createServer((req, res) => {
    if (req.url === '/video.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>One Liner Video</title><meta property="og:title" content="One Liner Video" /></head>
          <body><video src="/stream.mp4"></video></body>
        </html>
      `);
      return;
    }
    if (req.url === '/stream.mp4') {
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': fakeContent.length
      });
      res.end(fakeContent);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const pageUrl = `http://127.0.0.1:${port}/video.html`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ydlp-api-test-'));
  const destFile = path.join(tmpDir, 'downloaded.mp4');

  try {
    // 1. One-liner extractInfo
    const info = await extractInfo(pageUrl);
    assert.equal(info.title, 'One Liner Video');

    // 2. One-liner listFormats
    const rows = await listFormats(info, false);
    assert.ok(rows.length > 0);

    // 3. One-liner download
    const res = await download(pageUrl, {
      output: destFile,
      quiet: true
    });
    assert.equal(res.success, true);
    assert.equal(res.code, 0);
    assert.ok(fs.existsSync(destFile));
    assert.equal(fs.readFileSync(destFile).toString(), fakeContent.toString());
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Intuitive API: downloadMusic with enrich flag cleans title and renames MP3 from database', async () => {
  const fakeAudioContent = Buffer.from('FAKE_AUDIO_STREAM_DATA');
  const server = http.createServer((req, res) => {
    if (req.url === '/audio.mp3') {
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': fakeAudioContent.length
      });
      res.end(fakeAudioContent);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ydlp-enrich-test-'));

  const mockInfo = {
    id: 'test_song_123',
    title: 'Alan Walker - Fade [NCS Release]',
    uploader: 'NoCopyrightSounds',
    formats: [
      {
        format_id: '140',
        url: `http://127.0.0.1:${port}/audio.mp3`,
        ext: 'mp3',
        vcodec: 'none',
        acodec: 'mp3'
      }
    ]
  };

  const ydl = new YoutubeDL({ quiet: true });
  // Mock iTunes response for database lookup while allowing HTTP download
  ydl.director = {
    async send(urlOrReq, reqOpts = {}) {
      const urlStr = typeof urlOrReq === 'string' ? urlOrReq : (urlOrReq?.url || String(urlOrReq));
      if (urlStr.includes('itunes.apple.com/search')) {
        return {
          ok: true,
          async json() {
            return {
              resultCount: 1,
              results: [
                {
                  artistName: 'Alan Walker',
                  trackName: 'Fade',
                  collectionName: 'Fade - Single',
                  primaryGenreName: 'Dance',
                  releaseDate: '2014-11-19T00:00:00Z'
                }
              ]
            };
          }
        };
      }
      return fetch(urlStr, reqOpts);
    }
  };

  try {
    const result = await ydl.extract_audio(mockInfo, {
      enrich: true,
      outtmpl: path.join(tmpDir, '%(title)s.mp3'),
      embed_thumbnail: false,
      embed_metadata: false
    });

    assert.ok(result);
    assert.equal(result.artist, 'Alan Walker');
    assert.equal(result.title, 'Fade');
    assert.equal(result.album, 'Fade - Single');
    assert.equal(result.genre, 'Dance');
    assert.equal(result.year, '2014');

    const expectedCleanPath = path.join(tmpDir, 'Alan Walker - Fade.mp3');
    assert.equal(result.filename, expectedCleanPath);
    assert.ok(fs.existsSync(expectedCleanPath), 'Enriched clean MP3 file should exist on disk');
    assert.equal(fs.readFileSync(expectedCleanPath).toString(), fakeAudioContent.toString());
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

