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
import { YoutubeDL } from '../src/index.js';

test('YoutubeDL format selection and filename preparation', () => {
  const ydl = new YoutubeDL({
    outtmpl: '%(channel)s/%(title)s [%(id)s].%(ext)s'
  });

  const formats = [
    { format_id: '18', vcodec: 'avc1', acodec: 'mp4a', height: 360, ext: 'mp4' },
    { format_id: '22', vcodec: 'avc1', acodec: 'mp4a', height: 720, ext: 'mp4' },
    { format_id: '137', vcodec: 'avc1', acodec: 'none', height: 1080, ext: 'mp4' }
  ];

  // Best format selector should choose highest quality muxed video (720p)
  const best = ydl.select_format(formats, 'best');
  assert.equal(best.format_id, '22');

  // Specific format_id
  const specific = ydl.select_format(formats, '137');
  assert.equal(specific.format_id, '137');

  // Filename template expansion
  const info = {
    channel: 'Dev Channel',
    title: 'Awesome Video',
    id: 'vid123',
    ext: 'mp4'
  };
  const filename = ydl.prepare_filename(info);
  assert.equal(filename, 'Dev Channel/Awesome Video [vid123].mp4');
});

test('YoutubeDL end-to-end extraction and download workflow', async () => {
  const fakeVideoData = Buffer.from('FAKE_VIDEO_STREAM_DATA_12345');

  // Setup local mock media server
  const server = http.createServer((req, res) => {
    if (req.url === '/watch.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>My Sample Video</title>
            <meta property="og:title" content="My Sample Video" />
          </head>
          <body>
            <video src="/media/stream.mp4" controls></video>
          </body>
        </html>
      `);
      return;
    }

    if (req.url === '/media/stream.mp4') {
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': fakeVideoData.length
      });
      res.end(fakeVideoData);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const pageUrl = `http://127.0.0.1:${port}/watch.html`;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ydlp-e2e-'));
  const outtmpl = path.join(tmpDir, '%(title)s.%(ext)s');

  try {
    const progressEvents = [];
    const ydl = new YoutubeDL({
      outtmpl,
      quiet: true,
      progress_hooks: [(p) => progressEvents.push(p)]
    });

    // 1. Extract metadata without downloading
    const infoOnly = await ydl.extract_info(pageUrl, { download: false });
    assert.equal(infoOnly.title, 'My Sample Video');
    assert.ok(infoOnly.formats.length > 0);

    // 2. Extract and download
    const downloadedInfo = await ydl.extract_info(pageUrl, { download: true });
    assert.ok(downloadedInfo._filename);
    assert.ok(fs.existsSync(downloadedInfo._filename));
    assert.equal(fs.readFileSync(downloadedInfo._filename, 'utf8'), fakeVideoData.toString('utf8'));

    // Check progress hook received events
    assert.ok(progressEvents.some((e) => e.status === 'finished'));
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
