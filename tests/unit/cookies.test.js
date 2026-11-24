import { describe, expect, it } from 'vitest';
import {
  checkCookie,
  fromSetCookie,
  parseCookies,
  toCookieHeader,
  toJson,
} from '../../src/components/cookies/cookies.js';

const NOW = new Date('2026-11-17T12:00:00Z');

/** @param {string} text @param {object} [options] */
function jar(text, options) {
  const result = parseCookies(text, options);
  if (!result.ok) throw new Error(result.error);
  return result.jar;
}

/** @param {import('../../src/components/cookies/cookies.js').Cookie} cookie @param {string | null} site */
const codes = (cookie, site = 'shop.example.com') =>
  checkCookie(cookie, site, NOW).issues.map((i) => `${i.level}:${i.code}`);

describe('fromSetCookie', () => {
  it('reads every attribute; Max-Age wins over Expires', () => {
    const cookie = fromSetCookie(
      'id="a b"; Expires=Wed, 21 Oct 2015 07:28:00 GMT; Max-Age=3600; Domain=.Example.com; Path=/app; Secure; HttpOnly; SameSite=strict; Partitioned',
      'shop.example.com',
      'https://shop.example.com/',
      NOW,
    );
    expect(cookie).toMatchObject({
      name: 'id',
      value: 'a b',
      domain: 'example.com',
      hostOnly: false,
      path: '/app',
      session: false,
      secure: true,
      httpOnly: true,
      sameSite: 'Strict',
      partitioned: true,
    });
    expect(cookie.expires.getTime()).toBe(NOW.getTime() + 3600_000);
  });

  it('keeps the host of the response for a cookie without Domain', () => {
    const cookie = fromSetCookie('a=1', 'shop.example.com', null, NOW);
    expect(cookie).toMatchObject({ domain: 'shop.example.com', hostOnly: true, session: true });
  });
});

describe('parseCookies', () => {
  it('reads Set-Cookie lines and skips other headers', () => {
    const { cookies, format, site } = jar(
      'HTTP/2 200\ncontent-type: text/html\nSet-Cookie: a=1; Secure\n< set-cookie: b=2\nc=3; Path=/',
      { url: 'https://shop.example.com/cart' },
    );
    expect(format).toBe('set-cookie');
    expect(site).toBe('shop.example.com');
    expect(cookies.map((c) => c.name)).toEqual(['a', 'b', 'c']);
  });

  it('reads a Cookie header (names and values only)', () => {
    const { cookies, format } = jar('Cookie: a=1; b=x=y');
    expect(format).toBe('cookie');
    expect(cookies.map((c) => [c.name, c.value, c.attributes])).toEqual([
      ['a', '1', false],
      ['b', 'x=y', false],
    ]);
    expect(codes(cookies[0])).toEqual([]);
  });

  it('reads browser, Playwright and Puppeteer JSON', () => {
    const { cookies } = jar(
      JSON.stringify({
        cookies: [
          {
            name: 'pw',
            value: '1',
            domain: '.example.com',
            path: '/',
            expires: -1,
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
          },
          {
            name: 'ext',
            value: '2',
            domain: 'shop.example.com',
            hostOnly: true,
            expirationDate: 1800000000,
            sameSite: 'no_restriction',
          },
        ],
      }),
    );
    expect(cookies[0]).toMatchObject({
      domain: 'example.com',
      hostOnly: false,
      session: true,
      sameSite: 'Lax',
    });
    expect(cookies[1]).toMatchObject({ hostOnly: true, session: false, sameSite: 'None' });
    expect(cookies[1].expires.getTime()).toBe(1800000000 * 1000);
  });

  it('reads the cookies set in a HAR file, with the URL that set each one', () => {
    const har = {
      log: {
        entries: [
          {
            request: { url: 'https://www.example.org/' },
            response: {
              headers: [{ name: 'Set-Cookie', value: 'sid=1; Secure; HttpOnly\nlang=fr' }],
              cookies: [{ name: 'ignored', value: '' }],
            },
          },
          {
            request: { url: 'https://ads.tracker.example/pixel' },
            response: {
              headers: [],
              cookies: [{ name: 'uid', value: '9', expires: '2028-01-01T00:00:00Z' }],
            },
          },
        ],
      },
    };
    const { cookies, format, site } = jar(JSON.stringify(har));
    expect(format).toBe('har');
    expect(site).toBe('www.example.org');
    expect(cookies.map((c) => `${c.name}@${c.domain}`)).toEqual([
      'sid@www.example.org',
      'lang@www.example.org',
      'uid@ads.tracker.example',
    ]);
    expect(cookies[2].url).toBe('https://ads.tracker.example/pixel');
    expect(checkCookie(cookies[2], site, NOW).party).toBe('third');
    expect(checkCookie(cookies[0], site, NOW).party).toBe('first');
  });

  it('reads a Netscape cookies.txt file', () => {
    const { cookies, format } = jar(
      '# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tTRUE\t1800000000\ta\t1\n#HttpOnly_shop.example.com\tFALSE\t/\tFALSE\t0\tb\t2\n',
    );
    expect(format).toBe('netscape');
    expect(cookies[0]).toMatchObject({
      domain: 'example.com',
      hostOnly: false,
      secure: true,
      session: false,
    });
    expect(cookies[1]).toMatchObject({ httpOnly: true, hostOnly: true, session: true });
  });

  it('explains what it cannot read', () => {
    expect(parseCookies('  ')).toEqual({ ok: false, error: 'empty' });
    expect(parseCookies('hello world')).toEqual({ ok: false, error: 'format' });
    expect(parseCookies('{"a":1}')).toEqual({ ok: false, error: 'format' });
    expect(parseCookies('[1,').ok).toBe(false);
  });
});

describe('checkCookie', () => {
  const set = (/** @type {string} */ value) => fromSetCookie(value, 'shop.example.com', null, NOW);

  it('finds nothing wrong with a well-made cookie', () => {
    expect(codes(set('__Host-sid=1; Path=/; Secure; HttpOnly; SameSite=Lax'))).toEqual([]);
  });

  it('checks the prefixes and SameSite=None', () => {
    expect(
      codes(set('__Host-a=1; Domain=example.com; Path=/; Secure; HttpOnly; SameSite=Lax')),
    ).toContain('bad:hostPrefix');
    expect(codes(set('__Host-a=1; Secure; HttpOnly; SameSite=Lax'))).toContain('bad:hostPrefix');
    expect(codes(set('__Secure-a=1; HttpOnly; SameSite=Lax'))).toContain('bad:securePrefix');
    expect(codes(set('a=1; HttpOnly; SameSite=None'))[0]).toBe('bad:noneInsecure');
  });

  it('rejects a Domain that is not the host nor a parent of it', () => {
    const foreign = fromSetCookie(
      'a=1; Domain=ads.example.net; Secure; HttpOnly; SameSite=Lax',
      'shop.example.com',
      null,
      NOW,
    );
    expect(codes(foreign)).toContain('bad:foreignDomain');
    expect(codes(set('a=1; Domain=com; Secure; HttpOnly; SameSite=Lax'))).toContain(
      'bad:foreignDomain',
    );
    expect(codes(set('a=1; Domain=shop.example.com; Secure; HttpOnly; SameSite=Lax'))).toEqual([]);
  });

  it('warns about readable sessions, missing flags, long lifetimes and size', () => {
    expect(codes(set('sessionid=1; Secure; SameSite=Lax'))).toEqual(['warn:sessionReadable']);
    expect(codes(set('theme=dark; Secure; SameSite=Lax'))).toEqual(['info:scriptReadable']);
    expect(codes(set('a=1; HttpOnly'))).toEqual(['warn:notSecure', 'info:noSameSite']);
    expect(codes(set('a=1; Secure; HttpOnly; SameSite=Lax; Max-Age=63072000'))).toEqual([
      'warn:tooLong',
    ]);
    expect(codes(set(`a=${'x'.repeat(4100)}; Secure; HttpOnly; SameSite=Lax`))).toEqual([
      'warn:tooLarge',
    ]);
  });

  it('notes deletions, wide domains and persistent third-party cookies', () => {
    expect(codes(set('a=; Max-Age=0'))).toEqual(['info:deletion']);
    expect(codes(set('a=1; Domain=example.com; Secure; HttpOnly; SameSite=Lax'))).toEqual([
      'info:wideDomain',
    ]);
    const third = fromSetCookie(
      'uid=1; Secure; HttpOnly; SameSite=None; Max-Age=31536000',
      'ads.example.net',
      null,
      NOW,
    );
    expect(codes(third)).toEqual(['info:thirdPartyPersistent']);
    expect(checkCookie(third, null, NOW).party).toBeNull();
  });

  it('gives the lifetime left', () => {
    expect(checkCookie(set('a=1; Max-Age=60'), null, NOW).lifetime).toBe(60_000);
    expect(checkCookie(set('a=1'), null, NOW).lifetime).toBeNull();
  });
});

describe('export', () => {
  it('writes JSON read back the same, and a Cookie header', () => {
    const cookies = jar('Set-Cookie: a=1; Secure\nSet-Cookie: b=2; Max-Age=60', {
      url: 'https://x.dev',
    }).cookies;
    expect(toCookieHeader(cookies)).toBe('a=1; b=2');
    const again = jar(toJson(cookies)).cookies;
    expect(again.map((c) => [c.name, c.secure, c.session])).toEqual([
      ['a', true, true],
      ['b', false, false],
    ]);
  });
});
