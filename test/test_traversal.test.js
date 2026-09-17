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
import { traverse_obj, ALL } from '../src/utils/traversal.js';

test('traverse_obj basic path lookup', () => {
  const data = {
    user: {
      profile: {
        name: 'Axel',
        age: 30
      }
    }
  };

  assert.equal(traverse_obj(data, ['user', 'profile', 'name']), 'Axel');
  assert.equal(traverse_obj(data, ['user', 'profile', 'age']), 30);
  assert.equal(traverse_obj(data, ['user', 'nonexistent']), null);
});

test('traverse_obj multiple fallback paths', () => {
  const data = {
    videoDetails: {
      author: 'Tester'
    }
  };

  // First path fails, second succeeds
  const res = traverse_obj(data, ['author'], ['videoDetails', 'author']);
  assert.equal(res, 'Tester');
});

test('traverse_obj array branching and wildcard ALL', () => {
  const data = {
    streamingData: {
      formats: [
        { itag: 18, url: 'https://example.com/18.mp4', height: 360 },
        { itag: 22, url: 'https://example.com/22.mp4', height: 720 },
        { itag: 37, url: 'https://example.com/37.mp4', height: 1080 }
      ]
    }
  };

  // Wildcard traverse all formats itags
  const itags = traverse_obj(data, ['streamingData', 'formats', ALL, 'itag']);
  assert.deepEqual(itags, [18, 22, 37]);

  // Alternate keys branching: itag or url
  const urls = traverse_obj(data, ['streamingData', 'formats', 1, ['url', 'direct_url']]);
  assert.equal(urls, 'https://example.com/22.mp4');
});

test('traverse_obj function filters', () => {
  const data = {
    items: [
      { id: 1, active: false, label: 'one' },
      { id: 2, active: true, label: 'two' },
      { id: 3, active: true, label: 'three' }
    ]
  };

  const activeLabels = traverse_obj(data, [
    'items',
    (x) => x.active,
    ALL,
    'label'
  ]);

  assert.deepEqual(activeLabels, ['two', 'three']);
});

test('traverse_obj type assertion and default value', () => {
  const data = {
    count: '123',
    score: 99
  };

  // String expected
  assert.equal(traverse_obj(data, ['count'], { expected_type: String }), '123');
  // Number expected on string should fail and return default
  assert.equal(traverse_obj(data, ['count'], { expected_type: Number, default: 0 }), 0);
  // Number on actual number
  assert.equal(traverse_obj(data, ['score'], { expected_type: Number }), 99);
});
