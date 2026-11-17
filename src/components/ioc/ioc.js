// @ts-check
/**
 * Indicators of compromise: extraction from free text (refanged first), classification,
 * defanging and export as text, CSV, STIX 2.1 or a MISP event.
 *
 * Every regular expression is linear: bounded repetitions, no nested unbounded quantifiers.
 *
 * @module components/ioc/ioc
 */

/**
 * @typedef {'url' | 'domain' | 'ipv4' | 'ipv6' | 'email' | 'md5' | 'sha1' | 'sha256' | 'sha512' | 'cve' | 'attack'} IocType
 * @typedef {'private' | 'loopback' | 'link-local' | 'shared' | 'multicast' | 'reserved' | null} IpNote
 * @typedef {{ type: IocType, value: string, count: number, line: number, note: IpNote }} Indicator
 */

/** @type {readonly IocType[]} */
export const TYPES = Object.freeze([
  'url', 'domain', 'ipv4', 'ipv6', 'email', 'md5', 'sha1', 'sha256', 'sha512', 'cve', 'attack',
]); // prettier-ignore

/** Most distinct indicators kept. */
export const MAX_INDICATORS = 10000;

/** Longest line read; longer lines are cut (minified files, base64 blobs). */
const MAX_LINE = 20000;

/** Generic top-level domains accepted besides two-letter country codes. */
const GENERIC_TLDS = new Set(
  (
    'com net org info biz edu gov mil int arpa io co app dev xyz top online site club shop store ' +
    'tech cloud live life pro mobi name page link click work world email space website today ' +
    'news blog host press digital network services solutions support center company group ' +
    'agency media software systems security finance bank money market social one icu vip win ' +
    'bid loan men date download review stream racing party science trade cam rest buzz fun ' +
    'monster quest cyou sbs cfd bond onion bit eth crypto'
  ).split(' '),
);

/** Two-letter endings that are much more often file extensions than domains. */
const FILE_LIKE = new Set(['js', 'py', 'ts', 'rb', 'gz', 'xz', 'db', 'cs', 'go', 'md', 'sh', 'pl', 'so', 'ps']); // prettier-ignore

/**
 * Turns defanged text back into indicators: `hxxp`, `[.]`, `(.)`, `[dot]`, `[:]`, `[@]`, `[at]`.
 *
 * @param {string} text
 * @returns {string}
 */
export function refang(text) {
  return text
    .replace(/\bh(?:xx|\*\*|XX)p(s?)(?=\[?:)/g, 'http$1')
    .replace(/\bfxp(?=s?\[?:)/gi, 'ftp')
    .replace(/\[:\/\/\]/g, '://')
    .replace(/\[:\]/g, ':')
    .replace(/\[\.\]|\(\.\)|\{\.\}|\[dot\]|\(dot\)/gi, '.')
    .replace(/\[@\]|\[at\]|\(at\)/gi, '@');
}

/**
 * The defanged form of an indicator, safe to paste in a chat or a ticket: URLs, domains,
 * addresses and e-mail addresses cannot be clicked or resolved by accident.
 *
 * @param {IocType} type
 * @param {string} value
 * @returns {string}
 */
export function defang(type, value) {
  switch (type) {
    case 'url': {
      const match = /^([a-z]+):\/\/([^/?#]*)(.*)$/i.exec(value);
      if (!match) return value;
      const scheme = match[1].toLowerCase().replace(/^http/, 'hxxp').replace(/^ftp/, 'fxp');
      return `${scheme}[://]${match[2].replace(/\./g, '[.]')}${match[3]}`;
    }
    case 'domain':
    case 'ipv4':
      return value.replace(/\./g, '[.]');
    case 'ipv6':
      return value.replace(/:/g, '[:]');
    case 'email': {
      const at = value.lastIndexOf('@');
      return `${value.slice(0, at)}[@]${value.slice(at + 1).replace(/\./g, '[.]')}`;
    }
    default:
      return value;
  }
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isIpv4(value) {
  const [address, prefix] = value.split('/');
  if (prefix !== undefined && (!/^\d{1,2}$/.test(prefix) || Number(prefix) > 32)) return false;
  const parts = address.split('.');
  return parts.length === 4 && parts.every((p) => /^(?:0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255); // prettier-ignore
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isIpv6(value) {
  if (value.length > 39 || value.length < 2) return false;
  const halves = value.split('::');
  if (halves.length > 2) return false;
  const groups = halves.flatMap((half) => (half ? half.split(':') : []));
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return false;
  return halves.length === 2 ? groups.length <= 7 : groups.length === 8;
}

/**
 * Private, loopback and other special-purpose ranges (RFC 6890).
 *
 * @param {'ipv4' | 'ipv6'} type
 * @param {string} value
 * @returns {IpNote}
 */
export function ipNote(type, value) {
  if (type === 'ipv6') {
    const v = value.toLowerCase();
    if (v === '::1') return 'loopback';
    if (/^fe[89ab]/.test(v)) return 'link-local';
    if (/^f[cd]/.test(v)) return 'private';
    if (/^ff/.test(v)) return 'multicast';
    if (v === '::' || /^2001:db8:/.test(v)) return 'reserved';
    return null;
  }
  const [a, b] = value.split(/[./]/).map(Number);
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
  if (a === 127) return 'loopback';
  if (a === 169 && b === 254) return 'link-local';
  if (a === 100 && b >= 64 && b <= 127) return 'shared';
  if (a >= 224 && a <= 239) return 'multicast';
  if (a === 0 || a >= 240) return 'reserved';
  if (/^(?:192\.0\.2|198\.51\.100|203\.0\.113)\./.test(value)) return 'reserved';
  return null;
}

/**
 * @param {string} domain
 * @returns {boolean}
 */
function acceptedDomain(domain) {
  const tld = domain.slice(domain.lastIndexOf('.') + 1).toLowerCase();
  if (tld.startsWith('xn--')) return true;
  if (tld.length === 2) return !FILE_LIKE.has(tld);
  return GENERIC_TLDS.has(tld);
}

/**
 * Removes punctuation that ends a sentence rather than the URL, and a closing bracket
 * that has no opening one in the URL.
 *
 * @param {string} url
 * @returns {string}
 */
function trimUrl(url) {
  let end = url.length;
  while (end > 0) {
    const c = url[end - 1];
    if ('.,;:!?\'"'.includes(c)) end--;
    else if (c === ')' && !url.slice(0, end).includes('(')) end--;
    else if (c === ']' && !url.slice(0, end).includes('[')) end--;
    else if (c === '}' && !url.slice(0, end).includes('{')) end--;
    else break;
  }
  return url.slice(0, end);
}

const HASH_TYPES = /** @type {Record<number, IocType>} */ ({ 32: 'md5', 40: 'sha1', 64: 'sha256', 128: 'sha512' }); // prettier-ignore

/**
 * Finds every indicator in a text. Defanged indicators are read too. Each indicator is
 * kept once, with how many times it appears and the line where it first appears.
 *
 * @param {string} text
 * @param {{ max?: number }} [options]
 * @returns {{ indicators: Indicator[], capped: boolean }}
 */
export function extract(text, { max = MAX_INDICATORS } = {}) {
  /** @type {Map<string, Indicator>} */
  const found = new Map();
  let capped = false;
  /**
   * @param {IocType} type
   * @param {string} value
   * @param {number} line
   */
  const add = (type, value, line) => {
    const key = `${type} ${value}`;
    const existing = found.get(key);
    if (existing) {
      existing.count++;
      return;
    }
    if (found.size >= max) {
      capped = true;
      return;
    }
    const note = type === 'ipv4' || type === 'ipv6' ? ipNote(type, value) : null;
    found.set(key, { type, value, count: 1, line, note });
  };

  const lines = refang(String(text ?? '')).split(/\r\n|\r|\n/);
  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    let line = raw.length > MAX_LINE ? raw.slice(0, MAX_LINE) : raw;
    /**
     * Blanks out a match so later patterns do not read it again (a domain inside a URL).
     *
     * @param {number} start
     * @param {number} length
     */
    const mask = (start, length) => {
      line = line.slice(0, start) + ' '.repeat(length) + line.slice(start + length);
    };

    for (const match of line.matchAll(/\b(?:https?|ftp):\/\/[^\s<>"'`]{1,2048}/gi)) {
      const url = trimUrl(match[0]);
      if (/^[a-z]+:\/\/[^/?#\s]+/i.test(url)) add('url', url, lineNumber);
      mask(match.index, match[0].length);
    }
    for (const match of line.matchAll(/\b[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.){1,10}[A-Za-z]{2,24}\b/g)) {
      const domain = match[0].slice(match[0].lastIndexOf('@') + 1);
      if (acceptedDomain(domain)) add('email', match[0].toLowerCase(), lineNumber);
      mask(match.index, match[0].length);
    } // prettier-ignore
    for (const match of line.matchAll(/\bCVE-\d{4}-\d{4,7}\b/gi)) {
      add('cve', match[0].toUpperCase(), lineNumber);
      mask(match.index, match[0].length);
    }
    for (const match of line.matchAll(/\bT[1-9]\d{3}(?:\.\d{3})?\b/g)) {
      add('attack', match[0], lineNumber);
      mask(match.index, match[0].length);
    }
    for (const match of line.matchAll(/\b[a-fA-F0-9]{32,128}\b/g)) {
      const type = HASH_TYPES[match[0].length];
      if (type) add(type, match[0].toLowerCase(), lineNumber);
      mask(match.index, match[0].length);
    }
    for (const match of line.matchAll(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?(?![\d.]*\d)/g)) {
      if (isIpv4(match[0])) {
        add('ipv4', match[0], lineNumber);
        mask(match.index, match[0].length);
      }
    } // prettier-ignore
    for (const match of line.matchAll(/(?<![\w:])[A-Fa-f0-9:]{2,39}(?![\w:])/g)) {
      if (match[0].includes(':') && isIpv6(match[0])) {
        add('ipv6', match[0].toLowerCase(), lineNumber);
        mask(match.index, match[0].length);
      }
    }
    for (const match of line.matchAll(/(?<![\w.@-])(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.){1,10}(?:[A-Za-z]{2,24}|xn--[A-Za-z0-9-]{1,59})(?![\w-]|\.\w)/g)) {
      if (acceptedDomain(match[0])) add('domain', match[0].toLowerCase(), lineNumber);
    } // prettier-ignore
  });

  const order = (/** @type {Indicator} */ i) => TYPES.indexOf(i.type);
  const indicators = [...found.values()].sort((a, b) => order(a) - order(b) || a.line - b.line);
  return { indicators, capped };
}

// ---------------------------------------------------------------- exports

/**
 * @param {string} cell
 * @returns {string}
 */
function csvCell(cell) {
  return /[",\r\n]/.test(cell) || /^[=+\-@\t\r]/.test(cell)
    ? `"${(/^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell).replace(/"/g, '""')}"`
    : cell;
}

/**
 * One indicator per line.
 *
 * @param {Indicator[]} indicators
 * @param {boolean} defanged
 */
export function toText(indicators, defanged) {
  return indicators.map((i) => (defanged ? defang(i.type, i.value) : i.value)).join('\n');
}

/**
 * `type,value,count,line,note`. Cells that a spreadsheet would run as a formula are quoted
 * and prefixed with an apostrophe.
 *
 * @param {Indicator[]} indicators
 * @param {boolean} defanged
 */
export function toCsv(indicators, defanged) {
  const rows = indicators.map((i) =>
    [i.type, defanged ? defang(i.type, i.value) : i.value, String(i.count), String(i.line), i.note ?? '']
      .map(csvCell)
      .join(','),
  ); // prettier-ignore
  return ['type,value,count,line,note', ...rows].join('\n');
}

/** @type {Partial<Record<IocType, string>>} */
const STIX_PATTERNS = {
  url: 'url:value',
  domain: 'domain-name:value',
  ipv4: 'ipv4-addr:value',
  ipv6: 'ipv6-addr:value',
  email: 'email-addr:value',
  md5: 'file:hashes.MD5',
  sha1: "file:hashes.'SHA-1'",
  sha256: "file:hashes.'SHA-256'",
  sha512: "file:hashes.'SHA-512'",
};

/** @returns {string} */
function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`; // prettier-ignore
}

/**
 * A STIX 2.1 bundle: an indicator per observable (never defanged: patterns must match),
 * a vulnerability per CVE and an attack pattern per ATT&CK technique.
 *
 * @param {Indicator[]} indicators
 * @param {{ now?: Date, name?: string }} [options]
 * @returns {string}
 */
export function toStix(indicators, { now = new Date(), name } = {}) {
  const time = now.toISOString();
  const objects = indicators.map((i) => {
    if (i.type === 'cve')
      return { type: 'vulnerability', spec_version: '2.1', id: `vulnerability--${uuid()}`, created: time, modified: time, name: i.value, external_references: [{ source_name: 'cve', external_id: i.value }] }; // prettier-ignore
    if (i.type === 'attack')
      return { type: 'attack-pattern', spec_version: '2.1', id: `attack-pattern--${uuid()}`, created: time, modified: time, name: i.value, external_references: [{ source_name: 'mitre-attack', external_id: i.value, url: `https://attack.mitre.org/techniques/${i.value.replace('.', '/')}/` }] }; // prettier-ignore
    const literal = i.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return {
      type: 'indicator',
      spec_version: '2.1',
      id: `indicator--${uuid()}`,
      created: time,
      modified: time,
      name: i.value,
      ...(name ? { description: name } : {}),
      indicator_types: ['malicious-activity'],
      pattern: `[${STIX_PATTERNS[i.type]} = '${literal}']`,
      pattern_type: 'stix',
      valid_from: time,
    };
  });
  return JSON.stringify({ type: 'bundle', id: `bundle--${uuid()}`, objects }, null, 2);
}

/** @type {Record<IocType, [string, string, boolean]>} MISP type, category, to_ids. */
const MISP_TYPES = {
  url: ['url', 'Network activity', true],
  domain: ['domain', 'Network activity', true],
  ipv4: ['ip-dst', 'Network activity', true],
  ipv6: ['ip-dst', 'Network activity', true],
  email: ['email-src', 'Payload delivery', true],
  md5: ['md5', 'Payload delivery', true],
  sha1: ['sha1', 'Payload delivery', true],
  sha256: ['sha256', 'Payload delivery', true],
  sha512: ['sha512', 'Payload delivery', true],
  cve: ['vulnerability', 'External analysis', false],
  attack: ['text', 'External analysis', false],
};

/**
 * A MISP event in the JSON format of the MISP API and its import. Private and special
 * addresses are kept with `to_ids: false`.
 *
 * @param {Indicator[]} indicators
 * @param {{ info?: string }} [options]
 * @returns {string}
 */
export function toMisp(indicators, { info = 'Indicators' } = {}) {
  const Attribute = indicators.map((i) => {
    const [type, category, toIds] = MISP_TYPES[i.type];
    return {
      type,
      category,
      value: i.value,
      to_ids: toIds && !i.note,
      ...(i.note ? { comment: i.note } : {}),
    };
  });
  return JSON.stringify({ Event: { info, Attribute } }, null, 2);
}
