// @ts-check
/**
 * Tag data: normalization and validation of tags coming from JSON, parsing of typed
 * text into tags, and serialization of the selection.
 *
 * Every field is checked and bounded: tags come from page data, a backend, or people
 * typing, and end up in the DOM, in CSS custom properties and in form values.
 *
 * @module components/tags/model
 */
import { isSafeUrl } from '../../core/urls.js';

/** Most options kept (larger lists are cut). */
export const MAX_OPTIONS = 100_000;
/** Longest value or label kept. */
const MAX_TEXT = 200;

/**
 * @typedef {object} Tag
 * @property {string} value - Identifier sent to the backend.
 * @property {string} label - Text shown.
 * @property {string} [color] - Any CSS color (validated).
 * @property {string} [group] - Group heading in lists.
 * @property {string} [description] - Secondary text in lists.
 * @property {number} [count] - Number shown next to the tag (e.g. uses).
 * @property {string} [kind] - Style hook: exposed as the `tag-kind-<kind>` part.
 * @property {string} [href] - Makes the tag a link in view mode (safe URLs only).
 * @property {boolean} [disabled] - Cannot be selected or removed.
 */

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
function text(value, max) {
  if (value === null || value === undefined) return '';
  // eslint-disable-next-line no-control-regex
  const controls = /[\u0000-\u001f\u007f]/g;
  return String(value).replace(controls, ' ').trim().slice(0, max);
}

/**
 * Accepts a CSS color, refusing anything that is not a plain color value.
 *
 * @param {unknown} value
 * @returns {string | undefined}
 */
export function safeColor(value) {
  if (typeof value !== 'string' || value.length > 60) return undefined;
  const v = value.trim();
  if (/[;{}<>\\]|url\(|var\(|expression/i.test(v)) return undefined;
  if (typeof CSS !== 'undefined' && CSS.supports && !CSS.supports('color', v)) return undefined;
  return v;
}

/**
 * Makes a string safe as a part name or CSS identifier fragment.
 *
 * @param {string} value
 * @returns {string}
 */
export function slug(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Normalizes one tag: a string, or an object with `value` and optional fields.
 *
 * @param {unknown} input
 * @returns {Tag | null}
 */
export function normalizeTag(input) {
  if (typeof input === 'string' || typeof input === 'number') {
    const value = text(input, MAX_TEXT);
    return value ? { value, label: value } : null;
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = /** @type {Record<string, unknown>} */ (input);
  const value = text(source.value ?? source.label ?? source.name, MAX_TEXT);
  if (!value) return null;
  /** @type {Tag} */
  const tag = { value, label: text(source.label ?? source.name ?? value, MAX_TEXT) || value };
  const color = safeColor(source.color);
  if (color) tag.color = color;
  const group = text(source.group, 100);
  if (group) tag.group = group;
  const description = text(source.description, 300);
  if (description) tag.description = description;
  if (typeof source.count === 'number' && Number.isFinite(source.count)) tag.count = source.count;
  const kind = typeof source.kind === 'string' ? slug(source.kind) : '';
  if (kind) tag.kind = kind;
  if (typeof source.href === 'string' && source.href.trim() && isSafeUrl(source.href))
    tag.href = source.href.trim();
  if (source.disabled === true) tag.disabled = true;
  return tag;
}

/**
 * Normalizes a list of tags, dropping invalid entries and duplicates.
 *
 * @param {unknown} input
 * @param {boolean} caseSensitive
 * @returns {Tag[]}
 */
export function normalizeList(input, caseSensitive) {
  if (!Array.isArray(input)) return [];
  /** @type {Tag[]} */
  const tags = [];
  const seen = new Set();
  for (const item of input.slice(0, MAX_OPTIONS)) {
    const tag = normalizeTag(item);
    if (!tag) continue;
    const key = tagKey(tag.value, caseSensitive);
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/**
 * Reads the JSON given to the element: an array (the selected tags) or an object
 * `{ value, options }`.
 *
 * @param {string} json
 * @param {boolean} caseSensitive
 * @returns {{ value: Tag[], options: Tag[] }}
 * @throws {SyntaxError} When the text is not JSON.
 */
export function parseTagsJson(json, caseSensitive) {
  if (!json.trim()) return { value: [], options: [] };
  const data = JSON.parse(json);
  if (Array.isArray(data)) return { value: normalizeList(data, caseSensitive), options: [] };
  if (data && typeof data === 'object') {
    return {
      value: normalizeList(data.value ?? data.selected ?? data.tags ?? [], caseSensitive),
      options: normalizeList(data.options ?? [], caseSensitive),
    };
  }
  throw new SyntaxError('Expected an array of tags or an object with "value" and "options".');
}

/**
 * Comparison key of a tag value.
 *
 * @param {string} value
 * @param {boolean} caseSensitive
 * @returns {string}
 */
export function tagKey(value, caseSensitive) {
  const v = value.trim().normalize('NFC');
  return caseSensitive ? v : v.toLocaleLowerCase();
}

/**
 * Splits typed or pasted text into tag candidates.
 *
 * @param {string} input
 * @param {{ separators: string, prefix: string }} options - `prefix` (e.g. "#") starts a
 *   new tag and is removed; with a prefix, whitespace also separates tags.
 * @returns {string[]}
 */
export function splitInput(input, { separators, prefix }) {
  const escaped = [...separators]
    .map((c) => (c === '\n' ? '\\n' : c.replace(/[\\\]^-]/g, '\\$&')))
    .join('');
  const pattern = prefix ? new RegExp(`[${escaped}\\s]+`) : new RegExp(`[${escaped}\\n]+`);
  return input
    .split(pattern)
    .map((part) => part.trim())
    .map((part) => (prefix && part.startsWith(prefix) ? part.slice(prefix.length) : part))
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Serializes selected values for a form field.
 *
 * @param {Tag[]} tags
 * @param {"json" | "csv" | "lines"} format
 * @returns {string}
 */
export function serialize(tags, format) {
  const values = tags.map((tag) => tag.value);
  if (format === 'lines') return values.join('\n');
  if (format === 'csv')
    return values.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',');
  return JSON.stringify(values);
}

/**
 * Filters options for a query (label, value or description contain it).
 *
 * @param {Tag[]} options
 * @param {string} query
 * @param {number} limit
 * @returns {{ tags: Tag[], total: number }}
 */
export function filterOptions(options, query, limit) {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return { tags: options.slice(0, limit), total: options.length };
  /** @type {Tag[]} */
  const starts = [];
  /** @type {Tag[]} */
  const contains = [];
  let total = 0;
  for (const tag of options) {
    const label = tag.label.toLocaleLowerCase();
    const hit =
      label.includes(q) ||
      tag.value.toLocaleLowerCase().includes(q) ||
      (tag.description ?? '').toLocaleLowerCase().includes(q);
    if (!hit) continue;
    total += 1;
    // Labels starting with the query come first.
    if (label.startsWith(q)) {
      if (starts.length < limit) starts.push(tag);
    } else if (contains.length < limit) contains.push(tag);
  }
  return { tags: [...starts, ...contains].slice(0, limit), total };
}
