# js_ydlp

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Open AI Supported](https://img.shields.io/badge/Open_AI-Supported-brightgreen.svg)](NOTICE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org)
[![Build Tool](https://img.shields.io/badge/Build-Ninja_CLI-orange.svg)](build.cmd)

A high-performance, 1:1 port of [yt-dlp](https://github.com/yt-dlp/yt-dlp) in pure **Vanilla JavaScript** (Node.js ESM, zero external runtime dependencies) designed for local library integration.

---

## Open AI Statement

> **We openly support, embrace, and encourage the use of Artificial Intelligence (AI) and AI-assisted tooling in software design, development, testing, and maintenance.**
>
> All source files in this repository carry both the Apache 2.0 license notice and our Open AI commitment header.

---

## Features

- **Pure Vanilla JS / Node.js ESM**: Zero runtime dependencies. Runs directly in Node.js 18+.
- **1:1 Architectural Port of yt-dlp**:
  - `YoutubeDL` main orchestrator.
  - `InfoExtractor` hierarchy (`YoutubeIE`, `YoutubeBaseInfoExtractor`, `GenericIE`).
  - `HttpFD` downloader with byte-range resume and real-time progress hooks.
  - `RequestDirector` and `CookieJar` (full Netscape cookie file import/export).
  - `traverse_obj` data extractor matching yt-dlp path querying with wildcards and type filters.
- **YouTube Anti-Bot & Innertube Support**:
  - Native client cascade (`ANDROID` $\to$ `IOS` $\to$ `WEB`) bypassing bot-detection barriers without requiring account login.
  - Native V8 signature deciphering (`YoutubeSigSolver`).
  - PO-Token provider integration (`PoTokenProvider`).
- **Format Inspection & Selection**:
  - Equivalent to `yt-dlp -F` / `--list-formats`: lists resolutions, FPS, bitrates, video codecs (`vcodec`), and audio codecs (`acodec`).
  - Format selectors: `best`, `worst`, `bestvideo`, `bestaudio`, `worstvideo`, `worstaudio`, direct format IDs, or custom predicate functions.
- **Separate Video & Music Downloads**:
  - Download pristine video streams and separate music/audio tracks simultaneously.
- **Image & Thumbnail Downloads**:
  - Download video thumbnails or direct image URLs (`.jpg`, `.png`, `.webp`, `.svg`, `.gif`) via `download_image()`.
- **Ninja-Style Build System (`build.cmd` / `build.sh`)**:
  - Pre-flight automated tests (`33/33`).
  - Unified linking with dependency scanning.
  - Aggressive minification with Terser (variable mangling, dead code elimination, 100% comment stripping).
  - Post-linking integrity tests, including an obligatory build test that downloads video and music separately.
  - Release cache tracked in `BUILDS`.

---

## Installation & Quick Start

You can import `js_ydlp` either directly from the source directory (`src/index.js`) or from the bundled minified build (`dist/js_ydlp.min.js`):

```javascript
// Using local source modules:
import { YoutubeDL } from './src/index.js';

// OR using the minified single-file bundle:
import { YoutubeDL } from './dist/js_ydlp.min.js';
```

---

## Usage Instructions

### 1. Downloading a Video

```javascript
import { YoutubeDL } from './src/index.js';

const ydl = new YoutubeDL({
  outtmpl: 'downloads/%(title)s [%(id)s].%(ext)s',
  progress_hooks: [
    (status) => {
      if (status.status === 'downloading') {
        process.stdout.write(`\r[download] ${status.percent}% at ${status.speed}`);
      } else if (status.status === 'finished') {
        console.log(`\n[download] Finished: ${status.filename}`);
      }
    }
  ]
});

// Download video by URL
await ydl.download(['https://www.youtube.com/watch?v=yJg-Y5byMMw']);
```

---

### 2. Listing Resolutions, Codecs & Formats (`yt-dlp -F`)

Before choosing which stream to download, inspect all available streams, resolutions, and codecs:

```javascript
import { YoutubeDL } from './src/index.js';

const ydl = new YoutubeDL();
const url = 'https://www.youtube.com/watch?v=yJg-Y5byMMw';

// 1. Extract metadata without initiating download
const info = await ydl.extract_info(url, { download: false });

console.log(`Title: ${info.title}`);
console.log(`Uploader: ${info.uploader}`);
console.log(`Duration: ${info.duration}s\n`);

// 2. Print formatted stream table (Resolution, FPS, Codecs, File size)
const formatRows = ydl.list_formats(info, true);
```

#### Example Output:
```text
[info] Available formats for Warriyo - Mortals (feat. Laura Brehm):
ID     EXT   RESOLUTION   FPS  FILESIZE    VCODEC          ACODEC          MORE INFO
-----------------------------------------------------------------------------------------
18     mp4   640x360      30   9.33MiB     avc1.42001E     mp4a.40.2       360p (Muxed)
137    mp4   1920x1080    60   45.10MiB    avc1.64002a     none            1080p60 Full HD
136    mp4   1280x720     30   22.40MiB    avc1.4d401f     none            720p HD
140    m4a   audio only   -    3.20MiB     none            mp4a.40.2       medium (AAC stereo)
251    webm  audio only   -    3.45MiB     none            opus            high (Opus stereo)
```

---

### 3. Choosing Which Format to Download

You can specify the format selector in `YoutubeDL` options or select dynamically:

```javascript
// A. Download specific format by ID:
const ydl18 = new YoutubeDL({ format: '18' }); // MP4 360p pre-merged
await ydl18.download([url]);

// B. Download best video only:
const ydlVideo = new YoutubeDL({ format: 'bestvideo' });
await ydlVideo.download([url]);

// C. Download best audio/music only:
const ydlAudio = new YoutubeDL({ format: 'bestaudio' });
await ydlAudio.download([url]);

// D. Custom predicate filter:
const chosen = ydl.select_format(info.formats, (f) => f.height === 720 && f.ext === 'mp4');
console.log('Selected format:', chosen.format_id, chosen.vcodec);
```

---

### 4. Downloading Video and Music/Audio Separately

`download_separate()` extracts metadata, displays the stream table, selects the video and music streams, and saves them into separate files:

```javascript
import { YoutubeDL } from './src/index.js';

const ydl = new YoutubeDL();
const url = 'https://www.youtube.com/watch?v=yJg-Y5byMMw';

const result = await ydl.download_separate(url, {
  videoFormat: 'bestvideo',                       // or specific ID e.g. '137'
  audioFormat: 'bestaudio',                       // or specific ID e.g. '140'
  videoOuttmpl: 'downloads/video_track.mp4',
  audioOuttmpl: 'downloads/music_track.m4a'
});

console.log('Video downloaded to:', result.video._filename);
console.log('Resolution:', result.video.selected_format.resolution);
console.log('Video Codec:', result.video.selected_format.vcodec);

console.log('Music downloaded to:', result.audio._filename);
console.log('Audio Codec:', result.audio.selected_format.acodec);
```

---

### 5. Downloading Images & Thumbnails

You can download video thumbnails or any direct image URL (`.jpg`, `.png`, `.webp`, `.svg`, `.gif`):

#### A. Download Video Thumbnail:
```javascript
import { YoutubeDL } from './src/index.js';

const ydl = new YoutubeDL();
const url = 'https://www.youtube.com/watch?v=yJg-Y5byMMw';

// Extract metadata
const info = await ydl.extract_info(url, { download: false });

// Download highest resolution thumbnail
const { filename, bytes } = await ydl.download_image(info, 'downloads/thumbnail.jpg');
console.log(`Saved thumbnail (${bytes} bytes) to ${filename}`);
```

#### B. Download Direct Image URL:
```javascript
import { YoutubeDL } from './src/index.js';

const ydl = new YoutubeDL();

// Method 1: ydl.download_image()
await ydl.download_image('https://example.com/art.png', 'downloads/art.png');

// Method 2: ydl.download() via GenericIE
await ydl.download(['https://example.com/banner.webp']);
```

---

### 6. Extracting Music (MP3) with Embedded Cover Art & Artist (`yt-dlp -x --embed-thumbnail --add-metadata`)

Use `extract_audio()` to download audio, convert to MP3 at high quality (192 kbps), automatically extract the artist and song title, download the highest resolution thumbnail, and embed them directly into the MP3 file using ID3v2 tags and APIC cover art:

```javascript
import { YoutubeDL } from './src/index.js';

const ydl = new YoutubeDL();
const url = 'https://www.youtube.com/watch?v=yJg-Y5byMMw';

const result = await ydl.extract_audio(url, {
  outtmpl: 'downloads/Warriyo - Mortals.mp3', // Target output file
  artist: 'Warriyo feat. Laura Brehm',        // Custom artist (optional, auto-parsed if omitted)
  title: 'Mortals',                           // Custom title (optional, auto-parsed if omitted)
  album: 'NCS Release',                       // Album tag (optional)
  embed_thumbnail: true                       // Download & embed thumbnail as ID3 album cover
});

console.log('Saved to:', result.filename);
console.log('Embedded Artist:', result.artist);
console.log('Embedded Title:', result.title);
```

---

## Cross-Platform Build System

`js_ydlp` includes a Ninja-style CLI build system that unifies all modules into a single minified bundle with **100% comment stripping and variable mangling**.

### Running the Build

#### Windows:
```cmd
build.cmd build
```
Or specify a release tag:
```cmd
build.cmd build 1.0.2
```

#### Linux / macOS:
```bash
chmod +x build.sh
./build.sh build 1.0.2
```

### Build Pipeline Stages:
1. **[1/7] Pre-flight Test Suite**: Runs all 33 unit and integration tests (`node --test`).
2. **[2/7] Dependency Graph Scanner**: Discovers all source files in `src/`.
3. **[3/7] Symbol Resolution**: Inlines dependencies and removes circular references.
4. **[4/7] Ninja-Style Linking**:
   ```text
   [linking] [1/27] src/downloader/common.js
   [linking] [2/27] src/downloader/http.js
   ...
   [linking] [27/27] src/YoutubeDL.js
   ```
5. **[5/7] Terser Minification**: Shortens local identifiers, eliminates dead code, and strips all comments except the Apache 2.0 + AI statement header.
6. **[6/7] Post-Linking Integrity Verification**:
   - `[1/5]` Verifies public library exports.
   - `[2/5]` Verifies `YoutubeDL` instantiation and template rendering.
   - `[3/5]` Verifies `traverse_obj` and utility functions.
   - `[4/5]` Verifies complete comment removal and code density.
   - `[5/5]` **Obligatory separate download test**: Lists resolutions/codecs, selects streams, and downloads video and music separately from the linked bundle.
7. **[7/7] Release Cache Tracking**: Updates the tracked release list in `BUILDS`.

### Output Artifacts:
- `dist/js_ydlp.bundle.js` — Unified, unminified single-file bundle.
- `dist/js_ydlp.min.js` — Minified, mangled single-file library (~43 KiB).
- `BUILDS` — Comma-separated list of release versions (tracked in Git).

---

## Testing

Run the full automated test suite with Node's built-in test runner:

```bash
npm test
```

Verify Apache 2.0 license and Open AI statement headers across all files:

```bash
node scripts/header-generator.js --check
```

---

## License & Credits

- **License**: Apache License, Version 2.0 (see [LICENSE](LICENSE)).
- **Credits**: Derived from and inspired by [yt-dlp](https://github.com/yt-dlp/yt-dlp).
- **Open AI Commitment**: See [NOTICE](NOTICE).
