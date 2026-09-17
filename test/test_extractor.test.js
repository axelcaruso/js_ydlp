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
import {
  InfoExtractor,
  GenericIE,
  YoutubeIE,
  get_info_extractor,
  gen_extractor_classes
} from '../src/extractor/index.js';

test('InfoExtractor regex search helpers', () => {
  const ie = new InfoExtractor();
  const html = '<div id="video-id">12345</div><span class="views">5000 views</span>';

  assert.equal(ie._search_regex(/id="video-id">(\d+)</, html, 'id'), '12345');
  assert.equal(ie._search_regex(/not-found/, html, 'missing', 'default'), 'default');
  assert.throws(() => ie._search_regex(/not-found/, html, 'missing', undefined, true));

  assert.equal(ie._html_search_regex(/views">([^<]+)</, html, 'views'), '5000 views');
});

test('InfoExtractor meta search helper', () => {
  const ie = new InfoExtractor();
  const html = `
    <html>
      <head>
        <meta property="og:title" content="Test Video Title" />
        <meta name="description" content="A test description" />
      </head>
    </html>
  `;

  assert.equal(ie._html_search_meta('og:title', html), 'Test Video Title');
  assert.equal(ie._html_search_meta(['twitter:description', 'description'], html), 'A test description');
  assert.equal(ie._html_search_meta('missing', html, 'meta', 'default'), 'default');
});

test('InfoExtractor format sorting logic', () => {
  const ie = new InfoExtractor();
  const formats = [
    { format_id: 'low', height: 360, width: 640, tbr: 500 },
    { format_id: 'high', height: 1080, width: 1920, tbr: 3000 },
    { format_id: 'medium', height: 720, width: 1280, tbr: 1500 }
  ];

  ie._sort_formats(formats);
  // Sorts in ascending quality order (best is last)
  assert.equal(formats[0].format_id, 'low');
  assert.equal(formats[1].format_id, 'medium');
  assert.equal(formats[2].format_id, 'high');
});

test('Extractor registry and resolver', () => {
  const classes = gen_extractor_classes();
  assert.ok(classes.length >= 2);

  // Highest priority should be specialized extractors (YoutubeIE) before GenericIE
  assert.equal(classes[0], YoutubeIE);

  const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  assert.equal(get_info_extractor(youtubeUrl), YoutubeIE);

  const genericUrl = 'https://random-site.example.com/stream.html';
  assert.equal(get_info_extractor(genericUrl), GenericIE);

  // Name lookup
  assert.equal(get_info_extractor('youtube'), YoutubeIE);
});

test('GenericIE direct media extraction', async () => {
  const generic = new GenericIE();
  const directUrl = 'https://example.com/media/sample_video.mp4';
  const info = await generic.extract(directUrl);

  assert.equal(info.id, 'sample_video');
  assert.equal(info.ext, 'mp4');
  assert.equal(info.formats.length, 1);
  assert.equal(info.formats[0].url, directUrl);
});
