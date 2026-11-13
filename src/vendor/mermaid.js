// @ts-check
/**
 * Mermaid, bundled on its own (dist/vendor/mermaid.js and its chunks in dist/vendor/mermaid/)
 * and loaded only when a page shows a diagram. Each type of diagram is a chunk of its own,
 * fetched the first time a diagram of that type is drawn.
 *
 * Mermaid runs with `securityLevel: "strict"`: no click handlers, no HTML in labels. Its
 * HTML writes, inline styles and stylesheets go through what Vitrine sets (see
 * trusted-html.js), and so does the DOMPurify it uses inside, so it also works where a
 * strict Content Security Policy and Trusted Types are enforced.
 *
 * @module vendor/mermaid
 */
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import { releaseStyles, setSanitizers } from './trusted-html.js';

let count = 0;
/** Renders run one at a time: Mermaid's configuration is global. */
let queue = Promise.resolve();
let sanitizeWrapped = false;

/**
 * Hands over Vitrine's sanitizers (see trusted-html.js).
 *
 * @param {import('./trusted-html.js').Sanitizers} sanitizers
 */
export function useSanitizers(sanitizers) {
  setSanitizers(sanitizers);
  const tt = /** @type {any} */ (globalThis).trustedTypes;
  if (sanitizeWrapped || !tt) return;
  sanitizeWrapped = true;
  // Mermaid's DOMPurify parses its input with DOMParser, a Trusted Types sink: it gets a
  // policy whose createHTML is Vitrine's sanitizer.
  const policy = {
    createHTML: (/** @type {string} */ html) => sanitizers.html(html),
    createScriptURL: () => {
      throw new TypeError('[vitrine] Script URLs are not allowed in diagrams.');
    },
  };
  const sanitize = DOMPurify.sanitize.bind(DOMPurify);
  /** @type {any} */ (DOMPurify).sanitize = (/** @type {any} */ dirty, /** @type {any} */ config) =>
    sanitize(dirty, { ...(config ?? {}), TRUSTED_TYPES_POLICY: policy });
}

/**
 * Draws a diagram and returns its SVG markup, to be sanitized by the caller, and its CSS.
 *
 * @param {string} text - Mermaid source.
 * @param {Record<string, unknown>} config - Theme variables and options.
 * @returns {Promise<{ svg: string, css: string }>}
 */
export function renderDiagram(text, config) {
  const run = queue.then(async () => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      // Mermaid 12 lays out with ELK by default; ELK is not bundled (EPL-2.0 OR GPL-3.0).
      layout: 'dagre',
      suppressErrorRendering: true,
      maxTextSize: 100_000,
      maxEdges: 1000,
      theme: 'base',
      ...config,
    });
    count += 1;
    try {
      const { svg } = await mermaid.render(`vt-diagram-${count}`, text);
      return { svg, css: releaseStyles() };
    } catch (error) {
      releaseStyles();
      throw error;
    }
  });
  queue = run.then(
    () => {},
    () => {},
  );
  return run;
}
