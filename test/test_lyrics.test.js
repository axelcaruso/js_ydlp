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
import { LyricsProvider } from '../src/utils/lyrics.js';
import { YoutubeDL } from '../src/YoutubeDL.js';

test('LyricsProvider track name cleaning', () => {
  const provider = new LyricsProvider();

  const dirty1 = 'Warriyo - Mortals (feat. Laura Brehm) [NCS Release]';
  assert.equal(provider.cleanTrackName(dirty1), 'Warriyo - Mortals');

  const dirty2 = 'Alan Walker - Faded (Official Music Video)';
  assert.equal(provider.cleanTrackName(dirty2), 'Alan Walker - Faded');

  const dirty3 = 'Song Name (Audio) | Future Trap _ Bass';
  assert.equal(provider.cleanTrackName(dirty3), 'Song Name');

  const dirty4 = 'AGST - Topic';
  assert.equal(provider.cleanTrackName(dirty4), 'AGST');

  const dirty5 = 'Queen - Bohemian Rhapsody (Remastered 2011)';
  assert.equal(provider.cleanTrackName(dirty5), 'Queen - Bohemian Rhapsody');

  const dirty6 = 'Cool Track [FREE DOWNLOAD] [1080p]';
  assert.equal(provider.cleanTrackName(dirty6), 'Cool Track');
});

test('LyricsProvider caption parsing to plain and synced LRC', async () => {
  const provider = new LyricsProvider();

  const mockCaptionTracks = [
    {
      baseUrl: 'http://mock-caption.test?track=1',
      languageCode: 'en',
      kind: 'manual'
    }
  ];

  // Mock director to simulate YouTube caption response
  provider.director = {
    async send() {
      return {
        ok: true,
        async json() {
          return {
            events: [
              { tStartMs: 1500, segs: [{ utf8: 'First line of lyrics' }] },
              { tStartMs: 5200, segs: [{ utf8: 'Second line of lyrics' }] }
            ]
          };
        }
      };
    }
  };

  const lyrics = await provider.fetchFromYouTubeCaptions(mockCaptionTracks);
  assert.ok(lyrics);
  assert.equal(lyrics.source, 'youtube_captions');
  assert.ok(lyrics.plainLyrics.includes('First line of lyrics'));
  assert.ok(lyrics.plainLyrics.includes('Second line of lyrics'));
  assert.ok(lyrics.syncedLyrics.includes('[00:01.50] First line of lyrics'));
  assert.ok(lyrics.syncedLyrics.includes('[00:05.20] Second line of lyrics'));
});

test('LyricsProvider LRCLIB integration and cascade', async () => {
  const provider = new LyricsProvider();

  // Test with mock LRCLIB response
  provider.director = {
    async send(url) {
      if (url.includes('/api/get')) {
        return {
          ok: true,
          async json() {
            return {
              trackName: 'Mortals',
              artistName: 'Warriyo',
              plainLyrics: 'Stranded in the open\nDried out tears of sorrow',
              syncedLyrics: '[01:31.79] Stranded in the open\n[01:37.38] Dried out tears of sorrow',
              instrumental: false
            };
          }
        };
      }
      return { ok: false };
    }
  };

  const res = await provider.getLyrics({
    title: 'Warriyo - Mortals (feat. Laura Brehm)',
    duration: 228
  });

  assert.ok(res);
  assert.equal(res.source, 'lrclib');
  assert.equal(res.artist, 'Warriyo');
  assert.equal(res.title, 'Mortals');
  assert.ok(res.plainLyrics.includes('Stranded in the open'));
  assert.ok(res.syncedLyrics.includes('[01:31.79]'));
});

test('YoutubeDL get_lyrics method returns resolved lyrics', async () => {
  const ydl = new YoutubeDL();
  ydl.director = {
    async send() {
      return {
        ok: true,
        async json() {
          return {
            trackName: 'Spectre',
            artistName: 'Alan Walker',
            plainLyrics: 'Hello world lyrics',
            syncedLyrics: '[00:10.00] Hello world lyrics'
          };
        }
      };
    }
  };

  const lyrics = await ydl.get_lyrics('Alan Walker - Spectre');
  assert.ok(lyrics);
  assert.equal(lyrics.plainLyrics, 'Hello world lyrics');
});

test('LyricsProvider fetchMusicMetadata extracts genre, album, and year', async () => {
  const provider = new LyricsProvider();

  // Mock iTunes response
  provider.director = {
    async send(url) {
      if (url.includes('itunes.apple.com/search')) {
        return {
          ok: true,
          async json() {
            return {
              resultCount: 1,
              results: [
                {
                  trackName: 'Mortals',
                  artistName: 'Warriyo',
                  collectionName: 'Mortals - Single',
                  primaryGenreName: 'Dance',
                  releaseDate: '2016-12-15T12:00:00Z'
                }
              ]
            };
          }
        };
      }
      return { ok: false };
    }
  };

  const meta = await provider.fetchMusicMetadata({ artist: 'Warriyo', title: 'Mortals' });
  assert.ok(meta);
  assert.equal(meta.genre, 'Dance');
  assert.equal(meta.album, 'Mortals - Single');
  assert.equal(meta.year, '2016');
  assert.equal(meta.source, 'itunes');

  // Fallback to video metadata when iTunes returns no result
  provider.director = {
    async send() {
      return { ok: true, async json() { return { results: [] }; } };
    }
  };

  const fallbackMeta = await provider.fetchMusicMetadata({
    artist: 'Unknown',
    title: 'Trap Beat',
    info: { category: 'Music', keywords: ['Future Trap', 'Bass', 'Electronic'], upload_date: '20230510' }
  });
  assert.ok(fallbackMeta);
  assert.equal(fallbackMeta.genre, 'Trap');
  assert.equal(fallbackMeta.year, '2023');
  assert.equal(fallbackMeta.source, 'video_metadata');
});

test('LyricsProvider fetchMusicMetadata falls back to LRCLIB database when iTunes has no match', async () => {
  const provider = new LyricsProvider();

  provider.director = {
    async send(url) {
      if (url.includes('itunes.apple.com/search')) {
        return { ok: true, async json() { return { results: [] }; } };
      }
      if (url.includes('/api/search')) {
        return {
          ok: true,
          async json() {
            return [
              {
                trackName: 'Spectre',
                artistName: 'Alan Walker',
                albumName: 'Spectre - Single'
              }
            ];
          }
        };
      }
      return { ok: false };
    }
  };

  const meta = await provider.fetchMusicMetadata({ artist: 'Alan Walker', title: 'Spectre (Audio)' });
  assert.ok(meta);
  assert.equal(meta.source, 'lrclib');
  assert.equal(meta.artist, 'Alan Walker');
  assert.equal(meta.title, 'Spectre');
  assert.equal(meta.album, 'Spectre - Single');
});
