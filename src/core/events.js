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
  /** Split layout or scroll sync changed. Detail: `{ preview, sync }` (diff: `{ sync }`). */
  LAYOUT_CHANGE: 'vt-layout-change',
  /** Tree: an entry was activated. Detail: `{ path, name, type, note, status }`. */
  SELECT: 'vt-select',
  /** Tree: a folder was opened or closed. Detail: `{ path, expanded }`. */
  TOGGLE: 'vt-toggle',
  /** Log: levels shown or search changed. Detail: `{ levels, query, shown }`. */
  FILTER_CHANGE: 'vt-filter-change',
  /** Terminal: the typing replay finished or was stopped. Detail: `{}`. */
  TYPING_END: 'vt-typing-end',
  /** Diff: moved to a change. Detail: `{ index, total, original, modified }`. */
  CHANGE_NAVIGATE: 'vt-change-navigate',
  /** Job: a step was opened or closed. Detail: `{ name, open }`. */
  STEP_TOGGLE: 'vt-step-toggle',
  /** Job: the status of the job or a step changed. Detail: `{ status, step, previous }`. */
  JOB_CHANGE: 'vt-job-change',
  /** Regex: matching ran. Detail: `{ count, capped, timedOut }`. */
  MATCH: 'vt-match',
  /** Table: a selection bar action was chosen. Detail: `{ action, keys, rows }`. */
  BULK_ACTION: 'vt-bulk-action',
  /** Table: a cell was edited (cancelable). Detail: `{ key, column, value, previous, row }`. */
  CELL_EDIT: 'vt-cell-edit',
  /** Table: columns shown, moved, resized or pinned. Detail: `{ columns }`. */
  COLUMN_CHANGE: 'vt-column-change',
  /** Table: Enter or double-click on a row. Detail: `{ key, row }`. */
  ROW_ACTIVATE: 'vt-row-activate',
  /** Status: the overall state changed. Detail: `{ status, previous }`. */
  STATUS_CHANGE: 'vt-status-change',
  /** Calendar: the period shown changed. Detail: `{ date, view }`. */
  DATE_CHANGE: 'vt-date-change',
  /** Calendar: an event was opened. Detail: `{ uid, title, start, end, allDay, url }`. */
  EVENT_SELECT: 'vt-event-select',
  /** Pricing: the period or currency changed. Detail: `{ period, currency }`. */
  PRICING_CHANGE: 'vt-pricing-change',
  /** Pricing: a plan button was pressed (cancelable). Detail: `{ plan, name, period, currency, amount, url }`. */
  PLAN_SELECT: 'vt-plan-select',
  /** Board: a task is about to be added (cancelable). Detail: `{ task }`. */
  TASK_ADD: 'vt-task-add',
  /** Board: a task is about to move (cancelable). Detail: `{ task, from, to, index }`. */
  TASK_MOVE: 'vt-task-move',
  /** Board: a task is about to change (cancelable). Detail: `{ task, changes }`. */
  TASK_EDIT: 'vt-task-edit',
  /** Board: a task is about to be deleted (cancelable). Detail: `{ task }`. */
  TASK_DELETE: 'vt-task-delete',
  /** Countdown: the date was reached while the page was open. Detail: `{ to }`. */
  COUNTDOWN_END: 'vt-countdown-end',
  /** Upload: a file is about to be added (cancelable). Detail: `{ file }`. */
  FILE_ADD: 'vt-file-add',
  /** Upload: a file was removed. Detail: `{ file }`. */
  FILE_REMOVE: 'vt-file-remove',
  /** Upload: a file is about to be sent (cancelable). Detail: `{ file, request }`. */
  UPLOAD_START: 'vt-upload-start',
  /** Upload: part of a file was sent. Detail: `{ file, loaded, total }`. */
  UPLOAD_PROGRESS: 'vt-upload-progress',
  /** Upload: a file was sent. Detail: `{ file, status, response }`. */
  UPLOAD_DONE: 'vt-upload-done',
  /** Upload: a file could not be sent. Detail: `{ file, status }`. */
  UPLOAD_ERROR: 'vt-upload-error',
  /** Download: a file link was followed (cancelable). Detail: `{ name, url, os, arch, recommended }`. */
  DOWNLOAD: 'vt-download',
  /** Password or secret: a value was generated. Detail: `{ length }`. */
  GENERATE: 'vt-generate',
  /** Password: known breaches were checked. Detail: `{ count }`. */
  BREACH: 'vt-breach',
  /** Secret: the key is about to be regenerated (cancelable). Detail: `{ provider }`. */
  ROTATE: 'vt-rotate',
  /** Consent: a choice was made or read back. Detail: `{ categories, action, id }`. */
  CONSENT: 'vt-consent',
  /** Hash: the hashes of the text or file were computed. Detail: `{ source, name, size, hashes }`. */
  HASH: 'vt-hash',
  /** Hash: a fingerprint was compared. Detail: `{ state, algorithm }`. */
  VERIFY: 'vt-verify',
  /** Loading indicator: became visible (after its delay). Detail: `{ type }`. */
  LOADING_START: 'vt-loading-start',
  /** Loading indicator: hidden again (after its minimum duration). Detail: `{ type, duration }`. */
  LOADING_END: 'vt-loading-end',
  /** Questionnaire: the step changed. Detail: `{ from, to, id }`. */
  STEP: 'vt-step',
  /** Questionnaire: every answer passed the check. Detail: `{ value }`. */
  SUBMIT: 'vt-submit',
  /** Progress indicator: the value changed. Detail: `{ value, max, ratio }`. */
  PROGRESS: 'vt-progress',
  /** Progress indicator or task list: finished. Detail: `{ status }`. */
  COMPLETE: 'vt-complete',
  /** Loading overlay or task list: the reader asked to cancel. Detail: `{}`. */
  CANCEL: 'vt-cancel',
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
