// @ts-check
/**
 * Loads the map library and the world shapes on demand from dist/vendor/geo.js (next to
 * the language files), once per page.
 *
 * @module components/map/geo-loader
 */
import { defaultVendorUrl } from '../../core/asset-urls.js';
import { getConfig } from '../../core/config.js';

/** @type {{ ready: boolean, geo: any, promise: Promise<any> } | null} */
let state = null;

/**
 * @returns {{ ready: boolean, geo: any, promise: Promise<any> }}
 */
export function loadGeo() {
  if (state) return state;
  const base = getConfig().vendorUrl || defaultVendorUrl();
  /** @type {{ ready: boolean, geo: any, promise: Promise<any> }} */
  const current = { ready: false, geo: null, promise: Promise.resolve() };
  current.promise = import(/* @vite-ignore */ new URL('geo.js', base || location.href).href).then(
    (module) => {
      current.geo = module;
      current.ready = true;
      return module;
    },
    (error) => {
      // A later map may try again (network back, different base URL).
      state = null;
      throw error;
    },
  );
  state = current;
  return current;
}
