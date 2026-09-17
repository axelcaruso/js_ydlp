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

import os from 'node:os';
import path from 'node:path';
import { YoutubeDL } from '../src/YoutubeDL.js';
import { sanitize_filename } from '../src/utils/formatting.js';

async function main() {
  const desktopDir = path.join(os.homedir(), 'Desktop');
  const url = 'https://www.youtube.com/watch?v=yJg-Y5byMMw&list=RDd9GPAvKGlz0&index=20';

  console.log('=== Downloading Music to Desktop with js_ydlp ===');
  console.log('Target URL:', url);
  console.log('Desktop Folder:', desktopDir);

  const ydl = new YoutubeDL();
  const info = await ydl.extract_info(url, { download: false });

  console.log('\n--- Video Metadata ---');
  console.log('Title:', info.title);
  console.log('Channel:', info.uploader || info.channel);
  console.log('Duration:', `${info.duration}s`);

  // List available streams, resolutions, and codecs
  console.log('\n--- Formats, Resolutions & Codecs ---');
  ydl.list_formats(info, true);

  const safeTitle = sanitize_filename(info.title || 'Warriyo - Mortals');
  const targetMp3 = path.join(desktopDir, `${safeTitle}.mp3`);

  console.log('\n--- Extracting and Saving Audio to Desktop ---');
  console.log('Destination:', targetMp3);

  const result = await ydl.extract_audio(url, {
    outtmpl: targetMp3,
    artist: 'Warriyo feat. Laura Brehm',
    title: 'Mortals',
    album: 'NCS Release',
    embed_thumbnail: true,
    embed_lyrics: true,
    write_lrc: true
  });

  console.log('\n=== Download Complete! ===');
  console.log('Audio file saved to Desktop:', result.filename);
  console.log('Embedded Artist:', result.artist);
  console.log('Embedded Title:', result.title);
  if (result.lyrics) {
    console.log('\nEmbedded Lyrics (first lines):');
    console.log(result.lyrics.split('\n').slice(0, 4).join('\n') + '\n...');
  }
  if (result.lrc_file) {
    console.log('Synchronized .lrc file saved to:', result.lrc_file);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
