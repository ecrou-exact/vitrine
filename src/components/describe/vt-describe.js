// @ts-check
import csvCss from '../../styles/csv.css?raw';
import describeCss from '../../styles/describe.css?raw';
import { parseBoolean, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { TextSearch } from '../../core/search.js';
import { noticeView } from '../../core/ui.js';
import { toIso } from '../date-picker/dates.js';
import { PivotError, readDataset } from '../pivot/pivot.js';
import { describe, profileToCsv } from './describe.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('../pivot/pivot.js').Dataset} Dataset */
/** @typedef {import('./describe.js').Profile} Profile */
/** @typedef {import('./describe.js').ColumnStats} ColumnStats */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** Columns profiled at most. */
const MAX_COLUMNS = 500;

/**
 * The profile of a dataset, as `describe()` in pandas: for each column, its type, its
 * missing and distinct values, a summary, and its distribution as small bars. Opening a
 * column shows its quartiles, its histogram and its most frequent values.
 *
 * @element vt-describe
 * @since 0.15.0
 *
 * @attr {string} columns - Columns profiled, separated by commas (default: all).
 * @attr {number} bins - Bars of a histogram, 4 to 50 (default 12).
 * @attr {number} top - Most frequent values listed, 1 to 20 (default 5).
 * @attr {boolean} expanded - Opens the details of every column.
 *
 * @prop {string} content - The records: CSV with a header row, or JSON.
 * @prop {Record<string, unknown>[]} data - The records as a list of objects.
 * @prop {Profile | null} profile - The profile (read-only).
 *
 * @fires vt-toggle - The details of a column were opened or closed. Detail: `{ column, open }`.
 *
 * @csspart table - The table of columns.
 * @csspart bars - The distribution of a column.
 * @csspart details - The details of a column.
 *
 * @example
 * <vt-describe variant="full" src="/exports/customers.csv"></vt-describe>
 */
export class VtDescribe extends VtBase {
  static type = 'describe';

  static componentAttributes = Object.freeze(['columns', 'bins', 'top', 'expanded']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, search: true, download: true, fullscreen: true }, // prettier-ignore
  };

  static styles = [csvCss, describeCss];

  constructor() {
    super();
    /** @type {{ key: string, profile: Profile | null, error: Error | null } | null} */
    this.parsed = null;
    /** @type {Map<string, boolean>} Columns opened or closed by the reader. */
    this.open = new Map();
    this.panelId = uid('panel');
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  disconnectedCallback() {
    clearTimeout(this.previewTimer);
    this.editor?.destroy();
    super.disconnectedCallback();
  }

  contentChanged() {
    this.parsed = null;
  }

  /** @returns {{ profile: Profile | null, error: Error | null }} */
  parse() {
    const text = this.text ?? '';
    const bins = parseInteger(this.getAttribute('bins'), { min: 4, max: 50, fallback: 12 });
    const top = parseInteger(this.getAttribute('top'), { min: 1, max: 20, fallback: 5 });
    const fields = (this.getAttribute('columns') ?? '').split(',').map((f) => f.trim()).filter(Boolean); // prettier-ignore
    const key = `${bins}\u0000${top}\u0000${fields.join(',')}\u0000${text}`;
    if (this.parsed?.key === key) return this.parsed;
    try {
      const dataset = readDataset(text);
      const profile = describe(dataset, { bins, top: Math.max(top, 10), fields }); // prettier-ignore
      profile.columns = profile.columns.slice(0, MAX_COLUMNS);
      this.parsed = { key, profile, error: null };
    } catch (error) {
      this.parsed = { key, profile: null, error: error instanceof Error ? error : new Error(String(error)) }; // prettier-ignore
    }
    return this.parsed;
  }

  /** @returns {Profile | null} */
  get profile() {
    return this.parse().profile;
  }

  /**
   * A number or, in a date column, a day.
   *
   * @param {ColumnStats} column
   * @param {number} value
   */
  value(column, value) {
    if (column.type === 'date') return toIso(Math.round(value));
    const abs = Math.abs(value);
    try {
      return new Intl.NumberFormat(this.locale, { maximumFractionDigits: abs >= 100 ? 0 : abs >= 1 ? 2 : 4 }).format(value); // prettier-ignore
    } catch {
      return String(value);
    }
  }

  /**
   * @param {number} part
   * @param {number} whole
   */
  percent(part, whole) {
    return new Intl.NumberFormat(this.locale, { style: 'percent', maximumFractionDigits: 1 }).format(whole ? part / whole : 0); // prettier-ignore
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { profile, error } = this.parse();
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    const body = h('div', { class: 'body ds-body', part: 'body' });
    if (error || !profile) body.append(noticeView(this.errorText(error)));
    else body.append(this.tableView(profile));

    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('ds-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const table = /** @type {Element | null} */ (body.querySelector('table'));
    const csv = profile ? () => profileToCsv(this.shown(profile), (c, v) => (c.type === 'date' ? toIso(Math.round(v)) : Math.round(v * 1e6) / 1e6)) : null; // prettier-ignore
    const actions = [
      table ? this.searchButton(new TextSearch(table)) : null,
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download') && csv ? this.downloadButton(csv, this.downloadName('profile.csv'), 'text/csv') : null, // prettier-ignore
      this.feature('copy') && csv ? this.copyButton(csv, t('describeCopyCsv')) : null,
    ];
    const badge = profile ? t('describeSize', { rows: formatNumber(profile.rows, this.locale), columns: formatNumber(profile.columns.length, this.locale) }) : ''; // prettier-ignore
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /**
   * The profile with the histograms and lists at the size asked: the parse keeps more, for
   * the details.
   *
   * @param {Profile} profile
   * @returns {Profile}
   */
  shown(profile) {
    const top = parseInteger(this.getAttribute('top'), { min: 1, max: 20, fallback: 5 });
    return { ...profile, columns: profile.columns.map((c) => ({ ...c, top: c.top.slice(0, top) })) }; // prettier-ignore
  }

  /**
   * @param {Error | null} error
   * @returns {string}
   */
  errorText(error) {
    const t = this.t;
    if (error instanceof PivotError) {
      if (error.message === 'empty') return t('describeInvalidEmpty');
      if (error.message.startsWith('json:')) return t('describeInvalidJson', { message: error.message.slice(5) }); // prettier-ignore
    }
    return t('describeInvalidFormat');
  }

  /**
   * @param {Profile} profile
   * @returns {HTMLElement}
   */
  tableView(profile) {
    const t = this.t;
    const all = parseBoolean(this.getAttribute('expanded')) === true;
    const head = h(
      'tr',
      {},
      h('th', { attrs: { scope: 'col' }, text: t('describeColumn') }),
      h('th', { attrs: { scope: 'col' }, text: t('describeType') }),
      h('th', { class: 'col-number', attrs: { scope: 'col' }, text: t('describeMissing') }),
      h('th', { class: 'col-number', attrs: { scope: 'col' }, text: t('describeDistinct') }),
      h('th', { attrs: { scope: 'col' }, text: t('describeSummary') }),
      h('th', { attrs: { scope: 'col' }, text: t('describeDistribution') }),
    );
    const body = h('tbody');
    profile.columns.forEach((column, i) => {
      const open = this.open.get(column.name) ?? all;
      const id = `${this.panelId}-c${i}`;
      const toggle = h('button', {
        class: 'ds-toggle',
        text: column.name,
        attrs: {
          type: 'button',
          'aria-expanded': String(open),
          'aria-controls': id,
          'data-focus-key': `column-${i}`,
          title: t('describeShowDetails', { name: column.name }),
        },
        on: {
          click: () => {
            this.open.set(column.name, !open);
            this.render();
            emit(this, EVENTS.TOGGLE, { column: column.name, open: !open });
          },
        },
      });
      const missing = column.missing
        ? `${formatNumber(column.missing, this.locale)} (${this.percent(column.missing, profile.rows)})`
        : '0';
      const distinct = `${formatNumber(column.distinct, this.locale)}${column.capped ? '+' : ''}`;
      body.append(
        h(
          'tr',
          { class: open ? 'ds-open' : '' },
          h('th', { attrs: { scope: 'row' } }, toggle),
          h('td', {}, h('span', { class: `ds-type ds-${column.type}`, text: t(/** @type {StringKey} */ (`describeType_${column.type}`)) })), // prettier-ignore
          h('td', { class: `col-number${column.missing ? ' ds-has-missing' : ''}`, text: missing }),
          h('td', { class: 'col-number', text: distinct }),
          h('td', { class: 'ds-summary', text: this.summary(column) }),
          h('td', { class: 'ds-dist' }, this.bars(column, false)),
        ),
      );
      if (open) body.append(h('tr', { class: 'ds-details-row', attrs: { id } }, h('td', { attrs: { colspan: '6' } }, this.details(column, profile)))); // prettier-ignore
    });
    return h(
      'div',
      { class: 'ds-wrap', attrs: { tabindex: '0', role: 'region', 'aria-label': t('describeColumns') } }, // prettier-ignore
      h('table', { class: 'grid ds-table', part: 'table' }, h('thead', {}, head), body),
    );
  }

  /**
   * One line: the range and the mean of numbers, the first value of texts.
   *
   * @param {ColumnStats} column
   * @returns {string}
   */
  summary(column) {
    const t = this.t;
    const n = column.numbers;
    if (n && column.type === 'number')
      return `${t('describeRange', { min: this.value(column, n.min), max: this.value(column, n.max) })} · ${t('describeMean', { value: this.value(column, n.mean) })} · ${t('describeMedian', { value: this.value(column, n.median) })}`; // prettier-ignore
    if (n) return t('describeRange', { min: this.value(column, n.min), max: this.value(column, n.max) }); // prettier-ignore
    if (!column.count) return '';
    if (column.distinct === column.count && column.count > 1 && !column.capped) {
      const length = column.length ? ` · ${t('describeLength', { min: formatNumber(column.length.min, this.locale), max: formatNumber(column.length.max, this.locale) })}` : ''; // prettier-ignore
      return `${t('describeUnique')}${length}`;
    }
    return column.top
      .slice(0, 2)
      .map((v) =>
        t('describeShare', { value: v.value, percent: this.percent(v.count, column.count) }),
      ) // prettier-ignore
      .join(' · ');
  }

  /**
   * The histogram of numbers and dates, or the shares of the most frequent values.
   *
   * @param {ColumnStats} column
   * @param {boolean} large
   * @returns {HTMLElement | null}
   */
  bars(column, large) {
    const t = this.t;
    if (!column.count) return null;
    const hist = column.histogram;
    if (hist) {
      const counts = hist.counts;
      const max = Math.max(...counts) || 1;
      const width = (hist.to - hist.from) / counts.length;
      const peak = counts.indexOf(Math.max(...counts));
      const label = t('describeHistogram', {
        count: formatNumber(column.count, this.locale),
        min: this.value(column, hist.from),
        max: this.value(column, column.numbers?.max ?? hist.to),
        from: this.value(column, hist.from + peak * width),
        to: this.value(column, hist.from + (peak + 1) * width),
      });
      const box = h('div', { class: `ds-bars${large ? ' large' : ''}`, part: 'bars', attrs: { role: 'img', 'aria-label': label } }); // prettier-ignore
      counts.forEach((count, i) => {
        const bar = h('span', {
          class: 'ds-bar',
          attrs: { title: t('describeBin', { from: this.value(column, hist.from + i * width), to: this.value(column, hist.from + (i + 1) * width), count: formatNumber(count, this.locale) }) }, // prettier-ignore
        });
        bar.style.setProperty('--_h', String(Math.round((count / max) * 1000) / 1000));
        box.append(bar);
      });
      return box;
    }
    const top = column.top.slice(0, 5);
    const label = top.map((v) => t('describeShare', { value: v.value, percent: this.percent(v.count, column.count) })).join(', '); // prettier-ignore
    const box = h('div', { class: 'ds-stack', part: 'bars', attrs: { role: 'img', 'aria-label': label } }); // prettier-ignore
    top.forEach((v, i) => {
      const part = h('span', { class: `ds-part p${i}`, attrs: { title: t('describeShare', { value: v.value, percent: this.percent(v.count, column.count) }) } }); // prettier-ignore
      part.style.width = `${(v.count / column.count) * 100}%`;
      box.append(part);
    });
    return box;
  }

  /**
   * @param {ColumnStats} column
   * @param {Profile} profile
   * @returns {HTMLElement}
   */
  details(column, profile) {
    const t = this.t;
    const list = h('dl', { class: 'ds-stats' });
    /**
     * @param {StringKey} key
     * @param {string} value
     */
    const item = (key, value) => list.append(h('div', {}, h('dt', { text: t(key) }), h('dd', { text: value }))); // prettier-ignore
    item('describeCount', `${formatNumber(column.count, this.locale)} (${this.percent(column.count, profile.rows)})`); // prettier-ignore
    const n = column.numbers;
    if (n) {
      item('describeMin', this.value(column, n.min));
      item('describeQ1', this.value(column, n.q1));
      item('describeMedianLabel', this.value(column, n.median));
      item('describeMeanLabel', this.value(column, n.mean));
      item('describeQ3', this.value(column, n.q3));
      item('describeMax', this.value(column, n.max));
      if (column.type === 'number') {
        item('describeStd', this.value(column, n.std));
        item('describeSum', this.value(column, n.sum));
      }
    }
    const top = parseInteger(this.getAttribute('top'), { min: 1, max: 20, fallback: 5 });
    /** @type {Node[]} */
    const parts = [list];
    if (column.histogram) {
      const large = this.bars(column, true);
      if (large) parts.push(h('div', { class: 'ds-axis-box' }, large, h('div', { class: 'ds-axis', attrs: { 'aria-hidden': 'true' } }, h('span', { text: this.value(column, column.histogram.from) }), h('span', { text: this.value(column, column.numbers?.max ?? column.histogram.to) })))); // prettier-ignore
    }
    if (column.type !== 'number' && column.type !== 'date' && column.top.length) {
      const rows = column.top.slice(0, Math.max(top, 10));
      const table = h('table', { class: 'grid ds-top' }, h('caption', { text: t('describeTop') }));
      const tbody = h('tbody');
      for (const v of rows)
        tbody.append(
          h(
            'tr',
            {},
            h('th', { attrs: { scope: 'row' }, text: v.value }),
            h('td', { class: 'col-number', text: formatNumber(v.count, this.locale) }),
            h('td', { class: 'col-number', text: this.percent(v.count, column.count) }),
          ),
        );
      table.append(tbody);
      parts.push(table);
      if (column.distinct > rows.length) parts.push(h('p', { class: 'ds-more', text: t('describeMore', { count: formatNumber(column.distinct - rows.length, this.locale) }) })); // prettier-ignore
    }
    return h('div', { class: 'ds-details', part: 'details' }, ...parts);
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: /^\s*[[{]/.test(this.text ?? '') ? 'json' : 'plaintext',
      lineNumbers: true,
      wrap: false,
      highlightLimit: getConfig().highlightLimit,
      label: this.heading || this.t('editor'),
      placeholder: this.getAttribute('placeholder') ?? undefined,
      onInput: (text) => this.edited(text),
      onChange: (text) => emit(this, EVENTS.CHANGE, { value: text }),
      history: this.editHistory ?? undefined,
    });
    return this.editor;
  }

  contentEdited() {
    clearTimeout(this.previewTimer);
    this.parsed = null;
    this.previewTimer = setTimeout(() => this.render(), 300);
  }
}
