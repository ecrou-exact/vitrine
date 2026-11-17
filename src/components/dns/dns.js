// @ts-check
/**
 * DNS records: `dig` output and zone files read into records, and the records that carry a
 * policy explained and checked: SPF, DMARC, DKIM, CAA, MX, SOA and SRV.
 *
 * @module components/dns/dns
 */

/**
 * @typedef {{ name: string, ttl: number | null, class: string, type: string, data: string, section: string, line: number }} DnsRecord
 * @typedef {{ status: string, flags: string, server: string, time: string, question: string }} DigInfo
 * @typedef {{ records: DnsRecord[], dig: DigInfo | null }} Zone
 * @typedef {'bad' | 'warn' | 'info'} Level
 * @typedef {{ id: string, level: Level, name: string, params?: Record<string, string | number> }} Finding
 * @typedef {{ label: string, value: string, key?: string, params?: Record<string, string | number> }} Part
 */

/** Most records kept. */
export const MAX_RECORDS = 10000;

/** Record types read; others are read as `TYPEnnn`. */
export const TYPES = Object.freeze([
  'A', 'AAAA', 'CAA', 'CNAME', 'DNAME', 'DNSKEY', 'DS', 'HINFO', 'HTTPS', 'LOC', 'MX', 'NAPTR',
  'NS', 'NSEC', 'NSEC3', 'NSEC3PARAM', 'OPT', 'PTR', 'RP', 'RRSIG', 'SMIMEA', 'SOA', 'SPF', 'SRV',
  'SSHFP', 'SVCB', 'TLSA', 'TXT', 'URI', 'ZONEMD', 'CDS', 'CDNSKEY', 'CERT', 'KEY', 'SIG', 'ANY',
]); // prettier-ignore

/** Numeric types of DNS-over-HTTPS JSON answers. */
export const TYPE_NUMBERS = Object.freeze({
  1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 13: 'HINFO', 15: 'MX', 16: 'TXT', 17: 'RP',
  28: 'AAAA', 29: 'LOC', 33: 'SRV', 35: 'NAPTR', 39: 'DNAME', 43: 'DS', 44: 'SSHFP', 46: 'RRSIG',
  47: 'NSEC', 48: 'DNSKEY', 50: 'NSEC3', 51: 'NSEC3PARAM', 52: 'TLSA', 53: 'SMIMEA', 59: 'CDS',
  60: 'CDNSKEY', 64: 'SVCB', 65: 'HTTPS', 99: 'SPF', 256: 'URI', 257: 'CAA',
}); // prettier-ignore

const CLASSES = new Set(['IN', 'CH', 'HS', 'CS']);

/**
 * `3600` or `1h`, `1d2h`, `1w` (BIND units) in seconds.
 *
 * @param {string} token
 * @returns {number | null}
 */
export function parseTtl(token) {
  if (/^\d{1,10}$/.test(token)) return Number(token);
  const units = /** @type {Record<string, number>} */ ({ s: 1, m: 60, h: 3600, d: 86400, w: 604800 }); // prettier-ignore
  if (!/^(?:\d{1,7}[smhdw]){1,5}$/i.test(token)) return null;
  let total = 0;
  for (const m of token.toLowerCase().matchAll(/(\d+)([smhdw])/g)) total += Number(m[1]) * units[m[2]]; // prettier-ignore
  return total;
}

/**
 * Seconds as a short duration: `1 h`, `2 d 3 h`, `45 s`.
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  /** @type {[string, number][]} */
  const units = [['w', 604800], ['d', 86400], ['h', 3600], ['min', 60], ['s', 1]]; // prettier-ignore
  const parts = [];
  let rest = seconds;
  for (const [unit, size] of units) {
    if (rest >= size || (!parts.length && size === 1)) {
      parts.push(`${Math.floor(rest / size)} ${unit}`);
      rest %= size;
    }
    if (parts.length === 2) break;
  }
  return parts.join(' ');
}

/**
 * Removes a `;` comment, outside quoted strings.
 *
 * @param {string} line
 */
function stripComment(line) {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\') i++;
    else if (c === '"') quoted = !quoted;
    else if (c === ';' && !quoted) return line.slice(0, i);
  }
  return line;
}

/**
 * Splits a record into tokens, keeping quoted strings whole (with their quotes).
 *
 * @param {string} line
 * @returns {string[]}
 */
function tokens(line) {
  return line.match(/"(?:[^"\\]|\\.)*"|\S+/g) ?? [];
}

/**
 * The text of a TXT record: its quoted strings joined, as resolvers return it.
 *
 * @param {string} data
 * @returns {string}
 */
export function txtValue(data) {
  const strings = data.match(/"((?:[^"\\]|\\.)*)"/g);
  if (!strings) return data.trim();
  return strings.map((s) => s.slice(1, -1).replace(/\\(.)/g, '$1')).join('');
}

/**
 * Reads `dig` output (answer, authority and additional sections, and the header) or a zone
 * file (`$ORIGIN`, `$TTL`, `@`, relative names, records continued in parentheses).
 *
 * @param {string} text
 * @returns {Zone}
 */
export function parseDns(text) {
  /** @type {DnsRecord[]} */
  const records = [];
  /** @type {DigInfo | null} */
  let dig = null;
  let section = 'answer';
  let origin = '';
  /** @type {number | null} */
  let defaultTtl = null;
  let previous = '';
  const lines = String(text ?? '').split(/\r\n|\r|\n/);
  for (let index = 0; index < lines.length && records.length < MAX_RECORDS; index++) {
    let raw = lines[index];
    const lineNumber = index + 1;
    // dig header and section markers
    let m;
    if ((m = /^;; ->>HEADER<<- opcode: \w+, status: (\w+)/.exec(raw))) {
      dig ??= { status: '', flags: '', server: '', time: '', question: '' };
      dig.status = m[1];
      continue;
    }
    if ((m = /^;; flags: ([\w ]+);/.exec(raw))) {
      if (dig) dig.flags = m[1].trim();
      continue;
    }
    if ((m = /^;; (QUESTION|ANSWER|AUTHORITY|ADDITIONAL) SECTION:/.exec(raw))) {
      dig ??= { status: '', flags: '', server: '', time: '', question: '' };
      section = m[1].toLowerCase();
      continue;
    }
    if ((m = /^;; Query time: (.+)$/.exec(raw))) {
      if (dig) dig.time = m[1].trim();
      continue;
    }
    if ((m = /^;; SERVER: ([^#(\s]+)/.exec(raw))) {
      if (dig) dig.server = m[1];
      continue;
    }
    if (section === 'question' && (m = /^;(\S+)\s+(?:\w+\s+)?(\w+)\s*$/.exec(raw))) {
      if (dig) dig.question = `${m[1]} ${m[2]}`;
      continue;
    }
    raw = stripComment(raw);
    if (!raw.trim()) continue;
    // Records continued in parentheses (SOA, DNSKEY…)
    if (raw.includes('(') && !raw.includes(')')) {
      let joined = raw.replace('(', ' ');
      while (++index < lines.length) {
        const next = stripComment(lines[index]);
        if (next.includes(')')) {
          joined += ` ${next.replace(')', ' ')}`;
          break;
        }
        joined += ` ${next}`;
      }
      raw = joined;
    } else raw = raw.replace(/[()]/g, ' ');
    if ((m = /^\$ORIGIN\s+(\S+)/i.exec(raw))) {
      origin = m[1].replace(/\.$/, '');
      continue;
    }
    if ((m = /^\$TTL\s+(\S+)/i.exec(raw))) {
      defaultTtl = parseTtl(m[1]);
      continue;
    }
    if (/^\$/.test(raw)) continue;
    const parts = tokens(raw);
    /** @type {string} */
    let name;
    if (/^\s/.test(raw)) name = previous;
    else name = /** @type {string} */ (parts.shift());
    /** @type {number | null} */
    let ttl = null;
    let klass = '';
    for (let i = 0; i < 2 && parts.length; i++) {
      const head = parts[0].toUpperCase();
      if (CLASSES.has(head) && !klass) klass = /** @type {string} */ (parts.shift()).toUpperCase();
      else if (ttl === null && parseTtl(parts[0]) !== null) ttl = parseTtl(/** @type {string} */ (parts.shift())); // prettier-ignore
    }
    const type = (parts.shift() ?? '').toUpperCase();
    if (!TYPES.includes(type) && !/^TYPE\d{1,5}$/.test(type)) continue;
    if (type === 'OPT') continue;
    previous = name;
    records.push({
      name: absolute(name, origin),
      ttl: ttl ?? defaultTtl,
      class: klass || 'IN',
      type,
      data: parts.join(' '),
      section,
      line: lineNumber,
    });
  }
  return { records, dig };
}

/**
 * @param {string} name
 * @param {string} origin
 */
function absolute(name, origin) {
  if (name === '@') return origin ? `${origin}.` : '@';
  if (name.endsWith('.') || !origin) return name;
  return `${name}.${origin}.`;
}

// ---------------------------------------------------------------- explanations

/**
 * SPF mechanisms that cost a DNS lookup (RFC 7208: at most 10).
 */
const LOOKUPS = new Set(['include', 'a', 'mx', 'ptr', 'exists', 'redirect']);

/** @type {Record<string, string>} */
const QUALIFIERS = { '+': 'pass', '-': 'fail', '~': 'softfail', '?': 'neutral' };

/**
 * The terms of an SPF record, each explained.
 *
 * @param {string} value
 * @returns {Part[]}
 */
export function explainSpf(value) {
  return value
    .split(/\s+/)
    .slice(1)
    .filter(Boolean)
    .map((term) => {
      const m = /^([+\-~?]?)([a-z0-9]+)([:=/]?)(.*)$/i.exec(term);
      if (!m) return { label: term, value: '', key: 'dnsSpfUnknown' };
      const qualifier = QUALIFIERS[m[1] || '+'];
      const mechanism = m[2].toLowerCase();
      const known = ['all', 'include', 'a', 'mx', 'ip4', 'ip6', 'exists', 'ptr', 'redirect', 'exp'];
      return {
        label: term,
        value: m[4],
        key: known.includes(mechanism) ? `dnsSpf_${mechanism}` : 'dnsSpfUnknown',
        params: { result: qualifier, value: m[4] || '' },
      };
    });
}

/**
 * `tag=value` pairs of DMARC, DKIM and similar records.
 *
 * @param {string} value
 * @returns {Map<string, string>}
 */
export function tags(value) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const part of value.split(';')) {
    const at = part.indexOf('=');
    if (at > 0) map.set(part.slice(0, at).trim().toLowerCase(), part.slice(at + 1).trim());
  }
  return map;
}

/**
 * What a record says, in parts; `null` when there is nothing to add to the data.
 *
 * @param {DnsRecord} record
 * @returns {Part[] | null}
 */
export function explain(record) {
  const d = record.data.split(/\s+/);
  switch (record.type) {
    case 'MX':
      if (d[1] === '.') return [{ label: 'MX', value: '', key: 'dnsMxNull' }];
      return [
        { label: 'preference', value: d[0], key: 'dnsMxPreference' },
        { label: 'exchange', value: d[1] ?? '', key: 'dnsMxExchange' },
      ];
    case 'SOA':
      return [
        ['mname', 'dnsSoaMname'], ['rname', 'dnsSoaRname'], ['serial', 'dnsSoaSerial'],
        ['refresh', 'dnsSoaRefresh'], ['retry', 'dnsSoaRetry'], ['expire', 'dnsSoaExpire'],
        ['minimum', 'dnsSoaMinimum'],
      ].map(([label, key], i) => {
        const raw = d[i] ?? '';
        const seconds = i >= 3 ? parseTtl(raw) : null;
        const value = label === 'rname' ? rname(raw) : seconds !== null ? `${raw} (${formatDuration(seconds)})` : raw; // prettier-ignore
        return { label, value, key };
      }); // prettier-ignore
    case 'SRV':
      return [
        { label: 'priority', value: d[0], key: 'dnsSrvPriority' },
        { label: 'weight', value: d[1] ?? '', key: 'dnsSrvWeight' },
        { label: 'port', value: d[2] ?? '', key: 'dnsSrvPort' },
        { label: 'target', value: d[3] ?? '', key: 'dnsSrvTarget' },
      ];
    case 'CAA': {
      const m = /^(\d+)\s+([a-z0-9]+)\s+(.*)$/i.exec(record.data);
      if (!m) return null;
      const tag = m[2].toLowerCase();
      const value = txtValue(m[3]);
      const key = tag === 'issue' ? 'dnsCaaIssue' : tag === 'issuewild' ? 'dnsCaaIssueWild' : tag === 'iodef' ? 'dnsCaaIodef' : 'dnsCaaOther'; // prettier-ignore
      const ca = value.split(';')[0].trim();
      return [{ label: tag, value, key, params: { ca: ca || ';', value } }].concat(
        m[1] !== '0' ? [{ label: 'flags', value: m[1], key: 'dnsCaaCritical', params: { ca: '', value: '' } }] : [], // prettier-ignore
      );
    }
    case 'TXT':
    case 'SPF': {
      const value = txtValue(record.data);
      if (/^v=spf1(?:\s|$)/i.test(value)) return explainSpf(value);
      if (/^v=DMARC1/i.test(value))
        return [...tags(value)].filter(([tag]) => tag !== 'v').map(([tag, v]) => ({ label: tag, value: v, key: DMARC_TAGS.has(tag) ? `dnsDmarc_${tag}` : 'dnsTagOther' })); // prettier-ignore
      if (/^v=DKIM1/i.test(value) || /\._domainkey\./i.test(record.name))
        return [...tags(value)].filter(([tag]) => tag !== 'v').map(([tag, v]) => ({ label: tag, value: tag === 'p' && v.length > 40 ? `${v.slice(0, 24)}…${v.slice(-8)}` : v, key: DKIM_TAGS.has(tag) ? `dnsDkim_${tag}` : 'dnsTagOther' })); // prettier-ignore
      return null;
    }
    default:
      return null;
  }
}

const DMARC_TAGS = new Set(['p', 'sp', 'pct', 'rua', 'ruf', 'adkim', 'aspf', 'fo', 'ri', 'rf', 'np', 't', 'psd']); // prettier-ignore
const DKIM_TAGS = new Set(['k', 'p', 'h', 't', 's', 'n']);

/**
 * The SOA RNAME as an e-mail address: `hostmaster.example.com.` → `hostmaster@example.com`.
 *
 * @param {string} value
 */
function rname(value) {
  const name = value.replace(/\.$/, '');
  const at = name.search(/(?<!\\)\./);
  return at < 0 ? name : `${name.slice(0, at).replace(/\\\./g, '.')}@${name.slice(at + 1)}`;
}

/**
 * The kind of a TXT record, for its label.
 *
 * @param {DnsRecord} record
 * @returns {'spf' | 'dmarc' | 'dkim' | 'verification' | null}
 */
export function txtKind(record) {
  if (record.type !== 'TXT' && record.type !== 'SPF') return null;
  const value = txtValue(record.data);
  if (/^v=spf1(?:\s|$)/i.test(value)) return 'spf';
  if (/^v=DMARC1/i.test(value)) return 'dmarc';
  if (/^v=DKIM1/i.test(value) || /\._domainkey\./i.test(record.name)) return 'dkim';
  if (/^[\w.-]+-(?:site-)?verification[=:]/i.test(value) || /^MS=ms\d+/.test(value)) return 'verification'; // prettier-ignore
  return null;
}

/**
 * Checks the SPF, DMARC, DKIM and MX records.
 *
 * @param {DnsRecord[]} records
 * @returns {Finding[]}
 */
export function check(records) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {Map<string, number>} */
  const spfByName = new Map();
  for (const record of records) {
    if (record.section !== 'answer') continue;
    const kind = txtKind(record);
    const value = txtValue(record.data);
    const name = record.name;
    if (kind === 'spf') {
      spfByName.set(name, (spfByName.get(name) ?? 0) + 1);
      const terms = value.split(/\s+/).slice(1).filter(Boolean);
      const all = terms.find((t) => /^[+\-~?]?all$/i.test(t));
      if (all && /^\+?all$/i.test(all)) findings.push({ id: 'spfPassAll', level: 'bad', name });
      else if (all && /^\?all$/i.test(all)) findings.push({ id: 'spfNeutralAll', level: 'warn', name }); // prettier-ignore
      else if (!all && !terms.some((t) => /^redirect=/i.test(t))) findings.push({ id: 'spfNoAll', level: 'warn', name }); // prettier-ignore
      if (terms.some((t) => /^[+\-~?]?ptr(?::|$)/i.test(t))) findings.push({ id: 'spfPtr', level: 'warn', name }); // prettier-ignore
      const lookups = terms.filter((t) => LOOKUPS.has((/^[+\-~?]?([a-z]+)/i.exec(t)?.[1] ?? '').toLowerCase())).length; // prettier-ignore
      if (lookups > 10) findings.push({ id: 'spfLookups', level: 'bad', name, params: { count: lookups } }); // prettier-ignore
    } else if (kind === 'dmarc') {
      const t = tags(value);
      const policy = (t.get('p') ?? '').toLowerCase();
      if (!policy) findings.push({ id: 'dmarcNoPolicy', level: 'bad', name });
      else if (policy === 'none') findings.push({ id: 'dmarcNone', level: 'warn', name });
      const pct = Number(t.get('pct') ?? '100');
      if (pct < 100) findings.push({ id: 'dmarcPct', level: 'info', name, params: { pct } });
      if (!t.has('rua')) findings.push({ id: 'dmarcNoRua', level: 'info', name });
    } else if (kind === 'dkim') {
      const t = tags(value);
      const key = (t.get('p') ?? '').replace(/\s+/g, '');
      if (!key) findings.push({ id: 'dkimRevoked', level: 'info', name });
      else if ((t.get('k') ?? 'rsa').toLowerCase() === 'rsa' && (key.length * 3) / 4 < 200)
        findings.push({ id: 'dkimShortKey', level: 'warn', name });
    }
  }
  for (const [name, count] of spfByName)
    if (count > 1) findings.push({ id: 'spfMultiple', level: 'bad', name, params: { count } });
  /** @type {Record<Level, number>} */
  const order = { bad: 0, warn: 1, info: 2 };
  return findings.sort((a, b) => order[a.level] - order[b.level]);
}
