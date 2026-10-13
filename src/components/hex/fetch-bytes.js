// @ts-check
/**
 * Fetches binary content with the same rules as text content: http(s) only, same origin
 * unless allowed, size and time limits, cancellable.
 *
 * @module components/hex/fetch-bytes
 */
import { VitrineError } from '../../core/content.js';
import { isSameOrigin } from '../../core/urls.js';

/**
 * @param {string} src
 * @param {import('../../core/content.js').FetchOptions} options - `maxSize` is in bytes.
 * @returns {Promise<Uint8Array>}
 */
export async function fetchBytes(src, options) {
  /** @type {URL} */
  let url;
  try {
    url = new URL(src.trim(), document.baseURI);
  } catch {
    throw new VitrineError('unsafeUrl');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new VitrineError('unsafeUrl');
  const sameOrigin = isSameOrigin(url.href);
  if (!sameOrigin && !options.allowRemote) throw new VitrineError('remoteBlocked');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new VitrineError('timeout')), options.timeout);
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  const where = url.origin === location.origin ? url.pathname : url.href;

  try {
    const response = await fetch(url.href, {
      mode: sameOrigin ? 'same-origin' : 'cors',
      credentials: 'same-origin',
      redirect: 'follow',
      referrerPolicy: 'strict-origin-when-cross-origin',
      signal: controller.signal,
    });
    if (!response.ok)
      throw new VitrineError('loadFailed', { url: where, reason: `HTTP ${response.status}` });
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > options.maxSize)
      throw new VitrineError('tooLarge', { size: declared, limit: options.maxSize });
    return await readBytes(response, options.maxSize, controller);
  } catch (error) {
    if (error instanceof VitrineError) throw error;
    if (controller.signal.aborted && controller.signal.reason instanceof VitrineError)
      throw controller.signal.reason;
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new VitrineError('loadFailed', { url: where, reason }, error);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Streams the body, stopping at `maxSize` bytes.
 *
 * @param {Response} response
 * @param {number} maxSize
 * @param {AbortController} controller
 * @returns {Promise<Uint8Array>}
 */
async function readBytes(response, maxSize, controller) {
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.length > maxSize)
      throw new VitrineError('tooLarge', { size: buffer.length, limit: maxSize });
    return buffer;
  }
  const reader = response.body.getReader();
  /** @type {Uint8Array[]} */
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxSize) {
      controller.abort();
      throw new VitrineError('tooLarge', { size: `> ${maxSize}`, limit: maxSize });
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
