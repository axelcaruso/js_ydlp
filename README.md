# js_ydlp

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![AI Friendly](https://img.shields.io/badge/AI-Welcomed_%26_Supported-brightgreen.svg)](#open-ai-statement--policy)

A high-performance **1:1 Vanilla JavaScript port of [yt-dlp](https://github.com/yt-dlp/yt-dlp)** built specifically to be used locally as a modern, modular library.

---

## Highlights

- **Pure Vanilla JS**: Zero mandatory third-party runtime dependencies. Uses modern Node.js standards (`fetch`, Web Streams, `node:stream`, `node:fs`, `node:crypto`, `node:vm`, `node:test`).
- **High Performance ("Mayor Rendimiento")**: Native V8 execution for YouTube signature deciphering and n-token challenge resolution without requiring Python interpreters or external helper processes.
- **1:1 Architectural Parity**: Matches yt-dlp's class hierarchies, method names, and design patterns (`YoutubeDL`, `InfoExtractor`, `FileDownloader`, `HttpFD`, `RequestDirector`, `CookieJar`, `traverse_obj`).
- **Resumable Downloads**: Native HTTP chunked streaming with automatic `Range` header resume support and `.part` file protection.
- **Rich Progress Hooks**: Real-time speed (bytes/sec), ETA (seconds remaining), downloaded bytes, total bytes, and completion percentage.
- **Open AI Policy**: Openly embraces, celebrates, and supports Artificial Intelligence and agentic workflows.
- **Automated License & Header Tool**: Built-in script ensuring Apache 2.0 and attribution headers across all files.

---

## Open AI Statement & Policy

> **We openly support, celebrate, and embrace the use of Artificial Intelligence (AI) and AI-assisted tooling in design, development, testing, and maintenance.**

Unlike upstream yt-dlp which explicitly prohibits contributions generated or assisted by AI, **`js_ydlp`** was crafted with the philosophy that AI-assisted pair programming and agentic workflows represent a leap forward in software quality, documentation depth, performance optimization, and rigorous testing.

---

## Installation & Setup

Import `js_ydlp` directly in your ESM projects:

```bash
git clone <repo-url>
cd js_ydlp
npm test
```

Zero `npm install` steps are required to run or test the core library!

---

## Quick Start / Library Usage

### 1. Extract Video Information (Without Downloading)

```javascript
import { YoutubeDL } from 'js_ydlp';

const ydl = new YoutubeDL({
  quiet: false,
  skip_download: true
});

const info = await ydl.extract_info('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

console.log('Title:', info.title);
console.log('Channel:', info.channel);
console.log('Duration:', info.duration, 'seconds');
console.log('Formats Available:', info.formats.length);
```

### 2. Download Media with Progress Tracking and Custom Output Template

```javascript
import { YoutubeDL } from 'js_ydlp';

const ydl = new YoutubeDL({
  format: 'best', // 'best', 'worst', or specific format_id (itag)
  outtmpl: 'downloads/%(channel)s/%(title)s [%(id)s].%(ext)s',
  progress_hooks: [
    (progress) => {
      if (progress.status === 'downloading') {
        const percent = progress.percentage ? `${progress.percentage.toFixed(1)}%` : 'N/A';
        const speed = progress.speed ? `${(progress.speed / 1024 / 1024).toFixed(2)} MB/s` : 'N/A';
        const eta = progress.eta ? `${progress.eta}s` : 'N/A';
        console.log(`[download] ${percent} at ${speed} (ETA: ${eta})`);
      } else if (progress.status === 'finished') {
        console.log(`[download] Completed: ${progress.filename}`);
      }
    }
  ]
});

await ydl.download(['https://www.youtube.com/watch?v=dQw4w9WgXcQ']);
```

### 3. Using `traverse_obj` for Robust Metadata Extraction

`js_ydlp` includes a 1:1 port of `traverse_obj` from yt-dlp for deep, safe dictionary traversal:

```javascript
import { traverse_obj, ALL } from 'js_ydlp';

const data = {
  streamingData: {
    formats: [
      { itag: 18, url: 'https://example.com/18.mp4' },
      { itag: 22, url: 'https://example.com/22.mp4' }
    ]
  }
};

// Extract all itags using the ALL wildcard
const itags = traverse_obj(data, ['streamingData', 'formats', ALL, 'itag']);
console.log(itags); // [18, 22]

// Fallback search
const title = traverse_obj(data, ['title'], ['videoDetails', 'title'], { default: 'Untitled' });
```

### 4. Custom Cookies & Netscape Cookie Files

```javascript
import { YoutubeDL, CookieJar } from 'js_ydlp';

const ydl = new YoutubeDL({
  cookiefile: '/path/to/cookies.txt' // Netscape format exported from browser
});
```

---

## Architecture Overview

```
src/
├── index.js             # Public API exports
├── YoutubeDL.js         # Core orchestrator engine
├── utils/
│   ├── traversal.js     # traverse_obj with wildcards, branching, filters
│   ├── common.js        # int_or_none, float_or_none, parse_duration, etc.
│   ├── formatting.js    # format_bytes, parse_filesize, sanitize_filename
│   ├── date.js          # unified_strdate, parse_iso8601, formatSeconds
│   └── networking.js    # HTTPHeaderDict, sanitize_url, determine_ext
├── networking/
│   ├── Request.js       # HTTP Request abstraction
│   ├── Response.js      # HTTP Response abstraction with stream support
│   ├── CookieJar.js     # CookieJar matching Netscape format & Set-Cookie
│   └── RequestDirector.js # HTTP engine with retries and cookie persistence
├── downloader/
│   ├── common.js        # FileDownloader base class with progress tracking
│   └── http.js          # HttpFD with Range resume and stream pipeline
├── extractor/
│   ├── common.js        # InfoExtractor base with regex search & sorting
│   ├── generic.js       # GenericIE fallback for any HTML5/OG webpage
│   └── youtube/         # High-speed YouTube Innertube suite & sig solver
└── postprocessor/
    ├── common.js        # PostProcessor base class
    └── ffmpeg.js        # FFmpeg merger and converter wrapper
```

---

## Scripts & Tools

### Running Tests

Run the comprehensive unit test suite powered by Node.js native test runner:

```bash
npm test
```

### License & AI Header Validator

Check that all files comply with the Apache 2.0 license and AI statement:

```bash
npm run headers:check
```

Automatically apply headers to any newly created files:

```bash
npm run headers:apply
```

---

## License

This project is licensed under the **Apache License, Version 2.0**. See the [LICENSE](LICENSE) and [NOTICE](NOTICE) files for details.
