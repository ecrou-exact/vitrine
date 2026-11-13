// @ts-check
/**
 * dist/vitrine-loader.js: one small classic script that loads only the elements a page uses.
 *
 * It looks for `vt-*` elements that are not defined yet, now and whenever some are added
 * later, and imports the module of each one from `dist/esm/` (its shared code once). Only
 * names of Vitrine's own elements are ever turned into URLs.
 *
 * ```html
 * <script src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/vitrine-loader.js"
 *         data-config='{"theme": "auto"}' data-lazy></script>
 * ```
 *
 * - `data-config`: options for `configure()`, applied before any element is defined.
 * - `data-lazy`: an element is loaded when it comes near the screen.
 * - `data-base`: URL of the `dist/` folder, when the loader is served from elsewhere.
 *
 * It exposes `window.VitrineLoader`: `load(tag)`, `configure(options)` and `ready()`.
 *
 * @module loader
 */

/* global __VITRINE_ELEMENTS__ */

/** Names of the elements, without `vt-` (set at build time). */
// @ts-ignore -- replaced by esbuild `define`
const NAMES = new Set(/** @type {string[]} */ (typeof __VITRINE_ELEMENTS__ !== 'undefined' ? __VITRINE_ELEMENTS__ : [])); // prettier-ignore

const script = /** @type {HTMLScriptElement | null} */ (document.currentScript);
const base = new URL(script?.dataset.base || './', script?.src || document.baseURI);
const lazy = Boolean(script?.hasAttribute('data-lazy'));

/** @type {Map<string, Promise<CustomElementConstructor>>} */
const loading = new Map();
/** @type {Promise<any> | null} */
let api = null;

/** The shared API (`configure`, `registerLocale`, `registerTheme`…), loaded once. */
const loadApi = () => (api ??= import(new URL('esm/api.js', base).href));

/** Applied before any element is defined, so the first render uses it. */
const configured = (() => {
  const text = script?.dataset.config?.trim();
  if (!text) return Promise.resolve();
  /** @type {unknown} */
  let options;
  try {
    options = JSON.parse(text);
  } catch {
    console.warn('[vitrine] data-config is not valid JSON: it is ignored.');
    return Promise.resolve();
  }
  return loadApi().then((module) => module.configure(options));
})().catch((error) => console.warn('[vitrine] Could not apply data-config.', error));

/**
 * Loads the module of an element and resolves once it is defined.
 *
 * @param {string} tag - `vt-sql`, or `sql`.
 * @returns {Promise<CustomElementConstructor>}
 */
function load(tag) {
  const name = String(tag).toLowerCase().replace(/^vt-/, '');
  const full = `vt-${name}`;
  if (!NAMES.has(name))
    return Promise.reject(new TypeError(`[vitrine] Unknown element <${full}>.`));
  const defined = customElements.get(full);
  if (defined) return Promise.resolve(defined);
  let promise = loading.get(full);
  if (!promise) {
    promise = configured
      .then(() => import(new URL(`esm/${full}.js`, base).href))
      .then(() => customElements.whenDefined(full));
    promise.catch((error) => {
      // Another element may try again later (network back).
      loading.delete(full);
      console.warn(`[vitrine] Could not load <${full}>.`, error);
    });
    loading.set(full, promise);
  }
  return promise;
}

/** @type {IntersectionObserver | null} */
const nearScreen =
  lazy && typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            nearScreen?.unobserve(entry.target);
            load(entry.target.localName).catch(() => {});
          }
        },
        { rootMargin: '400px 0px' },
      )
    : null;

/**
 * @param {Element} element
 */
function request(element) {
  const name = element.localName;
  if (!name.startsWith('vt-') || !NAMES.has(name.slice(3)) || customElements.get(name)) return;
  if (nearScreen && !loading.has(name)) nearScreen.observe(element);
  else load(name).catch(() => {});
}

/**
 * @param {ParentNode} root
 */
function scan(root) {
  if (root instanceof Element) request(root);
  for (const element of root.querySelectorAll(':not(:defined)')) request(element);
}

new MutationObserver((records) => {
  for (const record of records)
    for (const node of record.addedNodes) if (node instanceof Element) scan(node);
}).observe(document.documentElement, { childList: true, subtree: true });
scan(document);
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', () => scan(document), { once: true });

/** @type {any} */ (window).VitrineLoader = Object.freeze({
  load,
  /**
   * Same options as `Vitrine.configure()`; the elements already on the page follow them.
   *
   * @param {Record<string, unknown>} options
   */
  configure: (options) => loadApi().then((module) => module.configure(options)),
  /** Resolves when every element requested so far is defined. */
  ready: () => Promise.allSettled([...loading.values()]).then(() => undefined),
});
