// @ts-check
/**
 * Loads Mermaid on demand from dist/vendor/mermaid.js, once per page. A page or a build that
 * already draws diagrams can hand over its own renderer with {@link useDiagramEngine}.
 *
 * @module components/diagram/mermaid-loader
 */
import { defaultVendorUrl } from '../../core/asset-urls.js';
import { getConfig } from '../../core/config.js';
import { cleanCss, sanitizeDrawing, trustedMarkup } from '../../core/security.js';

/**
 * @typedef {object} DiagramEngine
 * @property {(text: string, config: Record<string, unknown>) => Promise<string | { svg: string, css?: string }>} render -
 *   Returns SVG markup, or the markup and its CSS apart.
 */

/** @type {{ ready: boolean, engine: DiagramEngine | null, promise: Promise<DiagramEngine> } | null} */
let state = null;

/**
 * @returns {{ ready: boolean, engine: DiagramEngine | null, promise: Promise<DiagramEngine> }}
 */
export function loadDiagramEngine() {
  if (state) return state;
  const base = getConfig().vendorUrl || defaultVendorUrl();
  /** @type {{ ready: boolean, engine: DiagramEngine | null, promise: Promise<DiagramEngine> }} */
  const current = { ready: false, engine: null, promise: Promise.resolve(/** @type {any} */ (null)) }; // prettier-ignore
  current.promise = import(
    /* @vite-ignore */ new URL('mermaid.js', base || location.href).href
  ).then(
    (module) => {
      // Mermaid's own HTML writes and styles are sanitized by Vitrine (see vendor/trusted-html.js).
      module.useSanitizers({ html: trustedMarkup, fragment: sanitizeDrawing, css: cleanCss });
      current.engine = { render: module.renderDiagram };
      current.ready = true;
      return current.engine;
    },
    (error) => {
      state = null;
      throw error;
    },
  );
  state = current;
  return current;
}

/**
 * Draws diagrams with another renderer: a function that takes the source and a Mermaid
 * configuration and returns SVG markup. The SVG is sanitized like Mermaid's.
 *
 * @param {DiagramEngine} engine
 *
 * @example
 * import mermaid from 'mermaid';
 * useDiagramEngine({
 *   async render(text, config) {
 *     mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', ...config });
 *     return (await mermaid.render(`d${Date.now()}`, text)).svg;
 *   },
 * });
 */
export function useDiagramEngine(engine) {
  if (!engine || typeof engine.render !== 'function')
    throw new TypeError('[vitrine] useDiagramEngine(): expected an object with render().');
  state = { ready: true, engine, promise: Promise.resolve(engine) };
}
