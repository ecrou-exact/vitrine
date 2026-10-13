// @ts-check
/**
 * Loads the YAML reader on demand from dist/vendor/yaml.js, once per page.
 *
 * @module core/yaml-loader
 */
import { defaultVendorUrl } from './asset-urls.js';
import { getConfig } from './config.js';

/**
 * @typedef {object} YamlReader
 * @property {boolean} ready
 * @property {((text: string) => unknown) | null} parse - Reads a single document.
 * @property {((text: string) => unknown[]) | null} parseAll - Reads every document of a stream.
 * @property {Promise<unknown>} promise
 */

/** @type {YamlReader | null} */
let state = null;

/** @returns {YamlReader} */
export function loadYaml() {
  if (state) return state;
  const base = getConfig().vendorUrl || defaultVendorUrl();
  /** @type {YamlReader} */
  const current = { ready: false, parse: null, parseAll: null, promise: Promise.resolve() };
  current.promise = import(/* @vite-ignore */ new URL('yaml.js', base || location.href).href).then(
    (module) => {
      current.parse = module.parseYaml;
      current.parseAll = module.parseYamlAll;
      current.ready = true;
    },
    (error) => {
      state = null;
      throw error;
    },
  );
  state = current;
  return current;
}
