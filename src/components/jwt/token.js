// @ts-check
/**
 * Reads JSON Web Tokens: splits the compact form, decodes base64url parts, and
 * describes claims, validity and risky header values. Nothing is verified or fetched.
 *
 * @module components/jwt/token
 */

/** Longest token read, in characters. */
export const MAX_TOKEN_LENGTH = 64 * 1024;

/** A lifetime longer than this (in seconds) is flagged: 30 days. */
export const LONG_LIFETIME = 30 * 24 * 3600;

/**
 * @typedef {object} TokenPart
 * @property {string} raw - The part as written (base64url).
 * @property {string | null} text - Decoded UTF-8 text, `null` when it cannot be decoded.
 * @property {unknown} value - Parsed JSON, `undefined` when the text is not JSON.
 */

/**
 * @typedef {object} Token
 * @property {'jws' | 'jwe'} kind - Signed (3 parts) or encrypted (5 parts).
 * @property {string} compact - The token without spaces or a `Bearer ` prefix.
 * @property {string[]} parts - The raw parts.
 * @property {TokenPart} header
 * @property {TokenPart | null} payload - `null` for an encrypted token.
 * @property {string} signature - Raw signature (JWS) or authentication tag (JWE).
 */

/** @typedef {{ ok: true, token: Token } | { ok: false, error: string }} TokenResult */

/**
 * Decodes base64url text to bytes, or returns `null` when it is not base64url.
 *
 * @param {string} text
 * @returns {Uint8Array | null}
 */
export function base64UrlBytes(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * @param {string} raw
 * @returns {TokenPart}
 */
function decodePart(raw) {
  const bytes = base64UrlBytes(raw);
  /** @type {string | null} */
  let text = null;
  if (bytes) {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = null;
    }
  }
  /** @type {unknown} */
  let value;
  if (text !== null) {
    try {
      value = JSON.parse(text);
    } catch {
      value = undefined;
    }
  }
  return { raw, text, value };
}

/**
 * Reads a compact JWS or JWE.
 *
 * @param {string} input
 * @returns {TokenResult}
 */
export function decodeToken(input) {
  const compact = String(input ?? '')
    .slice(0, MAX_TOKEN_LENGTH)
    .trim()
    .replace(/^bearer\s+/i, '')
    .replace(/\s+/g, '');
  if (!compact) return { ok: false, error: 'empty' };
  const parts = compact.split('.');
  if (parts.length !== 3 && parts.length !== 5) return { ok: false, error: 'parts' };
  const header = decodePart(parts[0]);
  if (!isObject(header.value)) return { ok: false, error: 'header' };
  if (parts.length === 5) {
    return {
      ok: true,
      token: { kind: 'jwe', compact, parts, header, payload: null, signature: parts[4] },
    };
  }
  const payload = decodePart(parts[1]);
  if (payload.text === null) return { ok: false, error: 'payload' };
  return { ok: true, token: { kind: 'jws', compact, parts, header, payload, signature: parts[2] } };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Registered and common claims, in the order they are listed. */
export const KNOWN_CLAIMS = Object.freeze([
  'iss', 'sub', 'aud', 'exp', 'nbf', 'iat', 'jti', 'azp', 'scope', 'scp', 'roles', 'name',
  'email', 'email_verified', 'preferred_username', 'nonce', 'auth_time', 'sid', 'tid', 'acr', 'amr',
]); // prettier-ignore

/** Claims holding a NumericDate (seconds since 1970). */
export const DATE_CLAIMS = Object.freeze(['exp', 'nbf', 'iat', 'auth_time']);

/**
 * @typedef {'valid' | 'expired' | 'early' | 'unknown'} Validity
 */

/**
 * Validity of the token at a time, from `exp` and `nbf`.
 *
 * @param {unknown} payload
 * @param {number} now - Time in milliseconds.
 * @returns {{ state: Validity, at: number | null }} `at`: the date (ms) that decides the state.
 */
export function validity(payload, now) {
  if (!isObject(payload)) return { state: 'unknown', at: null };
  const exp = numericDate(payload.exp);
  const nbf = numericDate(payload.nbf);
  if (nbf !== null && now < nbf) return { state: 'early', at: nbf };
  if (exp !== null && now >= exp) return { state: 'expired', at: exp };
  if (exp === null && nbf === null) return { state: 'unknown', at: null };
  return { state: 'valid', at: exp };
}

/**
 * A NumericDate claim in milliseconds, or `null`.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function numericDate(value) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e11
    ? value * 1000
    : null;
}

/**
 * @typedef {object} Warning
 * @property {string} key - Warning kind: `algNone`, `algSymmetric`, `noExp`, `longLifetime`, `urlHeader`, `notJson`, `encrypted`.
 * @property {Record<string, string>} [params]
 */

/**
 * Risky or unusual values worth pointing out.
 *
 * @param {Token} token
 * @returns {Warning[]}
 */
export function warnings(token) {
  /** @type {Warning[]} */
  const list = [];
  const header = /** @type {Record<string, unknown>} */ (token.header.value);
  const alg = typeof header.alg === 'string' ? header.alg : '';
  if (token.kind === 'jwe') list.push({ key: 'encrypted' });
  if (token.kind === 'jws' && (alg.toLowerCase() === 'none' || !alg)) list.push({ key: 'algNone' });
  if (/^HS\d+$/.test(alg)) list.push({ key: 'algSymmetric', params: { alg } });
  for (const name of ['jku', 'x5u']) {
    if (typeof header[name] === 'string') list.push({ key: 'urlHeader', params: { name } });
  }
  if (typeof header.kid === 'string' && /^[a-z][a-z0-9+.-]*:|[/\\]|\.\./i.test(header.kid))
    list.push({ key: 'urlHeader', params: { name: 'kid' } });
  if (token.payload) {
    const payload = token.payload.value;
    if (!isObject(payload)) list.push({ key: 'notJson' });
    else {
      const exp = numericDate(payload.exp);
      const start = numericDate(payload.nbf) ?? numericDate(payload.iat);
      if (exp === null) list.push({ key: 'noExp' });
      else if (start !== null && (exp - start) / 1000 > LONG_LIFETIME)
        list.push({ key: 'longLifetime' });
    }
  }
  return list;
}
