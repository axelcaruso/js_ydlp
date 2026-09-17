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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { CookieJar, Cookie, Request, Response, RequestDirector } from '../src/networking/index.js';

test('CookieJar domain matching and header generation', () => {
  const jar = new CookieJar();
  jar.setCookie(
    new Cookie({
      name: 'session_id',
      value: 'xyz123',
      domain: '.youtube.com',
      path: '/'
    })
  );

  // Matching subdomain
  assert.equal(jar.getCookieHeader('https://www.youtube.com/watch?v=123'), 'session_id=xyz123');
  // Matching root domain
  assert.equal(jar.getCookieHeader('https://youtube.com/'), 'session_id=xyz123');
  // Non-matching domain
  assert.equal(jar.getCookieHeader('https://google.com/'), '');
});

test('CookieJar Netscape format export and parse', () => {
  const jar = new CookieJar();
  jar.setCookie(
    new Cookie({
      name: 'SID',
      value: 'secret',
      domain: '.google.com',
      path: '/',
      secure: true,
      expires: 2000000000
    })
  );

  const exported = jar.exportNetscape();
  assert.ok(exported.includes('.google.com\tTRUE\t/\tTRUE\t2000000000\tSID\tsecret'));
});

test('RequestDirector HTTP communication with local test server', async () => {
  // Start temporary local HTTP server
  const server = http.createServer((req, res) => {
    if (req.url === '/info') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'auth=token999; Path=/'
      });
      res.end(JSON.stringify({ title: 'Test Video', duration: 120 }));
      return;
    }

    if (req.url === '/check-cookie') {
      const cookieHeader = req.headers['cookie'] || '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ receivedCookie: cookieHeader }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const director = new RequestDirector();
    const infoRes = await director.send(`${baseUrl}/info`);
    assert.equal(infoRes.status, 200);

    const json = await infoRes.json();
    assert.equal(json.title, 'Test Video');
    assert.equal(json.duration, 120);

    // Second request should have received and sent cookie
    const cookieRes = await director.send(`${baseUrl}/check-cookie`);
    const cookieJson = await cookieRes.json();
    assert.equal(cookieJson.receivedCookie, 'auth=token999');
  } finally {
    server.close();
  }
});
