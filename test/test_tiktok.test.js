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
import crypto from 'node:crypto';
import { TikTokIE } from '../src/extractor/tiktok.js';
import { get_info_extractor } from '../src/extractor/index.js';
import { YoutubeDL } from '../src/YoutubeDL.js';

test('TikTokIE URL matching across URL variants', () => {
  const validUrls = [
    'https://www.tiktok.com/@tiktok/video/7106594312292453675',
    'http://tiktok.com/@user/video/1234567890123456789',
    'https://m.tiktok.com/@creator.name/video/9876543210987654321',
    'https://www.tiktok.com/embed/7106594312292453675',
    'https://www.tiktok.com/share/video/7106594312292453675',
    'https://vm.tiktok.com/ZM8vXq3L9/',
    'https://vt.tiktok.com/ZS8r4Wp1Q/',
    'https://www.tiktok.com/t/ZT8r4Wp1Q/'
  ];

  for (const url of validUrls) {
    assert.equal(TikTokIE.suitable(url), true, `Should match: ${url}`);
  }

  // Resolver check
  assert.equal(get_info_extractor('https://www.tiktok.com/@tiktok/video/7106594312292453675'), TikTokIE);
});

test('TikTokIE native WAF SHA-256 challenge solver', () => {
  const ie = new TikTokIE();

  // Create a synthetic challenge puzzle
  const baseA = Buffer.from('test_salt_challenge_seed_12345');
  const targetNumber = 42;
  const expectedDigest = crypto.createHash('sha256').update(baseA).update(String(targetNumber)).digest();

  const challengeObj = {
    v: {
      a: baseA.toString('base64'),
      b: Date.now(),
      c: expectedDigest.toString('base64')
    }
  };

  const rawCs = Buffer.from(JSON.stringify(challengeObj)).toString('base64');
  const mockWebpage = `
    <html>
      <body>
        Please wait...
        <p id="wci" class="_wafchallengeid"></p>
        <p id="cs" class="${rawCs}"></p>
        <p id="rci" class="waforiginalreid"></p>
        <p id="rs" class="original_req_token"></p>
      </body>
    </html>
  `;

  const cookieStr = ie._solve_challenge(mockWebpage);
  assert.ok(cookieStr);
  assert.ok(cookieStr.includes('_wafchallengeid='));
  assert.ok(cookieStr.includes('waforiginalreid=original_req_token'));

  // Verify that solution d was placed into challenge JSON
  const wciVal = cookieStr.match(/_wafchallengeid=([^;]+)/)[1];
  const decodedChallenge = JSON.parse(Buffer.from(wciVal, 'base64').toString('utf8'));
  assert.equal(decodedChallenge.d, Buffer.from(String(targetNumber)).toString('base64'));
});

test('TikTokIE format extraction prioritizes unwatermarked streams', () => {
  const ie = new TikTokIE();
  const ydl = new YoutubeDL();

  const mockItem = {
    video: {
      width: 1080,
      height: 1920,
      duration: 30,
      playAddr: 'https://v16-webapp-prime.tiktok.com/video/unwatermarked_main.mp4',
      downloadAddr: 'https://v16-webapp-prime.tiktok.com/video/watermarked_fallback.mp4',
      bitrateInfo: [
        {
          GearName: '1080p',
          Bitrate: 2500000,
          PlayAddr: {
            DataSize: 9500000,
            UrlList: ['https://v16-webapp-prime.tiktok.com/video/unwatermarked_1080p.mp4']
          }
        }
      ]
    },
    music: {
      playUrl: 'https://sf16-ies-music.tiktokcdn.com/music/audio.m4a'
    }
  };

  const formats = ie._extract_web_formats(mockItem);
  assert.equal(formats.length, 4);

  const adaptiveFormat = formats.find((f) => f.format_id === '1080p');
  const playFormat = formats.find((f) => f.format_id === 'play');
  const dlFormat = formats.find((f) => f.format_id === 'download_watermarked');
  const audioFormat = formats.find((f) => f.format_id === 'audio');

  assert.ok(adaptiveFormat, 'Must have unwatermarked adaptive format');

  assert.ok(playFormat, 'Must have unwatermarked play format');
  assert.ok(dlFormat, 'Must have watermarked download format');
  assert.ok(audioFormat, 'Must have audio format');

  assert.equal(playFormat.preference > dlFormat.preference, true, 'Unwatermarked must have higher preference than watermarked');
  assert.equal(dlFormat.format_note, 'Watermarked download');
  assert.equal(playFormat.format_note, 'Direct video (No watermark)');

  // Formats sorted with 'best' selector must pick an unwatermarked stream
  const chosenBest = ydl.select_format(formats, 'best');
  assert.notEqual(chosenBest.format_id, 'download_watermarked');
  assert.ok(chosenBest.url.includes('unwatermarked'));
});

test('TikTokIE _extract_item_struct parses UNIVERSAL_DATA_FOR_REHYDRATION and SIGI_STATE', () => {
  const ie = new TikTokIE();

  // 1. UNIVERSAL_DATA_FOR_REHYDRATION format
  const uniPayload = {
    __DEFAULT_SCOPE__: {
      'webapp.video-detail': {
        statusCode: 0,
        itemInfo: {
          itemStruct: {
            id: '7106594312292453675',
            desc: 'TikTok testing universal hydration',
            video: { playAddr: 'https://v16.tiktok.com/unwatermarked.mp4' }
          }
        }
      }
    }
  };
  const htmlWithUni = `
    <html><body>
      <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
        ${JSON.stringify(uniPayload)}
      </script>
    </body></html>
  `;
  const resUni = ie._extract_item_struct(htmlWithUni, '7106594312292453675');
  assert.ok(resUni);
  assert.equal(resUni.id, '7106594312292453675');
  assert.equal(resUni.desc, 'TikTok testing universal hydration');

  // 2. SIGI_STATE format
  const sigiPayload = {
    ItemModule: {
      '999888777': {
        id: '999888777',
        desc: 'TikTok testing sigi state fallback',
        video: { playAddr: 'https://v16.tiktok.com/sigi_unwatermarked.mp4' }
      }
    }
  };
  const htmlWithSigi = `
    <html><body>
      <script id="SIGI_STATE" type="application/json">
        ${JSON.stringify(sigiPayload)}
      </script>
    </body></html>
  `;
  const resSigi = ie._extract_item_struct(htmlWithSigi, '999888777');
  assert.ok(resSigi);
  assert.equal(resSigi.id, '999888777');
  assert.equal(resSigi.desc, 'TikTok testing sigi state fallback');
});
