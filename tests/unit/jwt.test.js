import { describe, expect, it } from 'vitest';
import {
  base64UrlBytes,
  decodeToken,
  numericDate,
  validity,
  warnings,
} from '../../src/components/jwt/token.js';
import { VtJwt } from '../../src/components/jwt/vt-jwt.js';

/** @param {unknown} value */
const b64 = (value) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/**
 * @param {unknown} header
 * @param {unknown} payload
 * @param {string} [signature]
 */
const jwt = (header, payload, signature = 'c2lnbmF0dXJl') =>
  `${b64(header)}.${b64(payload)}.${signature}`;

const NOW = Date.parse('2026-10-13T12:00:00Z');
const sec = (iso) => Date.parse(iso) / 1000;

describe('decodeToken', () => {
  it('decodes a signed token, ignoring spaces and a Bearer prefix', () => {
    const token = jwt({ alg: 'RS256', typ: 'JWT' }, { sub: '42', name: 'Ada Lovelace — é' });
    const result = decodeToken(`Bearer  ${token.slice(0, 10)}\n${token.slice(10)}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.token.kind).toBe('jws');
    expect(result.token.compact).toBe(token);
    expect(result.token.header.value).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(result.token.payload?.value).toEqual({ sub: '42', name: 'Ada Lovelace — é' });
  });

  it('reads only the header of an encrypted token', () => {
    const result = decodeToken(
      `${b64({ alg: 'RSA-OAEP', enc: 'A256GCM' })}.a2V5.aXY.Y2lwaGVy.dGFn`,
    );
    expect(result.ok && result.token.kind).toBe('jwe');
    expect(result.ok && result.token.payload).toBeNull();
  });

  it('keeps a payload that is text but not JSON', () => {
    const result = decodeToken(`${b64({ alg: 'HS256' })}.${b64('hello')}.`);
    expect(result.ok && result.token.payload?.text).toBe('hello');
    expect(result.ok && result.token.payload?.value).toBeUndefined();
  });

  it('rejects malformed tokens with a reason', () => {
    expect(decodeToken('')).toEqual({ ok: false, error: 'empty' });
    expect(decodeToken('a.b')).toEqual({ ok: false, error: 'parts' });
    expect(decodeToken('!!!.e30.x')).toEqual({ ok: false, error: 'header' });
    expect(decodeToken(`${b64({ alg: 'none' })}.%%%.`)).toEqual({ ok: false, error: 'payload' });
  });

  it('rejects text that is not base64url', () => {
    expect(base64UrlBytes('ab+c')).toBeNull();
    expect(base64UrlBytes('a')).toBeNull();
    expect(Array.from(base64UrlBytes('AQID') ?? [])).toEqual([1, 2, 3]);
  });
});

describe('validity', () => {
  it('tells valid, expired and not yet valid tokens apart', () => {
    expect(validity({ exp: sec('2026-10-14T00:00:00Z') }, NOW).state).toBe('valid');
    expect(validity({ exp: sec('2026-10-13T11:00:00Z') }, NOW)).toEqual({
      state: 'expired',
      at: Date.parse('2026-10-13T11:00:00Z'),
    });
    expect(validity({ nbf: sec('2026-10-13T13:00:00Z') }, NOW).state).toBe('early');
    expect(validity({ sub: 'x' }, NOW).state).toBe('unknown');
    expect(validity('text', NOW).state).toBe('unknown');
  });

  it('reads NumericDate claims as seconds only', () => {
    expect(numericDate(1)).toBe(1000);
    expect(numericDate('1')).toBeNull();
    expect(numericDate(1e12)).toBeNull();
  });
});

describe('warnings', () => {
  /** @param {string} token */
  const keys = (token) => {
    const result = decodeToken(token);
    if (!result.ok) throw new Error(result.error);
    return warnings(result.token).map((w) => w.key);
  };

  it('flags unsigned tokens and missing expiry', () => {
    expect(keys(jwt({ alg: 'none' }, { sub: '1' }, ''))).toEqual(['algNone', 'noExp']);
  });

  it('flags shared secrets, key URLs and long lifetimes', () => {
    const list = keys(
      jwt(
        { alg: 'HS256', jku: 'https://evil.example/keys', kid: '../../etc/passwd' },
        { iat: sec('2026-01-01T00:00:00Z'), exp: sec('2027-01-01T00:00:00Z') },
      ),
    );
    expect(list).toEqual(['algSymmetric', 'urlHeader', 'urlHeader', 'longLifetime']);
  });

  it('has nothing to say about a short-lived signed token', () => {
    expect(keys(jwt({ alg: 'ES256', kid: 'key-1' }, { iat: 1, exp: 3600 }))).toEqual([]);
  });
});

describe('<vt-jwt>', () => {
  it('renders parts, claims in words and the validity at `now`', () => {
    if (!customElements.get('vt-jwt')) customElements.define('vt-jwt', VtJwt);
    const el = /** @type {VtJwt} */ (document.createElement('vt-jwt'));
    el.setAttribute('variant', 'full');
    el.setAttribute('now', '2026-10-13T12:00:00Z');
    el.setAttribute('lang-ui', 'en');
    el.content = jwt(
      { alg: 'RS256' },
      { sub: '42', exp: sec('2026-10-13T11:00:00Z'), team: 'core' },
    );
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelectorAll('.jwt-part')).toHaveLength(3);
    expect(root.querySelector('.badge')?.textContent).toMatch(/^Expired/);
    const meanings = Array.from(root.querySelectorAll('.jwt-meaning'), (td) => td.textContent);
    expect(meanings).toEqual(['Subject', 'Expires', 'Custom claim']);
    expect(root.querySelector('[part~="token-signature"]')?.textContent).toBe('c2lnbmF0dXJl');
    el.setAttribute('mask-signature', '');
    el.render();
    expect(root.querySelector('[part~="token-signature"]')?.textContent).not.toContain('c2ln');
    el.remove();
  });

  it('explains why a token cannot be read', () => {
    const el = /** @type {VtJwt} */ (document.createElement('vt-jwt'));
    el.setAttribute('lang-ui', 'fr');
    el.content = 'not-a-token';
    document.body.append(el);
    el.render();
    expect(el.root.querySelector('.notice')?.textContent).toContain('3 parties');
    expect(el.token).toBeNull();
    el.remove();
  });
});
