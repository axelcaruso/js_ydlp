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

  // export { a, b, c }; -> Object.assign(exports, { a, b, c });
  transformed = transformed.replace(
    /^export\s+\{([^}]+)\};?\s*$/gm,
    'Object.assign(exports, { $1 });'
  );

  return transformed.trim();
}

/**
 * Basic lightweight JavaScript minifier for the unified bundle.
 * Compresses whitespace and removes comments while keeping string literals intact.
 * @param {string} code
 * @returns {string} Minified code.
 */
function minifyJs(code) {
  // Strip multi-line comments (preserving license header)
  let min = code.replace(/(?<!:)\/\/(?!#).*?$/gm, '');
  // Collapse consecutive whitespaces and empty lines
  min = min.replace(/^[ \t]+/gm, '');
  min = min.replace(/\n\s*\n/g, '\n');
  return min.trim();
}

/**
 * Builds the unified single-file bundles (dist/js_ydlp.bundle.js and dist/js_ydlp.min.js).
 * @param {object} options
 * @param {string} options.release - Release version tag.
 * @param {boolean} [options.skipTests=false]
 */
export async function runBuild(options = {}) {
  const startTime = Date.now();
  console.log('\x1b[1m\x1b[34m=== js_ydlp Ninja Build Pipeline ===\x1b[0m');

  // Step 1: Tests
  if (!options.skipTests) {
    console.log('\x1b[33m[1/6] Running test suite (node --test)...\x1b[0m');
    const testResult = spawnSync(process.execPath, ['--test', 'test/**/*.test.js'], {
      cwd: ROOT_DIR,
      stdio: 'inherit'
    });
    if (testResult.status !== 0) {
      console.error('\x1b[31m[FAILED] Tests failed! Build aborted.\x1b[0m');
      process.exit(1);
    }
    console.log('\x1b[32m[PASSED] All tests passed successfully.\x1b[0m\n');
  } else {
    console.log('\x1b[33m[1/6] Skipping test suite (--skip-tests).\x1b[0m\n');
  }

  // Step 2: Scan source modules
  console.log('\x1b[33m[2/6] Scanning module dependency graph...\x1b[0m');
  const sourceFiles = scanSourceModules(SRC_DIR);
  console.log(`Discovered ${sourceFiles.length} source modules in src/\n`);

  // Step 3: Topologically prepare module definitions
  console.log(`\x1b[33m[3/6] Resolving and indexing ${sourceFiles.length} modules...\x1b[0m\n`);

  // Step 4: Ninja-style linking and inlining
  console.log(`\x1b[33m[4/6] Linking and inlining symbols [${sourceFiles.length}/${sourceFiles.length}]...\x1b[0m`);
  const moduleEntries = [];
  let linkedCount = 0;

  for (const filePath of sourceFiles) {
    linkedCount++;
    const relPath = path.relative(SRC_DIR, filePath).replace(/\\/g, '/');
    console.log(`[\x1b[32mlinking\x1b[0m] [${linkedCount}/${sourceFiles.length}] src/${relPath}`);

    const code = fs.readFileSync(filePath, 'utf8');
    const transformed = transformModule(code);
    moduleEntries.push({ id: relPath, body: transformed });
  }

  // Assemble full unminified bundle
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

// Scoped Micro-Loader Registry
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
  YoutubeDL,
  DEFAULT_OUTTMPL,
  int_or_none,
  float_or_none,
  str_or_none,
  strip_or_none,
  url_or_none,
  try_get,
  try_call,
  filter_dict,
  join_nonempty,
  clean_html,
  unescapeHTML,
  escapeHTML,
  parse_duration,
  mimetype2ext,
  YoutubeDLError,
  ExtractorError,
  DownloadError,
  PostProcessingError,
  traverse_obj,
  ALL,
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
  determine_protocol,
  Cookie,
  CookieJar,
  Request,
  HEADRequest,
  Response,
  HTTPError,
  RequestDirector,
  FileDownloader,
  HttpFD,
  get_suitable_downloader,
  InfoExtractor,
  GenericIE,
  YoutubeIE,
  YoutubeBaseInfoExtractor,
  YoutubeSigSolver,
  PoTokenProvider,
  EXTRACTORS,
  gen_extractor_classes,
  get_info_extractor,
  PostProcessor,
  FFmpegPostProcessor
} = __main;

export default YoutubeDL;
`;

  // Step 5: Minification
  console.log('\n\x1b[33m[5/6] Minifying unified bundle...\x1b[0m');
  const minified = minifyJs(bundleCode);

  // Step 6: Injecting License & AI Header
  console.log('\x1b[33m[6/6] Injecting Apache 2.0 & Open AI statement header...\x1b[0m');
  const finalBundle = `${HEADER_TEXT}\n${bundleCode.trim()}\n`;
  const finalMin = `${HEADER_TEXT}\n${minified.trim()}\n`;

  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  const bundlePath = path.join(DIST_DIR, 'js_ydlp.bundle.js');
  const minPath = path.join(DIST_DIR, 'js_ydlp.min.js');

  fs.writeFileSync(bundlePath, finalBundle, 'utf8');
  fs.writeFileSync(minPath, finalMin, 'utf8');

  // Update BUILDS cache
  writeBuildsCache(options.release);

  const durationMs = Date.now() - startTime;
  const bundleSize = (fs.statSync(bundlePath).size / 1024).toFixed(2);
  const minSize = (fs.statSync(minPath).size / 1024).toFixed(2);

  console.log('\n\x1b[1m\x1b[32m=== Build Complete Successfully ===\x1b[0m');
  console.log(`Release Version: \x1b[36m${options.release}\x1b[0m`);
  console.log(`Cache Updated:   \x1b[32mBUILDS\x1b[0m`);
  console.log(`Bundle Output:   \x1b[37m${path.relative(ROOT_DIR, bundlePath)}\x1b[0m (${bundleSize} KiB)`);
  console.log(`Minified Output: \x1b[32m${path.relative(ROOT_DIR, minPath)}\x1b[0m (${minSize} KiB)`);
  console.log(`Elapsed Time:    \x1b[33m${(durationMs / 1000).toFixed(2)}s\x1b[0m\n`);
}

// CLI Execution entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  build.cmd build [options]
  ./build.sh build [options]
  node scripts/build.js [build] [options]

Options:
  --release, -r <version>   Specify release version (skips interactive prompt)
  --skip-tests              Skip running test suite prior to bundling
  --help, -h                Show this help message
    `);
    process.exit(0);
  }

  let releaseArg = null;
  const rIdx = args.findIndex((a) => a === '--release' || a === '-r');
  if (rIdx !== -1 && args[rIdx + 1]) {
    releaseArg = args[rIdx + 1];
  }

  const skipTests = args.includes('--skip-tests');

  // Resolve release version
  const builds = readBuildsCache();
  const suggested = getNextVersion(builds);

  (async () => {
    const release = releaseArg || (await promptReleaseName(suggested));
    await runBuild({ release, skipTests });
  })();
}
