// @ts-check
/**
 * E-mail messages (RFC 5322 and MIME): headers with encoded words decoded, the Received path,
 * authentication results, the body as text (HTML reduced to text without a DOM), links,
 * attachments, and the signs of phishing.
 *
 * Nothing here builds HTML: the HTML of a message is only read as text.
 *
 * @module components/email/email
 */

import { baseDomain } from '../../core/urls.js';

/**
 * @typedef {{ name: string, value: string }} Header
 * @typedef {{ name: string, address: string }} Address
 * @typedef {{ from: string, by: string, with: string, ip: string, date: number | null, raw: string }} Hop
 * @typedef {{ method: string, result: string, detail: string }} AuthResult
 * @typedef {{ name: string, type: string, size: number, bytes: Uint8Array }} Attachment
 * @typedef {{ text: string, href: string, deceptive: boolean }} Link
 * @typedef {{ id: string, level: 'bad' | 'warn' | 'info', params?: Record<string, string | number> }} Finding
 * @typedef {object} Message
 * @property {Header[]} headers
 * @property {Address[]} from
 * @property {Address[]} to
 * @property {Address[]} cc
 * @property {Address[]} replyTo
 * @property {string} returnPath
 * @property {string} subject
 * @property {number | null} date
 * @property {string} messageId
 * @property {Hop[]} hops - Oldest first.
 * @property {AuthResult[]} auth
 * @property {string} text - The text body, or the HTML body as text.
 * @property {boolean} fromHtml - Whether `text` comes from HTML.
 * @property {Link[]} links
 * @property {number} remoteImages
 * @property {Attachment[]} attachments
 */

const MAX_HEADERS = 1000;
const MAX_PARTS = 200;
const MAX_DEPTH = 10;
const MAX_LINKS = 1000;

/** Extensions of files that run code or hide it. */
export const RISKY_EXTENSIONS = new Set([
  'exe', 'scr', 'com', 'pif', 'bat', 'cmd', 'ps1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'hta',
  'lnk', 'msi', 'msp', 'jar', 'iso', 'img', 'vhd', 'vhdx', 'one', 'html', 'htm', 'svg', 'xll',
  'docm', 'xlsm', 'pptm', 'dotm', 'xlam', 'cpl', 'reg', 'chm', 'appx', 'msix', 'apk', 'dll',
]); // prettier-ignore

// ---------------------------------------------------------------- bytes and charsets

/**
 * @param {Uint8Array} bytes
 * @param {string} charset
 */
function decodeBytes(bytes, charset) {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * A string of characters 0–255 (or an ASCII body) as bytes.
 *
 * @param {string} text
 */
function latin1(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

/**
 * @param {string} text
 * @returns {Uint8Array}
 */
export function base64Bytes(text) {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  try {
    const usable = clean.length % 4 === 1 ? clean.slice(0, -1) : clean;
    return latin1(atob(usable.padEnd(Math.ceil(usable.length / 4) * 4, '=')));
  } catch {
    return new Uint8Array(0);
  }
}

/**
 * Quoted-printable (RFC 2045) as bytes.
 *
 * @param {string} text
 * @param {boolean} [header] - Q encoding of headers: `_` is a space.
 */
export function quotedPrintableBytes(text, header = false) {
  const source = (header ? text.replace(/_/g, ' ') : text).replace(/=\r?\n/g, '');
  const out = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(source.slice(i + 1, i + 3))) {
      out.push(parseInt(source.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = source.charCodeAt(i);
      if (code < 128) out.push(code);
      else out.push(...new TextEncoder().encode(c));
    }
  }
  return Uint8Array.from(out);
}

/**
 * Decodes RFC 2047 encoded words: `=?UTF-8?B?…?=`, `=?ISO-8859-1?Q?…?=`. Spaces between two
 * encoded words are dropped, as the RFC says.
 *
 * @param {string} value
 * @returns {string}
 */
export function decodeWords(value) {
  return value
    .replace(/(=\?[^?\s]{1,40}\?[BbQq]\?[^?\s]{0,2000}\?=)\s+(?==\?)/g, '$1')
    .replace(/=\?([^?\s]{1,40})\?([BbQq])\?([^?\s]{0,2000})\?=/g, (_, charset, encoding, text) => {
      const bytes = encoding.toUpperCase() === 'B' ? base64Bytes(text) : quotedPrintableBytes(text, true); // prettier-ignore
      return decodeBytes(bytes, String(charset).replace(/\*.*$/, ''));
    });
}

// ---------------------------------------------------------------- headers

/**
 * Splits a message into headers and body. Folded header lines are joined.
 *
 * @param {string} text
 * @returns {{ headers: Header[], body: string }}
 */
export function splitMessage(text) {
  const match = /\r?\n\r?\n/.exec(text);
  const head = match ? text.slice(0, match.index) : text;
  const body = match ? text.slice(match.index + match[0].length) : '';
  /** @type {Header[]} */
  const headers = [];
  for (const line of head.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && headers.length)
      headers[headers.length - 1].value += ` ${line.trim()}`; // prettier-ignore
    else {
      const m = /^([!-9;-~]{1,100}):[ \t]?(.*)$/.exec(line);
      if (m && headers.length < MAX_HEADERS) headers.push({ name: m[1], value: m[2] });
    }
  }
  return { headers, body };
}

/**
 * @param {Header[]} headers
 * @param {string} name
 */
export function header(headers, name) {
  const lower = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === lower)?.value ?? '';
}

/**
 * @param {Header[]} headers
 * @param {string} name
 */
function all(headers, name) {
  const lower = name.toLowerCase();
  return headers.filter((h) => h.name.toLowerCase() === lower).map((h) => h.value);
}

/**
 * `Name <a@b>, "Last, First" <c@d>, e@f` as addresses.
 *
 * @param {string} value
 * @returns {Address[]}
 */
export function parseAddresses(value) {
  /** @type {string[]} */
  const items = [];
  let current = '';
  let quoted = false;
  let angle = false;
  for (const c of value) {
    if (c === '"') quoted = !quoted;
    else if (c === '<' && !quoted) angle = true;
    else if (c === '>' && !quoted) angle = false;
    if (c === ',' && !quoted && !angle) {
      items.push(current);
      current = '';
    } else current += c;
  }
  items.push(current);
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const m = /^(.*?)<([^<>]*)>\s*$/.exec(item);
      if (!m) return { name: '', address: item.replace(/\s*\(.*\)$/, '') };
      return { name: decodeWords(m[1].trim().replace(/^"|"$/g, '').replace(/\\(.)/g, '$1')), address: m[2].trim() }; // prettier-ignore
    });
}

/**
 * @param {string} address
 */
export function domainOf(address) {
  const at = address.lastIndexOf('@');
  return at < 0
    ? ''
    : address
        .slice(at + 1)
        .replace(/[>\s]+$/, '')
        .toLowerCase();
}

export { baseDomain };

/**
 * @param {string} value
 * @returns {number | null}
 */
function parseDate(value) {
  const time = Date.parse(value.replace(/\s*\([^)]*\)\s*$/, '').trim());
  return Number.isFinite(time) ? time : null;
}

/**
 * The Received headers as hops, oldest first.
 *
 * @param {Header[]} headers
 * @returns {Hop[]}
 */
export function parseHops(headers) {
  return all(headers, 'received')
    .map((raw) => {
      const semi = raw.lastIndexOf(';');
      const route = semi < 0 ? raw : raw.slice(0, semi);
      const ip = /\[(?:IPv6:)?([0-9a-fA-F:.]{2,45})\]/.exec(route)?.[1] ?? /\((?:[^()]*\s)?(\d{1,3}(?:\.\d{1,3}){3})\)/.exec(route)?.[1] ?? ''; // prettier-ignore
      return {
        from: /\bfrom\s+(\S+)/i.exec(route)?.[1] ?? '',
        by: /\bby\s+(\S+)/i.exec(route)?.[1] ?? '',
        with: /\bwith\s+(\S+)/i.exec(route)?.[1] ?? '',
        ip,
        date: semi < 0 ? null : parseDate(raw.slice(semi + 1)),
        raw,
      };
    })
    .reverse();
}

/**
 * Authentication-Results (`spf=pass`, `dkim=fail`, `dmarc=pass`…) and Received-SPF.
 *
 * @param {Header[]} headers
 * @returns {AuthResult[]}
 */
export function parseAuth(headers) {
  /** @type {AuthResult[]} */
  const results = [];
  for (const value of all(headers, 'authentication-results')) {
    for (const m of value.matchAll(/\b(spf|dkim|dmarc|arc|bimi|auth|iprev|compauth)=([a-z]+)([^;]*)/gi)) {
      const method = m[1].toLowerCase();
      if (results.some((r) => r.method === method)) continue;
      results.push({ method, result: m[2].toLowerCase(), detail: m[3].trim().slice(0, 300) });
    } // prettier-ignore
  }
  const received = header(headers, 'received-spf');
  if (received && !results.some((r) => r.method === 'spf')) {
    const m = /^\s*([a-z]+)/i.exec(received);
    if (m) results.push({ method: 'spf', result: m[1].toLowerCase(), detail: received.slice(m[0].length).trim().slice(0, 300) }); // prettier-ignore
  }
  return results;
}

// ---------------------------------------------------------------- MIME

/**
 * @param {string} value - A Content-Type or Content-Disposition value.
 * @returns {{ value: string, params: Map<string, string> }}
 */
export function parseParams(value) {
  const [first, ...rest] = value.split(';');
  /** @type {Map<string, string>} */
  const params = new Map();
  for (const m of rest.join(';').matchAll(/([\w*-]{1,60})\s*=\s*("(?:[^"\\]|\\.)*"|[^;\s]*)/g)) {
    let v = m[2].replace(/^"|"$/g, '');
    let key = m[1].toLowerCase();
    if (key.endsWith('*')) {
      key = key.slice(0, -1);
      const ext = /^([^']*)'[^']*'(.*)$/.exec(v);
      if (ext) v = decodeBytes(latin1(decodeURIComponentSafe(ext[2])), ext[1]);
    }
    if (!params.has(key)) params.set(key, decodeWords(v));
  }
  return { value: first.trim().toLowerCase(), params };
}

/**
 * @param {string} text
 */
function decodeURIComponentSafe(text) {
  return text.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Walks the MIME tree: the first text/plain and text/html parts, and the attachments.
 *
 * @param {Header[]} headers
 * @param {string} body
 * @param {{ plain: string | null, html: string | null, attachments: Attachment[], parts: number }} out
 * @param {number} depth
 */
function walk(headers, body, out, depth) {
  if (depth > MAX_DEPTH || out.parts++ > MAX_PARTS) return;
  const type = parseParams(header(headers, 'content-type') || 'text/plain');
  const disposition = parseParams(header(headers, 'content-disposition'));
  const encoding = header(headers, 'content-transfer-encoding').trim().toLowerCase();
  if (type.value.startsWith('multipart/')) {
    const boundary = type.params.get('boundary');
    if (!boundary) return;
    const marker = `--${boundary}`;
    const chunks = body.split(/\r?\n/);
    /** @type {string[] | null} */
    let current = null;
    for (const line of chunks) {
      if (
        line === marker ||
        line === `${marker}--` ||
        (line.startsWith(marker) && /^--?\s*$/.test(line.slice(marker.length)))
      ) {
        // prettier-ignore
        if (current) {
          const part = splitMessage(current.join('\n'));
          walk(part.headers, part.body, out, depth + 1);
        }
        if (line.startsWith(`${marker}--`)) return;
        current = [];
      } else if (current) current.push(line);
    }
    if (current) {
      const part = splitMessage(current.join('\n'));
      walk(part.headers, part.body, out, depth + 1);
    }
    return;
  }
  const bytes = encoding === 'base64' ? base64Bytes(body) : encoding === 'quoted-printable' ? quotedPrintableBytes(body) : null; // prettier-ignore
  const filename = disposition.params.get('filename') ?? type.params.get('name') ?? '';
  const attachment =
    disposition.value === 'attachment' || (filename && !type.value.startsWith('text/'));
  if (!attachment && (type.value === 'text/plain' || type.value === 'text/html')) {
    const text = bytes ? decodeBytes(bytes, type.params.get('charset') ?? 'utf-8') : body;
    if (type.value === 'text/plain' && out.plain === null) out.plain = text;
    if (type.value === 'text/html' && out.html === null) out.html = text;
    return;
  }
  const data = bytes ?? new TextEncoder().encode(body);
  out.attachments.push({ name: filename || type.value, type: type.value, size: data.length, bytes: data }); // prettier-ignore
}

// ---------------------------------------------------------------- HTML as text

/** @type {Record<string, string>} */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', euro: '€' }; // prettier-ignore

/**
 * @param {string} text
 */
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (match, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1)); // prettier-ignore
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

/**
 * Removes comments and the content of script, style, head and title elements, in one pass:
 * an element that is never closed hides the rest of the text, as in a browser.
 *
 * @param {string} html
 * @returns {string}
 */
function removeBlocks(html) {
  const lower = html.toLowerCase();
  let out = '';
  let pos = 0;
  const open = /<!--|<(script|style|head|title)\b/g;
  /** @type {RegExpExecArray | null} */
  let m;
  while ((m = open.exec(lower))) {
    out += html.slice(pos, m.index);
    const close = m[0] === '<!--' ? '-->' : `</${m[1]}`;
    const end = lower.indexOf(close, m.index + m[0].length);
    if (end < 0) return out;
    const stop = close === '-->' ? end + 3 : lower.indexOf('>', end) + 1 || lower.length;
    pos = stop;
    open.lastIndex = stop;
  }
  return out + html.slice(pos);
}

/**
 * HTML reduced to text, without parsing it into a DOM: scripts, styles and comments removed,
 * block ends as line breaks, tags dropped, entities decoded.
 *
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  return decodeEntities(
    removeBlocks(html)
      .replace(/<br\b[^>]{0,500}>/gi, '\n')
      .replace(/<\/(?:p|div|tr|li|h[1-6]|table|blockquote)\s*>/gi, '\n')
      .replace(/<[^>]{0,5000}>/g, ''),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The host of a URL, or of something that looks like a URL or a domain.
 *
 * @param {string} text
 * @returns {string}
 */
export function hostOf(text) {
  const m = /^\s*(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@/\s]*@)?((?:[a-z0-9-]+\.)+[a-z]{2,24})(?::\d+)?(?:[/?#]\S*)?\s*$/i.exec(text); // prettier-ignore
  return m ? m[1].toLowerCase() : '';
}

/**
 * Links of an HTML body (`<a href>`), with their text; a link is deceptive when its text
 * shows another site than the one it opens.
 *
 * @param {string} html
 * @returns {{ links: Link[], remoteImages: number }}
 */
export function htmlLinks(html) {
  /** @type {Link[]} */
  const links = [];
  for (const m of html.matchAll(/<a\b([^>]{0,4000})>([\s\S]{0,4000}?)<\/a\s*>/gi)) {
    if (links.length >= MAX_LINKS) break;
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[1]);
    if (!href) continue;
    const url = decodeEntities(href[1] ?? href[2] ?? href[3] ?? '').trim();
    const text = htmlToText(m[2]).replace(/\s+/g, ' ').trim();
    links.push({ text, href: url, deceptive: isDeceptive(text, url) });
  }
  const remoteImages = [...html.matchAll(/<img\b[^>]{0,4000}?\bsrc\s*=\s*["']?\s*https?:/gi)]
    .length;
  return { links, remoteImages };
}

/**
 * @param {string} text
 * @param {string} href
 */
function isDeceptive(text, href) {
  const shown = hostOf(text);
  const real = hostOf(href);
  if (!shown || !real || !/^https?:/i.test(href.trim())) return false;
  return baseDomain(shown) !== baseDomain(real);
}

/**
 * URLs of a text body.
 *
 * @param {string} text
 * @returns {Link[]}
 */
export function textLinks(text) {
  /** @type {Link[]} */
  const links = [];
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s<>"')\]]{1,2048}/gi)) {
    if (links.length >= MAX_LINKS) break;
    const href = m[0].replace(/[.,;:!?]+$/, '');
    if (!links.some((l) => l.href === href)) links.push({ text: '', href, deceptive: false });
  }
  return links;
}

// ---------------------------------------------------------------- message

/**
 * @param {string} text - The raw message (`.eml`).
 * @returns {Message | null} `null` when the text has no header.
 */
export function parseMessage(text) {
  const { headers, body } = splitMessage(String(text ?? '').replace(/^\s+/, ''));
  if (!headers.length) return null;
  /** @type {{ plain: string | null, html: string | null, attachments: Attachment[], parts: number }} */
  const out = { plain: null, html: null, attachments: [], parts: 0 };
  walk(headers, body, out, 0);
  const html = out.html ? htmlLinks(out.html) : { links: [], remoteImages: 0 };
  const plainLinks = out.plain ? textLinks(out.plain) : [];
  const links = html.links.length ? html.links : plainLinks;
  return {
    headers: headers.map((h) => ({ name: h.name, value: decodeWords(h.value) })),
    from: parseAddresses(header(headers, 'from')),
    to: parseAddresses(header(headers, 'to')),
    cc: parseAddresses(header(headers, 'cc')),
    replyTo: parseAddresses(header(headers, 'reply-to')),
    returnPath: header(headers, 'return-path').replace(/[<>\s]/g, ''),
    subject: decodeWords(header(headers, 'subject')),
    date: parseDate(header(headers, 'date')),
    messageId: header(headers, 'message-id').trim(),
    hops: parseHops(headers),
    auth: parseAuth(headers),
    text: out.plain ?? (out.html ? htmlToText(out.html) : ''),
    fromHtml: out.plain === null && out.html !== null,
    links,
    remoteImages: html.remoteImages,
    attachments: out.attachments,
  };
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isRiskyAttachment(name) {
  const parts = name.toLowerCase().split('.');
  if (parts.length < 2) return false;
  return RISKY_EXTENSIONS.has(parts[parts.length - 1]);
}

/**
 * `invoice.pdf.exe`: a document extension followed by another one.
 *
 * @param {string} name
 */
export function hasDoubleExtension(name) {
  return /\.(?:pdf|docx?|xlsx?|pptx?|txt|jpe?g|png|gif|zip|rtf|csv)\s*\.[a-z0-9]{2,5}$/i.test(name);
}

/**
 * The signs that a message may be phishing or spoofed.
 *
 * @param {Message} message
 * @returns {Finding[]}
 */
export function analyze(message) {
  /** @type {Finding[]} */
  const findings = [];
  for (const r of message.auth) {
    if (!['spf', 'dkim', 'dmarc'].includes(r.method)) continue;
    if (r.result === 'fail' || r.result === 'permerror')
      findings.push({ id: 'authFail', level: 'bad', params: { method: r.method.toUpperCase(), result: r.result } }); // prettier-ignore
    else if (['softfail', 'none', 'neutral', 'temperror', 'policy'].includes(r.result))
      findings.push({ id: 'authWeak', level: 'warn', params: { method: r.method.toUpperCase(), result: r.result } }); // prettier-ignore
  }
  if (!message.auth.length) findings.push({ id: 'authMissing', level: 'info' });
  const from = message.from[0];
  const fromDomain = from ? domainOf(from.address) : '';
  if (from) {
    const shown = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(from.name)?.[0];
    if (shown && shown.toLowerCase() !== from.address.toLowerCase())
      findings.push({ id: 'displaySpoof', level: 'bad', params: { shown, address: from.address } });
  }
  const reply = message.replyTo[0];
  if (reply && fromDomain && baseDomain(domainOf(reply.address)) !== baseDomain(fromDomain))
    findings.push({ id: 'replyTo', level: 'warn', params: { address: reply.address } });
  if (
    message.returnPath &&
    fromDomain &&
    domainOf(message.returnPath) &&
    baseDomain(domainOf(message.returnPath)) !== baseDomain(fromDomain)
  )
    // prettier-ignore
    findings.push({ id: 'returnPath', level: 'info', params: { address: message.returnPath } });
  const deceptive = message.links.filter((l) => l.deceptive).length;
  if (deceptive) findings.push({ id: 'deceptiveLinks', level: 'bad', params: { count: deceptive } }); // prettier-ignore
  for (const a of message.attachments) {
    if (hasDoubleExtension(a.name)) findings.push({ id: 'doubleExtension', level: 'bad', params: { name: a.name } }); // prettier-ignore
    else if (isRiskyAttachment(a.name)) findings.push({ id: 'riskyAttachment', level: 'bad', params: { name: a.name } }); // prettier-ignore
  }
  if (message.remoteImages) findings.push({ id: 'remoteImages', level: 'info', params: { count: message.remoteImages } }); // prettier-ignore
  /** @type {Record<string, number>} */
  const order = { bad: 0, warn: 1, info: 2 };
  return findings.sort((a, b) => order[a.level] - order[b.level]);
}
