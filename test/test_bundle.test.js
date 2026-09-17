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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distMinPath = path.resolve(__dirname, '../dist/js_ydlp.min.js');

test('Verify minified bundle exists and includes Apache 2.0 and AI headers', () => {
  assert.ok(fs.existsSync(distMinPath), 'dist/js_ydlp.min.js must exist after build');
  const content = fs.readFileSync(distMinPath, 'utf8');
  assert.ok(content.includes('Licensed under the Apache License, Version 2.0'));
  assert.ok(content.includes('OPEN AI STATEMENT'));
});

test('Verify importing and using minified bundle', async () => {
  assert.ok(fs.existsSync(distMinPath));
  const fileUrl = pathToFileURL(distMinPath).href;
  const bundle = await import(fileUrl);

  // Check exports
  assert.ok(bundle.YoutubeDL, 'YoutubeDL should be exported');
  assert.ok(bundle.traverse_obj, 'traverse_obj should be exported');
  assert.ok(bundle.ALL, 'ALL should be exported');
  assert.ok(bundle.format_bytes, 'format_bytes should be exported');

  // Test functionality from bundle
  const ydl = new bundle.YoutubeDL({ quiet: true });
  const filename = ydl.prepare_filename({
    title: 'Bundled Video',
    id: 'b123',
    ext: 'mp4'
  });
  assert.equal(filename, 'Bundled Video [b123].mp4');

  const formatted = bundle.format_bytes(1048576);
  assert.equal(formatted, '1.00MiB');

  const traversed = bundle.traverse_obj({ nested: { key: 'val' } }, ['nested', 'key']);
  assert.equal(traversed, 'val');
});
