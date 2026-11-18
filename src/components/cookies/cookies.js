// @ts-check
/**
 * Reads cookies and checks them. Nothing is sent or stored: the text is only read.
 *
 * Accepted formats (detected automatically):
 *
 * - **`Set-Cookie` headers**, one per line, with or without the `Set-Cookie:` name (other
 *   header lines are skipped, so a whole response header block works);
 * - **a `Cookie` request header** (`Cookie: a=1; b=2`): names and values only;
 * - **JSON**: an array of cookie objects as exported by browsers, extensions, Playwright
 *   (`context.cookies()`, `storageState()`) or Puppeteer, `{ cookies: [...] }`, or a HAR file
 *   (the cookies set by its responses, with the URL that set each one);
 * - **Netscape `cookies.txt`**, as written by curl (`-c`) and wget.
 *
 * @module components/cookies/cookies
 */
import { baseDomain } from '../../core/urls.js';

/** @typedef {"bad" | "warn" | "info"} Level */
/** @typedef {"Strict" | "Lax" | "None"} SameSite */

/**
 * @typedef {object} Cookie
 * @property {string} name
 * @property {string} value
 * @property {string | null} domain - Without its leading dot; `null` when unknown.
 * @property {boolean} hostOnly - Set without a `Domain` attribute: sent to its host only.
 * @property {string | null} path
 * @property {Date | null} expires - `null` for a session cookie (or when unknown).
 * @property {boolean} session
 * @property {boolean} secure
 * @property {boolean} httpOnly
 * @property {SameSite | null} sameSite - `null` when not set.
 * @property {boolean} partitioned
 * @property {boolean} attributes - Attributes are known (false for a `Cookie` header).
 * @property {string | null} url - The URL that set the cookie, when known.
 * @property {string | null} setter - The host that set the cookie, when known.
 */

/**
 * @typedef {object} Issue
 * @property {Level} level
 * @property {string} code - `hostPrefix`, `securePrefix`, `noneInsecure`, `notSecure`,
 *   `sessionReadable`, `scriptReadable`, `noSameSite`, `tooLong`, `tooLarge`, `deletion`,
 *   `wideDomain`, `thirdPartyPersistent`, `foreignDomain`.
 */

/**
 * @typedef {object} CheckedCookie
 * @property {Cookie} cookie
 * @property {"first" | "third" | null} party - Compared with the site; `null` when unknown.
 * @property {number | null} lifetime - Milliseconds left; `null` for a session cookie.
 * @property {Issue[]} issues - Most serious first.
 */

/**
 * @typedef {object} CookieJar
 * @property {Cookie[]} cookies
 * @property {"set-cookie" | "cookie" | "json" | "har" | "netscape"} format
 * @property {string | null} site - The host the cookies are compared with.
 */

/** @typedef {{ ok: true, jar: CookieJar } | { ok: false, error: "empty" | "format" | "json", detail?: string }} ParseResult */

/** Cookies read at most. */
export const MAX_COOKIES = 5000;
/** Longest name + value kept (browsers refuse more than 4096 bytes). */
const MAX_VALUE = 16384;
/** Browsers cap a cookie lifetime at 400 days. */
export const MAX_LIFETIME = 400 * 24 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;
/** Names that usually hold a session or a credential. */
const SESSION_NAME = /sess|sid\b|^sid|auth|token|jwt|login|remember|csrf|xsrf/i;

const LEVELS = /** @type {const} */ (['bad', 'warn', 'info']);

/**
 * @param {string} text
 * @param {{ url?: string | null, site?: string | null }} [options] - `url`: the URL the
 *   `Set-Cookie` headers came from (gives the domain of cookies without `Domain`); `site`:
 *   the site to tell first and third parties apart (default: the host of `url`, or of the
 *   first entry of a HAR file).
 * @returns {ParseResult}
 */
export function parseCookies(text, options = {}) {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return { ok: false, error: 'empty' };
  const defaultHost = hostOf(options.url ?? null);
  const siteOption = hostOf(options.site ?? null) ?? (options.site?.trim() || null);
  if (/^[[{]/.test(trimmed)) {
    /** @type {any} */
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch (error) {
      return { ok: false, error: 'json', detail: error instanceof Error ? error.message : '' };
    }
    if (Array.isArray(data?.log?.entries)) {
      const { cookies, first } = fromHar(data.log.entries);
      return { ok: true, jar: { cookies, format: 'har', site: siteOption ?? first ?? defaultHost } }; // prettier-ignore
    }
    /** @type {unknown[] | null} */
    const list = Array.isArray(data) ? data : Array.isArray(data?.cookies) ? data.cookies : null;
    if (!list) return { ok: false, error: 'format' };
    /** @type {Cookie[]} */
    const cookies = [];
    for (const item of list.slice(0, MAX_COOKIES)) {
      const cookie = fromObject(item, null);
      if (cookie) cookies.push(cookie);
    }
    return { ok: true, jar: { cookies, format: 'json', site: siteOption ?? defaultHost } };
  }

  const lines = trimmed.split(/\r\n|\n|\r/);
  if (
    lines.some((line) => /^#\s*Netscape HTTP Cookie File/i.test(line)) ||
    lines.some(isNetscapeLine)
  ) {
    const cookies = lines.filter(isNetscapeLine).slice(0, MAX_COOKIES).map(fromNetscape);
    return { ok: true, jar: { cookies, format: 'netscape', site: siteOption ?? defaultHost } };
  }

  /** @type {Cookie[]} */
  const cookies = [];
  let format = /** @type {"set-cookie" | "cookie"} */ ('set-cookie');
  for (const raw of lines) {
    if (cookies.length >= MAX_COOKIES) break;
    // curl -v writes "< set-cookie: …" for responses and "> Cookie: …" for requests.
    const line = raw.replace(/^\s*[<>]\s?/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const header = /^([A-Za-z0-9-]+)\s*:\s*(.*)$/.exec(line);
    if (header) {
      const name = header[1].toLowerCase();
      if (name === 'cookie') {
        format = 'cookie';
        cookies.push(...fromCookieHeader(header[2], defaultHost));
        continue;
      }
      if (name !== 'set-cookie' && name !== 'set-cookie2') continue;
      const cookie = fromSetCookie(header[2], defaultHost, options.url ?? null);
      if (cookie) cookies.push(cookie);
      continue;
    }
    if (/^HTTP\/\d/.test(line)) continue;
    if (!line.includes('=')) continue;
    const cookie = fromSetCookie(line, defaultHost, options.url ?? null);
    if (cookie) cookies.push(cookie);
  }
  if (!cookies.length) return { ok: false, error: 'format' };
  return { ok: true, jar: { cookies: cookies.slice(0, MAX_COOKIES), format, site: siteOption ?? defaultHost } }; // prettier-ignore
}

/**
 * Reads one `Set-Cookie` value (RFC 6265bis).
 *
 * @param {string} value
 * @param {string | null} host - The host that set it.
 * @param {string | null} url
 * @param {Date} [now]
 * @returns {Cookie | null}
 */
export function fromSetCookie(value, host, url, now = new Date()) {
  const [pair, ...attributes] = value.slice(0, MAX_VALUE).split(';');
  const eq = pair.indexOf('=');
  const name = (eq === -1 ? '' : pair.slice(0, eq)).trim();
  const cookieValue = (eq === -1 ? pair : pair.slice(eq + 1)).trim().replace(/^"(.*)"$/, '$1');
  if (!name && !cookieValue) return null;
  /** @type {Cookie} */
  const cookie = {
    name,
    value: cookieValue,
    domain: host,
    hostOnly: true,
    path: null,
    expires: null,
    session: true,
    secure: false,
    httpOnly: false,
    sameSite: null,
    partitioned: false,
    attributes: true,
    url,
    setter: host,
  };
  /** @type {number | null} */
  let maxAge = null;
  for (const attribute of attributes) {
    const at = attribute.indexOf('=');
    const key = (at === -1 ? attribute : attribute.slice(0, at)).trim().toLowerCase();
    const raw = at === -1 ? '' : attribute.slice(at + 1).trim();
    if (key === 'domain' && raw) {
      cookie.domain = raw.replace(/^\./, '').toLowerCase();
      cookie.hostOnly = false;
    } else if (key === 'path') cookie.path = raw.startsWith('/') ? raw : '/';
    else if (key === 'expires') {
      const date = new Date(raw);
      if (!Number.isNaN(date.getTime())) cookie.expires = date;
    } else if (key === 'max-age' && /^-?\d+$/.test(raw)) maxAge = Number(raw);
    else if (key === 'secure') cookie.secure = true;
    else if (key === 'httponly') cookie.httpOnly = true;
    else if (key === 'samesite') cookie.sameSite = sameSite(raw);
    else if (key === 'partitioned') cookie.partitioned = true;
  }
  // Max-Age wins over Expires.
  if (maxAge !== null) cookie.expires = new Date(now.getTime() + maxAge * 1000);
  cookie.session = cookie.expires === null;
  return cookie;
}

/**
 * @param {string} value - `a=1; b=2`
 * @param {string | null} host
 * @returns {Cookie[]}
 */
function fromCookieHeader(value, host) {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=');
      return {
        name: (eq === -1 ? '' : part.slice(0, eq)).trim(),
        value: (eq === -1 ? part : part.slice(eq + 1)).trim().slice(0, MAX_VALUE),
        domain: host,
        hostOnly: true,
        path: null,
        expires: null,
        session: true,
        secure: false,
        httpOnly: false,
        sameSite: null,
        partitioned: false,
        attributes: false,
        url: null,
        setter: null,
      };
    });
}

/**
 * A cookie object from JSON: browsers and extensions (`expirationDate`), Playwright and
 * Puppeteer (`expires` in seconds, -1 for a session), HAR (`expires` as an ISO date).
 *
 * @param {any} item
 * @param {string | null} url
 * @returns {Cookie | null}
 */
function fromObject(item, url) {
  if (!item || typeof item !== 'object' || typeof item.name !== 'string') return null;
  const rawDomain = typeof item.domain === 'string' && item.domain ? item.domain : null;
  const expiry = item.expirationDate ?? item.expires ?? item.expiry ?? null;
  /** @type {Date | null} */
  let expires = null;
  if (typeof expiry === 'number' && Number.isFinite(expiry) && expiry > 0)
    expires = new Date(expiry < 1e11 ? expiry * 1000 : expiry);
  else if (typeof expiry === 'string' && expiry) {
    const date = new Date(expiry);
    if (!Number.isNaN(date.getTime())) expires = date;
  }
  if (item.session === true) expires = null;
  return {
    name: item.name.slice(0, MAX_VALUE),
    value: String(item.value ?? '').slice(0, MAX_VALUE),
    domain: rawDomain ? rawDomain.replace(/^\./, '').toLowerCase() : hostOf(url),
    hostOnly: typeof item.hostOnly === 'boolean' ? item.hostOnly : rawDomain ? !rawDomain.startsWith('.') : true, // prettier-ignore
    path: typeof item.path === 'string' && item.path ? item.path : null,
    expires,
    session: expires === null,
    secure: item.secure === true,
    httpOnly: item.httpOnly === true,
    sameSite: sameSite(item.sameSite),
    partitioned: item.partitioned === true || Boolean(item.partitionKey),
    attributes: true,
    url,
    setter: hostOf(url),
  };
}

/**
 * The cookies set by the responses of a HAR file: their `Set-Cookie` headers (complete), or
 * else their `cookies` array.
 *
 * @param {any[]} entries
 * @returns {{ cookies: Cookie[], first: string | null }}
 */
function fromHar(entries) {
  /** @type {Cookie[]} */
  const cookies = [];
  let first = null;
  for (const entry of entries) {
    if (cookies.length >= MAX_COOKIES) break;
    const url = typeof entry?.request?.url === 'string' ? entry.request.url : null;
    const host = hostOf(url);
    first ??= host;
    /** @type {any[]} */
    const headers = Array.isArray(entry?.response?.headers) ? entry.response.headers : [];
    const set = headers.filter((x) => typeof x?.name === 'string' && x.name.toLowerCase() === 'set-cookie'); // prettier-ignore
    if (set.length) {
      // Some tools join several cookies with new lines in one header.
      for (const header of set)
        for (const line of String(header.value ?? '').split('\n')) {
          const cookie = fromSetCookie(line, host, url);
          if (cookie) cookies.push(cookie);
        }
    } else if (Array.isArray(entry?.response?.cookies)) {
      for (const item of entry.response.cookies) {
        const cookie = fromObject(item, url);
        if (cookie) cookies.push(cookie);
      }
    }
  }
  return { cookies: cookies.slice(0, MAX_COOKIES), first };
}

/** @param {string} line */
function isNetscapeLine(line) {
  const fields = line.replace(/^#HttpOnly_/, '').split('\t');
  return fields.length === 7 && /^(TRUE|FALSE)$/i.test(fields[1]) && /^(TRUE|FALSE)$/i.test(fields[3]); // prettier-ignore
}

/**
 * @param {string} line - domain, include subdomains, path, secure, expiry, name, value.
 * @returns {Cookie}
 */
function fromNetscape(line) {
  const httpOnly = line.startsWith('#HttpOnly_');
  const [domain, sub, path, secure, expiry, name, value] = line.replace(/^#HttpOnly_/, '').split('\t'); // prettier-ignore
  const seconds = Number(expiry);
  const expires = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
  return {
    name: name.slice(0, MAX_VALUE),
    value: value.slice(0, MAX_VALUE),
    domain: domain.replace(/^\./, '').toLowerCase() || null,
    hostOnly: !/^TRUE$/i.test(sub),
    path: path || null,
    expires,
    session: expires === null,
    secure: /^TRUE$/i.test(secure),
    httpOnly,
    sameSite: null,
    partitioned: false,
    attributes: true,
    url: null,
    setter: null,
  };
}

/**
 * @param {unknown} value
 * @returns {SameSite | null}
 */
function sameSite(value) {
  const text = String(value ?? '').toLowerCase();
  if (text === 'strict') return 'Strict';
  if (text === 'lax') return 'Lax';
  if (text === 'none' || text === 'no_restriction') return 'None';
  return null;
}

/**
 * @param {string | null} url - A URL or a host name.
 * @returns {string | null}
 */
export function hostOf(url) {
  if (!url) return null;
  const value = url.trim();
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^\[|\]$/g, '') || null; // prettier-ignore
  } catch {
    return null;
  }
}

/**
 * Checks a cookie: prefixes, flags, SameSite, lifetime, size and party.
 *
 * @param {Cookie} cookie
 * @param {string | null} site
 * @param {Date} [now]
 * @returns {CheckedCookie}
 */
export function checkCookie(cookie, site, now = new Date()) {
  const party =
    site && cookie.domain ? (baseDomain(cookie.domain) === baseDomain(site) ? 'first' : 'third') : null; // prettier-ignore
  const lifetime = cookie.expires ? cookie.expires.getTime() - now.getTime() : null;
  /** @type {Issue[]} */
  const issues = [];
  /** @param {Level} level @param {string} code */
  const add = (level, code) => issues.push({ level, code });
  // A cookie that has already expired only deletes the one with this name: nothing to check.
  if (cookie.attributes && lifetime !== null && lifetime <= 0) add('info', 'deletion');
  else if (cookie.attributes) {
    if (cookie.name.startsWith('__Host-') && (!cookie.secure || !cookie.hostOnly || cookie.path !== '/')) add('bad', 'hostPrefix'); // prettier-ignore
    if (cookie.name.startsWith('__Secure-') && !cookie.secure) add('bad', 'securePrefix');
    if (cookie.sameSite === 'None' && !cookie.secure) add('bad', 'noneInsecure');
    if (!cookie.hostOnly && cookie.domain && cookie.setter && !domainMatch(cookie.setter, cookie.domain)) add('bad', 'foreignDomain'); // prettier-ignore
    if (!cookie.secure) add('warn', 'notSecure');
    if (!cookie.httpOnly) add(SESSION_NAME.test(cookie.name) ? 'warn' : 'info', SESSION_NAME.test(cookie.name) ? 'sessionReadable' : 'scriptReadable'); // prettier-ignore
    if (cookie.sameSite === null) add('info', 'noSameSite');
    if (lifetime !== null && lifetime > MAX_LIFETIME) add('warn', 'tooLong');
    if (!cookie.hostOnly && site && cookie.domain && cookie.domain !== site.toLowerCase() && party === 'first') add('info', 'wideDomain'); // prettier-ignore
    if (party === 'third' && lifetime !== null && lifetime > 30 * DAY)
      add('info', 'thirdPartyPersistent');
  }
  if (new TextEncoder().encode(cookie.name + cookie.value).length > 4096) add('warn', 'tooLarge');
  issues.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
  return { cookie, party, lifetime, issues };
}

/**
 * A host can set a cookie for itself or for a parent domain, never for another one
 * (RFC 6265, section 5.3, step 6). A domain of one label (`com`) is never accepted.
 *
 * @param {string} host
 * @param {string} domain
 * @returns {boolean}
 */
function domainMatch(host, domain) {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  if (!d.includes('.') && h !== d) return false;
  return h === d || h.endsWith(`.${d}`);
}

/**
 * The cookies as JSON (the shape read back by `parseCookies`).
 *
 * @param {Cookie[]} cookies
 * @returns {string}
 */
export function toJson(cookies) {
  return JSON.stringify(
    cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      hostOnly: c.hostOnly,
      path: c.path,
      expires: c.expires ? c.expires.toISOString() : null,
      session: c.session,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
      partitioned: c.partitioned,
    })),
    null,
    2,
  );
}

/**
 * The cookies as a `Cookie` request header value.
 *
 * @param {Cookie[]} cookies
 * @returns {string}
 */
export function toCookieHeader(cookies) {
  return cookies.map((c) => (c.name ? `${c.name}=${c.value}` : c.value)).join('; ');
}
