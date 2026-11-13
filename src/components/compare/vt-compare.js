// @ts-check
import csvCss from '../../styles/csv.css?raw';
import compareCss from '../../styles/compare.css?raw';
import { parseBoolean, parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { fetchContent, isAbortError, readContainer } from '../../core/content.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { TextSearch } from '../../core/search.js';
import { loadingView, noticeView } from '../../core/ui.js';
import { PivotError, readDataset } from '../pivot/pivot.js';
import { compareDatasets, comparisonToCsv } from './compare.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./compare.js').Comparison} Comparison */
/** @typedef {import('./compare.js').CompareRow} CompareRow */
/** @typedef {import('./compare.js').Status} Status */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const FILTERS = /** @type {const} */ (['changes', 'all', 'added', 'removed', 'changed']);
/** @typedef {(typeof FILTERS)[number]} Filter */
/** Rows drawn; the others are counted. */
const MAX_ROWS = 2000;
/** Columns drawn. */
const MAX_FIELDS = 60;
const SIDES = /** @type {const} */ (['original', 'modified']);

/**
 * Compares two datasets: rows are paired by a key column (found, or set with `key`), then
 * shown as added, removed or changed, with the old and new value of each changed cell.
 * Columns added or removed are named. Reads CSV or JSON, as `<vt-table>` and `<vt-pivot>`.
 *
 * Give the two datasets as `<template data-original>` and `<template data-modified>`, the
 * `original` and `modified` properties, the `original-src` and `modified-src` URLs, or JSON data
 * `{ original, modified, key }`.
 *
 * @element vt-compare
 * @since 0.15.0
 *
 * @attr {string} key - Columns that identify a row, separated by commas (default: found).
 * @attr {"changes"|"all"|"added"|"removed"|"changed"} filter - Rows shown at first (default `changes`).
 * @attr {string} original-src - URL of the first dataset.
 * @attr {string} modified-src - URL of the second dataset.
 * @attr {boolean} filters - Buttons that choose the rows shown. Full variant: on.
 *
 * @prop {string} original - The first dataset: CSV or JSON.
 * @prop {string} modified - The second dataset.
 * @prop {Comparison | null} comparison - The comparison (read-only).
 *
 * @fires vt-filter-change - The rows shown changed. Detail: `{ filter }`.
 *
 * @csspart filters - The buttons that choose the rows.
 * @csspart table - The table.
 * @csspart row-added - An added row (also `row-removed`, `row-changed`, `row-same`).
 * @csspart cell-changed - A changed value.
 *
 * @example
 * <vt-compare variant="full" key="id" original-src="/exports/monday.csv" modified-src="/exports/tuesday.csv"></vt-compare>
 */
export class VtCompare extends VtBase {
  static type = 'compare';

  static dataAttributes = Object.freeze(['key']);

  static componentAttributes = Object.freeze(['key', 'filter', 'original-src', 'modified-src', 'filters']); // prettier-ignore

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, search: true, download: true, fullscreen: true, filters: true }, // prettier-ignore
  };

  static styles = [csvCss, compareCss];

  static allowEmpty = true;

  static upgradeProperties = ['content', 'original', 'modified'];

  constructor() {
    super();
    /** @type {{ original?: string, modified?: string }} */
    this.own = {};
    /** @type {{ original?: string, modified?: string }} */
    this.inline = {};
    /** @type {{ original?: string, modified?: string }} */
    this.remote = {};
    this.sidesLoading = 0;
    /** @type {AbortController | null} */
    this.sidesAbort = null;
    /** @type {Filter | null} */
    this.filterChoice = null;
    /** @type {{ key: string, comparison: Comparison | null, error: string | null } | null} */
    this.cache = null;
    this.panelId = uid('panel');
  }

  // ------------------------------------------------------------------ sources

  /** @returns {string} */
  get original() {
    return this.sides().original ?? '';
  }

  set original(value) {
    this.own.original = value === null || value === undefined ? undefined : typeof value === 'string' ? value : JSON.stringify(value); // prettier-ignore
    this.sidesChanged();
  }

  /** @returns {string} */
  get modified() {
    return this.sides().modified ?? '';
  }

  set modified(value) {
    this.own.modified = value === null || value === undefined ? undefined : typeof value === 'string' ? value : JSON.stringify(value); // prettier-ignore
    this.sidesChanged();
  }

  /**
   * `{ original, modified, key }` (or `before` and `after`): each side CSV text or a list of records.
   *
   * @param {unknown} value
   */
  applyData(value) {
    const item = value !== null && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : null; // prettier-ignore
    if (!item || !['original', 'modified', 'before', 'after'].some((k) => k in item)) {
      super.applyData(value);
      return;
    }
    this._data = value;
    this.applyDataAttributes({ key: Array.isArray(item.key) ? item.key.join(',') : item.key });
    this.original = /** @type {any} */ (item.original ?? item.before ?? '');
    this.modified = /** @type {any} */ (item.modified ?? item.after ?? '');
  }

  /**
   * The two datasets: properties, then URLs, then templates, then JSON content
   * `{ original, modified }`.
   *
   * @returns {{ original?: string, modified?: string }}
   */
  sides() {
    /** @type {{ original?: string, modified?: string }} */
    let content = {};
    const text = this.text?.trim() ?? '';
    if (text.startsWith('{')) {
      try {
        const value = JSON.parse(text);
        if (
          value &&
          typeof value === 'object' &&
          ['original', 'modified', 'before', 'after'].some((k) => k in value)
        ) {
          const side = (/** @type {unknown} */ v) => (v === undefined ? undefined : typeof v === 'string' ? v : JSON.stringify(v)); // prettier-ignore
          content = {
            original: side(value.original ?? value.before),
            modified: side(value.modified ?? value.after),
          };
        }
      } catch {
        // Not a pair: read as nothing.
      }
    }
    const pick = (/** @type {"original" | "modified"} */ s) => this.own[s] ?? this.remote[s] ?? this.inline[s] ?? content[s]; // prettier-ignore
    return { original: pick('original'), modified: pick('modified') };
  }

  /**
   * `<template data-original>` and `<template data-modified>` go to the two sides.
   *
   * @returns {string | null}
   */
  readInline() {
    this.inline = {};
    for (const child of Array.from(this.children)) {
      const text = readContainer(child);
      if (text === null) continue;
      if (child.hasAttribute('data-original')) this.inline.original = text;
      else if (child.hasAttribute('data-modified')) this.inline.modified = text;
    }
    if (this.inline.original === undefined && this.inline.modified === undefined) return super.readInline(); // prettier-ignore
    return null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadSides();
  }

  disconnectedCallback() {
    this.sidesAbort?.abort();
    super.disconnectedCallback();
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'filter') this.filterChoice = null;
    if ((name === 'original-src' || name === 'modified-src') && oldValue !== newValue && this._connected) this.loadSides(); // prettier-ignore
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  /** Loads `original-src` and `modified-src`. */
  loadSides() {
    this.sidesAbort?.abort();
    const controller = new AbortController();
    this.sidesAbort = controller;
    this.remote = {};
    this.sidesLoading = 0;
    const config = getConfig();
    for (const side of SIDES) {
      const src = this.getAttribute(`${side}-src`);
      if (!src) continue;
      this.sidesLoading += 1;
      fetchContent(src, {
        allowRemote: parseBoolean(this.getAttribute('allow-remote')) === true,
        maxSize: config.maxSize,
        timeout: config.fetchTimeout,
        signal: controller.signal,
      }).then(
        (text) => {
          if (controller.signal.aborted) return;
          this.remote[side] = text;
          this.sidesLoading -= 1;
          this.sidesChanged();
        },
        (error) => {
          if (isAbortError(error) || controller.signal.aborted) return;
          this.sidesLoading -= 1;
          this.setError(error);
        },
      );
    }
    if (this.sidesLoading) this.requestRender();
  }

  sidesChanged() {
    this.cache = null;
    if (this._connected) this.requestRender();
  }

  contentChanged() {
    this.cache = null;
  }

  /** @returns {{ comparison: Comparison | null, error: string | null }} */
  compare() {
    const t = this.t;
    const { original, modified } = this.sides();
    const askedKey = (this.getAttribute('key') ?? '').split(',').map((f) => f.trim()).filter(Boolean); // prettier-ignore
    const key = `${askedKey.join(',')}\u0000${original ?? ''}\u0000${modified ?? ''}`;
    if (this.cache?.key === key) return this.cache;
    if (!original?.trim() || !modified?.trim()) {
      this.cache = { key, comparison: null, error: t('compareInvalidEmpty') };
      return this.cache;
    }
    /** @param {string} text @param {"original" | "modified"} side */
    const read = (text, side) => {
      try {
        return readDataset(text);
      } catch (error) {
        const message = error instanceof PivotError && error.message.startsWith('json:') ? t('compareInvalidJson', { message: error.message.slice(5) }) : t('compareInvalidFormat'); // prettier-ignore
        throw new Error(t('compareInvalidSide', { side: t(side === 'original' ? 'compareBefore' : 'compareAfter'), message }), { cause: error }); // prettier-ignore
      }
    };
    try {
      const comparison = compareDatasets(read(original, 'original'), read(modified, 'modified'), { key: askedKey }); // prettier-ignore
      this.cache = { key, comparison, error: null };
    } catch (error) {
      this.cache = { key, comparison: null, error: error instanceof Error ? error.message : String(error) }; // prettier-ignore
    }
    return this.cache;
  }

  /** @returns {Comparison | null} */
  get comparison() {
    return this.compare().comparison;
  }

  /** @returns {Filter} */
  get currentFilter() {
    return this.filterChoice ?? parseEnum(this.getAttribute('filter'), FILTERS, 'changes');
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    if (this.sidesLoading > 0) {
      frame.append(...this.chrome(null), h('div', { class: 'body', part: 'body' }, loadingView(t)));
      return;
    }
    const { comparison, error } = this.compare();
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    const body = h('div', { class: 'body cmp-body', part: 'body' });
    if (error || !comparison) body.append(noticeView(error ?? t('compareInvalidEmpty')));
    else {
      const filter = this.currentFilter;
      const rows = comparison.rows.filter((row) => shows(filter, row.status));
      if (this.feature('filters')) body.append(this.filtersView(comparison, filter));
      body.append(this.notes(comparison));
      if (!rows.length)
        body.append(h('p', { class: 'cmp-none', text: filter === 'changes' ? t('compareNone') : t('compareNoRow') })); // prettier-ignore
      else {
        if (rows.length > MAX_ROWS) body.append(noticeView(t('compareTruncated', { count: formatNumber(MAX_ROWS, this.locale) }))); // prettier-ignore
        body.append(this.tableView(comparison, rows.slice(0, MAX_ROWS)));
      }
    }
    panel.append(body);
    const table = /** @type {Element | null} */ (body.querySelector('table'));
    const csv = comparison ? () => comparisonToCsv(comparison, comparison.rows.filter((r) => shows(this.currentFilter, r.status))) : null; // prettier-ignore
    const actions = [
      table ? this.searchButton(new TextSearch(table)) : null,
      this.fullscreenButton(),
      this.feature('download') && csv ? this.downloadButton(csv, this.downloadName('differences.csv'), 'text/csv') : null, // prettier-ignore
      this.feature('copy') && csv ? this.copyButton(csv, t('compareCopyCsv')) : null,
    ];
    const c = comparison?.counts;
    const badge = c ? t('compareSummary', { added: formatNumber(c.added, this.locale), removed: formatNumber(c.removed, this.locale), changed: formatNumber(c.changed, this.locale) }) : ''; // prettier-ignore
    frame.append(...this.chrome({ badge, actions }), panel);
  }

  /**
   * @param {Comparison} comparison
   * @param {Filter} filter
   * @returns {HTMLElement}
   */
  filtersView(comparison, filter) {
    const t = this.t;
    const c = comparison.counts;
    const box = h('div', { class: 'cmp-filters', part: 'filters', attrs: { role: 'group', 'aria-label': t('compareFilter') } }); // prettier-ignore
    /** @type {[Filter, StringKey, number][]} */
    const choices = [
      ['changes', 'compareChanges', c.added + c.removed + c.changed],
      ['added', 'compareAdded', c.added],
      ['removed', 'compareRemoved', c.removed],
      ['changed', 'compareChanged', c.changed],
      ['all', 'compareAll', comparison.rows.length],
    ];
    for (const [id, label, count] of choices)
      box.append(
        h(
          'button',
          {
            class: `cmp-filter f-${id}`,
            attrs: { type: 'button', 'aria-pressed': String(id === filter), 'data-focus-key': `filter-${id}` }, // prettier-ignore
            on: {
              click: () => {
                this.filterChoice = id;
                this.render();
                emit(this, EVENTS.FILTER_CHANGE, { filter: id });
              },
            },
          },
          h('span', { text: t(label) }),
          h('span', { class: 'cmp-count', text: formatNumber(count, this.locale) }),
        ),
      );
    return box;
  }

  /**
   * How rows are paired, and the columns added or removed.
   *
   * @param {Comparison} comparison
   * @returns {HTMLElement}
   */
  notes(comparison) {
    const t = this.t;
    const list = h('ul', { class: 'cmp-notes' });
    list.append(h('li', { text: comparison.key.length ? t('compareByKey', { key: comparison.key.join(', ') }) : t('compareByPosition') })); // prettier-ignore
    if (comparison.addedFields.length) list.append(h('li', { class: 'cmp-note-added', text: t('compareFieldsAdded', { fields: comparison.addedFields.join(', ') }) })); // prettier-ignore
    if (comparison.removedFields.length) list.append(h('li', { class: 'cmp-note-removed', text: t('compareFieldsRemoved', { fields: comparison.removedFields.join(', ') }) })); // prettier-ignore
    if (comparison.duplicates) list.append(h('li', { text: t('compareDuplicates', { count: formatNumber(comparison.duplicates, this.locale) }) })); // prettier-ignore
    return list;
  }

  /**
   * @param {Comparison} comparison
   * @param {CompareRow[]} rows
   * @returns {HTMLElement}
   */
  tableView(comparison, rows) {
    const t = this.t;
    // Key columns first, then the others.
    const fields = [...comparison.key, ...comparison.fields.filter((f) => !comparison.key.includes(f))].slice(0, MAX_FIELDS); // prettier-ignore
    const added = new Set(comparison.addedFields);
    const removed = new Set(comparison.removedFields);
    const head = h('tr', {}, h('th', { class: 'cmp-status-col', attrs: { scope: 'col' }, text: t('compareStatus') })); // prettier-ignore
    if (!comparison.key.length) head.append(h('th', { class: 'col-number', attrs: { scope: 'col' }, text: '#' })); // prettier-ignore
    for (const f of fields)
      head.append(h('th', { class: added.has(f) ? 'cmp-col-added' : removed.has(f) ? 'cmp-col-removed' : '', attrs: { scope: 'col' }, text: f })); // prettier-ignore
    /** @type {Record<Status, StringKey>} */
    const names = { added: 'compareAdded', removed: 'compareRemoved', changed: 'compareChanged', same: 'compareSame' }; // prettier-ignore
    const marks = { added: '+', removed: '−', changed: '~', same: '' };
    const body = h('tbody');
    for (const row of rows) {
      const tr = h('tr', { class: `cmp-${row.status}`, part: `row-${row.status}` });
      const status = t(names[row.status]);
      tr.append(h('td', { class: 'cmp-status' }, h('span', { class: 'cmp-mark', text: marks[row.status], attrs: { 'aria-hidden': 'true' } }), h('span', { class: 'cmp-status-text', text: status }))); // prettier-ignore
      if (!comparison.key.length) tr.append(h('td', { class: 'col-number', text: row.key[0] }));
      for (const f of fields) {
        const changed = row.status === 'changed' && row.changed.includes(f);
        const td = h('td', { class: changed ? 'cmp-cell-changed' : '', part: changed ? 'cell-changed' : undefined }); // prettier-ignore
        if (changed)
          td.append(
            h('del', { text: show(row.before?.[f]), attrs: { title: t('compareBefore') } }),
            h('span', { class: 'sr-only', text: ' → ' }),
            h('ins', { text: show(row.after?.[f]), attrs: { title: t('compareAfter') } }),
          );
        else td.textContent = show(row.status === 'removed' ? row.before?.[f] : row.after?.[f]);
        tr.append(td);
      }
      body.append(tr);
    }
    return h(
      'div',
      { class: 'cmp-wrap', attrs: { tabindex: '0', role: 'region', 'aria-label': t('compareRows') } }, // prettier-ignore
      h('table', { class: 'grid cmp-table', part: 'table' }, h('thead', {}, head), body),
    );
  }
}

/**
 * @param {Filter} filter
 * @param {Status} status
 */
function shows(filter, status) {
  if (filter === 'all') return true;
  if (filter === 'changes') return status !== 'same';
  return filter === status;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function show(value) {
  return value === null || value === undefined ? '' : String(value);
}
