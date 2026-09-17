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

import { NO_DEFAULT } from './common.js';

/**
 * Wildcard sentinel for traversing all elements in an object or array.
 * Equivalent to Python's Ellipsis (...) in traverse_obj.
 */
export const ALL = Symbol('ALL');

/**
 * Checks if a value is consider empty/unhelpful in traversal.
 * @param {any} val
 * @returns {boolean}
 */
function isDiscardable(val) {
  return val === null || val === undefined;
}

/**
 * Matches a value against an expected type guard or constructor.
 * @param {any} val - Value to check.
 * @param {any} type - Expected type (e.g. String, Number, Array, Object, Function).
 * @returns {boolean}
 */
function matchesType(val, type) {
  if (!type) return true;
  if (type === String) return typeof val === 'string';
  if (type === Number) return typeof val === 'number' && !Number.isNaN(val);
  if (type === Boolean) return typeof val === 'boolean';
  if (type === Array) return Array.isArray(val);
  if (type === Function) return typeof val === 'function';
  if (type === Object) return val !== null && typeof val === 'object' && !Array.isArray(val);
  if (typeof type === 'function') {
    return val instanceof type || (val && val.constructor === type);
  }
  return false;
}

/**
 * Safely traverses nested objects, arrays, and maps using declarative paths.
 * 1:1 Vanilla JS implementation of yt-dlp's traverse_obj.
 *
 * @param {any} obj - Root object to traverse.
 * @param {...any} paths - One or more paths or branch arrays.
 * @returns {any} Traversed value or default.
 *
 * Path keys support:
 *  - string | number: object property or array index lookup.
 *  - ALL: branches out across all values/elements.
 *  - function: filter predicate `(val, key) => boolean` or transform function.
 *  - Set: type assertion `{ String }` or `{ Number }` or transform function.
 *  - Array: branch exploration where multiple paths are evaluated.
 */
export function traverse_obj(obj, ...paths) {
  if (isDiscardable(obj)) {
    return null;
  }

  // Parse trailing options if passed as last object with known options keys
  let defaultVal = null;
  let expectedType = null;
  let getAll = true;
  let casesense = true;

  // Check if last argument contains options
  let effectivePaths = paths;
  if (paths.length > 1 && paths[paths.length - 1] && typeof paths[paths.length - 1] === 'object' && !Array.isArray(paths[paths.length - 1]) && !(paths[paths.length - 1] instanceof Set)) {
    const candidate = paths[paths.length - 1];
    if ('default' in candidate || 'expected_type' in candidate || 'get_all' in candidate || 'casesense' in candidate) {
      defaultVal = candidate.default !== undefined ? candidate.default : null;
      expectedType = candidate.expected_type || null;
      getAll = candidate.get_all !== undefined ? candidate.get_all : true;
      casesense = candidate.casesense !== undefined ? candidate.casesense : true;
      effectivePaths = paths.slice(0, -1);
    }
  }

  if (effectivePaths.length === 0) {
    return matchesType(obj, expectedType) ? obj : defaultVal;
  }

  /**
   * Internal recursive walker.
   * @param {any} current - Current object state.
   * @param {any[]} steps - Remaining steps in the path.
   * @returns {any}
   */
  function evaluateStep(current, steps) {
    if (steps.length === 0) {
      if (isDiscardable(current)) return null;
      if (expectedType && !matchesType(current, expectedType)) return null;
      return current;
    }

    if (isDiscardable(current)) {
      return null;
    }

    const [head, ...rest] = steps;

    // 1. Wildcard ALL: expand all items/values
    if (head === ALL || head === '...') {
      let values = [];
      if (Array.isArray(current)) {
        values = current;
      } else if (current instanceof Map) {
        values = Array.from(current.values());
      } else if (typeof current === 'object') {
        values = Object.values(current);
      } else {
        return null;
      }

      const results = [];
      for (const val of values) {
        const sub = evaluateStep(val, rest);
        if (!isDiscardable(sub)) {
          if (Array.isArray(sub) && rest.includes(ALL)) {
            results.push(...sub);
          } else {
            results.push(sub);
          }
        }
      }
      return results.length > 0 ? (getAll ? results : results[0]) : null;
    }

    // 2. Branching array: try alternative paths
    if (Array.isArray(head)) {
      const branchResults = [];
      for (const branch of head) {
        const branchSteps = Array.isArray(branch) ? [...branch, ...rest] : [branch, ...rest];
        const res = evaluateStep(current, branchSteps);
        if (!isDiscardable(res)) {
          if (!getAll) {
            return res;
          }
          branchResults.push(res);
        }
      }
      if (branchResults.length === 0) return null;
      // If evaluating alternative keys at a leaf level and only 1 matched
      return branchResults.length === 1 && rest.length === 0 ? branchResults[0] : branchResults;
    }

    // 3. Set: Type checking or transformation function
    if (head instanceof Set) {
      let val = current;
      for (const item of head) {
        if (typeof item === 'function') {
          try {
            if (item === String || item === Number || item === Boolean || item === Array || item === Object) {
              if (!matchesType(val, item)) return null;
            } else {
              val = item(val);
            }
          } catch {
            return null;
          }
        }
      }
      return evaluateStep(val, rest);
    }

    // 4. Function: filter or transform
    if (typeof head === 'function') {
      if (Array.isArray(current)) {
        const filtered = current.filter((item, idx) => {
          try {
            return Boolean(head(item, idx));
          } catch {
            return false;
          }
        });
        return evaluateStep(filtered, rest);
      } else {
        try {
          const res = head(current);
          return evaluateStep(res, rest);
        } catch {
          return null;
        }
      }
    }

    // 5. Primitive key: string or number lookup
    if (typeof head === 'string' || typeof head === 'number') {
      let nextVal = undefined;
      if (Array.isArray(current) && typeof head === 'number') {
        const idx = head < 0 ? current.length + head : head;
        nextVal = current[idx];
      } else if (current instanceof Map) {
        nextVal = current.get(head);
      } else if (typeof current === 'object') {
        if (casesense || !(head in current)) {
          nextVal = current[head];
        } else {
          // Case-insensitive lookup if requested
          const lower = String(head).toLowerCase();
          for (const key of Object.keys(current)) {
            if (key.toLowerCase() === lower) {
              nextVal = current[key];
              break;
            }
          }
        }
      }

      return evaluateStep(nextVal, rest);
    }

    return null;
  }

  // Iterate over candidate paths until the first one resolves successfully
  for (const path of effectivePaths) {
    const steps = Array.isArray(path) ? path : [path];
    const result = evaluateStep(obj, steps);
    if (!isDiscardable(result)) {
      return result;
    }
  }

  return defaultVal;
}

traverse_obj.ALL = ALL;
