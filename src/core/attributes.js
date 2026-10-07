// @ts-check
/**
 * Defensive attribute parsers. Attribute values come from page authors (or from
 * user-controlled templates), so every parser bounds its output and falls back to a
 * default instead of throwing.
 *
 * @module core/attributes
 */

/** Longest attribute value we bother parsing. */
const MAX_ATTRIBUTE_LENGTH = 1000;

/**
 * Parses a boolean attribute.
 *
 * - absent → `null` (let the variant preset decide)
 * - `""`, `"true"`, `"on"`, `"yes"`, the attribute name → `true`
 * - `"false"`, `"off"`, `"no"`, `"0"` → `false`
 *
 * @param {string | null} value
 * @returns {boolean | null}
 */
export function parseBoolean(value) {
  if (value === null) return null;
  const v = value.trim().toLowerCase();
  return !(v === 'false' || v === 'off' || v === 'no' || v === '0');
}

/**
 * Parses an integer within bounds.
 *
 * @param {string | null} value
 * @param {{ min: number, max: number, fallback: number }} options
 * @returns {number}
 */
export function parseInteger(value, { min, max, fallback }) {
  if (value === null || value.length > 32) return fallback;
  const trimmed = value.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return fallback;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Parses an enumerated attribute (case-insensitive).
 *
 * @template {string} T
 * @param {string | null} value
 * @param {readonly T[]} allowed
 * @param {T} fallback
 * @returns {T}
 */
export function parseEnum(value, allowed, fallback) {
  if (value === null) return fallback;
  const v = /** @type {T} */ (value.trim().toLowerCase());
  return allowed.includes(v) ? v : fallback;
}

/**
 * Parses a comma separated list of identifiers (e.g. `"preview,source"`), keeping only
 * allowed values, without duplicates, in the given order.
 *
 * @template {string} T
 * @param {string | null} value
 * @param {readonly T[]} allowed
 * @returns {T[] | null} `null` when absent or when nothing valid remains.
 */
export function parseList(value, allowed) {
  if (value === null || value.length > MAX_ATTRIBUTE_LENGTH) return null;
  /** @type {T[]} */
  const result = [];
  for (const item of value.split(',')) {
    const v = /** @type {T} */ (item.trim().toLowerCase());
    if (allowed.includes(v) && !result.includes(v)) result.push(v);
  }
  return result.length ? result : null;
}

/** @typedef {[start: number, end: number]} Range */

/** Maximum number of ranges kept from a `highlight-lines` value. */
const MAX_RANGES = 500;

/**
 * Parses a line range list such as `"2,5-8, 12"` into sorted, merged ranges.
 *
 * Ranges are never expanded into individual numbers, so `"1-999999999"` costs nothing.
 * Invalid parts are ignored. Reversed ranges (`"8-5"`) are normalized.
 *
 * @param {string | null} value
 * @returns {Range[]}
 */
export function parseRanges(value) {
  if (!value || value.length > MAX_ATTRIBUTE_LENGTH * 10) return [];
  /** @type {Range[]} */
  const ranges = [];
  for (const part of value.split(',')) {
    if (ranges.length >= MAX_RANGES) break;
    const match = /^\s*(\d{1,9})\s*(?:-\s*(\d{1,9})\s*)?$/.exec(part);
    if (!match) continue;
    const a = Number(match[1]);
    const b = match[2] === undefined ? a : Number(match[2]);
    ranges.push([Math.min(a, b), Math.max(a, b)]);
  }
  ranges.sort((x, y) => x[0] - y[0]);
  /** @type {Range[]} */
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1] + 1) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

/**
 * Tells whether `n` falls in one of the sorted, merged ranges (binary search).
 *
 * @param {number} n
 * @param {Range[]} ranges
 * @returns {boolean}
 */
export function inRanges(n, ranges) {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = ranges[mid];
    if (n < start) hi = mid - 1;
    else if (n > end) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * Validates a CSS length for `max-height` (e.g. `"400px"`, `"50vh"`, `"20rem"`).
 * Only plain lengths and percentages are accepted: no `var()`, `calc()` or keywords,
 * so authors cannot smuggle unexpected values.
 *
 * @param {string | null} value
 * @returns {string | null} The normalized length, or `null` when invalid.
 */
export function parseCssLength(value) {
  if (value === null) return null;
  const v = value.trim().toLowerCase();
  if (!/^\d{1,6}(?:\.\d{1,4})?(?:px|em|rem|vh|svh|lvh|dvh|%|ch|lh)$/.test(v)) return null;
  return v;
}

/**
 * Cleans a short display string (title, file name…): removes control characters,
 * collapses whitespace and caps the length.
 *
 * @param {string | null} value
 * @param {number} [max=200]
 * @returns {string}
 */
export function cleanLabel(value, max = 200) {
  if (!value) return '';
  // eslint-disable-next-line no-control-regex
  const v = value.slice(0, max * 4).replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
  const collapsed = v.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? collapsed.slice(0, max - 1) + '…' : collapsed;
}

/**
 * Builds a safe download file name: strips paths, reserved characters and control
 * characters, and caps the length.
 *
 * @param {string | null} value
 * @param {string} fallback
 * @returns {string}
 */
export function cleanFileName(value, fallback) {
  const base = (value ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const reserved = /[\u0000-\u001f\u007f<>:"|?*]/g;
  const cleaned = base
    .replace(reserved, '')
    .replace(/^[.\s]+/, '')
    .trim();
  const name = cleaned.slice(0, 120);
  return name || fallback;
}
