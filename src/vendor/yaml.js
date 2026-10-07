// @ts-check
/**
 * YAML reader for <vt-openapi>, bundled on its own (dist/vendor/yaml.js) and loaded only
 * for specifications written in YAML.
 *
 * The core schema only produces strings, numbers, booleans, null, arrays and objects:
 * never functions or class instances.
 *
 * @module vendor/yaml
 */
import { CORE_SCHEMA, load } from 'js-yaml';

/**
 * @param {string} text
 * @returns {unknown}
 */
export function parseYaml(text) {
  return load(text, { schema: CORE_SCHEMA, json: true });
}
