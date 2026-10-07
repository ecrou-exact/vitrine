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
  /** Content edited. Detail: `{ value }`. */
  INPUT: 'vt-input',
  /** Editor left after edits. Detail: `{ value }`. */
  CHANGE: 'vt-change',
  /** Mode switched with the edit toggle. Detail: `{ mode }`. */
  MODE_CHANGE: 'vt-mode-change',
  /** Tags: the selection changed (also `vt-change`). Detail: `{ tag }`. */
  TAG_ADD: 'vt-tag-add',
  /** Tags: a tag was removed. Detail: `{ tag }`. */
  TAG_REMOVE: 'vt-tag-remove',
  /** Tags: a new tag is about to be created (cancelable). Detail: `{ tag }`. */
  TAG_CREATE: 'vt-tag-create',
  /** Tags: a tag was activated in view mode. Detail: `{ tag }`. */
  TAG_CLICK: 'vt-tag-click',
  /** A table was sorted. Detail: `{ column, name, direction }`. */
  SORT: 'vt-sort',
  /** Full screen entered or left. Detail: `{ fullscreen }`. */
  FULLSCREEN_CHANGE: 'vt-fullscreen-change',
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
