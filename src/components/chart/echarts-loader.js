// @ts-check
/**
 * Loads Apache ECharts on demand from dist/vendor/echarts.js (next to the language
 * files), once per page.
 *
 * @module components/chart/echarts-loader
 */
import { defaultVendorUrl } from '../../core/asset-urls.js';
import { getConfig } from '../../core/config.js';

/** @type {{ ready: boolean, echarts: any, promise: Promise<any> } | null} */
let state = null;

/**
 * @returns {{ ready: boolean, echarts: any, promise: Promise<any> }}
 */
export function loadECharts() {
  if (state) return state;
  const base = getConfig().vendorUrl || defaultVendorUrl();
  /** @type {{ ready: boolean, echarts: any, promise: Promise<any> }} */
  const current = { ready: false, echarts: null, promise: Promise.resolve() };
  current.promise = import(
    /* @vite-ignore */ new URL('echarts.js', base || location.href).href
  ).then(
    (module) => {
      current.echarts = module.echarts;
      current.ready = true;
      return module.echarts;
    },
    (error) => {
      // A later chart may try again (network back, different base URL).
      state = null;
      throw error;
    },
  );
  state = current;
  return current;
}
