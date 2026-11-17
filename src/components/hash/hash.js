// @ts-check
/**
 * Hashes computed in the page: MD5 in JavaScript, SHA-1, SHA-256, SHA-384 and SHA-512 with
 * Web Crypto. Fingerprints are read in the forms tools print them (hex with or without
 * separators, base64, Subresource Integrity `sha384-…`, `sha256:…` digests, `sha256sum`
 * lines) and compared with the computed ones.
 *
 * @module components/hash/hash
 */

/** @typedef {"md5" | "sha1" | "sha256" | "sha384" | "sha512"} Algorithm */
/** @typedef {"hex" | "upper" | "base64" | "sri"} Format */

/** @type {readonly Algorithm[]} */
export const ALGORITHMS = Object.freeze(['md5', 'sha1', 'sha256', 'sha384', 'sha512']);

/** Display names. */
export const NAMES = Object.freeze({ md5: 'MD5', sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' }); // prettier-ignore

/** Digest sizes in bytes. */
const SIZES = /** @type {Record<Algorithm, number>} */ ({ md5: 16, sha1: 20, sha256: 32, sha384: 48, sha512: 64 }); // prettier-ignore

/** MD5 and SHA-1 are broken for collisions: fine to find a file, not to prove it was not changed. */
export const WEAK = new Set(['md5', 'sha1']);

// ---------------------------------------------------------------- MD5 (RFC 1321)

const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0); // prettier-ignore

/**
 * @param {Uint8Array} bytes
 * @returns {Uint8Array} The 16-byte MD5 digest.
 */
export function md5(bytes) {
  const length = bytes.length;
  const blocks = ((length + 8) >>> 6) + 1;
  const words = new Uint32Array(blocks * 16);
  for (let i = 0; i < length; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  words[length >> 2] |= 0x80 << ((length % 4) * 8);
  const bits = length * 8;
  words[blocks * 16 - 2] = bits >>> 0;
  words[blocks * 16 - 1] = Math.floor(bits / 2 ** 32);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let block = 0; block < blocks; block++) {
    const base = block * 16;
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f;
      let g;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const sum = (a + f + K[i] + words[base + g]) >>> 0;
      const shift = S[(i >> 4) * 4 + (i % 4)];
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((word, i) => {
    for (let j = 0; j < 4; j++) out[i * 4 + j] = (word >>> (j * 8)) & 0xff;
  });
  return out;
}

// ---------------------------------------------------------------- digests

const SUBTLE_NAMES = /** @type {Record<string, string>} */ ({ sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' }); // prettier-ignore

/** @returns {boolean} Whether Web Crypto is available (HTTPS pages and localhost). */
export function canDigest() {
  return Boolean(globalThis.crypto?.subtle);
}

/**
 * @param {Algorithm} algorithm
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array | null>} `null` when Web Crypto is not available.
 */
export async function digest(algorithm, bytes) {
  if (algorithm === 'md5') return md5(bytes);
  if (!canDigest()) return null;
  // A copy: the buffer may be shared or larger than the view.
  const result = await crypto.subtle.digest(SUBTLE_NAMES[algorithm], bytes.slice());
  return new Uint8Array(result);
}

/**
 * Every digest of the bytes.
 *
 * @param {Uint8Array} bytes
 * @param {readonly Algorithm[]} algorithms
 * @returns {Promise<Partial<Record<Algorithm, Uint8Array | null>>>}
 */
export async function digestAll(bytes, algorithms) {
  /** @type {Partial<Record<Algorithm, Uint8Array | null>>} */
  const out = {};
  for (const algorithm of algorithms) out[algorithm] = await digest(algorithm, bytes);
  return out;
}

// ---------------------------------------------------------------- formats

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * @param {Algorithm} algorithm
 * @param {Uint8Array} bytes
 * @param {Format} format
 * @returns {string}
 */
export function formatDigest(algorithm, bytes, format) {
  if (format === 'upper') return toHex(bytes).toUpperCase();
  if (format === 'base64') return toBase64(bytes);
  if (format === 'sri') return `${algorithm}-${toBase64(bytes)}`;
  return toHex(bytes);
}

/**
 * @param {string} text
 * @returns {Uint8Array | null}
 */
function fromBase64(text) {
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * @param {string} hex
 * @returns {Uint8Array}
 */
function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * @param {number} size
 * @returns {Algorithm[]}
 */
function bySize(size) {
  return ALGORITHMS.filter((a) => SIZES[a] === size);
}

/**
 * Reads a fingerprint: hex (any case, with spaces or colons), base64, `sha384-…` (Subresource
 * Integrity), `sha256:…` (container digests), `SHA256 (file) = …` (BSD) or `… file`
 * (`sha256sum`).
 *
 * @param {string} input
 * @returns {{ bytes: Uint8Array, algorithms: Algorithm[] } | null} The digest and the
 *   algorithms it can be, `null` when it cannot be read.
 */
export function parseFingerprint(input) {
  let text = input.trim().slice(0, 1000);
  if (!text) return null;
  /** @type {Algorithm | null} */
  let named = null;
  const bsd = /^(MD5|SHA1|SHA-?256|SHA-?384|SHA-?512)\s*\([^)]*\)\s*=\s*(\S+)$/i.exec(text);
  const prefixed = /^(md5|sha-?1|sha-?256|sha-?384|sha-?512)[-:](\S+)$/i.exec(text);
  if (bsd || prefixed) {
    const match = /** @type {RegExpExecArray} */ (bsd ?? prefixed);
    named = /** @type {Algorithm} */ (match[1].toLowerCase().replace('-', ''));
    text = match[2];
  } else {
    // `sha256sum` output: the digest, then the file name.
    text = /^([0-9a-f]{32,128})\s+\*?\S/i.exec(text)?.[1] ?? text;
  }
  const hex = text.replace(/[\s:]/g, '');
  /** @type {Uint8Array | null} */
  let bytes = null;
  if (/^[0-9a-f]+$/i.test(hex) && hex.length % 2 === 0 && bySize(hex.length / 2).length)
    bytes = fromHex(hex); // prettier-ignore
  else if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(text)) bytes = fromBase64(text);
  if (!bytes) return null;
  const algorithms = named ? [named] : bySize(bytes.length);
  if (!algorithms.length || (named && SIZES[named] !== bytes.length)) return null;
  return { bytes, algorithms };
}

/**
 * Compares two digests in constant time for their length.
 *
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {boolean}
 */
export function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Finds which computed digest a fingerprint is.
 *
 * @param {string} input
 * @param {Partial<Record<Algorithm, Uint8Array | null>>} digests
 * @returns {{ state: "empty" | "invalid" | "match" | "mismatch" | "unknown", algorithm?: Algorithm }}
 *   `unknown`: the fingerprint is of an algorithm that is not computed.
 */
export function verify(input, digests) {
  if (!input.trim()) return { state: 'empty' };
  const fingerprint = parseFingerprint(input);
  if (!fingerprint) return { state: 'invalid' };
  for (const algorithm of fingerprint.algorithms) {
    const computed = digests[algorithm];
    if (computed && sameBytes(computed, fingerprint.bytes)) return { state: 'match', algorithm };
  }
  const known = fingerprint.algorithms.find((a) => digests[a]);
  return known ? { state: 'mismatch', algorithm: known } : { state: 'unknown', algorithm: fingerprint.algorithms[0] }; // prettier-ignore
}

/**
 * Reads the `algorithms` attribute.
 *
 * @param {string | null} value - Names separated by spaces or commas (`sha256 sha512`).
 * @returns {Algorithm[]}
 */
export function parseAlgorithms(value) {
  if (!value?.trim()) return [...ALGORITHMS];
  const names = value
    .toLowerCase()
    .split(/[\s,]+/)
    .map((n) => n.replace('-', ''));
  const list = ALGORITHMS.filter((a) => names.includes(a));
  return list.length ? list : [...ALGORITHMS];
}
