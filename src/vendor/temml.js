// @ts-check
/**
 * Temml, bundled on its own (dist/vendor/temml.js) and loaded only when a page shows math.
 * It turns TeX into MathML, which every current browser draws natively.
 *
 * Only `render` is used: it builds the MathML with DOM methods (styles through CSSOM), so it
 * works under a strict Content Security Policy and Trusted Types.
 *
 * @module vendor/temml
 */
import temml from 'temml';

/**
 * @param {string} tex
 * @param {Element} target
 * @param {Record<string, unknown>} options
 */
export function render(tex, target, options) {
  temml.render(tex, /** @type {HTMLElement} */ (target), options);
}

export const ParseError = temml.ParseError;
export const version = temml.version;
