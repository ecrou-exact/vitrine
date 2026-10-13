// @ts-check
/**
 * Strict, bounded ASN.1 DER reader.
 *
 * Lengths are never trusted: every length is checked against the bytes left in its
 * parent, indefinite lengths and non-minimal length encodings are refused, and depth and
 * node count are limited, so malformed or hostile input fails fast with a clear message.
 *
 * @module components/cert/der
 */

/** Maximum nesting of constructed values. */
export const MAX_DEPTH = 40;
/** Maximum number of nodes read from one input. */
export const MAX_NODES = 20000;
/** Maximum input size, in bytes. */
export const MAX_BYTES = 1024 * 1024;

/**
 * @typedef {object} DerNode
 * @property {number} cls - Tag class: 0 universal, 1 application, 2 context, 3 private.
 * @property {number} tag - Tag number.
 * @property {boolean} constructed
 * @property {number} start - Offset of the tag byte.
 * @property {number} header - Length of tag and length bytes.
 * @property {number} length - Length of the contents.
 * @property {DerNode[] | null} children - Children of a constructed value.
 * @property {Uint8Array} bytes - The whole input (contents are `bytes[start+header, end)`).
 */

export class DerError extends Error {
  /**
   * @param {string} message
   * @param {number} offset
   */
  constructor(message, offset) {
    super(`${message} (offset ${offset})`);
    this.name = 'DerError';
    this.offset = offset;
  }
}

/** Universal tag numbers. */
export const TAG = Object.freeze({
  BOOLEAN: 1,
  INTEGER: 2,
  BIT_STRING: 3,
  OCTET_STRING: 4,
  NULL: 5,
  OID: 6,
  UTF8: 12,
  SEQUENCE: 16,
  SET: 17,
  NUMERIC: 18,
  PRINTABLE: 19,
  T61: 20,
  IA5: 22,
  UTC_TIME: 23,
  GENERALIZED_TIME: 24,
  VISIBLE: 26,
  UNIVERSAL: 28,
  BMP: 30,
});

const UNIVERSAL_NAMES = /** @type {Record<number, string>} */ ({
  1: 'BOOLEAN', 2: 'INTEGER', 3: 'BIT STRING', 4: 'OCTET STRING', 5: 'NULL', 6: 'OBJECT IDENTIFIER',
  10: 'ENUMERATED', 12: 'UTF8String', 16: 'SEQUENCE', 17: 'SET', 18: 'NumericString',
  19: 'PrintableString', 20: 'T61String', 22: 'IA5String', 23: 'UTCTime', 24: 'GeneralizedTime',
  26: 'VisibleString', 28: 'UniversalString', 30: 'BMPString',
}); // prettier-ignore

/**
 * Reads one DER value and everything inside it.
 *
 * @param {Uint8Array} bytes
 * @param {{ start?: number, end?: number }} [range] - Part of `bytes` to read (default: all).
 * @returns {DerNode}
 */
export function parseDer(bytes, range = {}) {
  if (bytes.length > MAX_BYTES) throw new DerError('Input too large', 0);
  const start = range.start ?? 0;
  const end = range.end ?? bytes.length;
  const counter = { nodes: 0 };
  const node = readNode(bytes, start, end, 0, counter);
  if (start + node.header + node.length !== end) {
    throw new DerError('Unexpected bytes after the value', start + node.header + node.length);
  }
  return node;
}

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {number} limit - End of the enclosing value.
 * @param {number} depth
 * @param {{ nodes: number }} counter
 * @returns {DerNode}
 */
function readNode(bytes, offset, limit, depth, counter) {
  if (depth > MAX_DEPTH) throw new DerError('Nested too deeply', offset);
  counter.nodes += 1;
  if (counter.nodes > MAX_NODES) throw new DerError('Too many values', offset);
  if (offset >= limit) throw new DerError('Unexpected end of data', offset);
  const first = bytes[offset];
  const cls = first >> 6;
  const constructed = (first & 0x20) !== 0;
  let tag = first & 0x1f;
  let pos = offset + 1;
  if (tag === 0x1f) {
    // High tag number: base 128, at most 4 bytes.
    tag = 0;
    for (let i = 0; ; i += 1) {
      if (pos >= limit) throw new DerError('Unexpected end of tag', pos);
      if (i >= 4) throw new DerError('Tag number too large', pos);
      const b = bytes[pos++];
      tag = tag * 128 + (b & 0x7f);
      if (!(b & 0x80)) break;
    }
  }
  if (pos >= limit) throw new DerError('Unexpected end of length', pos);
  let length = bytes[pos++];
  if (length === 0x80) throw new DerError('Indefinite length is not DER', pos - 1);
  if (length > 0x80) {
    const count = length & 0x7f;
    if (count > 4) throw new DerError('Length too large', pos - 1);
    if (pos + count > limit) throw new DerError('Unexpected end of length', pos);
    if (bytes[pos] === 0) throw new DerError('Length not minimally encoded', pos);
    length = 0;
    for (let i = 0; i < count; i += 1) length = length * 256 + bytes[pos++];
    if (length < 0x80) throw new DerError('Length not minimally encoded', pos - count);
  }
  const header = pos - offset;
  if (pos + length > limit) throw new DerError('Length goes past the end of its container', offset);
  /** @type {DerNode[] | null} */
  let children = null;
  if (constructed) {
    children = [];
    let at = pos;
    const stop = pos + length;
    while (at < stop) {
      const child = readNode(bytes, at, stop, depth + 1, counter);
      children.push(child);
      at = child.start + child.header + child.length;
    }
  }
  return { cls, tag, constructed, start: offset, header, length, children, bytes };
}

/**
 * Contents of a value.
 *
 * @param {DerNode} node
 * @returns {Uint8Array}
 */
export function contents(node) {
  const from = node.start + node.header;
  return node.bytes.subarray(from, from + node.length);
}

/**
 * The whole encoding of a value (tag, length and contents).
 *
 * @param {DerNode} node
 * @returns {Uint8Array}
 */
export function encoding(node) {
  return node.bytes.subarray(node.start, node.start + node.header + node.length);
}

/**
 * Reads the value inside a BIT STRING or OCTET STRING, when it holds DER.
 *
 * @param {DerNode} node
 * @returns {DerNode | null}
 */
export function encapsulated(node) {
  if (node.cls !== 0 || node.constructed) return null;
  let from = node.start + node.header;
  const end = from + node.length;
  if (node.tag === TAG.BIT_STRING) {
    if (node.bytes[from] !== 0) return null;
    from += 1;
  } else if (node.tag !== TAG.OCTET_STRING) return null;
  if (from >= end) return null;
  try {
    return parseDer(node.bytes, { start: from, end });
  } catch {
    return null;
  }
}

/**
 * @param {DerNode} node
 * @param {number} tag
 * @param {string} what - Name used in the error message.
 * @returns {DerNode}
 */
export function expect(node, tag, what) {
  if (!node || node.cls !== 0 || node.tag !== tag) {
    throw new DerError(`Expected ${what}`, node?.start ?? 0);
  }
  return node;
}

/**
 * @param {DerNode} node
 * @param {number} index
 * @returns {DerNode}
 */
export function child(node, index) {
  const found = node.children?.[index];
  if (!found) throw new DerError('Missing value', node.start);
  return found;
}

/**
 * Dotted form of an OBJECT IDENTIFIER.
 *
 * @param {DerNode} node
 * @returns {string}
 */
export function oid(node) {
  const data = contents(node);
  if (!data.length || data.length > 64) throw new DerError('Invalid object identifier', node.start);
  /** @type {string[]} */
  const parts = [];
  let value = 0n;
  for (let i = 0; i < data.length; i += 1) {
    value = value * 128n + BigInt(data[i] & 0x7f);
    if (!(data[i] & 0x80)) {
      if (!parts.length) {
        const first = value < 80n ? value / 40n : 2n;
        parts.push(String(first), String(value - first * 40n));
      } else parts.push(String(value));
      value = 0n;
    } else if (i === data.length - 1) {
      throw new DerError('Invalid object identifier', node.start);
    }
  }
  return parts.join('.');
}

/**
 * Hex digits of bytes, separated by `separator`.
 *
 * @param {Uint8Array} data
 * @param {string} [separator]
 * @returns {string}
 */
export function hex(data, separator = ':') {
  return Array.from(data, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(separator);
}

/**
 * An INTEGER as hex (serial numbers), without leading zero bytes.
 *
 * @param {DerNode} node
 * @returns {string}
 */
export function integerHex(node) {
  let data = contents(node);
  while (data.length > 1 && data[0] === 0) data = data.subarray(1);
  return hex(data);
}

/**
 * A small INTEGER as a number.
 *
 * @param {DerNode} node
 * @returns {number}
 */
export function integer(node) {
  const data = contents(node);
  if (!data.length || data.length > 6) throw new DerError('Integer out of range', node.start);
  let value = 0;
  for (const b of data) value = value * 256 + b;
  // Two's complement: a set top bit makes the value negative.
  return data[0] & 0x80 ? value - 2 ** (8 * data.length) : value;
}

/**
 * Text of a string value.
 *
 * @param {DerNode} node
 * @returns {string}
 */
export function text(node) {
  const data = contents(node);
  if (node.tag === TAG.BMP) {
    let out = '';
    for (let i = 0; i + 1 < data.length; i += 2)
      out += String.fromCharCode((data[i] << 8) | data[i + 1]);
    return out;
  }
  if (node.tag === TAG.UNIVERSAL) {
    let out = '';
    for (let i = 0; i + 3 < data.length; i += 4) {
      const cp = ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0;
      out += cp <= 0x10ffff ? String.fromCodePoint(cp) : '�';
    }
    return out;
  }
  if (node.tag === TAG.UTF8) return new TextDecoder('utf-8').decode(data);
  return Array.from(data, (b) => String.fromCharCode(b)).join('');
}

/**
 * Reads a UTCTime or GeneralizedTime.
 *
 * @param {DerNode} node
 * @returns {Date}
 */
export function time(node) {
  const value = text(node);
  const utc = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(value);
  const general = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?Z$/.exec(value);
  const m = node.tag === TAG.UTC_TIME ? utc : general;
  if (!m) throw new DerError('Invalid time', node.start);
  let year = Number(m[1]);
  if (node.tag === TAG.UTC_TIME) year += year < 50 ? 2000 : 1900;
  const date = new Date(
    Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)),
  );
  if (Number.isNaN(date.getTime())) throw new DerError('Invalid time', node.start);
  return date;
}

/**
 * Short label of a tag for the structure view: `SEQUENCE`, `[0]`, `[APPLICATION 3]`.
 *
 * @param {DerNode} node
 * @returns {string}
 */
export function tagName(node) {
  if (node.cls === 0) return UNIVERSAL_NAMES[node.tag] ?? `UNIVERSAL ${node.tag}`;
  if (node.cls === 2) return `[${node.tag}]`;
  return `[${node.cls === 1 ? 'APPLICATION' : 'PRIVATE'} ${node.tag}]`;
}
