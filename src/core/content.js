// @ts-check
/**
 * Content sources: inline markup and remote `src` URLs.
 *
 * @module core/content
 */
import { dedent } from './dom.js';
import { isSameOrigin } from './urls.js';

/**
 * Error with a stable code and parameters, so the UI can display a translated message.
 */
export class VitrineError extends Error {
  /**
   * @param {"tooLarge"|"tooComplex"|"tooDeep"|"remoteBlocked"|"unsafeUrl"|"timeout"|"loadFailed"|"invalidJson"} code
   * @param {Record<string, string | number>} [params]
   * @param {unknown} [cause]
   */
  constructor(code, params = {}, cause) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'VitrineError';
    this.code = code;
    this.params = params;
  }
}

/** Non-executable `<script>` types accepted as content containers. */
const DATA_SCRIPT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
  'text/json',
]);

/**
 * Reads content written inside the element, in priority order:
 * a child `<template>`, a child data `<script>` (`text/plain`, `text/markdown`,
 * `application/json`), then the element text.
 *
 * Inline content is dedented so it can be indented naturally in HTML.
 *
 * Inline content is parsed by the browser as part of the page *before* Vitrine runs,
 * so it must never contain untrusted data: use the `content` property instead.
 *
 * @param {HTMLElement} host
 * @returns {string | null} `null` when the element has no inline content.
 */
export function readInlineContent(host) {
  for (const child of Array.from(host.children)) {
    const text = readContainer(child);
    if (text !== null) return text;
  }
  let text = '';
  for (const node of Array.from(host.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
      text += node.nodeValue ?? '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      text += node.textContent ?? '';
    }
  }
  const result = dedent(text);
  return result === '' ? null : result;
}

/**
 * Reads a content container: a `<template>` or a data `<script>`.
 *
 * @param {Element} child
 * @returns {string | null} `null` when the element is not a container.
 */
export function readContainer(child) {
  if (child instanceof HTMLTemplateElement) {
    // A template holding markup is HTML source: serialize it (reading innerHTML is not a sink).
    // Otherwise it holds plain text, read as text so "a < b" is not turned into "a &lt; b".
    const hasElements = child.content.children.length > 0;
    return dedent(hasElements ? child.innerHTML : (child.content.textContent ?? ''));
  }
  if (
    child instanceof HTMLScriptElement &&
    DATA_SCRIPT_TYPES.has(child.type.trim().toLowerCase())
  ) {
    return dedent(child.textContent ?? '');
  }
  return null;
}

/**
 * Checks a content size against the configured limit.
 *
 * @param {string} text
 * @param {number} maxSize
 * @throws {VitrineError} When the text is longer than `maxSize`.
 */
export function assertSize(text, maxSize) {
  if (text.length > maxSize) {
    throw new VitrineError('tooLarge', { size: text.length, limit: maxSize });
  }
}

/**
 * @typedef {object} FetchOptions
 * @property {boolean} allowRemote - Allow cross-origin URLs.
 * @property {number} maxSize - Maximum number of characters to read.
 * @property {number} timeout - Timeout in milliseconds.
 * @property {AbortSignal} [signal] - Cancels the request (e.g. element removed or `src` changed).
 */

/**
 * Fetches text content from a URL with origin, size and time limits.
 *
 * - Only `http:` and `https:` URLs are accepted.
 * - Cross-origin URLs require `allowRemote`; otherwise the request runs with
 *   `mode: "same-origin"`, which also rejects cross-origin redirects.
 * - The body is streamed and the request is aborted as soon as `maxSize` is exceeded,
 *   so a huge response never gets fully downloaded.
 *
 * @param {string} src
 * @param {FetchOptions} options
 * @returns {Promise<string>}
 */
export async function fetchContent(src, options) {
  const url = resolveUrl(src);
  const sameOrigin = isSameOrigin(url.href);
  if (!sameOrigin && !options.allowRemote) throw new VitrineError('remoteBlocked');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new VitrineError('timeout')), options.timeout);
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) onAbort();

  try {
    const response = await fetch(url.href, {
      mode: sameOrigin ? 'same-origin' : 'cors',
      credentials: 'same-origin',
      redirect: 'follow',
      referrerPolicy: 'strict-origin-when-cross-origin',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new VitrineError('loadFailed', {
        url: displayUrl(url),
        reason: `HTTP ${response.status}`,
      });
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > options.maxSize * 4) {
      throw new VitrineError('tooLarge', { size: declared, limit: options.maxSize });
    }
    return await readBody(response, options.maxSize, controller);
  } catch (error) {
    throw normalizeFetchError(error, controller.signal, url);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * @param {string} src
 * @returns {URL}
 */
function resolveUrl(src) {
  /** @type {URL} */
  let url;
  try {
    url = new URL(src.trim(), document.baseURI);
  } catch {
    throw new VitrineError('unsafeUrl');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new VitrineError('unsafeUrl');
  return url;
}

/**
 * Streams the response body as text, stopping at `maxSize` characters.
 *
 * @param {Response} response
 * @param {number} maxSize
 * @param {AbortController} controller
 * @returns {Promise<string>}
 */
async function readBody(response, maxSize, controller) {
  if (!response.body) {
    const text = await response.text();
    assertSize(text, maxSize);
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.length > maxSize) {
      controller.abort();
      throw new VitrineError('tooLarge', { size: `> ${maxSize}`, limit: maxSize });
    }
  }
  text += decoder.decode();
  assertSize(text, maxSize);
  return text;
}

/**
 * @param {unknown} error
 * @param {AbortSignal} signal
 * @param {URL} url
 * @returns {unknown}
 */
function normalizeFetchError(error, signal, url) {
  if (error instanceof VitrineError) return error;
  if (signal.aborted && signal.reason instanceof VitrineError) return signal.reason;
  if (error instanceof DOMException && error.name === 'AbortError') return error;
  const reason = error instanceof Error ? error.message : String(error);
  return new VitrineError('loadFailed', { url: displayUrl(url), reason }, error);
}

/**
 * Shortens a URL for display in error messages.
 *
 * @param {URL} url
 * @returns {string}
 */
function displayUrl(url) {
  const text = url.origin === location.origin ? url.pathname + url.search : url.href;
  return text.length > 120 ? text.slice(0, 119) + '…' : text;
}

/**
 * Tells whether an error comes from a deliberate cancellation.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError';
}
