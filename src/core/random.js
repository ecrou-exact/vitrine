// @ts-check
/**
 * Random strings from the browser's cryptographic generator, without bias: values that would
 * favor the first characters of an alphabet are drawn again.
 *
 * @module core/random
 */

/** Alphabets by name. */
export const ALPHABETS = Object.freeze({
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digit: '0123456789',
  symbol: '!#$%&*+-.:;=?@^_~',
  hex: '0123456789abcdef',
  base32: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
  base62: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  base64url: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
});

/** Characters easy to mistake for one another when read or typed. */
export const AMBIGUOUS = 'Il1O0o|`\'"';

/**
 * @param {number} count
 * @returns {Uint32Array}
 */
function randomWords(count) {
  const words = new Uint32Array(count);
  crypto.getRandomValues(words);
  return words;
}

/**
 * A random whole number in [0, max), without modulo bias.
 *
 * @param {number} max - At most 2^32.
 * @returns {number}
 */
export function randomBelow(max) {
  if (!(max > 0)) return 0;
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  for (;;) {
    for (const word of randomWords(8)) if (word < limit) return word % max;
  }
}

/**
 * @param {number} length
 * @param {string} alphabet
 * @returns {string} `length` characters drawn from `alphabet`.
 */
export function randomString(length, alphabet) {
  const chars = [...new Set(alphabet)];
  if (!chars.length) return '';
  let out = '';
  for (let i = 0; i < length; i += 1) out += chars[randomBelow(chars.length)];
  return out;
}

/**
 * Shuffles in place (Fisher–Yates) with the cryptographic generator.
 *
 * @template T
 * @param {T[]} list
 * @returns {T[]}
 */
export function shuffle(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = randomBelow(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
