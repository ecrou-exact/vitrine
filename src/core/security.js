// @ts-check
/**
 * Security primitives: HTML sanitization, URL checks and the Trusted Types policy.
 *
 * This is the only module allowed to turn an HTML string into DOM nodes.
 * Every other module builds DOM with `createElement` / `textContent`.
 *
 * @module core/security
 */
import DOMPurify from 'dompurify';
import { isSafeUrl, isSameOrigin } from './urls.js';

export { isSafeUrl, isSameOrigin };

/** Name of the Trusted Types policy created by Vitrine. */
export const TRUSTED_TYPES_POLICY_NAME = 'vitrine';

/** Elements that may survive sanitization. Anything else is removed (its text is kept). */
const ALLOWED_TAGS = Object.freeze([
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'caption',
  'code',
  'col',
  'colgroup',
  'dd',
  'del',
  'details',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'input',
  'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
  'var',
]);

/** Attributes that may survive sanitization. `style`, `id`, event handlers… are always removed. */
const ALLOWED_ATTR = Object.freeze([
  'align',
  'alt',
  'checked',
  'class',
  'colspan',
  'dir',
  'disabled',
  'height',
  'href',
  'lang',
  'open',
  'rowspan',
  'span',
  'src',
  'start',
  'title',
  'type',
  'width',
]);

/** Only `language-*` classes may be set by content (used for fenced code blocks). */
const SAFE_CLASS = /^language-[\w#+.-]{1,40}$/;

/** @typedef {NonNullable<import('dompurify').Config['TRUSTED_TYPES_POLICY']>} TrustedTypePolicy */

/** @type {TrustedTypePolicy | null | undefined} */
let policy;

/**
 * Returns the `vitrine` Trusted Types policy, creating it on first use.
 *
 * The policy is private to this module and only handed to DOMPurify, so the
 * identity `createHTML` is never reachable with unsanitized input from outside.
 * Returns `null` when Trusted Types are unsupported or the policy cannot be created
 * (for example when the page CSP does not list `vitrine` in `trusted-types`).
 *
 * @returns {TrustedTypePolicy | null}
 */
export function getTrustedTypesPolicy() {
  if (policy !== undefined) return policy;
  policy = null;
  const tt = /** @type {any} */ (globalThis).trustedTypes;
  if (tt && typeof tt.createPolicy === 'function') {
    try {
      policy = tt.createPolicy(TRUSTED_TYPES_POLICY_NAME, {
        createHTML: (/** @type {string} */ input) => input,
        createScriptURL: (/** @type {string} */ input) => input,
      });
    } catch {
      console.warn(
        `[vitrine] Could not create the "${TRUSTED_TYPES_POLICY_NAME}" Trusted Types policy. ` +
          'Add it to your CSP "trusted-types" directive.',
      );
    }
  }
  return policy ?? null;
}

/**
 * Returns the input as inert text. Used when the sanitizer cannot be trusted.
 *
 * @param {string} html
 * @returns {DocumentFragment}
 */
function textFallback(html) {
  const fragment = document.createDocumentFragment();
  fragment.append(document.createTextNode(String(html)));
  return fragment;
}

/** @type {boolean | undefined} */
let sanitizerOk;

/**
 * Checks once that DOMPurify really sanitizes in this environment.
 *
 * DOMPurify returns its input unchanged when it considers the environment unsupported,
 * and some non-browser DOM implementations make it fail silently. A known payload is
 * sanitized and inspected; if anything dangerous survives, every later call falls back
 * to plain text.
 *
 * The payload holds no event handler attribute: browsers report one under a strict CSP as
 * soon as it is parsed, even in a detached document, and this check runs on every page.
 *
 * @returns {boolean}
 */
export function sanitizerWorks() {
  if (sanitizerOk !== undefined) return sanitizerOk;
  sanitizerOk = false;
  try {
    if (!DOMPurify.isSupported) return false;
    const probe = DOMPurify.sanitize('<b>1</b><script>1</script><a href="javascript:1">a</a>', {
      RETURN_DOM_FRAGMENT: true,
      ...(getTrustedTypesPolicy()
        ? { TRUSTED_TYPES_POLICY: /** @type {TrustedTypePolicy} */ (getTrustedTypesPolicy()) }
        : {}),
    });
    sanitizerOk =
      probe instanceof DocumentFragment &&
      probe.querySelector('b') !== null &&
      probe.querySelector('script') === null &&
      !probe.querySelector('a')?.hasAttribute('href');
  } catch {
    sanitizerOk = false;
  }
  if (!sanitizerOk)
    console.warn('[vitrine] HTML sanitizer unavailable: rich content is shown as plain text.');
  return sanitizerOk;
}

/**
 * @typedef {object} SanitizeOptions
 * @property {"allow"|"block"|"same-origin"} [images="allow"] - Image policy.
 * @property {"new-tab"|"same"} [externalLinks="new-tab"] - How external links open.
 * @property {string} [baseUrl] - Base for relative URLs (e.g. the Markdown file URL).
 * @property {string} [lineMarkers] - Token signing source line markers
 *   (`<span data-vt-line="12:token">`). Markers without this exact token are stripped,
 *   so content cannot forge them.
 */

/**
 * Sanitizes an HTML string and returns inert DOM nodes.
 *
 * The HTML is parsed by DOMPurify in a detached document with a strict allow-list,
 * then post-processed: unsafe URLs are removed, external links get
 * `rel="noopener noreferrer"`, images follow the image policy, and only
 * `language-*` classes are kept.
 *
 * @param {string} html - Untrusted HTML.
 * @param {SanitizeOptions} [options]
 * @returns {DocumentFragment}
 */
export function sanitizeHtml(html, options = {}) {
  if (!sanitizerWorks()) return textFallback(html);
  const tt = getTrustedTypesPolicy();
  /** @type {import('dompurify').Config & { RETURN_DOM_FRAGMENT: true }} */
  const config = {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: options.lineMarkers ? [...ALLOWED_ATTR, 'data-vt-line'] : [...ALLOWED_ATTR],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SAFE_FOR_TEMPLATES: false,
    WHOLE_DOCUMENT: false,
    RETURN_DOM_FRAGMENT: true,
    KEEP_CONTENT: true,
  };
  if (tt) config.TRUSTED_TYPES_POLICY = tt;
  const fragment = DOMPurify.sanitize(String(html), config);
  postProcess(fragment, options);
  return fragment;
}

/** Classes highlight.js may emit: `hljs-*` scopes and sub-scope suffixes like `function_`. */
const HIGHLIGHT_CLASS = /^(?:hljs-[\w-]{1,40}|[a-z]{1,20}_{1,2})$/;

/**
 * Sanitizes highlight.js output: only `<span class="hljs-…">` and text survive.
 *
 * highlight.js already escapes its input; this is a second, independent barrier so
 * that a bug in a grammar can never inject markup.
 *
 * @param {string} html
 * @returns {DocumentFragment}
 */
export function sanitizeHighlight(html) {
  if (!sanitizerWorks()) return textFallback(html);
  const tt = getTrustedTypesPolicy();
  /** @type {import('dompurify').Config & { RETURN_DOM_FRAGMENT: true }} */
  const config = {
    ALLOWED_TAGS: ['span'],
    ALLOWED_ATTR: ['class'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
    KEEP_CONTENT: true,
  };
  if (tt) config.TRUSTED_TYPES_POLICY = tt;
  const fragment = DOMPurify.sanitize(String(html), config);
  for (const el of Array.from(fragment.querySelectorAll('[class]'))) {
    const kept = Array.from(el.classList).filter((name) => HIGHLIGHT_CLASS.test(name));
    if (kept.length) el.setAttribute('class', kept.join(' '));
    else el.removeAttribute('class');
  }
  return fragment;
}

/** SVG elements never kept from a drawing: scripts, embedded documents, external resources. */
const SVG_FORBIDDEN = Object.freeze([
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea',
  'select', 'link', 'meta', 'base', 'img', 'image', 'video', 'audio', 'source', 'animate',
  'animateMotion', 'animateTransform', 'set', 'feImage',
]); // prettier-ignore

/**
 * Removes from CSS what could reach outside the drawing: imports, external `url()` (local
 * `url(#id)` references stay), escapes that could spell them, and old script hooks.
 *
 * @param {string} css
 * @returns {string}
 */
export function cleanCss(css) {
  return String(css)
    .replace(/\\/g, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\s*\(\s*(['"]?)(?!#)[^)]*\)/gi, 'none')
    .replace(/expression\s*\(|behavior\s*:|-moz-binding/gi, '');
}

/**
 * Renames `style` attributes and `<style>` elements in markup before it is parsed.
 *
 * Under a strict `style-src`, browsers report every inline style they parse, even in the
 * inert document of the sanitizer. Inside tags, `style=` becomes `data-vt-style=`, and
 * `<style>` becomes `<vt-style>`, so nothing is reported; the sanitizer then removes them
 * or hands their (cleaned) CSS back. Text between tags is left as it is.
 *
 * @param {string} markup
 * @returns {string}
 */
function neutralizeStyles(markup) {
  return String(markup).replace(/<(\/?)([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (_, close, name, rest) => {
    const tag = name.toLowerCase() === 'style' ? 'vt-style' : name;
    const attrs = rest.replace(/(^|[\s"'])style(\s*=)/gi, '$1data-vt-style$2');
    return `<${close}${tag}${attrs}>`;
  }); // prettier-ignore
}

/**
 * Sanitizes a drawing or markup written by a library from content Vitrine does not trust
 * (Mermaid), and returns it as DOM, with the CSS of its `<style>` elements apart.
 *
 * Inline styles are moved to CSSOM (which a strict `style-src` allows) after the same
 * cleaning as stylesheets; links keep only local `#id` targets; scripts, embedded
 * documents, external resources and attribute animations are removed.
 *
 * @param {string} markup
 * @returns {{ fragment: DocumentFragment, css: string }}
 */
export function sanitizeDrawing(markup) {
  if (!sanitizerWorks()) return { fragment: textFallback(''), css: '' };
  const tt = getTrustedTypesPolicy();
  /** @type {string[]} */
  const css = [];
  /** @param {Element} node @param {{ tagName: string }} data */
  const keepStyle = (node, data) => {
    if (data.tagName === 'vt-style') css.push(node.textContent ?? '');
  };
  /** @param {Element} node */
  const keepLocalLinks = (node) => {
    for (const name of ['href', 'xlink:href']) {
      const value = node.getAttribute?.(name);
      if (value !== null && value !== undefined && !/^#[\w:.-]{1,200}$/.test(value.trim()))
        node.removeAttribute(name);
    }
  };
  /** @type {import('dompurify').Config & { RETURN_DOM_FRAGMENT: true }} */
  const config = {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['foreignObject'],
    ADD_ATTR: ['data-vt-style'],
    FORBID_TAGS: [...SVG_FORBIDDEN, 'vt-style'],
    FORBID_ATTR: ['style', 'srcset', 'action', 'formaction'],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
    KEEP_CONTENT: false,
  };
  if (tt) config.TRUSTED_TYPES_POLICY = tt;
  DOMPurify.addHook('uponSanitizeElement', /** @type {any} */ (keepStyle));
  DOMPurify.addHook('afterSanitizeAttributes', /** @type {any} */ (keepLocalLinks));
  /** @type {DocumentFragment} */
  let fragment;
  try {
    fragment = DOMPurify.sanitize(neutralizeStyles(markup), config);
  } finally {
    DOMPurify.removeHook('uponSanitizeElement', /** @type {any} */ (keepStyle));
    DOMPurify.removeHook('afterSanitizeAttributes', /** @type {any} */ (keepLocalLinks));
  }
  for (const el of Array.from(fragment.querySelectorAll('[data-vt-style]'))) {
    const value = cleanCss(el.getAttribute('data-vt-style') ?? '').slice(0, 4000);
    el.removeAttribute('data-vt-style');
    const style = /** @type {any} */ (el).style;
    if (style) style.cssText = value;
  }
  return { fragment, css: cleanCss(css.join('\n')) };
}

/**
 * Sanitizes an SVG drawing and returns its root element, with its CSS apart (for a
 * constructable stylesheet). See {@link sanitizeDrawing}.
 *
 * @param {string} markup
 * @returns {{ svg: SVGSVGElement | null, css: string }}
 */
export function sanitizeSvg(markup) {
  const { fragment, css } = sanitizeDrawing(markup);
  const svg = fragment.querySelector('svg');
  return { svg: /** @type {SVGSVGElement | null} */ (svg), css: svg ? css : '' };
}

/**
 * Sanitized markup ready for an `innerHTML` sink: a `TrustedHTML` from the `vitrine`
 * policy when Trusted Types are on, a string otherwise, without inline styles. Given as
 * the Trusted Types policy of the DOMPurify that Mermaid uses inside.
 *
 * @param {string} html
 * @returns {string}
 */
export function trustedMarkup(html) {
  if (!sanitizerWorks()) return '';
  const tt = getTrustedTypesPolicy();
  /** @type {import('dompurify').Config} */
  const config = {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_TAGS: ['foreignObject'],
    FORBID_TAGS: [...SVG_FORBIDDEN, 'vt-style'],
    FORBID_ATTR: ['style'],
  };
  if (tt) {
    config.TRUSTED_TYPES_POLICY = tt;
    config.RETURN_TRUSTED_TYPE = true;
  }
  return /** @type {string} */ (/** @type {unknown} */ (DOMPurify.sanitize(neutralizeStyles(html), config))); // prettier-ignore
}

/**
 * Applies the URL, link, image, class and input rules to sanitized nodes.
 *
 * @param {DocumentFragment} root
 * @param {SanitizeOptions} options
 */
function postProcess(root, options) {
  const images = options.images ?? 'allow';
  const newTab = (options.externalLinks ?? 'new-tab') === 'new-tab';
  const base = options.baseUrl;

  for (const marker of Array.from(root.querySelectorAll('[data-vt-line]'))) {
    const match = /^(\d{1,9}):(.+)$/.exec(marker.getAttribute('data-vt-line') ?? '');
    const genuine =
      match &&
      options.lineMarkers &&
      match[2] === options.lineMarkers &&
      marker.localName === 'span';
    if (genuine && !marker.hasChildNodes()) marker.setAttribute('data-vt-line', match[1]);
    else marker.removeAttribute('data-vt-line');
  }
  for (const el of Array.from(root.querySelectorAll('[class]'))) {
    const kept = Array.from(el.classList).filter(
      (name) => el.localName === 'code' && SAFE_CLASS.test(name),
    );
    if (kept.length) el.setAttribute('class', kept.join(' '));
    else el.removeAttribute('class');
  }
  for (const link of Array.from(root.querySelectorAll('a'))) processLink(link, newTab, base);
  for (const img of Array.from(root.querySelectorAll('img'))) processImage(img, images, base);
  for (const input of Array.from(root.querySelectorAll('input'))) {
    if (input.getAttribute('type') !== 'checkbox') input.remove();
    else input.setAttribute('disabled', '');
  }
}

/**
 * Resolves a relative URL against a base. Absolute URLs and fragments are unchanged.
 *
 * @param {string} url
 * @param {string | undefined} base
 * @returns {string}
 */
function resolveAgainst(url, base) {
  if (!base || url.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(url.trim())) return url;
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

/**
 * @param {HTMLAnchorElement} link
 * @param {boolean} newTab
 * @param {string | undefined} base
 */
function processLink(link, newTab, base) {
  const raw = link.getAttribute('href');
  if (raw === null) return;
  if (!isSafeUrl(raw)) {
    link.removeAttribute('href');
    return;
  }
  const href = resolveAgainst(raw, base);
  if (href !== raw) link.setAttribute('href', href);
  if (href.startsWith('#')) return;
  if (!isSameOrigin(href)) {
    link.setAttribute('rel', 'noopener noreferrer nofollow');
    // Only web links open in a new tab: mailto: and tel: hand over to another app.
    if (newTab && /^https?:/i.test(href.trim())) link.setAttribute('target', '_blank');
  }
}

/**
 * @param {HTMLImageElement} img
 * @param {"allow"|"block"|"same-origin"} policy
 * @param {string | undefined} base
 */
function processImage(img, policy, base) {
  const raw = img.getAttribute('src') ?? '';
  const src = isSafeUrl(raw, { allowDataImage: true }) ? resolveAgainst(raw, base) : raw;
  if (src !== raw) img.setAttribute('src', src);
  const allowed =
    policy === 'allow'
      ? isSafeUrl(src, { allowDataImage: true })
      : policy === 'same-origin' && isSafeUrl(src) && isSameOrigin(src);
  if (!allowed || !src) {
    const placeholder = img.ownerDocument.createElement('span');
    placeholder.className = 'vt-blocked-image';
    placeholder.textContent = img.getAttribute('alt') || '';
    placeholder.title = src.length > 200 ? src.slice(0, 200) + '…' : src;
    img.replaceWith(placeholder);
    return;
  }
  img.setAttribute('loading', 'lazy');
  img.setAttribute('decoding', 'async');
  img.setAttribute('referrerpolicy', 'no-referrer');
}
