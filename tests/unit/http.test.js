import { describe, expect, it } from 'vitest';
import {
  HttpParseError,
  absoluteUrl,
  parseExchange,
  queryParams,
  shellWords,
  toRawHttp,
} from '../../src/components/http/message.js';
import {
  MASK,
  hasSecrets,
  maskBody,
  maskExchange,
  maskHeader,
  maskUrl,
} from '../../src/components/http/secrets.js';
import {
  shellQuote,
  toCurl,
  toFetch,
  toHttpie,
  toPython,
} from '../../src/components/http/snippets.js';

const RAW = `POST /api/users?active=true HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer abcdefghijklmnopqrstuvwxyz

{"name": "Ada", "id": 9007199254740993}

HTTP/1.1 201 Created
Content-Type: application/json

{"ok": true}`;

describe('parseExchange: raw HTTP', () => {
  it('reads the request and the response', () => {
    const { request, response, format } = parseExchange(RAW);
    expect(format).toBe('http');
    expect(request).toMatchObject({ method: 'POST', url: '/api/users?active=true' });
    expect(request.headers).toHaveLength(3);
    expect(request.body).toBe('{"name": "Ada", "id": 9007199254740993}');
    expect(response).toMatchObject({ status: 201, statusText: 'Created', body: '{"ok": true}' });
  });

  it('reads a response alone, and fills the reason phrase', () => {
    const { request, response } = parseExchange('HTTP/2 404\ncontent-type: text/plain\n\nnot here');
    expect(request).toBeNull();
    expect(response).toMatchObject({ status: 404, statusText: 'Not Found', body: 'not here' });
  });

  it('accepts a request without headers or version, after .http comments', () => {
    const { request } = parseExchange('### Get a user\n# comment\nget https://x.dev/u/1');
    expect(request).toMatchObject({
      method: 'GET',
      url: 'https://x.dev/u/1',
      headers: [],
      body: '',
    });
  });

  it('keeps a body line that looks like a status line when it is not after a blank line', () => {
    const { request, response } = parseExchange('POST /a\n\nline one\nHTTP/1.1 200 is text\n');
    expect(request.body).toBe('line one\nHTTP/1.1 200 is text');
    expect(response).toBeNull();
  });

  it('rejects text that is not HTTP', () => {
    expect(() => parseExchange('hello world, this is not a request')).toThrow(HttpParseError);
  });

  it('builds absolute URLs from the Host header', () => {
    const { request } = parseExchange(RAW);
    expect(absoluteUrl(request)).toBe('https://api.example.com/api/users?active=true');
    const local = parseExchange('GET /x\nHost: localhost:3000').request;
    expect(absoluteUrl(local)).toBe('http://localhost:3000/x');
    expect(queryParams('/s?q=a+b&x=%C3%A9&flag')).toEqual([
      ['q', 'a b'],
      ['x', 'é'],
      ['flag', ''],
    ]);
  });

  it('round-trips to raw HTTP', () => {
    const exchange = parseExchange(RAW);
    expect(parseExchange(toRawHttp(exchange))).toEqual(exchange);
  });
});

describe('parseExchange: curl', () => {
  it('splits shell words like a shell', () => {
    expect(shellWords(`curl 'a b' "c \\"d\\"" e\\ f $'g\\nh' \\\n  -s`)).toEqual([
      'curl',
      'a b',
      'c "d"',
      'e f',
      'g\nh',
      '-s',
    ]);
    expect(() => shellWords("curl 'open")).toThrow(HttpParseError);
  });

  it('reads method, headers, data and URL', () => {
    const { request, format } = parseExchange(
      `curl -sS -X PATCH 'https://api.example.com/items/7' -H 'Content-Type: application/json' --data-raw '{"done":true}' -o out.json`,
    );
    expect(format).toBe('curl');
    expect(request).toMatchObject({
      method: 'PATCH',
      url: 'https://api.example.com/items/7',
      body: '{"done":true}',
    });
    expect(request.headers).toEqual([['Content-Type', 'application/json']]);
  });

  it('infers POST from data, GET from -G, and reads --json and -u', () => {
    expect(parseExchange('curl https://x.dev -d a=1').request).toMatchObject({
      method: 'POST',
      headers: [['Content-Type', 'application/x-www-form-urlencoded']],
    });
    expect(parseExchange('curl -G https://x.dev/s -d q=1 -d n=2').request).toMatchObject({
      method: 'GET',
      url: 'https://x.dev/s?q=1&n=2',
      body: '',
    });
    const json = parseExchange(`curl --json '{"a":1}' -u ada:secret https://x.dev`).request;
    expect(json.method).toBe('POST');
    expect(json.headers).toContainEqual(['Authorization', `Basic ${btoa('ada:secret')}`]);
    expect(json.headers).toContainEqual(['Content-Type', 'application/json']);
  });

  it('needs a URL', () => {
    expect(() => parseExchange('curl -s')).toThrow(HttpParseError);
  });
});

describe('parseExchange: JSON and HAR', () => {
  it('reads request / response objects with header objects or pairs', () => {
    const { request, response, format } = parseExchange(
      JSON.stringify({
        request: { method: 'put', url: '/x', headers: { Accept: 'text/plain' }, body: { a: 1 } },
        response: { status: 200, headers: [['X-Id', '1']], body: 'ok', time: 12 },
      }),
    );
    expect(format).toBe('json');
    expect(request).toMatchObject({ method: 'PUT', headers: [['Accept', 'text/plain']] });
    expect(request.body).toBe('{\n  "a": 1\n}');
    expect(response).toMatchObject({ status: 200, statusText: 'OK', time: 12 });
  });

  it('reads a HAR file entry', () => {
    const har = {
      log: {
        entries: [
          {
            time: 87.5,
            request: {
              method: 'POST',
              url: 'https://x.dev/api',
              headers: [{ name: 'Accept', value: '*/*' }],
              postData: { mimeType: 'application/json', text: '{"q":1}' },
            },
            response: {
              status: 200,
              statusText: '',
              headers: [],
              content: { mimeType: 'application/json', text: '[]' },
            },
          },
        ],
      },
    };
    const exchange = parseExchange(JSON.stringify(har));
    expect(exchange.format).toBe('har');
    expect(exchange.request.headers).toContainEqual(['Content-Type', 'application/json']);
    expect(exchange.response).toMatchObject({ statusText: 'OK', body: '[]', time: 87.5 });
  });

  it('validates methods and statuses', () => {
    expect(() => parseExchange('{"request": {"method": "G E T", "url": "/"}}')).toThrow();
    expect(() => parseExchange('{"response": {"status": 42}}')).toThrow();
    expect(() => parseExchange('{"nothing": 1}')).toThrow();
  });
});

describe('secrets', () => {
  it('masks authorization schemes, cookies and keys', () => {
    expect(maskHeader('Authorization', 'Bearer abcdefghijklmnopqrstuvwxyz')).toBe(
      `Bearer ${MASK}wxyz`,
    );
    expect(maskHeader('Authorization', 'Basic YTpi')).toBe(`Basic ${MASK}`);
    expect(maskHeader('Cookie', 'session=abc; theme=dark')).toBe(`session=${MASK}; theme=${MASK}`);
    expect(maskHeader('Set-Cookie', 'sid=xyz; Path=/; HttpOnly')).toBe(
      `sid=${MASK}; Path=/; HttpOnly`,
    );
  });

  it('masks query parameters and URL credentials', () => {
    expect(maskUrl('https://ada:pw@x.dev/a?api_key=123&page=2#top')).toBe(
      `https://ada:${MASK}@x.dev/a?api_key=${MASK}&page=2#top`,
    );
    expect(maskUrl('/a?access_token=1&token=2&q=3')).toBe(
      `/a?access_token=${MASK}&token=${MASK}&q=3`,
    );
  });

  it('masks JSON fields at any depth and form fields', () => {
    const json = maskBody('{"user":{"password":"hunter2","name":"Ada"},"n":1}', 'application/json');
    expect(JSON.parse(json)).toEqual({ user: { password: MASK, name: 'Ada' }, n: 1 });
    expect(maskBody('user=ada&password=x', 'application/x-www-form-urlencoded')).toBe(
      `user=ada&password=${MASK}`,
    );
    expect(maskBody('{"keyboard": "qwerty"}', 'application/json')).toBe('{"keyboard": "qwerty"}');
  });

  it('masks a whole exchange and detects secrets', () => {
    const exchange = parseExchange(RAW);
    expect(hasSecrets(exchange)).toBe(true);
    const masked = maskExchange(exchange);
    expect(masked.request.headers[2][1]).toBe(`Bearer ${MASK}wxyz`);
    expect(hasSecrets(parseExchange('GET /a\nAccept: */*'))).toBe(false);
  });
});

describe('snippets', () => {
  const { request } = parseExchange(RAW);

  it('quotes shell values safely', () => {
    expect(shellQuote('simple-value')).toBe('simple-value');
    expect(shellQuote(`it's $(rm -rf /)`)).toBe(`'it'\\''s $(rm -rf /)'`);
  });

  it('writes curl', () => {
    expect(toCurl(request)).toBe(
      [
        `curl 'https://api.example.com/api/users?active=true'`,
        `  -H 'Content-Type: application/json'`,
        `  -H 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz'`,
        `  --data-raw '{"name": "Ada", "id": 9007199254740993}'`,
      ].join(' \\\n'),
    );
    expect(toCurl(parseExchange('DELETE https://x.dev/1').request)).toBe(
      'curl -X DELETE https://x.dev/1',
    );
  });

  it('writes fetch with a JSON object literal and exact numbers', () => {
    const code = toFetch(request, { responseType: 'json' });
    expect(code).toContain('method: "POST"');
    expect(code).toContain(
      'body: JSON.stringify({\n    name: "Ada",\n    id: 9007199254740993,\n  }),',
    );
    expect(code).toContain('await response.json()');
    expect(code).not.toContain('Host');
  });

  it('drops headers fetch cannot set and sends cookies with credentials', () => {
    const code = toFetch(parseExchange('GET https://x.dev\nCookie: a=1\nUser-Agent: me').request);
    expect(code).not.toContain('Cookie');
    expect(code).toContain("credentials: 'include'");
  });

  it('writes Python with a dict body', () => {
    const code = toPython(
      parseExchange(
        'POST https://x.dev\nContent-Type: application/json\n\n{"a": true, "b": null, "c": [1.50]}',
      ).request,
    );
    expect(code).toContain('requests.post(');
    expect(code).toContain(
      'json={\n        "a": True,\n        "b": None,\n        "c": [\n            1.50,\n        ],\n    },',
    );
    expect(code).not.toContain('Content-Type');
    expect(toPython(parseExchange('PROPFIND https://x.dev').request)).toContain(
      'requests.request(\n    "PROPFIND",',
    );
  });

  it('writes HTTPie', () => {
    expect(toHttpie(parseExchange('GET https://x.dev/a\nAccept: text/plain').request)).toBe(
      'http GET https://x.dev/a \\\n  Accept:text/plain',
    );
  });

  it('never lets a value escape its string', () => {
    const evil = parseExchange(
      JSON.stringify({
        request: { method: 'POST', url: "https://x.dev/'; rm -rf /", body: '"\u2028`${x}`' },
      }),
    ).request;
    expect(toCurl(evil)).toContain(`'https://x.dev/'\\''; rm -rf /'`);
    expect(toFetch(evil)).toContain('body: "\\"\\u2028`${x}`"');
    expect(toPython(evil)).toContain('data="\\"\\u2028`${x}`"');
  });
});

describe('URL display', () => {
  it('splits a URL and its path parameters in linear time', async () => {
    const { splitUrl, pathParts } = await import('../../src/components/http/vt-http.js');
    expect(splitUrl('https://x.dev/a/{id}?q=1#top')).toEqual({
      origin: 'https://x.dev',
      path: '/a/{id}',
      rest: '?q=1#top',
    });
    expect(splitUrl('/users/:id')).toEqual({ origin: '', path: '/users/:id', rest: '' });
    expect(pathParts('/projects/{projectId}/tasks/:task_id')).toEqual([
      { text: '/projects/', param: false },
      { text: '{projectId}', param: true },
      { text: '/tasks/', param: false },
      { text: ':task_id', param: true },
    ]);
    expect(pathParts('/a{b/c}')).toEqual([{ text: '/a{b/c}', param: false }]);
    const start = performance.now();
    pathParts('{'.repeat(50_000));
    splitUrl(`"${'"'.repeat(50_000)}`);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
