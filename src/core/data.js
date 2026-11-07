// @ts-check
/**
 * Reading JSON written by other people: values of the wrong type are ignored, texts are bounded,
 * links keep safe schemes only, and dates stay within what a `Date` holds.
 *
 * @module core/data
 */
import { isSafeUrl } from './urls.js';

/** The largest time a `Date` holds, in milliseconds. */
const MAX_TIME = 8.64e15;

/** Items read from one list. */
export const MAX_ITEMS = 1000;

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
export const isObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string} The text of a string or a number, else an empty string.
 */
export function text(value, max = 4000) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * The first of some keys that has a text.
 *
 * @param {Record<string, any>} item
 * @param {string[]} keys
 * @param {number} [max]
 * @returns {string}
 */
export function firstText(item, keys, max) {
  for (const key of keys) {
    const value = text(item[key], max);
    if (value) return value;
  }
  return '';
}

/**
 * @param {unknown} value
 * @returns {string | null} A link with a safe scheme, else `null`.
 */
export function safeLink(value) {
  const url = text(value, 2000);
  return url && isSafeUrl(url) ? url : null;
}

/**
 * @param {unknown} value
 * @returns {string | null} An image address with a safe scheme (raster `data:` included), else `null`.
 */
export function safeImage(value) {
  if (typeof value !== 'string') return null;
  const url = value.trim().slice(0, 5_000_000);
  return url && isSafeUrl(url, { allowDataImage: true }) ? url : null;
}

/**
 * Seconds or milliseconds since 1970, or a date string.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function toTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const time = Math.abs(value) > 1e11 ? value : value * 1000;
    return Math.abs(time) <= MAX_TIME ? time : null;
  }
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/**
 * @param {unknown} value
 * @returns {number | null} A finite number, from a number or a numeric string.
 */
export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @typedef {{ ok: true, items: Record<string, any>[], root: Record<string, any> }
 *   | { ok: false, error: 'json', message: string }
 *   | { ok: false, error: 'shape', message: string }} ListResult
 */

/**
 * Parses JSON that holds a list: the list itself, or an object with the list under some key.
 *
 * @param {string} source
 * @param {string[]} keys - Where the list may be in an object.
 * @returns {ListResult}
 */
export function parseList(source, keys) {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(source);
  } catch (error) {
    return { ok: false, error: 'json', message: error instanceof Error ? error.message : '' };
  }
  /** @type {unknown} */
  let list = data;
  if (isObject(data)) list = keys.map((key) => data[key]).find(Array.isArray);
  if (!Array.isArray(list))
    return { ok: false, error: 'shape', message: keys.map((key) => `"${key}"`).join(', ') };
  return {
    ok: true,
    items: list.filter(isObject).slice(0, MAX_ITEMS),
    root: isObject(data) ? data : {},
  };
}

/**
 * @param {string} name
 * @returns {string} Up to two initials.
 */
export function initials(name) {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters
    .map((word) => [...word][0] ?? '')
    .join('')
    .toUpperCase();
}
