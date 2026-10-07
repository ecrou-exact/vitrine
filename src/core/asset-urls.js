// @ts-check
/**
 * Default URLs of the lazy-loaded assets, set by the entry points. Kept apart from the
 * highlighter so components that never highlight code do not load highlight.js.
 *
 * @module core/asset-urls
 */

let languagesUrl = '';
let syntaxThemesUrl = '';
let vendorUrl = '';

/** @param {string} url - Base URL of `languages/*.js`. */
export function setDefaultLanguagesUrl(url) {
  languagesUrl = url;
}

/** @returns {string} */
export function defaultLanguagesUrl() {
  return languagesUrl;
}

/** @param {string} url - Base URL of `vendor/*.js` (Apache ECharts for <vt-chart>). */
export function setDefaultVendorUrl(url) {
  vendorUrl = url;
}

/** @returns {string} */
export function defaultVendorUrl() {
  return vendorUrl;
}

/** @param {string} url - Base URL of `syntax-themes/*.css`. */
export function setDefaultSyntaxThemesUrl(url) {
  syntaxThemesUrl = url;
}

/** @returns {string} */
export function defaultSyntaxThemesUrl() {
  return syntaxThemesUrl;
}
