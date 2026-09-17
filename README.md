# js_ydlp

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Open AI Supported](https://img.shields.io/badge/Open_AI-Supported-brightgreen.svg)](NOTICE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org)
[![Build Tool](https://img.shields.io/badge/Build-Ninja_CLI-orange.svg)](build.cmd)

A high-performance media extraction and downloading library in pure **Vanilla JavaScript** (Node.js ESM, zero external runtime dependencies) **based on the proven architecture of yt-dlp**, engineered specifically for the web's most critical, high-volume platforms (YouTube, TikTok, and direct media) with modular target builds and automatic music metadata enrichment (genre, album, year, cover art, synced lyrics).

---

## Architecture & Philosophy

Unlike monolithic scrapers that bundle thousands of obsolete extractors, `js_ydlp` **is based on the battle-tested architecture of yt-dlp** but is laser-focused on today's dominant platforms:
- **YouTube**: Full Innertube client cascade (ANDROID $\to$ IOS $\to$ WEB), V8 signature deciphering, and visitorData bot-challenge bypass.
- **TikTok**: Sub-millisecond Proof-of-Work SHA-256 WAF challenge solving and pristine unwatermarked stream extraction.
- **Generic & Direct Media**: High-speed chunked HTTP/HTTPS streaming with resume support.
- **Modular Target Builds**: Compile lean, specialized bundles tailored to your specific platform needs (e.g. YouTube-only or TikTok-only) down to ~35–55 KiB.

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
  - `InfoExtractor` hierarchy (`YoutubeIE`, `TikTokIE`, `YoutubeBaseInfoExtractor`, `GenericIE`).
  - `HttpFD` downloader with byte-range resume and real-time progress hooks.
  - `RequestDirector` and `CookieJar` (full Netscape cookie file import/export).
  - `traverse_obj` data extractor matching yt-dlp path querying with wildcards and type filters.
- **YouTube Anti-Bot & Innertube Support**:
  - Native client cascade (`ANDROID` $\to$ `IOS` $\to$ `WEB`) bypassing bot-detection barriers without requiring account login.
  - Native V8 signature deciphering (`YoutubeSigSolver`).
  - PO-Token provider integration (`PoTokenProvider`).
- **TikTok Unwatermarked Video Downloading**:
  - Native 1:1 port of yt-dlp's `TikTokIE`.
  - Built-in WAF challenge solver using sub-millisecond SHA-256 Proof-of-Work.
  - Automatically extracts direct, pristine, unwatermarked streams (`playAddr` and adaptive streams from `bitrateInfo`).
  - Watermarked fallback (`downloadAddr`) is deprioritized matching yt-dlp.
  - Supports standard video URLs, short URLs (`vm.tiktok.com`, `vt.tiktok.com`, `tiktok.com/t/`), and embed URLs.
- **Format Inspection & Selection**:
  - Equivalent to `yt-dlp -F` / `--list-formats`: lists resolutions, FPS, bitrates, video codecs (`vcodec`), and audio codecs (`acodec`).
  - Format selectors: `best`, `worst`, `bestvideo`, `bestaudio`, `worstvideo`, `worstaudio`, direct format IDs, or custom predicate functions.
- **Separate Video & Music Downloads**:
  - Download pristine video streams and separate music/audio tracks simultaneously.
- **Image & Thumbnail Downloads**:
  - Download video thumbnails or direct image URLs (`.jpg`, `.png`, `.webp`, `.svg`, `.gif`) via `download_image()`.
- **Ninja-Style Build System (`build.cmd` / `build.sh`)**:
  - Pre-flight automated tests (`41/41`).
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

### 6. Extracting Music (MP3) with Automatic Genre, Album, Year, Cover Art & Lyrics

Use `extract_audio()` to download audio, convert to MP3 at high quality (192 kbps), automatically search public music databases (iTunes Search API) and video metadata for:
- **Genre** (`Dance`, `Electronic`, `Rock`, `Hip-Hop`, `Trap`, `Pop`, etc.)
- **Official Album** name
- **Release Year**
- **Artist & Song Title**
- **High-resolution Cover Art** embedded as ID3v2 APIC attached picture
- **Synchronized Lyrics** (`.lrc`) and static lyrics embedded into ID3v2 `USLT` tags

```javascript
import { YoutubeDL } from './src/index.js';

const ydl = new YoutubeDL();
const url = 'https://www.youtube.com/watch?v=yJg-Y5byMMw';

const result = await ydl.extract_audio(url, {
  outtmpl: 'downloads/%(title)s.mp3',
  embed_thumbnail: true,                      // Download & embed cover art
  embed_lyrics: true,                         // Search & embed lyrics into MP3 ID3 tags
  write_lrc: true,                            // Save synchronized .lrc file
  fetch_metadata: true                        // Auto-discover genre, album & release year
});

console.log('Audio file saved to:', result.filename);
console.log('Embedded Artist:', result.artist);
console.log('Embedded Title:', result.title);
console.log('Embedded Album:', result.album);
console.log('Embedded Genre:', result.genre); // e.g. "Dance"
console.log('Embedded Year:', result.year);   // e.g. "2016"
console.log('Synchronized LRC file:', result.lrc_file);
```

#### Fetching Lyrics Directly (`get_lyrics`):

You can also fetch synchronized (.lrc) and plain lyrics directly without downloading audio:

```javascript
import { YoutubeDL } from './src/index.js';

const ydl = new YoutubeDL();

// Method A: By video URL
const lyrics1 = await ydl.get_lyrics('https://www.youtube.com/watch?v=yJg-Y5byMMw');
console.log(lyrics1.plainLyrics);
console.log(lyrics1.syncedLyrics); // Timed [mm:ss.xx] format

// Method B: By song query
const lyrics2 = await ydl.get_lyrics('Warriyo - Mortals');
```

---

### 7. Downloading TikTok Videos Without Watermark

`js_ydlp` includes a 1:1 port of yt-dlp's `TikTokIE` with an automatic SHA-256 Proof-of-Work WAF solver. It automatically prioritizes pristine unwatermarked playback streams over watermarked downloads (`download_watermarked` has preference `-2`):

```javascript
import { YoutubeDL } from './src/index.js';

const ydl = new YoutubeDL({
  outtmpl: 'downloads/tiktok_%(id)s.%(ext)s'
});

// Supports standard, short (vm.tiktok.com, vt.tiktok.com, /t/), and embed URLs
const tiktokUrl = 'https://www.tiktok.com/@tiktok/video/7106594312292453675';

// 1. Inspect unwatermarked formats and audio track
const info = await ydl.extract_info(tiktokUrl, { download: false });
ydl.list_formats(info, true);

// 2. Download the unwatermarked video (selected automatically by 'best')
await ydl.download([tiktokUrl]);

// 3. Or extract only the music track with embedded metadata
await ydl.extract_audio(tiktokUrl, {
  outtmpl: 'downloads/%(title)s.mp3',
  embed_thumbnail: true
});
```

---

## Cross-Platform Build System & Modular Target Bundling

`js_ydlp` includes a high-performance Ninja-style CLI build system that unifies all modules into a single minified bundle with **100% comment stripping and variable mangling**.

You can compile a **full bundle** or a **lean, target-specific bundle** specialized for a single platform:

### Build Targets

| Target | Description | Output Files | Approximate Size |
|---|---|---|---|
| `all` (default) | Complete engine with YouTube, TikTok, and Generic extractors | `dist/js_ydlp.bundle.js`, `dist/js_ydlp.min.js` | ~61 KiB |
| `youtube` | Specialized lean build for YouTube only | `dist/js_ydlp.youtube.min.js`, `dist/js_ydlp.min.js` | ~55 KiB |
| `tiktok` | Specialized ultra-compact build for TikTok only | `dist/js_ydlp.tiktok.min.js`, `dist/js_ydlp.min.js` | ~53 KiB |

### Running the Build

#### 1. Full Build (Default):
```cmd
# Windows:
build.cmd build

# Linux / macOS:
./build.sh build
```

#### 2. YouTube-Only Build:
```cmd
build.cmd build youtube
# Or specify version:
build.cmd build youtube 1.0.7
```

#### 3. TikTok-Only Build:
```cmd
build.cmd build tiktok
# Or specify version:
build.cmd build tiktok 1.0.7
```

#### 4. Explicit Options:
```cmd
build.cmd build --target youtube --release 1.0.7 --skip-tests
```

### Build Pipeline Stages:
1. **[1/7] Pre-flight Test Suite**: Runs all 42 unit and integration tests (`node --test`).
2. **[2/7] Dependency Graph Scanner**: Discovers and filters source modules matching the selected target.
3. **[3/7] Symbol Resolution**: Inlines dependencies and resolves target-specific extractor registries.
4. **[4/7] Ninja-Style Linking**:
   ```text
   [linking] [1/28] src/downloader/common.js
   ...
   [linking] [28/28] src/YoutubeDL.js
   ```
5. **[5/7] Terser Minification**: Shortens local identifiers, eliminates dead code, and strips all comments except the Apache 2.0 + AI statement header.
6. **[6/7] Post-Linking Integrity Verification**:
   - `[1/4]` Verifies public library exports for the active target.
   - `[2/4]` Verifies `YoutubeDL` instantiation and template rendering.
   - `[3/4]` Verifies `traverse_obj` and utility functions.
   - `[4/5]` Verifies complete comment removal and code density.
   - `[5/5]` **Obligatory separate download test**: Lists resolutions/codecs, selects streams, and downloads video and music separately from the linked bundle.
7. **[7/7] Release Cache Tracking**: Updates the tracked release list in `BUILDS`.

### Output Artifacts:
- `dist/js_ydlp.bundle.js` — Full unminified single-file bundle.
- `dist/js_ydlp.min.js` — Minified, mangled single-file library ready for import.
- `dist/js_ydlp.youtube.min.js` — YouTube-specialized minified bundle.
- `dist/js_ydlp.tiktok.min.js` — TikTok-specialized minified bundle.
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
