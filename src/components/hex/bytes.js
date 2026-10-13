// @ts-check
/**
 * Bytes for <vt-hex>: reading hex and base64 text, byte classes, file types from magic
 * bytes, searching and writing bytes back as hex or base64.
 *
 * No DOM here, so every function can be unit tested.
 *
 * @module components/hex/bytes
 */

/** @typedef {"null" | "printable" | "whitespace" | "control" | "high"} ByteClass */
/** @typedef {"auto" | "hex" | "base64"} InputFormat */

/**
 * Hex text: pairs of digits, with optional `0x`, offsets (`00000010:`), spaces, commas
 * and an ASCII column after `|` as written by `hexdump -C` or `xxd`.
 */
const HEX_TEXT = /^[\s0-9a-fA-F,:|x]*$/;

/**
 * Reads hex text (`48 65 6c`, `0x48,0x65`, `hexdump -C` or `xxd` output).
 *
 * @param {string} text
 * @returns {Uint8Array}
 */
export function parseHex(text) {
  /** @type {number[]} */
  const out = [];
  for (const raw of text.split('\n')) {
    let line = raw;
    // hexdump -C: `00000010  48 65 6c 6c  |Hell|`; xxd: `00000010: 4865 6c6c  Hell`.
    const bar = line.indexOf('|');
    if (bar >= 0) line = line.slice(0, bar);
    const xxd = /^\s*[0-9a-fA-F]{4,16}:\s+(.*)$/.exec(line);
    if (xxd) line = xxd[1].split(/\s{2,}/)[0];
    else line = line.replace(/^\s*[0-9a-fA-F]{6,16}\s{2}(?=[0-9a-fA-F]{2}\s)/, '');
    const digits = line.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
    for (let i = 0; i + 1 < digits.length; i += 2) out.push(parseInt(digits.slice(i, i + 2), 16));
  }
  return Uint8Array.from(out);
}

/**
 * Reads base64 (standard or URL-safe, line breaks allowed).
 *
 * @param {string} text
 * @returns {Uint8Array}
 * @throws {Error} When the text is not base64.
 */
export function parseBase64(text) {
  const clean = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error('Invalid base64');
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Reads text as hex or base64. `auto` picks hex when the text only has hex digits and
 * separators, base64 otherwise.
 *
 * @param {string} text
 * @param {InputFormat} [format]
 * @returns {Uint8Array}
 */
export function decodeText(text, format = 'auto') {
  const trimmed = text.trim();
  if (!trimmed) return new Uint8Array(0);
  if (format === 'hex') return parseHex(trimmed);
  if (format === 'base64') return parseBase64(trimmed);
  const digits = trimmed.replace(/[^0-9a-fA-F]/g, '').length;
  const looksHex = HEX_TEXT.test(trimmed) && (/[\s,:]/.test(trimmed) || digits % 2 === 0);
  // Base64 of 4 letters such as "dead" is also valid hex: hex wins when spaced or `0x`.
  if (looksHex && (/[\s,:x]/.test(trimmed) || trimmed.length % 4 !== 0)) return parseHex(trimmed);
  try {
    return parseBase64(trimmed);
  } catch {
    return parseHex(trimmed);
  }
}

/**
 * @param {number} byte
 * @returns {ByteClass}
 */
export function byteClass(byte) {
  if (byte === 0) return 'null';
  if (byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0x20) return 'whitespace';
  if (byte < 0x20 || byte === 0x7f) return 'control';
  if (byte > 0x7f) return 'high';
  return 'printable';
}

/**
 * The character shown in the ASCII column (`.` for anything not printable).
 *
 * @param {number} byte
 * @returns {string}
 */
export function asciiChar(byte) {
  return byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.';
}

/**
 * @param {number} value
 * @param {number} width
 * @returns {string}
 */
export function toHex(value, width = 2) {
  return value.toString(16).padStart(width, '0');
}

/**
 * Known signatures: offset, bytes and name.
 *
 * @type {ReadonlyArray<{ name: string, mime: string, at?: number, magic: number[] }>}
 */
const SIGNATURES = [
  { name: 'PNG', mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { name: 'JPEG', mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { name: 'GIF', mime: 'image/gif', magic: [0x47, 0x49, 0x46, 0x38] },
  { name: 'WebP', mime: 'image/webp', at: 8, magic: [0x57, 0x45, 0x42, 0x50] },
  { name: 'PDF', mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { name: 'ZIP', mime: 'application/zip', magic: [0x50, 0x4b, 0x03, 0x04] },
  { name: 'GZIP', mime: 'application/gzip', magic: [0x1f, 0x8b] },
  { name: 'BZIP2', mime: 'application/x-bzip2', magic: [0x42, 0x5a, 0x68] },
  { name: 'XZ', mime: 'application/x-xz', magic: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00] },
  { name: '7Z', mime: 'application/x-7z-compressed', magic: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { name: 'RAR', mime: 'application/vnd.rar', magic: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07] },
  { name: 'ELF', mime: 'application/x-elf', magic: [0x7f, 0x45, 0x4c, 0x46] },
  { name: 'PE', mime: 'application/vnd.microsoft.portable-executable', magic: [0x4d, 0x5a] },
  { name: 'Mach-O', mime: 'application/x-mach-binary', magic: [0xcf, 0xfa, 0xed, 0xfe] },
  { name: 'Mach-O', mime: 'application/x-mach-binary', magic: [0xfe, 0xed, 0xfa, 0xcf] },
  { name: 'WASM', mime: 'application/wasm', magic: [0x00, 0x61, 0x73, 0x6d] },
  { name: 'SQLite', mime: 'application/vnd.sqlite3', magic: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65] },
  { name: 'OLE', mime: 'application/x-ole-storage', magic: [0xd0, 0xcf, 0x11, 0xe0] },
  { name: 'Class', mime: 'application/java-vm', magic: [0xca, 0xfe, 0xba, 0xbe] },
  { name: 'PCAP', mime: 'application/vnd.tcpdump.pcap', magic: [0xd4, 0xc3, 0xb2, 0xa1] },
  { name: 'PCAPNG', mime: 'application/x-pcapng', magic: [0x0a, 0x0d, 0x0d, 0x0a] },
  { name: 'MP3', mime: 'audio/mpeg', magic: [0x49, 0x44, 0x33] },
  { name: 'OGG', mime: 'audio/ogg', magic: [0x4f, 0x67, 0x67, 0x53] },
];

/**
 * Detects the file type from its first bytes.
 *
 * @param {Uint8Array} bytes
 * @returns {{ name: string, mime: string } | null}
 */
export function detectType(bytes) {
  for (const sig of SIGNATURES) {
    const at = sig.at ?? 0;
    if (bytes.length < at + sig.magic.length) continue;
    if (sig.magic.every((b, i) => bytes[at + i] === b)) return { name: sig.name, mime: sig.mime };
  }
  return null;
}

/**
 * Turns a search query into bytes: hex pairs (`de ad be ef`, `0xCAFE`) when the query
 * only has hex digits and separators and an even number of digits, UTF-8 text otherwise.
 * A query in quotes is always text.
 *
 * @param {string} query
 * @returns {Uint8Array}
 */
export function queryBytes(query) {
  const quoted = /^"(.*)"$/s.exec(query);
  if (quoted) return new TextEncoder().encode(quoted[1]);
  const digits = query.replace(/0x/gi, '').replace(/[\s,]/g, '');
  if (/^(?:[0-9a-fA-F]{2})+$/.test(digits) && (/[\s,]|0x/i.test(query) || digits.length >= 4))
    return parseHex(digits);
  return new TextEncoder().encode(query);
}

/**
 * Start offsets of `needle` in `bytes`, at most `limit`. Text queries also match other
 * letter cases.
 *
 * @param {Uint8Array} bytes
 * @param {Uint8Array} needle
 * @param {{ limit?: number, ignoreCase?: boolean }} [options]
 * @returns {number[]}
 */
export function findBytes(bytes, needle, { limit = Infinity, ignoreCase = false } = {}) {
  /** @type {number[]} */
  const found = [];
  if (!needle.length) return found;
  const fold = (/** @type {number} */ b) => (ignoreCase && b >= 0x41 && b <= 0x5a ? b + 32 : b);
  const first = fold(needle[0]);
  outer: for (let i = 0; i + needle.length <= bytes.length; i += 1) {
    if (fold(bytes[i]) !== first) continue;
    for (let j = 1; j < needle.length; j += 1)
      if (fold(bytes[i + j]) !== fold(needle[j])) continue outer;
    found.push(i);
    if (found.length >= limit) break;
  }
  return found;
}

/**
 * Bytes as spaced hex pairs, `columns` per line.
 *
 * @param {Uint8Array} bytes
 * @param {number} [columns]
 * @returns {string}
 */
export function formatHex(bytes, columns = 16) {
  /** @type {string[]} */
  const lines = [];
  for (let i = 0; i < bytes.length; i += columns) {
    lines.push(Array.from(bytes.subarray(i, i + columns), (b) => toHex(b)).join(' '));
  }
  return lines.join('\n');
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function formatBase64(bytes) {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}
