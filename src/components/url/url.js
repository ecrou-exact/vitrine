// @ts-check
/**
 * URLs taken apart and checked: scheme, credentials, host (with punycode decoded and
 * look-alike characters found), registered domain, port, path, decoded query parameters and
 * fragment, and the URLs hidden in parameters (redirects, base64). Nothing is fetched or
 * resolved: everything is read from the text.
 *
 * @module components/url/url
 */
import { ipNote, isIpv6, refang } from '../ioc/ioc.js';

/** Longest URL read (characters). */
export const MAX_URL = 16384;
/** Most URLs read from one content. */
export const MAX_URLS = 200;
/** Most query parameters read from one URL. */
const MAX_PARAMS = 500;
/** How deep URLs hidden in parameters are followed. */
const MAX_DEPTH = 3;

/**
 * @typedef {"danger" | "warning" | "info"} Level
 * @typedef {{ id: string, level: Level, params: Record<string, string | number> }} Finding
 * @typedef {{ name: string, value: string, raw: string, tracking: boolean }} Param
 * @typedef {object} UrlParts
 * @property {string} scheme - Lowercase, without `:`.
 * @property {boolean} hierarchical - `false` for `mailto:`, `data:`, `javascript:`…
 * @property {string} username - Decoded.
 * @property {string} password - Decoded.
 * @property {string} rawHost - The host as written.
 * @property {string} host - The host as a browser reads it (lowercase, punycode, IPv4 normalized).
 * @property {string} hostUnicode - The host with punycode decoded.
 * @property {string} domain - The registered domain (an approximation of the Public Suffix List).
 * @property {string} subdomain - What comes before the registered domain.
 * @property {string} suffix - The public suffix (`com`, `co.uk`, `github.io`…).
 * @property {"domain" | "ipv4" | "ipv6" | ""} hostType
 * @property {string} port - Only when it is not the default one.
 * @property {string} path - Decoded; for opaque URLs, everything after the scheme.
 * @property {string[]} segments - Decoded path segments.
 * @property {Param[]} query
 * @property {string} fragment - Decoded.
 * @property {string} href - The URL as a browser reads it.
 * @typedef {object} Analysis
 * @property {boolean} ok - `false` when the text is not a URL.
 * @property {string} input - The text read.
 * @property {UrlParts | null} parts
 * @property {Finding[]} findings - Most severe first.
 * @property {"danger" | "warning" | "none"} verdict
 * @property {{ param: string, encoding: string, analysis: Analysis }[]} nested - URLs hidden in
 *   parameters or the fragment.
 */

/** Zero-width characters, bidirectional controls and soft hyphens. */
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff\u00ad]/;

/** Schemes that run code or read local data when opened. */
const DANGEROUS_SCHEMES = new Set(['javascript', 'vbscript', 'data', 'file', 'blob']);
const SPECIAL_SCHEMES = new Set(['http', 'https', 'ftp', 'ws', 'wss']);
const DEFAULT_PORTS = /** @type {Record<string, string>} */ ({ http: '80', https: '443', ftp: '21', ws: '80', wss: '443' }); // prettier-ignore

/** Public suffixes of two labels or more that are common (an extract of the Public Suffix List). */
const MULTI_SUFFIXES = new Set(
  (
    'co.uk org.uk ac.uk gov.uk me.uk net.uk ltd.uk plc.uk com.au net.au org.au edu.au gov.au ' +
    'co.nz org.nz net.nz co.jp ne.jp or.jp ac.jp go.jp co.kr or.kr com.br net.br org.br gov.br ' +
    'com.cn net.cn org.cn gov.cn com.hk com.tw com.sg com.my com.mx com.ar com.co com.pe ' +
    'com.tr com.ua com.ru com.pl co.in net.in org.in gov.in co.za org.za co.il co.id ac.id ' +
    'com.eg com.sa com.vn com.ph com.pk com.ng co.ke gouv.fr asso.fr com.es'
  ).split(' '),
);

/** Suffixes where anyone can publish a site (private part of the Public Suffix List). */
const SHARED_HOSTS = new Set(
  (
    'github.io gitlab.io pages.dev workers.dev r2.dev web.app firebaseapp.com netlify.app ' +
    'vercel.app herokuapp.com azurewebsites.net blob.core.windows.net web.core.windows.net ' +
    'appspot.com blogspot.com wixsite.com weebly.com glitch.me repl.co replit.app ' +
    '000webhostapp.com ngrok.io ngrok-free.app ngrok.app trycloudflare.com duckdns.org ' +
    'no-ip.org ddns.net hopto.org serveo.net loca.lt onrender.com fly.dev surge.sh ' +
    'webflow.io framer.app notion.site sites.google.com godaddysites.com square.site ' +
    'translate.goog ipfs.io dweb.link cloudfront.net s3.amazonaws.com amplifyapp.com'
  ).split(' '),
);

/** Link shorteners: the destination is not in the URL. */
const SHORTENERS = new Set(
  (
    'bit.ly t.co tinyurl.com goo.gl ow.ly is.gd buff.ly rebrand.ly cutt.ly shorturl.at rb.gy ' +
    'tiny.cc lnkd.in s.id t.ly v.gd bl.ink short.io qrco.de tiny.one shorturl.com x.co ' +
    'soo.gd clck.ru u.to t.me/s urlz.fr git.io'
  ).split(' '),
);

/** Parameters that only track the visit: removed from the clean URL. */
const TRACKING = new Set(
  (
    'utm_source utm_medium utm_campaign utm_term utm_content utm_id utm_name fbclid gclid ' +
    'dclid gbraid wbraid gclsrc msclkid mc_cid mc_eid _hsenc _hsmi igshid yclid twclid ttclid ' +
    'li_fat_id mkt_tok oly_anon_id oly_enc_id rb_clickid s_cid vero_id wickedid _ga _gl ' +
    'ref_src spm scid epik'
  ).split(' '),
);

/** File extensions that install or run something when opened. */
const RUNNABLE = new Set(
  (
    'exe scr msi msix bat cmd com pif ps1 vbs vbe js jse wsf hta lnk jar apk dmg pkg iso img ' +
    'vhd vhdx one appx appinstaller reg cpl xll docm xlsm pptm'
  ).split(' '),
);

/** Top-level domains often seen inside a subdomain to imitate another site. */
const TLD_LABELS = new Set('com net org gov edu co io info biz fr de uk us ca eu'.split(' '));

/** Characters of other scripts that look like Latin letters (from Unicode confusables). */
const CONFUSABLES = /** @type {Record<string, string>} */ ({
  // Cyrillic
  а: 'a', в: 'b', е: 'e', ё: 'e', г: 'r', һ: 'h', і: 'i', ї: 'i', ј: 'j', к: 'k', ӏ: 'l', м: 'm',
  н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', ѕ: 's', ԁ: 'd', ԛ: 'q', ԝ: 'w', ь: 'b',
  п: 'n', ɡ: 'g', ү: 'y', ҽ: 'e', ӄ: 'k', ԍ: 'g',
  // Greek
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u',
  χ: 'x', ω: 'w', ϲ: 'c', ϳ: 'j',
  // Armenian
  օ: 'o', ս: 'u', հ: 'h', ո: 'n', ց: 'g', զ: 'q', ա: 'w',
  // Latin look-alikes
  ı: 'i', ɑ: 'a', ɩ: 'i', ʟ: 'l', ɴ: 'n', ꞵ: 'b', ǀ: 'l', ⅼ: 'l', ⅰ: 'i',
}); // prettier-ignore

/**
 * @param {string} text
 * @returns {string}
 */
function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * @param {string} text
 * @returns {string} A query value: `+` is a space.
 */
function decodeQuery(text) {
  return safeDecode(text.replace(/\+/g, ' '));
}

// ---------------------------------------------------------------- punycode

const BASE = 36;

/**
 * @param {number} delta
 * @param {number} points
 * @param {boolean} first
 * @returns {number}
 */
function adapt(delta, points, first) {
  let k = 0;
  let d = first ? Math.floor(delta / 700) : delta >> 1;
  d += Math.floor(d / points);
  for (; d > ((BASE - 1) * 26) >> 1; k += BASE) d = Math.floor(d / (BASE - 1));
  return Math.floor(k + ((BASE - 1 + 1) * d) / (d + 38));
}

/**
 * Decodes a punycode label without its `xn--` prefix (RFC 3492).
 *
 * @param {string} input
 * @returns {string | null} `null` when it is not valid punycode.
 */
export function punycodeDecode(input) {
  if (input.length > 63) return null;
  /** @type {number[]} */
  const output = [];
  const basic = Math.max(0, input.lastIndexOf('-'));
  for (let j = 0; j < basic; j++) {
    const c = input.charCodeAt(j);
    if (c >= 0x80) return null;
    output.push(c);
  }
  let n = 128;
  let bias = 72;
  let i = 0;
  for (let index = basic > 0 ? basic + 1 : 0; index < input.length;) {
    const old = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) return null;
      const c = input.charCodeAt(index++);
      const digit = c >= 48 && c <= 57 ? c - 22 : c >= 65 && c <= 90 ? c - 65 : c >= 97 && c <= 122 ? c - 97 : BASE; // prettier-ignore
      if (digit >= BASE || digit > Math.floor((0x7fffffff - i) / w)) return null;
      i += digit * w;
      const t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
      if (digit < t) break;
      w *= BASE - t;
    }
    const length = output.length + 1;
    bias = adapt(i - old, length, old === 0);
    n += Math.floor(i / length);
    i %= length;
    if (n > 0x10ffff) return null;
    output.splice(i, 0, n);
    i++;
  }
  return String.fromCodePoint(...output);
}

/**
 * @param {string} host - ASCII host.
 * @returns {string} The host with each `xn--` label decoded.
 */
export function toUnicode(host) {
  return host
    .split('.')
    .map((label) => (/^xn--/i.test(label) ? (punycodeDecode(label.slice(4)) ?? label) : label))
    .join('.');
}

// ---------------------------------------------------------------- look-alikes

/**
 * @param {string} char
 * @returns {string} `latin`, `cyrillic`, `greek`, `armenian`, `other` or `` (not a letter).
 */
function scriptOf(char) {
  if (/[a-z]/i.test(char)) return 'latin';
  if (/\p{Script=Cyrillic}/u.test(char)) return 'cyrillic';
  if (/\p{Script=Greek}/u.test(char)) return 'greek';
  if (/\p{Script=Armenian}/u.test(char)) return 'armenian';
  if (/\p{Script=Latin}/u.test(char)) return 'latin';
  return /\p{L}/u.test(char) ? 'other' : '';
}

/**
 * Checks each label of a Unicode host for characters that imitate Latin letters.
 *
 * @param {string} host - Unicode host.
 * @returns {{ lookalike: string | null, mixed: boolean }} `lookalike`: the ASCII host the
 *   characters imitate; `mixed`: a label mixes Latin with Cyrillic, Greek or Armenian.
 */
export function lookalikes(host) {
  let mixed = false;
  let confusable = false;
  const skeleton = host.split('.').map((label) => {
    const scripts = new Set([...label].map(scriptOf).filter(Boolean));
    const alphabets = [...scripts].filter((s) => s !== 'other');
    if (alphabets.length > 1 && alphabets.includes('latin')) mixed = true;
    return [...label]
      .map((char) => {
        const latin = CONFUSABLES[char];
        if (latin) confusable = true;
        return latin ?? char;
      })
      .join('');
  });
  const ascii = skeleton.join('.');
  return {
    lookalike: confusable && /^[a-z0-9.-]+$/.test(ascii) ? ascii : null,
    mixed,
  };
}

// ---------------------------------------------------------------- domains

/**
 * Splits a host into subdomain, registered domain and public suffix. Uses common suffixes
 * of the Public Suffix List, not the whole list.
 *
 * @param {string} host - ASCII or Unicode host, without port.
 * @returns {{ subdomain: string, domain: string, suffix: string }}
 */
export function splitDomain(host) {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  if (labels.length < 2) return { subdomain: '', domain: host, suffix: '' };
  let size = 1;
  for (let n = Math.min(4, labels.length - 1); n >= 2; n--) {
    const candidate = labels.slice(-n).join('.');
    if (MULTI_SUFFIXES.has(candidate) || SHARED_HOSTS.has(candidate)) {
      size = n;
      break;
    }
  }
  if (labels.length <= size) return { subdomain: '', domain: labels.join('.'), suffix: labels.slice(1).join('.') }; // prettier-ignore
  return {
    subdomain: labels.slice(0, -size - 1).join('.'),
    domain: labels.slice(-size - 1).join('.'),
    suffix: labels.slice(-size).join('.'),
  };
}

/**
 * The registered domain of a host (`www.shop.example.co.uk` → `example.co.uk`).
 *
 * @param {string} host
 * @returns {string}
 */
export function registeredDomain(host) {
  if (/^\[|^\d+(?:\.\d+){3}$/.test(host)) return host;
  return splitDomain(host).domain;
}

/**
 * @param {string} host
 * @returns {string | null} The shared-hosting suffix the host belongs to.
 */
function sharedHost(host) {
  const labels = host.split('.');
  for (let n = Math.min(4, labels.length - 1); n >= 2; n--) {
    const candidate = labels.slice(-n).join('.');
    if (SHARED_HOSTS.has(candidate)) return candidate;
  }
  return null;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isIpv4(value) {
  return /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(value); // prettier-ignore
}

// ---------------------------------------------------------------- parsing

/**
 * @param {string} query - Without `?`.
 * @returns {Param[]}
 */
function parseQuery(query) {
  if (!query) return [];
  return query
    .split('&')
    .slice(0, MAX_PARAMS)
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      const name = decodeQuery(eq < 0 ? pair : pair.slice(0, eq));
      return {
        name,
        value: eq < 0 ? '' : decodeQuery(pair.slice(eq + 1)),
        raw: pair,
        tracking: TRACKING.has(name.toLowerCase()) || /^utm_/i.test(name),
      };
    });
}

/**
 * A URL hidden in a value: plain, percent-encoded twice, base64, or in Proofpoint's encoding.
 *
 * @param {string} value - Decoded once.
 * @returns {{ url: string, encoding: string } | null}
 */
export function hiddenUrl(value) {
  const text = value.trim();
  if (/^(?:https?:)?\/\/[^\s/]/i.test(text)) return { url: text.startsWith('//') ? `https:${text}` : text, encoding: 'plain' }; // prettier-ignore
  const twice = safeDecode(text);
  if (twice !== text && /^https?:\/\/[^\s/]/i.test(twice))
    return { url: twice, encoding: 'percent' };
  // Proofpoint URL Defense v2: https-3A__example.com_path
  if (/^https?-3A__/i.test(text)) {
    const url = safeDecode(text.replace(/_/g, '/').replace(/-([0-9A-F]{2})/g, '%$1'));
    return { url, encoding: 'proofpoint' };
  }
  if (text.length >= 16 && text.length <= 8192 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(text)) {
    try {
      const decoded = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
      if (/^https?:\/\/[\x21-\x7e]+$/.test(decoded)) return { url: decoded, encoding: 'base64' };
    } catch {
      // Not base64.
    }
  }
  return null;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[a-z]{2,}$/i;

/**
 * @param {string} value
 * @returns {boolean} Whether the value is, or encodes in base64, an e-mail address.
 */
function carriesEmail(value) {
  if (EMAIL.test(value)) return true;
  if (value.length < 8 || value.length > 400 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false; // prettier-ignore
  try {
    return EMAIL.test(atob(value));
  } catch {
    return false;
  }
}

/**
 * Reads the parts of a hierarchical URL as written.
 *
 * @param {string} rest - After `scheme:`.
 */
function splitHierarchical(rest) {
  const match = /^\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#([\s\S]*))?$/.exec(rest);
  if (!match) return null;
  const [, authority, path, query = '', fragment = ''] = match;
  const at = authority.lastIndexOf('@');
  const userinfo = at < 0 ? '' : authority.slice(0, at);
  const hostport = at < 0 ? authority : authority.slice(at + 1);
  let host = hostport;
  if (hostport.startsWith('[')) host = hostport.slice(0, hostport.indexOf(']') + 1) || hostport;
  else {
    const colon = hostport.lastIndexOf(':');
    if (colon >= 0 && /^\d*$/.test(hostport.slice(colon + 1))) host = hostport.slice(0, colon);
  }
  const colon = userinfo.indexOf(':');
  return {
    hasUserinfo: at >= 0,
    username: safeDecode(colon < 0 ? userinfo : userinfo.slice(0, colon)),
    password: colon < 0 ? '' : safeDecode(userinfo.slice(colon + 1)),
    host,
    path,
    query,
    fragment,
  };
}

/**
 * @param {Finding[]} findings
 * @param {string} id
 * @param {Level} level
 * @param {Record<string, string | number>} [params]
 */
function add(findings, id, level, params = {}) {
  if (!findings.some((f) => f.id === id)) findings.push({ id, level, params });
}

const RANK = { danger: 0, warning: 1, info: 2 };

/**
 * @param {Finding[]} findings
 * @returns {"danger" | "warning" | "none"}
 */
function verdictOf(findings) {
  if (findings.some((f) => f.level === 'danger')) return 'danger';
  return findings.some((f) => f.level === 'warning') ? 'warning' : 'none';
}

/**
 * @param {string} input
 * @param {Finding[]} findings
 * @returns {Analysis}
 */
function invalid(input, findings) {
  add(findings, 'invalid', 'danger');
  return { ok: false, input, parts: null, findings, verdict: 'danger', nested: [] };
}

/**
 * Takes a URL apart and checks it.
 *
 * @param {string} input
 * @param {number} [depth] - How deep this URL was hidden in another one.
 * @returns {Analysis}
 */
export function analyzeUrl(input, depth = 0) {
  /** @type {Finding[]} */
  const findings = [];
  const raw = input.trim().slice(0, MAX_URL);
  if (input.trim().length > MAX_URL) add(findings, 'long', 'info', { length: input.trim().length });
  if (INVISIBLE.test(raw)) add(findings, 'invisible', 'danger'); // prettier-ignore
  let text = raw.replace(new RegExp(INVISIBLE.source, 'g'), '');
  // eslint-disable-next-line no-control-regex -- control characters are what is looked for
  if (/[\s\u0000-\u001f\u007f]/.test(text)) {
    add(findings, 'whitespace', 'warning');
    text = text.replace(/[\t\n\r]/g, '');
  }
  const refanged = refang(text);
  if (refanged !== text) {
    add(findings, 'defanged', 'info');
    text = refanged;
  }
  if (text.startsWith('//')) text = `https:${text}`;
  else if (
    !/^[a-z][a-z0-9+.-]*:/i.test(text) &&
    /^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?::\d+)?(?:[/?#]|$)/u.test(text)
  ) {
    // prettier-ignore
    add(findings, 'noScheme', 'info');
    text = `http://${text}`;
  }
  const schemeMatch = /^([a-z][a-z0-9+.-]*):([\s\S]*)$/i.exec(text);
  if (!schemeMatch) return invalid(raw, findings);
  const scheme = schemeMatch[1].toLowerCase();
  let rest = schemeMatch[2];

  if (!SPECIAL_SCHEMES.has(scheme)) {
    if (DANGEROUS_SCHEMES.has(scheme)) {
      const mime = scheme === 'data' ? /^([^;,]*)/.exec(rest)?.[1] || 'text/plain' : '';
      add(findings, scheme === 'data' ? 'dataUrl' : 'scheme', 'danger', { scheme, mime });
    } else add(findings, 'opaque', 'info', { scheme });
    const parts = opaqueParts(scheme, rest);
    return finish(raw, parts, findings, []);
  }

  if (rest.includes('\\')) {
    add(findings, 'backslash', 'warning');
    rest = rest.replace(/\\/g, '/');
  }
  if (!rest.startsWith('//')) rest = `//${rest.replace(/^\/*/, '')}`;
  const written = splitHierarchical(rest);
  /** @type {URL} */
  let url;
  try {
    url = new URL(`${scheme}:${rest}`);
  } catch {
    return invalid(raw, findings);
  }
  if (!written || !url.hostname) return invalid(raw, findings);

  const host = url.hostname.toLowerCase();
  const bare = host.replace(/^\[|\]$/g, '');
  const hostType = isIpv4(host) ? 'ipv4' : isIpv6(bare) ? 'ipv6' : 'domain';
  const hostUnicode = hostType === 'domain' ? toUnicode(host) : host;
  const split = hostType === 'domain' ? splitDomain(hostUnicode) : { subdomain: '', domain: host, suffix: '' }; // prettier-ignore
  const query = parseQuery(url.search.slice(1));
  const port = url.port && url.port !== DEFAULT_PORTS[scheme] ? url.port : '';
  /** @type {UrlParts} */
  const parts = {
    scheme,
    hierarchical: true,
    username: written.username,
    password: written.password,
    rawHost: written.host,
    host,
    hostUnicode,
    domain: split.domain,
    subdomain: split.subdomain,
    suffix: split.suffix,
    hostType,
    port,
    path: safeDecode(url.pathname),
    segments: url.pathname.split('/').filter(Boolean).map(safeDecode),
    query,
    fragment: safeDecode(url.hash.slice(1)),
    href: url.href,
  };

  if (!findings.some((f) => f.id === 'noScheme')) checkScheme(parts, findings);
  checkCredentials(parts, written.hasUserinfo, findings);
  checkHost(parts, findings);
  checkPath(parts, `${written.path}?${written.query}`, findings);
  const nested = depth < MAX_DEPTH ? hiddenUrls(parts, findings, depth) : [];
  checkQuery(parts, findings);
  if (port) add(findings, 'port', 'info', { port });
  return finish(raw, parts, findings, nested);
}

/**
 * @param {string} raw
 * @param {UrlParts} parts
 * @param {Finding[]} findings
 * @param {Analysis['nested']} nested
 * @returns {Analysis}
 */
function finish(raw, parts, findings, nested) {
  findings.sort((a, b) => RANK[a.level] - RANK[b.level]);
  return { ok: true, input: raw, parts, findings, verdict: verdictOf(findings), nested };
}

/**
 * @param {string} scheme
 * @param {string} rest
 * @returns {UrlParts}
 */
function opaqueParts(scheme, rest) {
  const shown = scheme === 'data' ? rest.slice(0, 200) : safeDecode(rest);
  return {
    scheme,
    hierarchical: false,
    username: '',
    password: '',
    rawHost: '',
    host: '',
    hostUnicode: '',
    domain: '',
    subdomain: '',
    suffix: '',
    hostType: '',
    port: '',
    path: shown,
    segments: [],
    query: [],
    fragment: '',
    href: `${scheme}:${rest}`,
  };
}

/**
 * @param {UrlParts} parts
 * @param {Finding[]} findings
 */
function checkScheme(parts, findings) {
  if (parts.scheme === 'http' || parts.scheme === 'ws')
    add(findings, 'http', 'warning', { scheme: parts.scheme }); // prettier-ignore
  else if (parts.scheme === 'ftp') add(findings, 'ftp', 'info');
}

/**
 * @param {UrlParts} parts
 * @param {boolean} present
 * @param {Finding[]} findings
 */
function checkCredentials(parts, present, findings) {
  if (!present) return;
  // https://www.bank.example@evil.example/ opens evil.example.
  if (/\.[a-z]{2,}/i.test(parts.username) || /\.[a-z]{2,}/i.test(parts.password))
    add(findings, 'userinfoHost', 'danger', { fake: parts.username, host: parts.hostUnicode });
  else add(findings, 'credentials', 'warning');
}

/**
 * @param {UrlParts} parts
 * @param {Finding[]} findings
 */
function checkHost(parts, findings) {
  const { host, hostUnicode, rawHost } = parts;
  if (parts.hostType === 'ipv4' || parts.hostType === 'ipv6') {
    const bare = host.replace(/^\[|\]$/g, '');
    const written = safeDecode(rawHost)
      .toLowerCase()
      .replace(/^\[|\]$/g, '');
    if (parts.hostType === 'ipv4' && written !== bare)
      add(findings, 'ipObfuscated', 'danger', { written, ip: bare }); // prettier-ignore
    else add(findings, 'ipHost', 'warning', { ip: bare });
    const note = ipNote(parts.hostType, bare);
    if (note) add(findings, 'ipSpecial', 'info', { note });
    return;
  }
  if (/%[0-9a-f]{2}/i.test(rawHost)) add(findings, 'encodedHost', 'warning');
  if (host.split('.').some((l) => l.startsWith('xn--'))) {
    add(findings, 'punycode', 'warning', { unicode: hostUnicode });
    const { lookalike, mixed } = lookalikes(hostUnicode);
    if (lookalike) add(findings, 'homograph', 'danger', { lookalike });
    else if (mixed) add(findings, 'mixedScript', 'danger');
  }
  const sub = parts.subdomain ? parts.subdomain.split('.') : [];
  const tld = sub.findIndex((label, i) => i > 0 && TLD_LABELS.has(label));
  if (tld > 0)
    add(findings, 'deceptiveSubdomain', 'danger', { fake: sub.slice(0, tld + 1).join('.'), domain: parts.domain }); // prettier-ignore
  else if (sub.length >= 4) add(findings, 'deepSubdomain', 'warning', { count: sub.length });
  const name = parts.domain.split('.')[0] ?? '';
  if ((name.match(/-/g) ?? []).length >= 3) add(findings, 'hyphens', 'info');
  if (SHORTENERS.has(host.replace(/^www\./, ''))) add(findings, 'shortener', 'warning');
  const shared = sharedHost(host);
  if (shared) add(findings, 'sharedHost', 'info', { suffix: shared });
}

/**
 * @param {UrlParts} parts
 * @param {string} written - Path and query as written.
 * @param {Finding[]} findings
 */
function checkPath(parts, written, findings) {
  if (/%25[0-9a-f]{2}/i.test(written)) add(findings, 'doubleEncoded', 'warning');
  const last = parts.segments.at(-1) ?? '';
  const ext = /\.([a-z0-9]{2,12})$/i.exec(last)?.[1]?.toLowerCase();
  if (ext && RUNNABLE.has(ext)) add(findings, 'download', 'warning', { ext, file: last });
}

/**
 * @param {UrlParts} parts
 * @param {Finding[]} findings
 */
function checkQuery(parts, findings) {
  const tracking = parts.query.filter((p) => p.tracking).map((p) => p.name);
  if (tracking.length) add(findings, 'tracking', 'info', { params: [...new Set(tracking)].join(', ') }); // prettier-ignore
  const fragmentValues = fragmentParams(parts.fragment).map((p) => ({ name: `#${p.name}`, value: p.value })); // prettier-ignore
  for (const p of [...parts.query, ...fragmentValues, { name: '#', value: parts.fragment }]) {
    if (p.value && carriesEmail(p.value)) {
      add(findings, 'email', 'warning', { param: p.name });
      break;
    }
  }
}

/**
 * @param {string} fragment
 * @returns {{ name: string, value: string }[]}
 */
function fragmentParams(fragment) {
  if (!fragment.includes('=')) return [];
  // `#/route?a=1` (single-page apps) or `#a=1`.
  const query = fragment.includes('?') ? fragment.slice(fragment.indexOf('?') + 1) : fragment;
  return parseQuery(query.replace(/^[!/]+/, ''));
}

/**
 * @param {UrlParts} parts
 * @param {Finding[]} findings
 * @param {number} depth
 * @returns {Analysis['nested']}
 */
function hiddenUrls(parts, findings, depth) {
  /** @type {Analysis['nested']} */
  const nested = [];
  const candidates = [
    ...parts.query.map((p) => ({ param: p.name, value: p.value })),
    ...fragmentParams(parts.fragment).map((p) => ({ param: `#${p.name}`, value: p.value })),
    { param: '#', value: parts.fragment },
  ];
  for (const { param, value } of candidates) {
    if (nested.length >= 5) break;
    const found = value ? hiddenUrl(value) : null;
    if (!found) continue;
    const analysis = analyzeUrl(found.url, depth + 1);
    if (!analysis.ok) continue;
    nested.push({ param, encoding: found.encoding, analysis });
    const other = analysis.parts && analysis.parts.domain !== parts.domain;
    add(findings, found.encoding === 'plain' ? 'redirect' : 'redirectEncoded', other ? 'warning' : 'info', { param, encoding: found.encoding, domain: analysis.parts?.domain ?? '' }); // prettier-ignore
  }
  return nested;
}

// ---------------------------------------------------------------- lists and output

/**
 * Reads one URL per line (blank lines and `#` comments ignored).
 *
 * @param {string} text
 * @returns {{ urls: string[], capped: boolean }}
 */
export function readUrls(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('# '));
  return { urls: lines.slice(0, MAX_URLS), capped: lines.length > MAX_URLS };
}

/**
 * The URL without its tracking parameters.
 *
 * @param {UrlParts} parts
 * @returns {string}
 */
export function cleanUrl(parts) {
  if (!parts.hierarchical || !parts.query.some((p) => p.tracking)) return parts.href;
  try {
    const url = new URL(parts.href);
    url.search = parts.query
      .filter((p) => !p.tracking)
      .map((p) => p.raw)
      .join('&');
    return url.href;
  } catch {
    return parts.href;
  }
}

/**
 * The URL made safe to paste: `hxxps[://]example[.]com/…`.
 *
 * @param {string} url
 * @returns {string}
 */
export function defangUrl(url) {
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([\s\S]*)$/i.exec(url);
  if (!match) return url.replace(/^javascript:/i, 'javascript[:]').replace(/^data:/i, 'data[:]');
  const scheme = match[1].toLowerCase().replace(/^http/, 'hxxp').replace(/^ftp/, 'fxp');
  return `${scheme}[://]${match[2].replace(/\./g, '[.]')}${match[3]}`;
}

/**
 * Summary of a redirect chain: the domains crossed and whether HTTPS is dropped on the way.
 *
 * @param {Analysis[]} steps
 * @returns {{ domains: string[], downgrade: number }} `downgrade`: 1-based index of the first
 *   step that goes from HTTPS to HTTP, or 0.
 */
export function chainSummary(steps) {
  /** @type {string[]} */
  const domains = [];
  let downgrade = 0;
  steps.forEach((step, i) => {
    const domain = step.parts?.domain;
    if (domain && domains.at(-1) !== domain) domains.push(domain);
    const previous = steps[i - 1]?.parts?.scheme;
    if (!downgrade && previous === 'https' && step.parts?.scheme === 'http') downgrade = i + 1;
  });
  return { domains, downgrade };
}
