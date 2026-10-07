// @ts-check
/**
 * Event names and dispatch helper.
 *
 * Every Vitrine event is a bubbling, composed `CustomEvent` prefixed with `vt-`.
 *
 * @module core/events
 */

/** Event names dispatched by Vitrine elements. */
export const EVENTS = Object.freeze({
  /** Content rendered. Detail: `{ type }`. */
  READY: 'vt-ready',
  /** Text copied to the clipboard. Detail: `{ text }`. */
  COPY: 'vt-copy',
  /** Search updated. Detail: `{ query, matches }`. */
  SEARCH: 'vt-search',
  /** Active tab changed. Detail: `{ tab }`. */
  TAB_CHANGE: 'vt-tab-change',
  /** Split layout changed. Detail: `{ preview, sync }`. */
  LAYOUT_CHANGE: 'vt-layout-change',
  /** Content could not be loaded or displayed. Detail: `{ message, cause }`. */
  ERROR: 'vt-error',
});

/**
 * Dispatches a bubbling, composed custom event.
 *
 * @template T
 * @param {EventTarget} target
 * @param {string} name
 * @param {T} detail
 * @returns {boolean} `false` if a listener called `preventDefault()`.
 */
export function emit(target, name, detail) {
  return target.dispatchEvent(
    new CustomEvent(name, { detail, bubbles: true, composed: true, cancelable: true }),
  );
}
