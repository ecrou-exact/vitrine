// @ts-check
/**
 * What Mermaid and d3 call instead of writing HTML and inline styles, in dist/vendor/mermaid.js
 * (the build rewrites those writes to call these functions). With them, diagrams are drawn
 * on pages with a strict Content Security Policy and enforced Trusted Types, and nothing is
 * reported by the browser:
 *
 * - `innerHTML` writes insert markup sanitized by Vitrine, as DOM (`setHtml`);
 * - `style` attributes are set through CSSOM (`setAttributeSafely`);
 * - the stylesheet of a diagram being drawn is a constructable stylesheet on the document,
 *   with only the rules scoped to that diagram, until the drawing is done (`adoptStyle`).
 *
 * @module vendor/trusted-html
 */

/** Ids of the diagrams Vitrine draws start with this. */
const ID_PREFIX = '#vt-diagram-';

/**
 * @typedef {object} Sanitizers
 * @property {(html: string) => unknown} html - Markup for a Trusted Types sink.
 * @property {(html: string) => { fragment: DocumentFragment }} fragment - Markup as sanitized DOM.
 * @property {(css: string) => string} css - Cleans a stylesheet.
 */

/** @type {Sanitizers} */
let sanitizers = {
  html: () => '',
  fragment: () => ({ fragment: document.createDocumentFragment() }),
  css: () => '',
};
/** @type {CSSStyleSheet[]} */
const adopted = [];
/** @type {string[]} */
let collected = [];

/**
 * @param {Sanitizers} next
 */
export function setSanitizers(next) {
  sanitizers = next;
}

/** @returns {Sanitizers} */
export function getSanitizers() {
  return sanitizers;
}

/**
 * `target.innerHTML = value`, with the markup sanitized and inserted as DOM.
 *
 * @param {Element} target
 * @param {unknown} value
 */
export function setHtml(target, value) {
  target.replaceChildren(sanitizers.fragment(value == null ? '' : String(value)).fragment);
}

/**
 * `element.setAttribute(name, value)`, except that `style` goes through CSSOM.
 *
 * @param {Element} element
 * @param {string} name
 * @param {unknown} value
 */
export function setAttributeSafely(element, name, value) {
  const style = /** @type {CSSStyleDeclaration | undefined} */ (/** @type {any} */ (element).style);
  if (String(name).toLowerCase() === 'style' && style)
    style.cssText = sanitizers.css(String(value ?? '')); // prettier-ignore
  else element.setAttribute(name, /** @type {string} */ (value));
}

/**
 * Applies the stylesheet of a diagram being drawn, so that Mermaid measures its text with
 * the right fonts, and keeps it for the drawing. Only the rules whose every selector starts
 * with the id of a diagram are applied: nothing else on the page can be styled.
 *
 * @param {string} css
 */
export function adoptStyle(css) {
  const clean = sanitizers.css(String(css ?? ''));
  collected.push(clean);
  if (typeof CSSStyleSheet !== 'function' || !('adoptedStyleSheets' in document)) return;
  const sheet = new CSSStyleSheet();
  try {
    sheet.replaceSync(clean);
  } catch {
    return;
  }
  for (let i = sheet.cssRules.length - 1; i >= 0; i -= 1) {
    const rule = sheet.cssRules[i];
    const scoped =
      rule instanceof CSSStyleRule &&
      rule.selectorText.split(',').every((selector) => selector.trim().startsWith(ID_PREFIX));
    if (!scoped) sheet.deleteRule(i);
  }
  adopted.push(sheet);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

/**
 * Removes the stylesheets of the diagrams drawn, and returns their CSS.
 *
 * @returns {string}
 */
export function releaseStyles() {
  const css = collected.join('\n');
  collected = [];
  if (adopted.length) {
    const done = new Set(adopted.splice(0));
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => !done.has(sheet));
  }
  return css;
}
