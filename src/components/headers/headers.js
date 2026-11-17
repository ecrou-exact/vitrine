// @ts-check
/**
 * HTTP security headers: reading a response (raw headers, `curl -I` or `curl -v` output, or a
 * Content-Security-Policy alone), checking each security header, the cookies, the CORS
 * headers and what the server tells about itself, and a grade.
 *
 * @module components/headers/headers
 */

/**
 * @typedef {{ name: string, value: string }} Header
 * @typedef {'bad' | 'warn' | 'info' | 'ok'} Level
 * @typedef {{ id: string, level: Level, header: string, params?: Record<string, string | number> }} Finding
 * @typedef {{ name: string, sources: string[] }} Directive
 * @typedef {'A+' | 'A' | 'B' | 'C' | 'D' | 'F'} Grade
 * @typedef {{ status: string | null, headers: Header[], cspOnly: boolean }} Response
 */

/** Most header lines read. */
const MAX_HEADERS = 500;

/** HSTS max-age below which a warning is shown: 180 days. */
export const HSTS_MIN_AGE = 15552000;

const TOKEN = /^([!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}):[ \t]*(.*)$/;

/**
 * Reads the headers of the last response in a text: raw headers, `curl -I` (redirects
 * included: the last response is kept), `curl -v` (`<` lines), or a Content-Security-Policy
 * value alone.
 *
 * @param {string} text
 * @returns {Response}
 */
export function parseResponse(text) {
  const lines = String(text ?? '').split(/\r\n|\r|\n/);
  const verbose = lines.some((line) => /^< /.test(line));
  /** @type {Header[]} */
  let headers = [];
  /** @type {string | null} */
  let status = null;
  for (let raw of lines) {
    if (verbose) {
      if (!/^< ?/.test(raw)) continue;
      raw = raw.replace(/^< ?/, '');
    }
    if (/^HTTP\/\d(?:\.\d)? +\d{3}/.test(raw)) {
      // A new response (after a redirect or a 100 Continue): start again.
      status = raw.trim();
      headers = [];
      continue;
    }
    if (/^[ \t]+\S/.test(raw) && headers.length) {
      headers[headers.length - 1].value += ` ${raw.trim()}`;
      continue;
    }
    const match = TOKEN.exec(raw.trim());
    if (match && headers.length < MAX_HEADERS)
      headers.push({ name: match[1].toLowerCase(), value: match[2].trim() });
  }
  const trimmed = String(text ?? '').trim();
  if (
    !headers.length &&
    /(?:^|;)\s*(?:default-src|script-src|style-src|object-src|base-uri|frame-ancestors|upgrade-insecure-requests)\b/i.test(
      trimmed,
    )
  )
    // prettier-ignore
    return {
      status: null,
      headers: [{ name: 'content-security-policy', value: trimmed.replace(/\s+/g, ' ') }],
      cspOnly: true,
    };
  return { status, headers, cspOnly: false };
}

/**
 * @param {Header[]} headers
 * @param {string} name
 * @returns {string | null} The first value of a header, `null` when absent.
 */
function get(headers, name) {
  return headers.find((header) => header.name === name)?.value ?? null;
}

/**
 * Directives of a policy. When a directive appears twice, browsers use the first.
 *
 * @param {string} policy
 * @returns {Directive[]}
 */
export function parseCsp(policy) {
  /** @type {Directive[]} */
  const directives = [];
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (!name) continue;
    const lower = name.toLowerCase();
    if (directives.some((d) => d.name === lower)) continue;
    directives.push({ name: lower, sources });
  }
  return directives;
}

/** Fetch directives that fall back to default-src. */
const FALLBACK = new Set(['script-src', 'style-src', 'img-src', 'connect-src', 'font-src', 'object-src', 'media-src', 'frame-src', 'child-src', 'worker-src', 'manifest-src']); // prettier-ignore

/**
 * The sources that apply to a fetch directive: its own, or those of default-src.
 *
 * @param {Directive[]} directives
 * @param {string} name
 * @returns {string[] | null} `null` when neither is set.
 */
export function effectiveSources(directives, name) {
  const own = directives.find((d) => d.name === name);
  if (own) return own.sources;
  if (FALLBACK.has(name)) return directives.find((d) => d.name === 'default-src')?.sources ?? null;
  return null;
}

/**
 * Kind of a source expression, for coloring and checks.
 *
 * @param {string} source
 * @returns {'keyword' | 'nonce' | 'hash' | 'scheme' | 'wildcard' | 'host'}
 */
export function sourceKind(source) {
  const s = source.toLowerCase();
  if (/^'nonce-/.test(s)) return 'nonce';
  if (/^'sha(?:256|384|512)-/.test(s)) return 'hash';
  if (/^'.*'$/.test(s)) return 'keyword';
  if (s === '*') return 'wildcard';
  if (/^[a-z][a-z0-9+.-]*:$/.test(s)) return 'scheme';
  return 'host';
}

/**
 * Whether a source lets any site's script run: `*`, a whole scheme, or a wildcard host.
 *
 * @param {string} source
 */
export function isUnsafeSource(source) {
  const s = source.toLowerCase();
  return s === '*' || s === 'http:' || s === 'https:' || s === 'data:' || s === 'blob:' || /^(?:https?:\/\/)?\*(?::\d+|:\*)?$/.test(s); // prettier-ignore
}

/**
 * Checks a Content-Security-Policy.
 *
 * @param {string} policy
 * @param {string} header - The header it came from.
 * @returns {Finding[]}
 */
export function checkCsp(policy, header = 'content-security-policy') {
  /** @type {Finding[]} */
  const findings = [];
  const directives = parseCsp(policy);
  const script = effectiveSources(directives, 'script-src');
  const lower = (script ?? []).map((s) => s.toLowerCase());
  const strict = lower.some((s) => /^'(?:nonce-|sha(?:256|384|512)-|strict-dynamic')/.test(s));
  if (!script) findings.push({ id: 'cspNoScriptSrc', level: 'bad', header });
  else {
    if (lower.includes("'unsafe-inline'") && !strict)
      findings.push({ id: 'cspUnsafeInline', level: 'bad', header });
    if (lower.includes("'unsafe-eval'")) findings.push({ id: 'cspUnsafeEval', level: 'warn', header });
    const unsafe = script.filter(isUnsafeSource);
    if (unsafe.length && !lower.includes("'strict-dynamic'"))
      findings.push({ id: 'cspWildcard', level: 'bad', header, params: { source: unsafe.join(' ') } });
  } // prettier-ignore
  const object = effectiveSources(directives, 'object-src');
  if (!object || !(object.length === 1 && object[0].toLowerCase() === "'none'"))
    findings.push({ id: 'cspObjectSrc', level: 'warn', header });
  if (!directives.some((d) => d.name === 'base-uri'))
    findings.push({ id: 'cspBaseUri', level: 'warn', header });
  if (!findings.length) findings.push({ id: 'cspOk', level: 'ok', header });
  return findings;
}

/**
 * @param {string} cookie - A Set-Cookie value.
 * @param {boolean} https
 * @returns {Finding[]}
 */
export function checkCookie(cookie, https) {
  const [pair, ...rest] = cookie.split(';');
  const name = pair.split('=')[0].trim();
  /** @type {Map<string, string>} */
  const attributes = new Map();
  for (const item of rest) {
    const [key, ...value] = item.split('=');
    if (key.trim()) attributes.set(key.trim().toLowerCase(), value.join('=').trim());
  }
  const header = 'set-cookie';
  /** @type {Finding[]} */
  const findings = [];
  const secure = attributes.has('secure');
  const sameSite = attributes.get('samesite')?.toLowerCase();
  if (https && !secure) findings.push({ id: 'cookieSecure', level: 'warn', header, params: { name } }); // prettier-ignore
  if (!attributes.has('httponly')) findings.push({ id: 'cookieHttpOnly', level: 'info', header, params: { name } }); // prettier-ignore
  if (sameSite === 'none' && !secure)
    findings.push({ id: 'cookieSameSiteNone', level: 'bad', header, params: { name } });
  else if (!sameSite) findings.push({ id: 'cookieSameSite', level: 'info', header, params: { name } }); // prettier-ignore
  if (/^__host-/i.test(name) && (!secure || attributes.has('domain') || attributes.get('path') !== '/'))
    findings.push({ id: 'cookieHostPrefix', level: 'bad', header, params: { name } });
  else if (/^__secure-/i.test(name) && !secure)
    findings.push({ id: 'cookieSecurePrefix', level: 'bad', header, params: { name } }); // prettier-ignore
  if (!findings.length) findings.push({ id: 'cookieOk', level: 'ok', header, params: { name } });
  return findings;
}

/**
 * Checks a response.
 *
 * @param {Response} response
 * @param {{ https?: boolean }} [options] - `https`: the response is served over HTTPS (default).
 * @returns {Finding[]}
 */
export function analyze(response, { https = true } = {}) {
  const headers = response.headers;
  if (response.cspOnly) return checkCsp(headers[0].value);
  /** @type {Finding[]} */
  const findings = [];
  /**
   * @param {string} id
   * @param {Level} level
   * @param {string} header
   * @param {Record<string, string | number>} [params]
   */
  const add = (id, level, header, params) => findings.push({ id, level, header, ...(params ? { params } : {}) }); // prettier-ignore

  // Strict-Transport-Security
  const hsts = get(headers, 'strict-transport-security');
  if (https) {
    if (hsts === null) add('hstsMissing', 'bad', 'strict-transport-security');
    else {
      const age = /(?:^|;)\s*max-age\s*=\s*"?(\d{1,12})"?/i.exec(hsts);
      if (!age) add('hstsInvalid', 'bad', 'strict-transport-security');
      else if (Number(age[1]) < HSTS_MIN_AGE)
        add('hstsShort', 'warn', 'strict-transport-security', { days: Math.floor(Number(age[1]) / 86400) }); // prettier-ignore
      else add('hstsOk', 'ok', 'strict-transport-security', { days: Math.floor(Number(age[1]) / 86400) }); // prettier-ignore
    }
  }

  // Content-Security-Policy
  const csp = get(headers, 'content-security-policy');
  const cspReport = get(headers, 'content-security-policy-report-only');
  if (csp !== null) findings.push(...checkCsp(csp));
  else if (cspReport !== null) add('cspReportOnly', 'warn', 'content-security-policy-report-only');
  else add('cspMissing', 'bad', 'content-security-policy');

  // Framing
  const xfo = get(headers, 'x-frame-options');
  const ancestors = csp !== null && parseCsp(csp).some((d) => d.name === 'frame-ancestors');
  if (xfo !== null && /^allow-from/i.test(xfo.trim()))
    add('xfoAllowFrom', ancestors ? 'info' : 'warn', 'x-frame-options'); // prettier-ignore
  else if (xfo !== null && !/^(?:deny|sameorigin)$/i.test(xfo.trim()))
    add('xfoInvalid', ancestors ? 'info' : 'warn', 'x-frame-options'); // prettier-ignore
  else if (xfo === null && !ancestors) add('framingMissing', 'warn', 'x-frame-options');
  else add('framingOk', 'ok', ancestors ? 'content-security-policy' : 'x-frame-options');

  // X-Content-Type-Options
  const xcto = get(headers, 'x-content-type-options');
  if (xcto === null) add('xctoMissing', 'warn', 'x-content-type-options');
  else if (xcto.trim().toLowerCase() !== 'nosniff')
    add('xctoInvalid', 'warn', 'x-content-type-options'); // prettier-ignore
  else add('xctoOk', 'ok', 'x-content-type-options');

  // Referrer-Policy (the last valid token wins)
  const referrer = get(headers, 'referrer-policy');
  const policy = referrer?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).at(-1); // prettier-ignore
  if (!policy) add('referrerMissing', 'info', 'referrer-policy');
  else if (policy === 'unsafe-url' || policy === 'no-referrer-when-downgrade')
    add('referrerUnsafe', 'warn', 'referrer-policy', { value: policy });
  else add('referrerOk', 'ok', 'referrer-policy', { value: policy });

  // Permissions-Policy and cross-origin isolation
  if (get(headers, 'permissions-policy') === null)
    add('permissionsMissing', 'info', 'permissions-policy'); // prettier-ignore
  else add('permissionsOk', 'ok', 'permissions-policy');
  if (get(headers, 'cross-origin-opener-policy') === null)
    add('coopMissing', 'info', 'cross-origin-opener-policy'); // prettier-ignore
  else add('coopOk', 'ok', 'cross-origin-opener-policy');

  // Cookies
  for (const header of headers)
    if (header.name === 'set-cookie') findings.push(...checkCookie(header.value, https));

  // CORS
  const origin = get(headers, 'access-control-allow-origin');
  const credentials = get(headers, 'access-control-allow-credentials')?.trim().toLowerCase() === 'true'; // prettier-ignore
  if (origin?.trim() === '*' && credentials) add('corsCredentials', 'bad', 'access-control-allow-origin'); // prettier-ignore
  else if (origin?.trim() === '*') add('corsWildcard', 'info', 'access-control-allow-origin');
  else if (origin?.trim().toLowerCase() === 'null') add('corsNull', 'warn', 'access-control-allow-origin'); // prettier-ignore

  // What the server tells about itself
  const server = get(headers, 'server');
  if (server !== null && /\d/.test(server))
    add('serverVersion', 'warn', 'server', { value: server });
  for (const name of ['x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version', 'x-generator']) {
    const value = get(headers, name);
    if (value !== null) add('poweredBy', 'warn', name, { value });
  }

  // Obsolete headers
  const xxss = get(headers, 'x-xss-protection');
  if (xxss !== null && xxss.trim() !== '0') add('xxssEnabled', 'warn', 'x-xss-protection');
  if (get(headers, 'public-key-pins') !== null) add('hpkp', 'info', 'public-key-pins');
  if (get(headers, 'expect-ct') !== null) add('expectCt', 'info', 'expect-ct');

  return findings;
}

/** @type {Record<Level, number>} */
const ORDER = { bad: 0, warn: 1, info: 2, ok: 3 };

/**
 * Most severe first, keeping the order of the checks within a level.
 *
 * @param {Finding[]} findings
 * @returns {Finding[]}
 */
export function sortFindings(findings) {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => ORDER[a.finding.level] - ORDER[b.finding.level] || a.index - b.index)
    .map(({ finding }) => finding);
}

/**
 * A+ without problems or warnings; A with up to 2 warnings; B with more; then C, D and F
 * for 1, 2, and 3 or more problems.
 *
 * @param {Finding[]} findings
 * @returns {Grade}
 */
export function grade(findings) {
  const bad = findings.filter((f) => f.level === 'bad').length;
  const warn = findings.filter((f) => f.level === 'warn').length;
  if (bad >= 3) return 'F';
  if (bad === 2) return 'D';
  if (bad === 1) return 'C';
  if (warn > 2) return 'B';
  return warn ? 'A' : 'A+';
}
