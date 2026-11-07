// @ts-check
/**
 * JSON as input for every element: the value a `data` property, a `json` attribute, a
 * `json-src` address or a `<script type="application/json" data-json>` gives is turned into
 * the content the element reads, plus the few attributes it may set.
 *
 * @module core/data-input
 */
import { isObject } from './data.js';

/**
 * What an element makes of a JSON value: its text, and attributes from its allow-list.
 *
 * @typedef {{ content: string, attributes?: Record<string, unknown> }} DataResult
 */

/**
 * The value at a path such as `data.items` or `result[0].code`. Only own properties are
 * followed, so `__proto__` or `constructor` lead nowhere.
 *
 * @param {unknown} value
 * @param {string} path
 * @returns {{ ok: true, value: unknown } | { ok: false }}
 */
export function pickPath(value, path) {
  const steps = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((step) => step.trim())
    .filter(Boolean);
  let current = value;
  for (const step of steps.slice(0, 32)) {
    if (Array.isArray(current) && /^\d+$/.test(step) && Number(step) < current.length)
      current = current[Number(step)];
    else if (isObject(current) && Object.hasOwn(current, step)) current = current[step];
    else return { ok: false };
  }
  return { ok: true, value: current };
}

/**
 * JSON text, indented.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function jsonText(value) {
  return JSON.stringify(value === undefined ? null : value, null, 2) ?? 'null';
}

/**
 * The common shape of a wrapped text: a string, or an object holding the text under one of
 * some keys, with options beside it. Options are mapped to attributes by name.
 *
 * @param {unknown} value
 * @param {object} options
 * @param {string[]} options.keys - Where the text may be, in order.
 * @param {Record<string, string>} [options.attributes] - JSON key to attribute name.
 * @param {(value: unknown) => DataResult} [options.otherwise] - For values without the text.
 * @returns {DataResult}
 */
export function wrapped(value, { keys, attributes = {}, otherwise }) {
  if (typeof value === 'string') return { content: value };
  if (isObject(value)) {
    const key = keys.find((name) => typeof value[name] === 'string');
    if (key !== undefined) {
      /** @type {Record<string, unknown>} */
      const found = {};
      for (const [name, attribute] of Object.entries(attributes))
        if (Object.hasOwn(value, name) && !Object.hasOwn(found, attribute))
          found[attribute] = value[name];
      return { content: value[key], attributes: found };
    }
  }
  return otherwise ? otherwise(value) : { content: jsonText(value) };
}

/**
 * The list in a value: the value itself, or the first list under some keys.
 *
 * @param {unknown} value
 * @param {string[]} keys
 * @returns {unknown[] | null}
 */
export function listIn(value, keys) {
  if (Array.isArray(value)) return value;
  if (!isObject(value)) return null;
  for (const key of keys) if (Array.isArray(value[key])) return value[key];
  return null;
}
