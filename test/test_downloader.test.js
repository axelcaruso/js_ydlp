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
import { HttpFD } from '../src/downloader/http.js';

test('HttpFD complete download with progress hooks', async () => {
  const fileContent = Buffer.alloc(100 * 1024, 0x41); // 100 KiB test data

  const server = http.createServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': fileContent.length
    });
    res.end(fileContent);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const targetUrl = `http://127.0.0.1:${port}/video.mp4`;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ydlp-dl-test-'));
  const targetFile = path.join(tmpDir, 'downloaded_video.mp4');

  try {
    const progressEvents = [];
    const downloader = new HttpFD(null, {
      progress_hooks: [(p) => progressEvents.push(p)]
    });

    const success = await downloader.download(targetFile, { url: targetUrl });
    assert.equal(success, true);
    assert.ok(fs.existsSync(targetFile));
    assert.equal(fs.statSync(targetFile).size, fileContent.length);

    // Verify progress hooks
    assert.ok(progressEvents.length > 0);
    const lastEvent = progressEvents[progressEvents.length - 1];
    assert.equal(lastEvent.status, 'finished');
    assert.equal(lastEvent.downloadedBytes, fileContent.length);
  } finally {
    server.close();
    if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
    fs.rmdirSync(tmpDir);
  }
});

test('HttpFD range request resume support', async () => {
  const fullContent = Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');
  const halfLen = 13;

  const server = http.createServer((req, res) => {
    const rangeHeader = req.headers['range'];
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-/);
      if (match) {
        const start = parseInt(match[1], 10);
        const slice = fullContent.subarray(start);
        res.writeHead(206, {
          'Content-Type': 'application/octet-stream',
          'Content-Range': `bytes ${start}-${fullContent.length - 1}/${fullContent.length}`,
          'Content-Length': slice.length
        });
        res.end(slice);
        return;
      }
    }

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': fullContent.length
    });
    res.end(fullContent);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const targetUrl = `http://127.0.0.1:${port}/data.bin`;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ydlp-resume-test-'));
  const targetFile = path.join(tmpDir, 'resumed_data.bin');
  const partFile = `${targetFile}.part`;

  try {
    // Simulate an existing partial download of 13 bytes
    fs.writeFileSync(partFile, fullContent.subarray(0, halfLen));

    const downloader = new HttpFD(null, { continuedl: true });
    const success = await downloader.download(targetFile, { url: targetUrl });

    assert.equal(success, true);
    assert.ok(fs.existsSync(targetFile));
    assert.equal(fs.readFileSync(targetFile, 'utf8'), fullContent.toString('utf8'));
  } finally {
    server.close();
    if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
    if (fs.existsSync(partFile)) fs.unlinkSync(partFile);
    fs.rmdirSync(tmpDir);
  }
});
