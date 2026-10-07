// @ts-check
/**
 * Loads the YAML reader on demand from dist/vendor/yaml.js, once per page.
 *
 * @module components/openapi/yaml-loader
 */
import { defaultVendorUrl } from '../../core/asset-urls.js';
import { getConfig } from '../../core/config.js';

/** @type {{ ready: boolean, parse: ((text: string) => unknown) | null, promise: Promise<unknown> } | null} */
let state = null;

/**
 * @returns {{ ready: boolean, parse: ((text: string) => unknown) | null, promise: Promise<unknown> }}
 */
export function loadYaml() {
  if (state) return state;
  const base = getConfig().vendorUrl || defaultVendorUrl();
  /** @type {{ ready: boolean, parse: ((text: string) => unknown) | null, promise: Promise<unknown> }} */
  const current = { ready: false, parse: null, promise: Promise.resolve() };
  current.promise = import(/* @vite-ignore */ new URL('yaml.js', base || location.href).href).then(
    (module) => {
      current.parse = module.parseYaml;
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
