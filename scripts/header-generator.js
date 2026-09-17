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
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const HEADER_TEXT = `/**
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
`;

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'temp',
  'downloads',
  'yt-dlp-master',
  'coverage'
]);

const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

/**
 * Recursively find all JavaScript files in the project.
 * @param {string} dir - Directory to search.
 * @returns {string[]} Array of absolute file paths.
 */
export function findJsFiles(dir = ROOT_DIR) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsFiles(fullPath));
    } else if (entry.isFile() && JS_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Checks whether file content has the expected Apache 2.0 and AI statement header.
 * @param {string} content - File content.
 * @returns {boolean} True if header is present.
 */
export function hasHeader(content) {
  return content.includes('Licensed under the Apache License, Version 2.0') &&
         content.includes('OPEN AI STATEMENT');
}

/**
 * Applies the license header to a file's content, preserving shebangs if present.
 * @param {string} content - Existing file content.
 * @returns {string} Updated content with header.
 */
export function applyHeaderToContent(content) {
  if (hasHeader(content)) {
    return content;
  }

  // Preserve shebang if present
  if (content.startsWith('#!')) {
    const newlineIndex = content.indexOf('\n');
    if (newlineIndex !== -1) {
      const shebang = content.slice(0, newlineIndex + 1);
      const rest = content.slice(newlineIndex + 1);
      return `${shebang}${HEADER_TEXT}\n${rest.trimStart()}`;
    }
  }

  return `${HEADER_TEXT}\n${content.trimStart()}`;
}

/**
 * Main runner function for CLI.
 * @param {object} options
 * @param {boolean} options.apply - If true, writes changes to files.
 * @param {boolean} options.check - If true, fails if any file lacks the header.
 */
export function runHeaderGenerator(options = { check: false, apply: false }) {
  const files = findJsFiles();
  let missing = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!hasHeader(content)) {
      missing.push(filePath);
      if (options.apply) {
        const updated = applyHeaderToContent(content);
        fs.writeFileSync(filePath, updated, 'utf8');
        console.log(`[Applied Header] ${path.relative(ROOT_DIR, filePath)}`);
      }
    }
  }

  if (options.apply) {
    console.log(`Successfully updated ${missing.length} file(s).`);
    return 0;
  }

  if (options.check) {
    if (missing.length > 0) {
      console.error(`Header check failed! The following ${missing.length} file(s) are missing license/AI headers:`);
      for (const f of missing) {
        console.error(`  - ${path.relative(ROOT_DIR, f)}`);
      }
      return 1;
    } else {
      console.log(`All ${files.length} JavaScript file(s) have valid Apache 2.0 and AI statement headers.`);
      return 0;
    }
  }

  return 0;
}

// Direct execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isCheck = process.argv.includes('--check');
  const isApply = process.argv.includes('--apply');

  if (!isCheck && !isApply) {
    console.log('Usage: node scripts/header-generator.js [--check | --apply]');
    process.exit(0);
  }

  const exitCode = runHeaderGenerator({ check: isCheck, apply: isApply });
  process.exit(exitCode);
}
