// @ts-check
/**
 * YAML reader for <vt-openapi> and <vt-yaml>, bundled on its own (dist/vendor/yaml.js) and loaded only
 * for content written in YAML.
 *
 * The core schema (with merge keys) only produces strings, numbers, booleans, null, arrays and objects:
 * never functions or class instances.
 *
 * @module vendor/yaml
 */
import { CORE_SCHEMA, load, loadAll, mergeTag } from 'js-yaml';

/** The core schema, plus merge keys (`<<: *base`), which only combine plain mappings. */
const SCHEMA = CORE_SCHEMA.withTags(mergeTag);

/**
 * @param {string} text
 * @returns {unknown}
 */
export function parseYaml(text) {
  return load(text, { schema: SCHEMA, json: true });
}

/**
 * Reads every document of a YAML stream (documents separated by `---`).
 *
 * @param {string} text
 * @returns {unknown[]}
 */
export function parseYamlAll(text) {
  /** @type {unknown[]} */
  const documents = [];
  loadAll(text, (document) => documents.push(document), { schema: SCHEMA, json: true });
  return documents;
}
