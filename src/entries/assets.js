// @ts-check
/**
 * Points the lazy-loaded assets (highlight.js languages, syntax themes) at a dist folder.
 *
 * @module entries/assets
 */
import { setDefaultLanguagesUrl, setDefaultSyntaxThemesUrl } from '../core/asset-urls.js';

/**
 * @param {URL} distUrl - URL of the dist/ folder.
 */
export function useAssetsFrom(distUrl) {
  setDefaultLanguagesUrl(new URL('languages/', distUrl).href);
  setDefaultSyntaxThemesUrl(new URL('syntax-themes/', distUrl).href);
}
