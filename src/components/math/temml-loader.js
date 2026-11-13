// @ts-check
/**
 * Loads Temml on demand from dist/vendor/temml.js, once per page. A page or a build that
 * already has Temml can hand it over with {@link useMathEngine} instead.
 *
 * @module components/math/temml-loader
 */
import { defaultVendorUrl } from '../../core/asset-urls.js';
import { getConfig } from '../../core/config.js';

/**
 * @typedef {object} MathEngine
 * @property {(tex: string, target: Element, options: Record<string, unknown>) => void} render
 * @property {Function} [ParseError]
 */

/** @type {{ ready: boolean, engine: MathEngine | null, promise: Promise<MathEngine> } | null} */
let state = null;

/**
 * @returns {{ ready: boolean, engine: MathEngine | null, promise: Promise<MathEngine> }}
 */
export function loadMathEngine() {
  if (state) return state;
  const base = getConfig().vendorUrl || defaultVendorUrl();
  /** @type {{ ready: boolean, engine: MathEngine | null, promise: Promise<MathEngine> }} */
  const current = { ready: false, engine: null, promise: Promise.resolve(/** @type {any} */ (null)) }; // prettier-ignore
  current.promise = import(/* @vite-ignore */ new URL('temml.js', base || location.href).href).then(
    (module) => {
      current.engine = { render: module.render, ParseError: module.ParseError };
      current.ready = true;
      return current.engine;
    },
    (error) => {
      // A later element may try again (network back, different base URL).
      state = null;
      throw error;
    },
  );
  state = current;
  return current;
}

/**
 * Uses a Temml that is already loaded (bundled with the page, or `import temml from 'temml'`)
 * instead of fetching dist/vendor/temml.js.
 *
 * @param {{ render: Function, ParseError?: Function }} engine - Temml, or an object with its `render`.
 *
 * @example
 * import temml from 'temml';
 * import { useMathEngine } from 'vitrine/dist/esm/vt-math.js';
 * useMathEngine(temml);
 */
export function useMathEngine(engine) {
  if (!engine || typeof engine.render !== 'function')
    throw new TypeError('[vitrine] useMathEngine(): expected Temml (an object with render()).');
  const ready = /** @type {MathEngine} */ ({ render: engine.render.bind(engine), ParseError: engine.ParseError }); // prettier-ignore
  state = { ready: true, engine: ready, promise: Promise.resolve(ready) };
}
