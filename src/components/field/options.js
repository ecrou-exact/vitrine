// @ts-check
/**
 * Options of a list field, and the values a field holds.
 *
 * @module components/field/options
 */
import { isObject, text } from '../../core/data.js';

/**
 * @typedef {object} FieldOption
 * @property {string} value
 * @property {string} label
 * @property {string} description
 * @property {string} group
 * @property {boolean} disabled
 */

/** Options read from one list. */
export const MAX_OPTIONS = 2000;

/** Types that show a list of options. */
export const LIST_TYPES = new Set(['select', 'multiselect', 'radio', 'checkboxes']);

/** Types that hold several values. */
export const MULTIPLE_TYPES = new Set(['multiselect', 'checkboxes']);

/** Types read from an `<input>`, as the browser knows them. */
export const INPUT_TYPES = new Set([
  'text', 'email', 'url', 'tel', 'password', 'search', 'number', 'date', 'time',
  'datetime-local', 'month', 'week', 'color', 'range',
]); // prettier-ignore

/** Every type a field can be. */
export const TYPES = [...INPUT_TYPES, 'textarea', 'checkbox', 'switch', ...LIST_TYPES];

/**
 * @param {unknown} item
 * @param {string} group
 * @returns {FieldOption | null}
 */
function readOption(item, group) {
  if (typeof item === 'string' || typeof item === 'number') {
    const value = text(item, 500);
    return value ? { value, label: value, description: '', group, disabled: false } : null;
  }
  if (!isObject(item)) return null;
  const value = text(item.value ?? item.id ?? item.label, 500);
  if (!value) return null;
  return {
    value,
    label: text(item.label ?? item.name ?? item.value, 500) || value,
    description: text(item.description ?? item.hint, 500),
    group: text(item.group, 200) || group,
    disabled: item.disabled === true,
  };
}

/**
 * Reads options: JSON (a list of strings or `{ value, label, description, group, disabled }`,
 * groups as `{ group, options: [...] }`, or `{ options }`), else one option per line, with
 * `value | label` when they differ.
 *
 * @param {string} source
 * @returns {FieldOption[]}
 */
export function parseOptions(source) {
  const trimmed = source.trim();
  if (!trimmed) return [];
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, MAX_OPTIONS)
      .map((line) => {
        const [value, ...label] = line.split('|');
        return {
          value: value.trim(),
          label: label.join('|').trim() || value.trim(),
          description: '',
          group: '',
          disabled: false,
        };
      })
      .filter((option) => option.value);
  }
  const list = Array.isArray(data) ? data : isObject(data) && Array.isArray(data.options) ? data.options : []; // prettier-ignore
  /** @type {FieldOption[]} */
  const options = [];
  /** @type {Set<string>} */
  const seen = new Set();
  const push = (/** @type {FieldOption | null} */ option) => {
    if (option && !seen.has(option.value) && options.length < MAX_OPTIONS) {
      seen.add(option.value);
      options.push(option);
    }
  };
  for (const item of list) {
    if (isObject(item) && Array.isArray(item.options)) {
      const group = text(item.group ?? item.label, 200);
      for (const child of item.options) push(readOption(child, group));
    } else push(readOption(item, ''));
  }
  return options;
}

/**
 * Folds case and accents, so "eclair" finds "Éclair".
 *
 * @param {string} value
 * @returns {string}
 */
export function fold(value) {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * @param {FieldOption[]} options
 * @param {string} query
 * @returns {FieldOption[]} Options whose label, value or description hold every word.
 */
export function filterOptions(options, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return options;
  return options.filter((option) => {
    const haystack = fold(`${option.label} ${option.value} ${option.description} ${option.group}`);
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * The values of a multiple field written in an attribute: a JSON list, or values separated
 * by commas.
 *
 * @param {string | null} value
 * @returns {string[]}
 */
export function readValues(value) {
  if (!value) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const list = JSON.parse(trimmed);
      if (Array.isArray(list)) return list.map((item) => text(item, 500)).filter(Boolean);
    } catch {
      // Read as a list separated by commas.
    }
  }
  return trimmed
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
