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
  int_or_none,
  float_or_none,
  str_or_none,
  strip_or_none,
  url_or_none,
  try_get,
  filter_dict,
  join_nonempty,
  clean_html,
  unescapeHTML,
  escapeHTML,
  parse_duration,
  mimetype2ext,
  format_bytes,
  parse_filesize,
  sanitize_filename,
  format_decimal_suffix,
  parse_iso8601,
  unified_strdate,
  unified_timestamp,
  formatSeconds,
  HTTPHeaderDict,
  sanitize_url,
  urljoin,
  determine_ext,
  determine_protocol
} from '../src/utils/index.js';

test('int_or_none, float_or_none, str_or_none, strip_or_none', () => {
  assert.equal(int_or_none('42'), 42);
  assert.equal(int_or_none('invalid', 0), 0);
  assert.equal(int_or_none(null), null);
  assert.equal(int_or_none('5', 0, 10), 50);

  assert.equal(float_or_none('3.14'), 3.14);
  assert.equal(float_or_none('bad', 1.0), 1.0);

  assert.equal(str_or_none(123), '123');
  assert.equal(str_or_none(null), null);

  assert.equal(strip_or_none('  hello  '), 'hello');
  assert.equal(strip_or_none('   '), null);
});

test('url_or_none and try_get', () => {
  assert.equal(url_or_none('https://example.com/video.mp4'), 'https://example.com/video.mp4');
  assert.equal(url_or_none('not-a-url'), null);

  const obj = { nested: { val: 'found' } };
  assert.equal(try_get(obj, (x) => x.nested.val), 'found');
  assert.equal(try_get(obj, (x) => x.missing.val), null);
});

test('clean_html, unescapeHTML, escapeHTML', () => {
  const html = '<p>Hello <b>World</b> &amp; friends</p>';
  assert.equal(clean_html(html), 'Hello World &amp; friends');
  assert.equal(unescapeHTML('&lt;video&gt;&quot;&#39;&amp;'), '<video>"\'&');
  assert.equal(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
});

test('parse_duration', () => {
  assert.equal(parse_duration('01:30:15'), 5415);
  assert.equal(parse_duration('03:45'), 225);
  assert.equal(parse_duration('PT1H2M3S'), 3723);
  assert.equal(parse_duration(120), 120);
  assert.equal(parse_duration('invalid'), null);
});

test('format_bytes and parse_filesize', () => {
  assert.equal(format_bytes(1048576), '1.00MiB');
  assert.equal(format_bytes(500), '500.00B');

  assert.equal(parse_filesize('1.5MiB'), 1572864);
  assert.equal(parse_filesize('100kB'), 100000);
});

test('sanitize_filename', () => {
  assert.equal(sanitize_filename('A/B\\C:D*E?F"G<H>I|J.mp4'), 'A_B_C_D_E_F_G_H_I_J.mp4');
  // Windows reserved names
  assert.equal(sanitize_filename('CON.mp4'), '_CON.mp4');
  assert.equal(sanitize_filename('NUL'), '_NUL');
  assert.equal(sanitize_filename('   spaces   '), 'spaces');
});

test('date utilities: parse_iso8601, unified_strdate, unified_timestamp, formatSeconds', () => {
  const iso = '2024-05-15T14:30:00Z';
  const ts = parse_iso8601(iso);
  assert.ok(ts > 0);

  assert.equal(unified_strdate('2024-05-15'), '20240515');
  assert.equal(unified_strdate('20240515'), '20240515');
  assert.equal(unified_strdate(iso), '20240515');

  assert.equal(formatSeconds(3665), '01:01:05');
  assert.equal(formatSeconds(125), '02:05');
});

test('HTTPHeaderDict case-insensitivity', () => {
  const headers = new HTTPHeaderDict({
    'User-Agent': 'Mozilla/5.0',
    'Content-Type': 'application/json'
  });

  assert.equal(headers.get('user-agent'), 'Mozilla/5.0');
  assert.equal(headers.get('USER-AGENT'), 'Mozilla/5.0');
  assert.ok(headers.has('content-type'));

  headers.set('authorization', 'Bearer 123');
  assert.equal(headers.get('Authorization'), 'Bearer 123');
});

test('determine_ext and determine_protocol', () => {
  assert.equal(determine_ext('https://example.com/stream.m3u8?token=xyz'), 'm3u8');
  assert.equal(determine_ext('https://example.com/video.mp4'), 'mp4');
  assert.equal(determine_protocol('https://example.com/manifest.mpd'), 'mpd');
  assert.equal(determine_protocol('https://example.com/index.m3u8'), 'm3u8_native');
  assert.equal(determine_protocol('https://example.com/file.mp4'), 'https');
});
