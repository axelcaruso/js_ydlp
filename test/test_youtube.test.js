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
import { YoutubeIE, YoutubeSigSolver } from '../src/extractor/youtube/index.js';

test('YoutubeIE URL pattern matching across all YouTube URL variations', () => {
  const urls = [
    { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', expectedId: 'dQw4w9WgXcQ' },
    { url: 'https://youtu.be/dQw4w9WgXcQ', expectedId: 'dQw4w9WgXcQ' },
    { url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', expectedId: 'dQw4w9WgXcQ' },
    { url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', expectedId: 'dQw4w9WgXcQ' },
    { url: 'https://www.youtube.com/live/dQw4w9WgXcQ', expectedId: 'dQw4w9WgXcQ' },
    { url: 'http://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share', expectedId: 'dQw4w9WgXcQ' }
  ];

  const ie = new YoutubeIE();
  for (const { url, expectedId } of urls) {
    assert.ok(YoutubeIE.suitable(url), `Should match URL: ${url}`);
    assert.equal(ie._extract_id(url), expectedId);
  }

  // Non-youtube URLs should not match
  assert.equal(YoutubeIE.suitable('https://vimeo.com/12345'), false);
  assert.equal(YoutubeIE.suitable('https://example.com/video.mp4'), false);
});

test('YoutubeSigSolver signature deciphering operations', () => {
  const solver = new YoutubeSigSolver();
  const inputSig = 'abcdefghijklmnopqrstuvwxyz';

  // Test reverse
  const rev = solver.decipher(inputSig, [{ action: 'reverse' }]);
  assert.equal(rev, 'zyxwvutsrqponmlkjihgfedcba');

  // Test splice
  const spliced = solver.decipher(inputSig, [{ action: 'splice', arg: 3 }]);
  assert.equal(spliced, 'defghijklmnopqrstuvwxyz');

  // Test swap
  const swapped = solver.decipher(inputSig, [{ action: 'swap', arg: 2 }]);
  // Swap element 0 ('a') with element 2 ('c')
  assert.equal(swapped, 'cbadefghijklmnopqrstuvwxyz');

  // Multi-step transformation
  const combined = solver.decipher(inputSig, [
    { action: 'splice', arg: 1 },
    { action: 'reverse' },
    { action: 'swap', arg: 4 }
  ]);
  assert.ok(combined.length === inputSig.length - 1);
});

test('YoutubeSigSolver operation extraction from player JS', () => {
  const mockPlayerJs = `
    var Q4 = {
      Xa: function(a, b) { a.splice(0, b); },
      dk: function(a) { a.reverse(); },
      sZ: function(a, b) { var c = a[0]; a[0] = a[b % a.length]; a[b % a.length] = c; }
    };
    function decipher(a) {
      a = a.split("");
      Q4.Xa(a, 2);
      Q4.dk(a);
      Q4.sZ(a, 3);
      return a.join("");
    }
  `;

  const solver = new YoutubeSigSolver();
  const ops = solver.extractOperations(mockPlayerJs);

  assert.equal(ops.length, 3);
  assert.deepEqual(ops[0], { action: 'splice', arg: 2 });
  assert.deepEqual(ops[1], { action: 'reverse', arg: undefined });
  assert.deepEqual(ops[2], { action: 'swap', arg: 3 });
});
