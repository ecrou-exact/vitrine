// @ts-check
/**
 * URL checks shared by the sanitizer, content loading and tags.
 * Kept apart from the sanitizer so components that never parse HTML do not load DOMPurify.
 *
 * @module core/urls
 */

/** URL schemes accepted in `href` / `src` (relative URLs and fragments are always accepted). */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);
/** Raster image formats accepted as `data:` URLs when images are allowed. SVG is excluded on purpose. */
const SAFE_DATA_IMAGE = /^data:image\/(?:png|gif|jpe?g|webp|avif);base64,[a-z0-9+/]+=*$/i;

/**
 * Tells whether a URL is safe to use in `href` or `src`.
 *
 * Accepts relative URLs, fragments, and the `http:`, `https:`, `mailto:` and `tel:` schemes.
 * `javascript:`, `vbscript:`, `data:` (except raster images when allowed) and every other
 * scheme are rejected. Control characters and whitespace tricks are normalized first,
 * exactly like browsers do.
 *
 * @param {string} url
 * @param {{ allowDataImage?: boolean }} [options]
 * @returns {boolean}
 */
export function isSafeUrl(url, options = {}) {
  if (typeof url !== 'string') return false;
  // Browsers strip leading/trailing C0 controls and spaces, and remove tabs/newlines anywhere.
  // eslint-disable-next-line no-control-regex
  const normalized = url.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '');
  if (normalized === '') return true;
  if (options.allowDataImage && SAFE_DATA_IMAGE.test(normalized)) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(normalized);
  if (!scheme) return true;
  return SAFE_SCHEMES.has(scheme[1].toLowerCase() + ':');
}

/**
 * Tells whether a URL resolves to the current page origin.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isSameOrigin(url) {
  try {
    return new URL(url, document.baseURI).origin === location.origin;
  } catch {
    return false;
  }
}
