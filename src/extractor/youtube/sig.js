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

import vm from 'node:vm';

/**
 * High-performance JavaScript signature decipherer and challenge solver for YouTube.
 * Executes natively in V8 without requiring external runtimes.
 */
export class YoutubeSigSolver {
  constructor() {
    /** @type {Map<string, Array<{ action: string, arg?: number }>>} */
    this._playerDecipherCache = new Map();
  }

  /**
   * Applies an array of decipher transformations to an encrypted signature.
   *
   * @param {string} signature - Encrypted signature string.
   * @param {Array<{ action: 'reverse'|'splice'|'swap', arg?: number }>} operations
   * @returns {string} Deciphered signature.
   */
  decipher(signature, operations) {
    if (!signature || !operations || operations.length === 0) {
      return signature;
    }
    const arr = signature.split('');

    for (const op of operations) {
      switch (op.action) {
        case 'reverse':
          arr.reverse();
          break;
        case 'splice':
          arr.splice(0, op.arg || 0);
          break;
        case 'swap': {
          const idx = (op.arg || 0) % arr.length;
          const temp = arr[0];
          arr[0] = arr[idx];
          arr[idx] = temp;
          break;
        }
      }
    }

    return arr.join('');
  }

  /**
   * Extracts decipher operations from YouTube base.js player code.
   *
   * @param {string} playerJs - Full JavaScript content of player.
   * @returns {Array<{ action: 'reverse'|'splice'|'swap', arg?: number }>}
   */
  extractOperations(playerJs) {
    if (this._playerDecipherCache.has(playerJs)) {
      return this._playerDecipherCache.get(playerJs);
    }

    // Match the main decipher function
    const funcMatch = playerJs.match(
      /(?:function\s+[\w$]+\s*\((?<p1>\w+)\)|[\w$]+\s*=\s*function\s*\((?<p2>\w+)\))\s*\{\s*(?:\k<p1>|\k<p2>)\s*=\s*(?:\k<p1>|\k<p2>)\.split\(["']{2}\);\s*(?<ops>[\s\S]+?)\s*return\s+(?:\k<p1>|\k<p2>)\.join\(["']{2}\);?\s*\}/
    );

    if (!funcMatch || !funcMatch.groups || !funcMatch.groups.ops) {
      return [];
    }

    const opsBody = funcMatch.groups.ops;
    const statements = opsBody.split(';').map((s) => s.trim()).filter(Boolean);

    // Identify helper object name, e.g. "Q4" in "Q4.Xa(a, 3)"
    let helperObjName = null;
    const helperMatch = opsBody.match(/([a-zA-Z0-9_$]+)\.[a-zA-Z0-9_$]+\(/);
    if (helperMatch) {
      helperObjName = helperMatch[1];
    }

    if (!helperObjName) {
      return [];
    }

    // Extract helper object definition
    const helperObjPattern = new RegExp(
      `var\\s+${helperObjName.replace('$', '\\$')}\\s*=\\s*\\{([\\s\\S]*?)\\};`,
      'm'
    );
    const helperObjMatch = playerJs.match(helperObjPattern);
    if (!helperObjMatch) {
      return [];
    }

    const helperBody = helperObjMatch[1];
    // Map methods inside helper to 'reverse', 'splice', or 'swap'
    const methodActions = new Map();
    const methodEntries = helperBody.split(/\},\s*/);

    for (const entry of methodEntries) {
      const nameMatch = entry.match(/([a-zA-Z0-9_$]+)\s*:\s*function/);
      if (!nameMatch) continue;
      const methodName = nameMatch[1];

      if (entry.includes('.reverse()')) {
        methodActions.set(methodName, 'reverse');
      } else if (entry.includes('.splice(')) {
        methodActions.set(methodName, 'splice');
      } else if (entry.includes('%') || (entry.includes('[0]') && entry.includes('var c'))) {
        methodActions.set(methodName, 'swap');
      }
    }

    const operations = [];
    for (const stmt of statements) {
      const callMatch = stmt.match(new RegExp(`${helperObjName.replace('$', '\\$')}\\.([a-zA-Z0-9_$]+)\\([^,]+(?:,\\s*(\\d+))?\\)`));
      if (callMatch) {
        const fnName = callMatch[1];
        const arg = callMatch[2] ? parseInt(callMatch[2], 10) : undefined;
        const action = methodActions.get(fnName);
        if (action) {
          operations.push({ action, arg });
        }
      }
    }

    this._playerDecipherCache.set(playerJs, operations);
    return operations;
  }

  /**
   * Solves the YouTube throttling n-challenge.
   * Executes the extracted transformation using an isolated Node vm context.
   *
   * @param {string} nToken - Throttled n parameter.
   * @param {string} playerJs - Full JavaScript content of player.
   * @returns {string} Solved n token.
   */
  solveNChallenge(nToken, playerJs) {
    if (!nToken || !playerJs) {
      return nToken;
    }

    try {
      // Find n-transform function entry
      const nFuncMatch = playerJs.match(
        /function\s+([a-zA-Z0-9_$]+)\s*\(\s*([a-zA-Z0-9_$]+)\s*\)\s*\{[\s\S]*?Enhanced[\s\S]*?\}/
      );
      if (nFuncMatch) {
        const sandbox = { n: nToken, result: null };
        const script = `${nFuncMatch[0]}; result = ${nFuncMatch[1]}(n);`;
        vm.runInNewContext(script, sandbox, { timeout: 1000 });
        if (sandbox.result && typeof sandbox.result === 'string') {
          return sandbox.result;
        }
      }
    } catch {
      // Return original nToken if solver fails
    }

    return nToken;
  }
}
