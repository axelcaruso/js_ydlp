# js_ydlp

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Open AI Supported](https://img.shields.io/badge/Open_AI-Supported-brightgreen.svg)](NOTICE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org)
[![Build Tool](https://img.shields.io/badge/Build-Ninja_CLI-orange.svg)](build.cmd)
[![Bundle Size](https://img.shields.io/badge/Minified_Bundle-~59--66_KB-blueviolet.svg)](dist/)

A high-performance media extraction and downloading library in pure **Vanilla JavaScript** (Node.js ESM, zero external runtime dependencies) **based on the proven architecture of yt-dlp**.

Engineered specifically for the web's dominant media platforms (**YouTube**, **TikTok**, and direct streams) with an **ultra-intuitive, modern JavaScript API**, zero-RAM streaming chunk pipeline, modular target builds, and rich music metadata auto-discovery (genre, album, release year, cover art, synchronized lyrics).

---

## Architecture & Philosophy

Unlike monolithic scrapers carrying thousands of legacy extractors, `js_ydlp` **is based on the battle-tested architecture of yt-dlp** but is streamlined and laser-focused:

- **YouTube**: Full Innertube client cascade (`ANDROID` $\to$ `IOS` $\to$ `WEB`), V8 signature deciphering, PO-Token integration, and bot-challenge bypass.
- **TikTok**: Sub-millisecond Proof-of-Work SHA-256 WAF challenge solver, pristine **unwatermarked** stream extraction, and automatic universal **H.264 (yuv420p)** recoding.
- **Music & Audio**: Automatic rich metadata discovery (genre, official album, release year) via public music databases, ID3v2 tagging, cover art embedding, and synchronized `.lrc` lyrics.
- **Stream-First & Zero-RAM**: Media is piped chunk-by-chunk directly to disk with HTTP 206 Range resumption. No file is ever buffered entirely into RAM.
- **Modular Target Builds**: Compile specialized standalone bundles tailored to your use case (`all`, `youtube`, or `tiktok`) down to ~55–60 KiB.
- **Dual API Design**: Use modern top-level one-liners (`download`, `downloadMusic`, `extractInfo`) or the classic, fluent `YoutubeDL` orchestrator class. Supports both `camelCase` and `snake_case`.

---

## Open AI Statement

> **We openly support, embrace, and encourage the use of Artificial Intelligence (AI) and AI-assisted tooling in software design, development, testing, and maintenance.**
>
> All source files in this repository carry both the Apache 2.0 license notice and our Open AI commitment header.

---

## Table of Contents

- [Installation & Imports](#installation--imports)
- [Quick Start (3-Line One-Liners)](#quick-start-3-line-one-liners)
- [Top-Level Intuitive API](#top-level-intuitive-api)
  - [`download(url, options)`](#downloadurl-options)
  - [`downloadMusic(url, options)`](#downloadmusicurl-options)
  - [`extractInfo(url, options)`](#extractinfourl-options)
  - [`listFormats(url, print)`](#listformatsurl-print)
  - [`downloadSeparate(url, options)`](#downloadseparateurl-options)
  - [`downloadImage(url, targetPath)`](#downloadimageurl-targetpath)
  - [`getLyrics(url, options)`](#getlyricsurl-options)
  - [`getMetadata(url)`](#getmetadataurl)
- [Object-Oriented & Fluent API (`YoutubeDL`)](#object-oriented--fluent-api-youtubedl)
  - [Constructor Options](#constructor-options)
  - [Fluent Chaining](#fluent-chaining)
  - [Progress Monitoring Hooks](#progress-monitoring-hooks)
- [Platform Features](#platform-features)
  - [TikTok (No Watermark + Universal H.264 Recode)](#tiktok-no-watermark--universal-h264-recode)
  - [YouTube (Multi-Client Innertube & Bot Bypass)](#youtube-multi-client-innertube--bot-bypass)
- [Format & Codec Inspection](#format--codec-inspection)
- [Streaming & Chunks Architecture](#streaming--chunks-architecture)
- [Modular Build Pipeline](#modular-build-pipeline)
- [Complete Options Reference](#complete-options-reference)
- [License](#license)

---

## Installation & Imports

`js_ydlp` requires **Node.js 18.0.0 or higher** (ESM native, zero external dependencies).

### 1. From local source modules:
```javascript
import ydlp, {
  download,
  downloadMusic,
  extractInfo,
  listFormats,
  YoutubeDL
} from './src/index.js';
```

### 2. From minified single-file bundles (`dist/`):
```javascript
// Full bundle (YouTube + TikTok + Direct Streams)
import ydlp, { download, downloadMusic, YoutubeDL } from './dist/js_ydlp.min.js';

// YouTube-only lean bundle (60 KiB)
import { download, YoutubeDL } from './dist/js_ydlp.youtube.min.js';

// TikTok-only lean bundle (59 KiB)
import { download, YoutubeDL } from './dist/js_ydlp.tiktok.min.js';
```

---

## Quick Start (3-Line One-Liners)

### 1. Download Any Video (YouTube or TikTok)
```javascript
import { download } from './src/index.js';

// Downloads to desktop with clean H.264 video + AAC audio
await download('https://www.tiktok.com/@user/video/123456789', {
  output: '~/Desktop/%(title)s.%(ext)s'
});
```

### 2. Download Music with Database Enrichment & Clean Filename
```javascript
import { downloadMusic } from './src/index.js';

// Searches iTunes / LRCLIB, removes YouTube clutter, embeds cover art & lyrics,
// and automatically saves with a clean "Artist - Title.mp3" filename!
await downloadMusic('https://www.youtube.com/watch?v=wsGdGASOjro', {
  enrich: true,       // Matches clean artist/title in DB & strips YouTube noise
  output: '~/Music/', // Saves cleanly as: "~/Music/AGST - Thought.mp3"
  writeLrc: true      // Also saves synced .lrc file
});
```

### 3. Extract Metadata Only
```javascript
import { extractInfo } from './src/index.js';

const info = await extractInfo('https://www.youtube.com/watch?v=wsGdGASOjro');
console.log(`${info.title} (${info.duration}s) by ${info.uploader}`);
```

---

## Top-Level Intuitive API

### `download(url, options)`
Downloads media from a URL or array of URLs.

```javascript
const result = await download('https://www.youtube.com/watch?v=wsGdGASOjro', {
  output: 'downloads/%(title)s.%(ext)s',
  format: 'best',
  onProgress: (p) => console.log(`${p.percentage?.toFixed(1)}% | ${p.speed} B/s`)
});

console.log(result.success); // true
console.log(result.files);   // ['downloads/Thought.mp4']
```

**Parameters**:
- `url` *(string | string[])*: Media URL or list of URLs.
- `options` *(object)*: Configuration options (see [Options Reference](#complete-options-reference)).

**Returns**: `Promise<{ success: boolean, code: number, files: string[], info: object[] }>`

---

### `downloadMusic(url, options)`
*Alias: `extractAudio(url, options)`*

Extracts the audio track from a video and enriches it with:
1. **Database Enrichment & Clean Filenames (`enrich: true`)**: Searches public music databases (iTunes Search API and LRCLIB) to match the official song, removes YouTube title noise (e.g. `[NCS Release]`, `(Official Video)`, `(Lyrics)`, ` - Topic`), and automatically names the MP3 file cleanly as `Artist - Title.mp3`.
2. **ID3v2 tags**: Artist, song title, album name, genre, and release year verified against official music catalogs.
3. **Cover Art**: High-resolution thumbnail downloaded and embedded into the MP3 container (`APIC` frame).
4. **Lyrics**: Synced or plain lyrics automatically searched and embedded (`USLT` frame).
5. **Synced LRC**: Generates a synchronized `.lrc` file alongside the audio if `writeLrc: true`.

```javascript
const track = await downloadMusic('https://www.youtube.com/watch?v=wsGdGASOjro', {
  enrich: true,         // Clean name & database metadata match (e.g. "AGST - Thought.mp3")
  output: 'music/',     // Directory or custom template
  embedThumbnail: true, // Embed album art into MP3
  embedLyrics: true,    // Search and embed lyrics
  writeLrc: true        // Save synced .lrc file alongside
});

console.log(track.filename);      // 'music/AGST - Thought.mp3'
console.log(track.artist);        // 'AGST'
console.log(track.title);         // 'Thought'
console.log(track.album);         // 'Thought - Single'
console.log(track.genre);         // 'Electronic'
console.log(track.year);          // '2023'
console.log(track.lrc_file);      // 'music/AGST - Thought.lrc'
```

---

### `extractInfo(url, options)`
*Alias: `getInfo(url, options)`*

Extracts metadata, available formats, thumbnail URLs, description, and playability status without downloading media.

```javascript
const info = await extractInfo('https://www.tiktok.com/@coolshotlab2/video/7681295491799338270');
console.log(info.title);
console.log(info.duration);
console.log(info.formats); // Array of available streams
```

---

### `listFormats(url, print)`
Inspects all available video and audio streams, reporting format IDs, extensions, resolutions, FPS, bitrates, video codecs (`vcodec`), and audio codecs (`acodec`).

```javascript
// Prints formatted table to stdout and returns the rows array
const formats = await listFormats('https://www.youtube.com/watch?v=wsGdGASOjro', true);
```

**Example Output Table**:
```text
ID     EXT   RESOLUTION   FPS  FILESIZE    VCODEC          ACODEC          MORE INFO
-----------------------------------------------------------------------------------------
137    mp4   1920x1080    60   16.00KiB    avc1.64002a     none            1080p60 Full HD
136    mp4   1280x720     30   16.00KiB    avc1.4d401f     none            720p HD
140    m4a   audio only   -    8.00KiB     none            mp4a.40.2       medium (AAC stereo)
251    webm  audio only   -    8.00KiB     none            opus            high (Opus stereo)
18     mp4   360x360      25   ~207k       avc1.42001E     mp4a.40.2       360p
```

---

### `downloadSeparate(url, options)`
Downloads pristine adaptive video and separate music/audio streams concurrently as individual files.

```javascript
const result = await downloadSeparate('https://www.youtube.com/watch?v=wsGdGASOjro', {
  videoFormat: 'bestvideo',
  audioFormat: 'bestaudio',
  videoOuttmpl: 'raw_video.mp4',
  audioOuttmpl: 'raw_music.m4a'
});

console.log(result.video._filename); // 'raw_video.mp4'
console.log(result.audio._filename); // 'raw_music.m4a'
```

---

### `downloadImage(url, targetPath)`
Downloads video thumbnails or standalone images directly to disk.

```javascript
await downloadImage('https://i.ytimg.com/vi/wsGdGASOjro/maxresdefault.jpg', 'cover.jpg');
```

---

### `getLyrics(url, options)`
Fetches synchronized and plain text lyrics from open databases (LRCLIB) with fallback to video closed captions.

```javascript
const lyrics = await getLyrics('Warriyo - Mortals');
console.log(lyrics.plainLyrics);
console.log(lyrics.syncedLyrics); // [00:15.20] Stranded in the open...
```

---

### `getMetadata(url)`
Resolves rich music metadata (genre, album, release year) for a track or video URL.

```javascript
const meta = await getMetadata('https://www.youtube.com/watch?v=yJg-Y5byMMw');
console.log(meta.genre);       // 'Dance'
console.log(meta.album);       // 'Mortals (feat. Laura Brehm) - Single'
console.log(meta.releaseDate); // '2016-12-16'
```

---

## Object-Oriented & Fluent API (`YoutubeDL`)

For advanced use cases, multi-download sessions, or fine-grained control, instantiate the `YoutubeDL` orchestrator class:

```javascript
import { YoutubeDL } from './src/index.js';

const ydl = new YoutubeDL({
  output: 'downloads/%(title)s [%(id)s].%(ext)s',
  format: 'best',
  quiet: false,
  verbose: false,
  continueDl: true
});

await ydl.download(['https://www.youtube.com/watch?v=yJg-Y5byMMw']);
```

### Fluent Chaining
Configure instances seamlessly with fluent builder methods:

```javascript
const ydl = new YoutubeDL()
  .output('videos/%(title)s.%(ext)s')
  .format('bestvideo+bestaudio/best')
  .recode('mp4') // Auto-recode to universal H.264
  .cookieFile('cookies.txt')
  .onProgress((p) => {
    if (p.status === 'downloading') {
      process.stdout.write(`\r[${p.percentage?.toFixed(1)}%] Speed: ${p.speed} B/s | ETA: ${p.eta}s`);
    }
  });

await ydl.download('https://www.tiktok.com/@user/video/12345');
```

### Progress Monitoring Hooks
Progress hooks receive real-time metrics every **250 ms**:

```javascript
ydl.addProgressHook((status) => {
  if (status.status === 'downloading') {
    console.log({
      percentage: status.percentage,       // e.g. 45.2 (%)
      downloadedBytes: status.downloadedBytes, // e.g. 4718592 (bytes)
      totalBytes: status.totalBytes,           // e.g. 10444800 (bytes)
      speed: status.speed,                     // e.g. 1524000 (bytes/sec)
      eta: status.eta,                         // e.g. 4 (seconds)
      elapsed: status.elapsed                  // e.g. 3 (seconds)
    });
  } else if (status.status === 'finished') {
    console.log(`Download finished: ${status.filename}`);
  }
});
```

---

## Platform Features

### TikTok (No Watermark + Universal H.264 Recode)
- **Sub-millisecond WAF Proof-of-Work**: Bypasses TikTok's client-side JavaScript challenge (`SHA-256(seed + nonce) === target`) natively in `< 2 ms` without headless browsers.
- **Pristine Unwatermarked Streams**: Automatically extracts and prioritizes direct playback streams (`playAddr` and adaptive 1080p/720p streams from `bitrateInfo`), deprioritizing the watermarked fallback.
- **Universal H.264 / AAC Recode**:
  - TikTok often encodes vertical 1080p videos in **HEVC / H.265** (`bytevc1`), causing black screens in Windows Media Player and older devices.
  - `js_ydlp` **automatically detects HEVC streams** and recodes them using FFmpeg to **H.264 (`libx264`) with `yuv420p` pixel format and `+faststart` atom**.
  - Plays instantly and smoothly in **every single video player**.

### YouTube (Multi-Client Innertube & Bot Bypass)
- **Multi-Client Cascade**:
  - Tries `ANDROID` client first (direct clean streams without bot blocks).
  - Cascades to `IOS` $\to$ `WEB` if needed.
- **Signature Deciphering**:
  - Includes `YoutubeSigSolver` with native bytecode operations extraction from YouTube player base JavaScript.
- **PO-Token Integration**:
  - Includes `PoTokenProvider` for automated minting of proof-of-origin tokens.

---

## Streaming & Chunks Architecture

`js_ydlp` is built on a **Stream-First, Zero-RAM Buffer Architecture**:

1. **Streaming Consumer**:
   - `HttpFD` consumes the server response via **Web `ReadableStream`** (`getReader()`) or **Node.js `pipeline`**.
   - Chunks are written incrementally to a temporary `.part` file on disk via `fs.createWriteStream`.
   - **RAM usage is constant (~KB)** regardless of whether downloading a 3 MB song or a 50 GB 4K video.
2. **HTTP 206 Partial Content & Range Resumption**:
   - If a download is interrupted, `js_ydlp` inspects the existing `.part` file size and issues an HTTP Range request:
     ```http
     Range: bytes=<existing_bytes>-
     ```
   - Automatically resumes from where it stopped without restarting from zero.
3. **Atomic File Renaming**:
   - Files only receive their final extension once the entire byte stream has verified and closed.

---

## Modular Build Pipeline

`js_ydlp` includes a cross-platform Ninja build CLI (`build.cmd` on Windows, `build.sh` on Linux/macOS) powered by Terser:

- **Full variable mangling & obfuscation**
- **100% comment and JSDoc stripping**
- **2-pass dead code elimination**
- **Automated post-linking integrity tests**

### Compile Targets

```bash
# Windows
build.cmd build all [version]      # Full bundle (~66 KiB minified)
build.cmd build youtube [version]  # YouTube-only lean bundle (~60 KiB)
build.cmd build tiktok [version]   # TikTok-only lean bundle (~59 KiB)

# Linux / macOS
./build.sh build all [version]
./build.sh build youtube [version]
./build.sh build tiktok [version]
```

### Verified Bundle Isolation
Target-specific builds strictly exclude code from other platforms:
- `dist/js_ydlp.youtube.min.js`: Contains 0 TikTok WAF or extractor code.
- `dist/js_ydlp.tiktok.min.js`: Contains 0 YouTube Innertube or signature deciphering code.

---

## Complete Options Reference

All options support both modern `camelCase` and traditional `snake_case`:

| Option (`camelCase`) | Option (`snake_case`) | Type | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `output` | `outtmpl` | `string` | `%(title)s [%(id)s].%(ext)s` | Output filename or path template. |
| `format` | `format` | `string` | `'best'` | Format selector (`best`, `worst`, `bestvideo`, `bestaudio`, or itag). |
| `skipDownload` | `skip_download` | `boolean` | `false` | Extract metadata only without downloading. |
| `continueDl` | `continuedl` | `boolean` | `true` | Resume partial `.part` downloads with HTTP 206 Range. |
| `quiet` | `quiet` | `boolean` | `false` | Suppress console log messages. |
| `verbose` | `verbose` | `boolean` | `false` | Print detailed debug messages. |
| `cookieFile` | `cookiefile` | `string` | `null` | Path to Netscape format cookies file. |
| `onProgress` | `progress_hooks` | `Function` | `[]` | Callback invoked every 250ms with progress metrics. |
| `recodeVideo` | `recode_video` | `string` | `null` | Target video container/codec (e.g. `'mp4'`, `'h264'`). |
| `autoRecodeHevc` | `auto_recode_hevc`| `boolean` | `true` | Automatically convert HEVC (H.265) to universal H.264 (AVC). |
| `enrich` / `cleanName` | `clean_name` / `clean_filename` | `boolean` | `false` | Matches song in music databases (iTunes/LRCLIB), strips YouTube noise, and saves clean `Artist - Title.mp3` filename. |
| `embedThumbnail` | `embed_thumbnail`| `boolean` | `true` | Embed cover art image into audio metadata (`extractAudio`). |
| `embedLyrics` | `embed_lyrics` | `boolean` | `true` | Search and embed lyrics into ID3 tags (`extractAudio`). |
| `fetchMetadata` | `fetch_metadata`| `boolean` | `true` | Search online music databases for genre, album, and year. |
| `writeLrc` | `write_lrc` | `boolean` | `false` | Save synchronized `.lrc` lyrics file alongside audio. |
| `artist` | `artist` | `string` | `null` | Override artist name for ID3 tags. |
| `title` | `title` | `string` | `null` | Override track title for ID3 tags. |
| `album` | `album` | `string` | `null` | Override album name for ID3 tags. |
| `genre` | `genre` | `string` | `null` | Override genre for ID3 tags. |
| `videoFormat` | `video_format` | `string` | `'bestvideo'` | Video selector for `downloadSeparate`. |
| `audioFormat` | `audio_format` | `string` | `'bestaudio'` | Audio selector for `downloadSeparate`. |

---

## License

This project is licensed under the **Apache License 2.0**. See the [LICENSE](LICENSE) file for details.

```text
Copyright (c) 2026 Axel Caruso and js_ydlp contributors.
Derived from and inspired by yt-dlp (https://github.com/yt-dlp/yt-dlp).

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
```
