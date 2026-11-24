import { describe, expect, it } from 'vitest';
import {
  checkChain,
  kindOf,
  parseRedirects,
  toText,
} from '../../src/components/redirects/redirects.js';

/** @param {string} text @param {object} [options] */
function hops(text, options) {
  const result = parseRedirects(text, options);
  if (!result.ok) throw new Error(result.error);
  return result.chain.hops;
}

const summary = (/** @type {any[]} */ list) => list.map((hop) => `${hop.status ?? '-'} ${hop.url} ${hop.kind ?? ''}`.trim()); // prettier-ignore

describe('kindOf', () => {
  it('tells permanent and temporary redirects apart', () => {
    expect([301, 308, 302, 303, 307, 300, 200, null].map(kindOf)).toEqual([
      'permanent', 'permanent', 'temporary', 'temporary', 'temporary', 'other', null, null,
    ]); // prettier-ignore
  });
});

describe('parseRedirects', () => {
  it('follows the redirects of a HAR file, skipping unrelated entries', () => {
    const entry = (url, status, location, extra = {}) => ({
      request: { url },
      response: { status, redirectURL: location ?? '', headers: [] },
      ...extra,
    });
    const har = {
      log: {
        entries: [
          entry('http://example.com/', 301, 'https://example.com/', {
            serverIPAddress: '192.0.2.1',
            time: 20,
          }),
          entry('https://cdn.example.net/app.js', 200),
          entry('https://example.com/', 302, '/home?utm_source=mail'),
          entry('https://example.com/home?utm_source=mail', 200),
        ],
      },
    };
    const list = hops(JSON.stringify(har));
    expect(summary(list)).toEqual([
      '301 http://example.com/ permanent',
      '302 https://example.com/ temporary',
      '200 https://example.com/home?utm_source=mail',
    ]);
    expect(list[0]).toMatchObject({ ip: '192.0.2.1', time: 20 });
    expect(
      parseRedirects(JSON.stringify(har), { start: 'cdn.example.net' }).chain.hops,
    ).toHaveLength(1);
  });

  it('shows where a HAR chain goes when the next request was not captured', () => {
    const har = { log: { entries: [{ request: { url: 'https://a.example/' }, response: { status: 302, headers: [{ name: 'Location', value: 'https://b.example/' }] } }] } }; // prettier-ignore
    expect(summary(hops(JSON.stringify(har)))).toEqual([
      '302 https://a.example/ temporary',
      '- https://b.example/',
    ]);
  });

  it('reads curl -sIL output, with the URL from the command line', () => {
    const text = [
      '$ curl -sIL http://example.com',
      'HTTP/1.1 301 Moved Permanently',
      'Location: https://example.com/',
      '',
      'HTTP/2 302',
      'location: /fr/',
      '',
      'HTTP/2 200',
      'content-type: text/html',
    ].join('\n');
    expect(summary(hops(text))).toEqual([
      '301 http://example.com permanent',
      '302 https://example.com/ temporary',
      '200 https://example.com/fr/',
    ]);
  });

  it('reads curl -v output: request host, server IP, prefixed lines', () => {
    const text = [
      '* Connected to example.com (93.184.216.34) port 80',
      '> GET / HTTP/1.1',
      '> Host: example.com',
      '< HTTP/1.1 100 Continue',
      '< HTTP/1.1 308 Permanent Redirect',
      '< Location: https://example.com/',
      '* Connected to example.com (93.184.216.34) port 443',
      '< HTTP/2 200',
    ].join('\n');
    const list = hops(text);
    expect(summary(list)).toEqual([
      '308 https://example.com/ permanent',
      '200 https://example.com/',
    ]);
    expect(list.map((hop) => hop.ip)).toEqual(['93.184.216.34', '93.184.216.34']);
  });

  it('reads JSON with client-side redirects', () => {
    const list = hops(
      JSON.stringify({
        hops: [
          { url: 'https://bit.example/x', status: 301 },
          { url: 'https://landing.example/', status: 200, type: 'meta' },
          { url: 'https://landing.example/go', type: 'js', location: 'https://final.example/' },
        ],
      }),
    );
    expect(summary(list)).toEqual([
      '301 https://bit.example/x permanent',
      '200 https://landing.example/ meta',
      '- https://landing.example/go script',
      '- https://final.example/',
    ]);
  });

  it('reads a list of URLs, with statuses or arrows', () => {
    expect(
      summary(hops('301 http://a.example/\nhttps://a.example/ 302\n200 https://b.example/')),
    ).toEqual([
      '301 http://a.example/ permanent',
      '302 https://a.example/ temporary',
      '200 https://b.example/',
    ]);
    expect(
      summary(hops('https://a.example -> https://b.example (meta) -> https://c.example')),
    ).toEqual(['- https://a.example other', '- https://b.example meta', '- https://c.example']);
  });

  it('explains what it cannot read', () => {
    expect(parseRedirects('')).toEqual({ ok: false, error: 'empty' });
    expect(parseRedirects('no URL here')).toEqual({ ok: false, error: 'format' });
    expect(parseRedirects('{"a":1}')).toEqual({ ok: false, error: 'format' });
    expect(parseRedirects('[1,').ok).toBe(false);
  });
});

describe('checkChain', () => {
  it('marks host and site changes, HTTPS upgrades and downgrades, added parameters', () => {
    const { steps, issues, sites } = checkChain(
      hops(
        '301 http://example.com/\n302 https://example.com/\n302 https://www.example.com/?a=1\n302 http://track.example.net/?a=1&utm_source=x&gclid=2&id=3\n200 https://shop.example.org/',
      ),
    );
    expect(steps.map((s) => [s.scheme, s.hostChange, s.siteChange])).toEqual([
      ['upgrade', false, false],
      [null, true, false],
      ['downgrade', true, true],
      ['upgrade', true, true],
    ]);
    expect(steps[2].added).toEqual(['utm_source', 'gclid', 'id']);
    expect(steps[2].tracking).toEqual(['utm_source', 'gclid']);
    expect(sites).toEqual(['example.com', 'example.net', 'example.org']);
    expect(issues.map((i) => `${i.level}:${i.code}`)).toEqual(['bad:downgrade', 'info:sites']);
  });

  it('finds loops, long chains, errors and unfinished chains', () => {
    const loop = checkChain(
      hops('302 https://a.example/\n302 https://b.example/\n302 https://a.example/'),
    );
    expect(loop.steps[1].loop).toBe(true);
    expect(loop.issues[0].code).toBe('loop');
    const long = Array.from({ length: 12 }, (_, i) => `301 https://a.example/${i}`).join('\n');
    expect(checkChain(hops(long)).issues.map((i) => i.code)).toContain('tooLong');
    expect(checkChain(hops('301 https://a.example/\n404 https://a.example/x')).issues[0].code).toBe(
      'endsError',
    );
    expect(checkChain(hops('301 https://a.example/\nhttps://a.example/x')).issues[0].code).toBe(
      'unfinished',
    );
  });
});

describe('toText', () => {
  it('writes one hop per line', () => {
    expect(toText(hops('301 http://a.example/\n200 https://a.example/'))).toBe(
      '301 http://a.example/\n200 https://a.example/',
    );
  });
});
