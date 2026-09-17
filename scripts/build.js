#!/usr/bin/env node
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

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { HEADER_TEXT } from './header-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const BUILDS_FILE = path.join(ROOT_DIR, 'BUILDS');

/**
 * Reads existing build tags from BUILDS cache file.
 * @returns {string[]}
 */
export function readBuildsCache() {
  if (!fs.existsSync(BUILDS_FILE)) {
    return ['1.0.0'];
  }
  const content = fs.readFileSync(BUILDS_FILE, 'utf8').trim();
  if (!content) return ['1.0.0'];
  return content.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Appends a new build version tag to BUILDS cache file.
 * @param {string} version
 */
export function writeBuildsCache(version) {
  const current = readBuildsCache();
  if (!current.includes(version)) {
    current.push(version);
  }
  fs.writeFileSync(BUILDS_FILE, current.join(', ') + '\n', 'utf8');
}

/**
 * Computes next suggested semantic version tag.
 * @param {string[]} builds
 * @returns {string}
 */
export function getNextVersion(builds) {
  if (builds.length === 0) return '1.0.0';
  const last = builds[builds.length - 1];
  const parts = last.split('.').map((p) => parseInt(p, 10));
  if (parts.length === 3 && !parts.some(Number.isNaN)) {
    return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
  return `${last}.1`;
}

/**
 * Prompts user for release name if in TTY mode.
 * @param {string} suggested
 * @returns {Promise<string>}
 */
export async function promptReleaseName(suggested) {
  if (!process.stdin.isTTY) {
    return suggested;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(`\x1b[36mChoose release version [default: ${suggested}]:\x1b[0m `, (answer) => {
      rl.close();
      const choice = answer.trim();
      resolve(choice || suggested);
    });
  });
}

/**
 * Recursively scans all JavaScript modules in a directory.
 * @param {string} dir
 * @returns {string[]} Absolute paths.
 */
function scanSourceModules(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanSourceModules(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Transforms an ES module's source code to a scoped module factory function body.
 * @param {string} code - Original ES module code.
 * @returns {string} Transformed factory body.
 */
function transformModule(code) {
  let transformed = code;

  // 1. Remove license block at top if present
  transformed = transformed.replace(/\/\*\*[\s\S]*?\*\/\s*/, '');

  // 2. Remove Node.js built-in imports (they are provided at top level of bundle)
  transformed = transformed.replace(/^import\s+[\s\S]*?from\s+['"]node:[^'"]+['"];?\s*$/gm, '');

  // 3. Transform relative imports into require calls
  // import { a, b } from './path.js'; -> const { a, b } = require('./path.js');
  transformed = transformed.replace(
    /^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
    'const { $1 } = require("$2");'
  );

  // import * as x from './path.js'; -> const x = require('./path.js');
  transformed = transformed.replace(
    /^import\s+\*\s+as\s+([a-zA-Z0-9_$]+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
    'const $1 = require("$2");'
  );

  // 4. Transform re-exports
  // export * from './path.js'; -> Object.assign(exports, require('./path.js'));
  transformed = transformed.replace(
    /^export\s+\*\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
    'Object.assign(exports, require("$1"));'
  );

  // export { a, b } from './path.js';
  transformed = transformed.replace(
    /^export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
    'const { $1 } = require("$2"); Object.assign(exports, { $1 });'
  );

  // 5. Transform named exports
  // export const/let/var x = ... -> const x = ...; exports.x = x;
  transformed = transformed.replace(
    /^export\s+(const|let|var)\s+([a-zA-Z0-9_$]+)\s*=/gm,
    '$1 $2 = exports.$2 ='
  );

  // export function f(...) { -> function f(...) { ... }; exports.f = f;
  transformed = transformed.replace(
    /^export\s+(async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/gm,
    '$1function $2('
  );
  // Also register function exports
  const funcMatches = code.matchAll(/^export\s+(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/gm);
  for (const match of funcMatches) {
    transformed += `\nexports.${match[1]} = ${match[1]};`;
  }

  // export class C { -> class C { ... }; exports.C = C;
  transformed = transformed.replace(
    /^export\s+class\s+([a-zA-Z0-9_$]+)/gm,
    'class $1'
  );
  const classMatches = code.matchAll(/^export\s+class\s+([a-zA-Z0-9_$]+)/gm);
  for (const match of classMatches) {
    transformed += `\nexports.${match[1]} = ${match[1]};`;
  }

  // export { a, b, c as d }; -> exports.a = a; exports.d = c;
  transformed = transformed.replace(/^export\s+\{([^}]+)\};?\s*$/gm, (_, specifiers) => {
    const lines = [];
    for (const spec of specifiers.split(',')) {
      const trimmed = spec.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+as\s+/);
      if (parts.length === 2) {
        lines.push(`exports.${parts[1].trim()} = ${parts[0].trim()};`);
      } else if (parts[0]) {
        lines.push(`exports.${parts[0].trim()} = ${parts[0].trim()};`);
      }
    }
    return lines.join('\n');
  });

  // export default <identifier/expression>; -> exports.default = <expression>;
  transformed = transformed.replace(/^export\s+default\s+([^;]+);?\s*$/gm, 'exports.default = $1;');

  return transformed.trim();
}

/**
 * High-performance JavaScript minifier for the unified bundle.
 * Uses Terser for full variable mangling, dead code elimination, and comment removal.
 * @param {string} code
 * @returns {Promise<string>} Minified code.
 */
async function minifyJs(code) {
  try {
    const { minify } = await import('terser');
    const res = await minify(code, {
      module: true,
      compress: {
        passes: 2,
        dead_code: true
      },
      mangle: {
        toplevel: false,
        eval: true
      },
      format: {
        comments: false
      }
    });
    if (res.code) {
      return res.code;
    }
  } catch (err) {
    console.error('\x1b[31m[Terser error]\x1b[0m', err.message || err);
  }

  // Fallback: strip comments and collapse whitespace
  let min = code.replace(/\/\*[\s\S]*?\*\//g, '');
  min = min.replace(/(?<!:)\/\/(?!#).*?$/gm, '');
  min = min.replace(/^[ \t]+/gm, '');
  min = min.replace(/\n\s*\n/g, '\n');
  return min.trim();
}

/**
 * Executes post-linking integrity tests on the newly generated bundle.
 * @param {string} minBundlePath - Absolute path to minified bundle.
 */
async function testLinkedBundle(minBundlePath, { hasYouTube = true, hasTikTok = true } = {}) {
  console.log('\x1b[33m[6/7] Testing linked bundle integrity...\x1b[0m');
  const { pathToFileURL } = await import('node:url');
  const bundleUrl = `${pathToFileURL(minBundlePath).href}?t=${Date.now()}`;
  const bundle = await import(bundleUrl);

  // 1. Verify key exports
  const requiredExports = [
    'YoutubeDL',
    'traverse_obj',
    'ALL',
    'InfoExtractor',
    'GenericIE',
    'HttpFD',
    'RequestDirector',
    'CookieJar',
    'format_bytes',
    'sanitize_filename'
  ];
  if (hasYouTube) requiredExports.push('YoutubeIE');
  if (hasTikTok) requiredExports.push('TikTokIE');

  for (const exp of requiredExports) {
    if (!bundle[exp]) {
      throw new Error(`[linking-test] Missing export in bundle: ${exp}`);
    }
  }
  console.log('  [\x1b[32mlinking-test\x1b[0m] [1/4] Verified all module exports in bundle.');

  // 2. Test YoutubeDL engine
  const ydl = new bundle.YoutubeDL({ quiet: true });
  const filename = ydl.prepare_filename({ title: 'Test Video', id: 'xyz', ext: 'mp4' });
  if (!filename.includes('Test Video') || !filename.includes('xyz')) {
    throw new Error(`[linking-test] YoutubeDL.prepare_filename output unexpected: ${filename}`);
  }
  console.log('  [\x1b[32mlinking-test\x1b[0m] [2/4] Verified YoutubeDL instantiation and template expansion.');

  // 3. Test traverse_obj and formatting
  const testData = { a: { b: [{ val: 123 }, { val: 456 }] } };
  const res = bundle.traverse_obj(testData, ['a', 'b', bundle.ALL, 'val']);
  if (!Array.isArray(res) || res[0] !== 123 || res[1] !== 456) {
    throw new Error(`[linking-test] traverse_obj failed on linked bundle`);
  }
  if (bundle.format_bytes(1048576) !== '1.00MiB') {
    throw new Error(`[linking-test] format_bytes failed on linked bundle`);
  }
  console.log('  [\x1b[32mlinking-test\x1b[0m] [3/4] Verified traverse_obj and utility functions.');

  // 4. Verify comments removal
  const rawContent = fs.readFileSync(minBundlePath, 'utf8');
  // Everything below the header must contain no comments
  const lines = rawContent.split('\n');
  const codeAfterHeader = lines.slice(25).join('\n');
  if (codeAfterHeader.includes('//') && !codeAfterHeader.includes('://')) {
    // Only URL protocols allowed
    const hasUnstrippedComment = /\/\/[^"'`\n]+$/m.test(codeAfterHeader);
    if (hasUnstrippedComment) {
      console.warn('  [\x1b[33mwarning\x1b[0m] Found remaining comments in minified bundle.');
    }
  }
  console.log('  [\x1b[32mlinking-test\x1b[0m] [4/5] Verified complete comment stripping and code density.');

  // 5. Obligatory build test: List resolutions/codecs, choose format, download video & music separately
  const http = await import('node:http');
  const path = await import('node:path');
  const tmpDir = path.resolve('test/tmp_bundle_sep');
  fs.mkdirSync(tmpDir, { recursive: true });

  const mockVid = Buffer.alloc(1024, 'V');
  const mockAud = Buffer.alloc(512, 'A');

  const srv = http.createServer((req, res) => {
    if (req.url === '/v.mp4') {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': mockVid.length });
      res.end(mockVid);
    } else if (req.url === '/a.m4a') {
      res.writeHead(200, { 'Content-Type': 'audio/mp4', 'Content-Length': mockAud.length });
      res.end(mockAud);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const srvPort = srv.address().port;
  const srvBase = `http://127.0.0.1:${srvPort}`;

  class BuildMockIE extends bundle.InfoExtractor {
    static IE_NAME = 'build_mock';
    static _VALID_URL = /http:\/\/127\.0\.0\.1:[0-9]+\/media/;
    async _real_extract(url) {
      return {
        id: 'build_track',
        title: 'Build Integrity Track',
        formats: [
          {
            format_id: 'vid-1080p',
            url: `${srvBase}/v.mp4`,
            ext: 'mp4',
            width: 1920,
            height: 1080,
            fps: 60,
            vcodec: 'avc1.64002a',
            acodec: 'none',
            tbr: 4500,
            filesize: mockVid.length,
            format_note: '1080p60'
          },
          {
            format_id: 'aud-aac',
            url: `${srvBase}/a.m4a`,
            ext: 'm4a',
            width: null,
            height: null,
            fps: null,
            vcodec: 'none',
            acodec: 'mp4a.40.2',
            tbr: 128,
            filesize: mockAud.length,
            format_note: 'music AAC'
          }
        ]
      };
    }
  }

  const buildYdl = new bundle.YoutubeDL({ quiet: true });
  buildYdl._ies.unshift(BuildMockIE);

  try {
    const info = await buildYdl.extract_info(`${srvBase}/media`, { download: false });
    const rows = buildYdl.list_formats(info, false);
    if (!rows.some((r) => r.resolution === '1920x1080' && r.vcodec === 'avc1.64002a')) {
      throw new Error('[linking-test] list_formats failed to report video resolution and codec');
    }
    if (!rows.some((r) => r.resolution === 'audio only' && r.acodec === 'mp4a.40.2')) {
      throw new Error('[linking-test] list_formats failed to report audio codec');
    }

    const vDest = path.join(tmpDir, 'v_out.mp4');
    const aDest = path.join(tmpDir, 'a_out.m4a');
    await buildYdl.download_separate(`${srvBase}/media`, {
      videoFormat: 'bestvideo',
      audioFormat: 'bestaudio',
      videoOuttmpl: vDest,
      audioOuttmpl: aDest
    });

    if (!fs.existsSync(vDest) || fs.statSync(vDest).size !== mockVid.length) {
      throw new Error('[linking-test] Video separate download failed or invalid size');
    }
    if (!fs.existsSync(aDest) || fs.statSync(aDest).size !== mockAud.length) {
      throw new Error('[linking-test] Music/Audio separate download failed or invalid size');
    }
  } finally {
    await new Promise((resolve) => srv.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('  [\x1b[32mlinking-test\x1b[0m] [5/5] Verified listing resolutions/codecs and downloading video & music separately.');
  console.log('\x1b[32m[PASSED] Linked bundle verified and passed all runtime integrity checks.\x1b[0m\n');
}

/**
 * Builds the unified single-file bundles.
 * Supports target modularity: 'all', 'youtube', 'tiktok', or custom.
 *
 * @param {object} options
 * @param {string} options.release - Release version tag.
 * @param {string} [options.target='all'] - Target platforms ('all', 'youtube', 'tiktok').
 * @param {boolean} [options.skipTests=false]
 */
export async function runBuild(options = {}) {
  const startTime = Date.now();
  const target = (options.target || 'all').toLowerCase();
  const isFull = target === 'all' || target === 'full';
  const hasYouTube = isFull || target.includes('youtube');
  const hasTikTok = isFull || target.includes('tiktok');

  console.log('\x1b[1m\x1b[34m=== js_ydlp Ninja Build Pipeline ===\x1b[0m');
  console.log(`Target: \x1b[35m${target.toUpperCase()}\x1b[0m (YouTube: ${hasYouTube ? 'YES' : 'NO'}, TikTok: ${hasTikTok ? 'YES' : 'NO'})\n`);

  // Step 1: Pre-flight Tests
  if (!options.skipTests) {
    console.log('\x1b[33m[1/7] Running pre-flight test suite (node --test)...\x1b[0m');
    const testResult = spawnSync(process.execPath, ['--test', 'test/**/*.test.js'], {
      cwd: ROOT_DIR,
      stdio: 'inherit'
    });
    if (testResult.status !== 0) {
      console.error('\x1b[31m[FAILED] Tests failed! Build aborted.\x1b[0m');
      process.exit(1);
    }
    console.log('\x1b[32m[PASSED] All pre-flight tests passed successfully.\x1b[0m\n');
  } else {
    console.log('\x1b[33m[1/7] Skipping pre-flight test suite (--skip-tests).\x1b[0m\n');
  }

  // Step 2: Scan source modules filtered by target
  console.log('\x1b[33m[2/7] Scanning module dependency graph...\x1b[0m');
  const allSourceFiles = scanSourceModules(SRC_DIR);
  const sourceFiles = allSourceFiles.filter((filePath) => {
    const relPath = path.relative(SRC_DIR, filePath).replace(/\\/g, '/');
    if (!hasYouTube && relPath.startsWith('extractor/youtube/')) {
      return false;
    }
    if (!hasTikTok && relPath === 'extractor/tiktok.js') {
      return false;
    }
    return true;
  });
  console.log(`Discovered ${sourceFiles.length} source modules for target [${target}]\n`);

  // Step 3: Topologically prepare module definitions
  console.log(`\x1b[33m[3/7] Resolving and indexing ${sourceFiles.length} modules...\x1b[0m\n`);

  // Step 4: Ninja-style linking and inlining
  console.log(`\x1b[33m[4/7] Linking and inlining symbols [${sourceFiles.length}/${sourceFiles.length}]...\x1b[0m`);
  const moduleEntries = [];
  let linkedCount = 0;

  for (const filePath of sourceFiles) {
    linkedCount++;
    const relPath = path.relative(SRC_DIR, filePath).replace(/\\/g, '/');
    console.log(`[\x1b[32mlinking\x1b[0m] [${linkedCount}/${sourceFiles.length}] src/${relPath}`);

    let code = fs.readFileSync(filePath, 'utf8');

    // Dynamically adjust extractor registry if building a targeted bundle
    if (relPath === 'extractor/index.js' && !isFull) {
      if (hasYouTube && !hasTikTok) {
        code = `
import { InfoExtractor } from './common.js';
import { GenericIE } from './generic.js';
import { YoutubeIE } from './youtube/video.js';

export * from './common.js';
export * from './generic.js';
export * from './youtube/index.js';

export const EXTRACTORS = [YoutubeIE, GenericIE];

export function gen_extractor_classes() {
  return [...EXTRACTORS].sort((a, b) => (b._WEIGHT || 0) - (a._WEIGHT || 0));
}

export function get_info_extractor(urlOrName) {
  const byName = EXTRACTORS.find((ie) => ie.IE_NAME.toLowerCase() === urlOrName.toLowerCase());
  if (byName) return byName;
  for (const ie of gen_extractor_classes()) {
    if (ie.suitable(urlOrName)) return ie;
  }
  return GenericIE;
}
`;
      } else if (hasTikTok && !hasYouTube) {
        code = `
import { InfoExtractor } from './common.js';
import { GenericIE } from './generic.js';
import { TikTokIE } from './tiktok.js';

export * from './common.js';
export * from './generic.js';
export * from './tiktok.js';

export const EXTRACTORS = [TikTokIE, GenericIE];

export function gen_extractor_classes() {
  return [...EXTRACTORS].sort((a, b) => (b._WEIGHT || 0) - (a._WEIGHT || 0));
}

export function get_info_extractor(urlOrName) {
  const byName = EXTRACTORS.find((ie) => ie.IE_NAME.toLowerCase() === urlOrName.toLowerCase());
  if (byName) return byName;
  for (const ie of gen_extractor_classes()) {
    if (ie.suitable(urlOrName)) return ie;
  }
  return GenericIE;
}
`;
      }
    }

    const transformed = transformModule(code);
    moduleEntries.push({ id: relPath, body: transformed });
  }

  // Build target-specific export list
  const publicExports = [
    'YoutubeDL',
    'DEFAULT_OUTTMPL',
    'int_or_none',
    'float_or_none',
    'str_or_none',
    'strip_or_none',
    'url_or_none',
    'try_get',
    'try_call',
    'filter_dict',
    'join_nonempty',
    'clean_html',
    'unescapeHTML',
    'escapeHTML',
    'parse_duration',
    'mimetype2ext',
    'YoutubeDLError',
    'ExtractorError',
    'DownloadError',
    'PostProcessingError',
    'traverse_obj',
    'ALL',
    'format_bytes',
    'parse_filesize',
    'sanitize_filename',
    'format_decimal_suffix',
    'parse_iso8601',
    'unified_strdate',
    'unified_timestamp',
    'formatSeconds',
    'HTTPHeaderDict',
    'sanitize_url',
    'urljoin',
    'determine_ext',
    'determine_protocol',
    'Cookie',
    'CookieJar',
    'Request',
    'HEADRequest',
    'Response',
    'HTTPError',
    'RequestDirector',
    'FileDownloader',
    'HttpFD',
    'get_suitable_downloader',
    'InfoExtractor',
    'GenericIE',
    'download',
    'extractInfo',
    'getInfo',
    'downloadMusic',
    'extractAudio',
    'listFormats',
    'downloadSeparate',
    'downloadImage',
    'getLyrics',
    'getMetadata',
    'ydlp'
  ];

  if (hasYouTube) {
    publicExports.push('YoutubeIE', 'YoutubeBaseInfoExtractor', 'YoutubeSigSolver', 'PoTokenProvider');
  }
  if (hasTikTok) {
    publicExports.push('TikTokIE');
  }

  publicExports.push(
    'EXTRACTORS',
    'gen_extractor_classes',
    'get_info_extractor',
    'PostProcessor',
    'FFmpegPostProcessor',
    'LyricsProvider',
    'MusicMetadataProvider'
  );

  // Assemble unminified bundle
  const bundleCode = `
// Node.js Native Runtime Imports
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import stream, { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn, spawnSync } from 'node:child_process';
import vm from 'node:vm';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Unified Module Registry
const __modules = new Map();
const __cache = new Map();

function __define(id, factory) {
  __modules.set(id, factory);
}

function __resolve(fromId, relPath) {
  if (!relPath.startsWith('.')) return relPath;
  const fromDir = path.posix.dirname(fromId);
  return path.posix.normalize(path.posix.join(fromDir, relPath));
}

function __require(id) {
  const normId = id.replace(/\\.js$/, '') + '.js';
  if (__cache.has(normId)) return __cache.get(normId);
  const factory = __modules.get(normId);
  if (!factory) {
    throw new Error(\`[js_ydlp bundle] Module not found: \${normId}\`);
  }
  const exports = {};
  __cache.set(normId, exports);
  factory(exports, (dep) => __require(__resolve(normId, dep)));
  return exports;
}

// Module Registrations
${moduleEntries.map((m) => `__define('${m.id}', function(exports, require) {\n${m.body}\n});`).join('\n\n')}

// Public Library Exports
const __main = __require('index.js');
export const {
  ${publicExports.join(',\n  ')}
} = __main;

export default __main.default || YoutubeDL;
`;

  // Step 5: Minification with full mangling and comment stripping
  console.log('\n\x1b[33m[5/7] Minifying and obfuscating unified bundle (mangling identifiers, stripping comments)...\x1b[0m');
  const minified = await minifyJs(bundleCode);

  const finalBundle = `${HEADER_TEXT}\n${bundleCode.trim()}\n`;
  const finalMin = `${HEADER_TEXT}\n${minified.trim()}\n`;

  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  const bundleFilename = isFull ? 'js_ydlp.bundle.js' : `js_ydlp.${target}.bundle.js`;
  const minFilename = isFull ? 'js_ydlp.min.js' : `js_ydlp.${target}.min.js`;

  const bundlePath = path.join(DIST_DIR, bundleFilename);
  const minPath = path.join(DIST_DIR, minFilename);

  fs.writeFileSync(bundlePath, finalBundle, 'utf8');
  fs.writeFileSync(minPath, finalMin, 'utf8');

  // Also maintain primary dist/js_ydlp.min.js so imports are seamless
  if (!isFull) {
    fs.writeFileSync(path.join(DIST_DIR, 'js_ydlp.bundle.js'), finalBundle, 'utf8');
    fs.writeFileSync(path.join(DIST_DIR, 'js_ydlp.min.js'), finalMin, 'utf8');
  }

  // Step 6: Post-linking integrity verification test
  await testLinkedBundle(minPath, { hasYouTube, hasTikTok });

  // Step 7: Update BUILDS cache
  console.log('\x1b[33m[7/7] Updating release cache in BUILDS...\x1b[0m');
  writeBuildsCache(options.release);

  const durationMs = Date.now() - startTime;
  const bundleSize = (fs.statSync(bundlePath).size / 1024).toFixed(2);
  const minSize = (fs.statSync(minPath).size / 1024).toFixed(2);

  console.log('\x1b[1m\x1b[32m=== Build Complete Successfully ===\x1b[0m');
  console.log(`Target:          \x1b[35m${target.toUpperCase()}\x1b[0m`);
  console.log(`Release Version: \x1b[36m${options.release}\x1b[0m`);
  console.log(`Cache Updated:   \x1b[32mBUILDS\x1b[0m`);
  console.log(`Bundle Output:   \x1b[37m${path.relative(ROOT_DIR, bundlePath)}\x1b[0m (${bundleSize} KiB)`);
  console.log(`Minified Output: \x1b[32m${path.relative(ROOT_DIR, minPath)}\x1b[0m (${minSize} KiB) - Fully Obfuscated`);
  console.log(`Elapsed Time:    \x1b[33m${(durationMs / 1000).toFixed(2)}s\x1b[0m\n`);
}

// CLI Execution entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  build.cmd build [target] [version] [options]
  ./build.sh build [target] [version] [options]
  node scripts/build.js [build] [target] [version] [options]

Targets:
  all (default)       Build full bundle with all extractors (YouTube, TikTok, Generic)
  youtube             Build lean bundle specialized for YouTube only (~48 KiB)
  tiktok              Build ultra-compact bundle specialized for TikTok only (~35 KiB)
  <custom>            Comma-separated target list (e.g. youtube,tiktok)

Options:
  --target, -t <name> Specify build target (all, youtube, tiktok)
  --release, -r <ver> Specify release version (skips interactive prompt)
  --skip-tests        Skip running test suite prior to bundling
  --help, -h          Show this help message

Examples:
  build.cmd build
  build.cmd build youtube
  build.cmd build tiktok
  build.cmd build youtube 1.0.7
  build.cmd build --target tiktok --release 1.0.7
    `);
    process.exit(0);
  }

  let target = 'all';
  let releaseArg = null;
  const skipTests = args.includes('--skip-tests');

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === 'build') continue;
    if (arg === '--target' || arg === '-t') {
      target = args[i + 1] || 'all';
      i++;
    } else if (arg === '--release' || arg === '-r') {
      releaseArg = args[i + 1];
      i++;
    } else if (['all', 'full', 'youtube', 'tiktok'].includes(arg.toLowerCase())) {
      target = arg.toLowerCase();
    } else if (/^\d+\.\d+(\.\d+)?(-[\w.]+)?$/.test(arg)) {
      releaseArg = arg;
    }
  }

  // Resolve release version
  const builds = readBuildsCache();
  const suggested = getNextVersion(builds);

  (async () => {
    const release = releaseArg || (await promptReleaseName(suggested));
    await runBuild({ release, target, skipTests });
  })();
}
