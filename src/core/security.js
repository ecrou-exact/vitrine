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

/** URL schemes accepted in `href` / `src` (relative URLs and fragments are always accepted). */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** Raster image formats accepted as `data:` URLs when images are allowed. SVG is excluded on purpose. */
const SAFE_DATA_IMAGE = /^data:image\/(?:png|gif|jpe?g|webp|avif);base64,[a-z0-9+/]+=*$/i;

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
 * @returns {boolean}
 */
export function sanitizerWorks() {
  if (sanitizerOk !== undefined) return sanitizerOk;
  sanitizerOk = false;
  try {
    if (!DOMPurify.isSupported) return false;
    const probe = DOMPurify.sanitize(
      '<img src="x" onerror="1"><script>1</script><a href="javascript:1">a</a>',
      {
        RETURN_DOM_FRAGMENT: true,
        ...(getTrustedTypesPolicy()
          ? { TRUSTED_TYPES_POLICY: /** @type {TrustedTypePolicy} */ (getTrustedTypesPolicy()) }
          : {}),
      },
    );
    const img = probe.querySelector('img');
    sanitizerOk =
      probe instanceof DocumentFragment &&
      img !== null &&
      !img.hasAttribute('onerror') &&
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
    ALLOWED_ATTR: [...ALLOWED_ATTR],
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
