// @ts-check
import csvCss from '../../styles/csv.css?raw';
import pivotCss from '../../styles/pivot.css?raw';
import { parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { TextSearch } from '../../core/search.js';
import { noticeView } from '../../core/ui.js';
import { AGGREGATES, MAX_KEYS, PivotError, pivot, pivotToCsv, readDataset } from './pivot.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./pivot.js').Dataset} Dataset */
/** @typedef {import('./pivot.js').PivotOptions} PivotOptions */
/** @typedef {import('./pivot.js').PivotResult} PivotResult */
/** @typedef {import('./pivot.js').Aggregate} Aggregate */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** Rows built; the others are counted in the totals. */
const MAX_ROWS = 1000;

/**
 * A pivot table: records from CSV or JSON grouped by the values of some fields in rows and
 * others in columns, with a value summed, counted, averaged or other in each cell, and the
 * totals. Cells can be shaded by their value, and choosing one sends its records.
 *
 * In the full variant, lists choose the fields and the calculation, as in a spreadsheet.
 *
 * @element vt-pivot
 * @since 0.15.0
 *
 * @attr {string} rows - Fields in rows, separated by commas (default: the first text field).
 * @attr {string} columns - Fields in columns, separated by commas (default: none).
 * @attr {string} values - Field aggregated (default: the first numeric field).
 * @attr {"sum"|"count"|"avg"|"min"|"max"|"distinct"} aggregate - Calculation (default `sum`, `count` without a numeric field).
 * @attr {boolean} totals - Totals of rows and columns (default on).
 * @attr {boolean} heat - Shades cells by their value.
 * @attr {number} decimals - Decimals shown (default: up to 2).
 * @attr {boolean} controls - Lists that choose the fields and the calculation. Full variant: on.
 *
 * @prop {string} content - The records: CSV with a header row, or JSON.
 * @prop {Record<string, unknown>[]} data - The records as a list of objects.
 * @prop {{ rows: string[], columns: string[], values: string, aggregate: string }} settings - Fields and calculation shown; setting it changes them.
 *
 * @fires vt-change - The fields or the calculation were changed with the lists. Detail: `{ rows, columns, values, aggregate }`.
 * @fires vt-select - A cell, a total or the grand total was chosen. Detail: `{ row, column, value, records }`.
 *
 * @csspart controls - The lists.
 * @csspart table - The table.
 * @csspart header-cell - A column or row header.
 * @csspart cell - A value.
 * @csspart total - A total.
 *
 * @example
 * <vt-pivot variant="full" rows="region" columns="year" values="sales" heat src="/sales.csv"></vt-pivot>
 */
export class VtPivot extends VtBase {
  static type = 'pivot';

  static dataAttributes = Object.freeze(['rows', 'columns', 'values', 'aggregate']);

  static componentAttributes = Object.freeze([
    'rows', 'columns', 'values', 'aggregate', 'totals', 'heat', 'decimals', 'controls',
  ]); // prettier-ignore

  static presets = {
    simple: { totals: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      totals: true, controls: true,
    },
  }; // prettier-ignore

  static styles = [csvCss, pivotCss];

  static upgradeProperties = ['content', 'settings'];

  /**
   * JSON: a list of records, or an object holding one with the settings beside it.
   *
   * @param {unknown} value
   */
  static fromData(value) {
    if (typeof value === 'string') return value;
    /** @type {Record<string, unknown>} */
    const attributes = {};
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = /** @type {Record<string, unknown>} */ (value);
      for (const name of ['rows', 'columns', 'values', 'aggregate']) {
        const v = record[name];
        if (typeof v === 'string') attributes[name] = v;
        else if (Array.isArray(v) && name !== 'values' && v.every((x) => typeof x === 'string'))
          attributes[name] = v.join(',');
      }
    }
    return { content: JSON.stringify(value), attributes };
  }

  constructor() {
    super();
    /** @type {{ text: string, dataset: Dataset | null, error: Error | null } | null} */
    this.parsed = null;
    /** @type {Partial<PivotOptions> | null} Settings chosen with the lists. */
    this.choice = null;
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

  /** @returns {{ dataset: Dataset | null, error: Error | null }} */
  parse() {
    const text = this.text ?? '';
    if (this.parsed?.text === text) return this.parsed;
    try {
      this.parsed = { text, dataset: readDataset(text), error: null };
    } catch (error) {
      this.parsed = { text, dataset: null, error: error instanceof Error ? error : new Error(String(error)) }; // prettier-ignore
    }
    return this.parsed;
  }

  /**
   * @param {string} name
   * @param {Dataset} dataset
   * @returns {string[]}
   */
  fieldList(name, dataset) {
    const value = this.getAttribute(name);
    if (value === null) return [];
    return value
      .split(',')
      .map((field) => field.trim())
      .filter((field) => dataset.fields.includes(field));
  }

  /**
   * The settings in use: chosen with the lists, then the attributes, then sensible defaults.
   *
   * @param {Dataset} dataset
   * @returns {PivotOptions}
   */
  options(dataset) {
    const text = dataset.fields.find((f) => !dataset.numeric.has(f)) ?? dataset.fields[0] ?? '';
    const rowsAttr = this.hasAttribute('rows') ? this.fieldList('rows', dataset) : null;
    const rows = this.choice?.rows ?? rowsAttr ?? (text ? [text] : []);
    const columns = this.choice?.columns ?? this.fieldList('columns', dataset);
    const valueAttr = this.getAttribute('values')?.trim();
    // By default, the first numeric field that is not already in rows or columns.
    const numeric = dataset.fields.find((f) => dataset.numeric.has(f) && !rows.includes(f) && !columns.includes(f)) ?? ''; // prettier-ignore
    const value = this.choice?.value ?? (valueAttr && dataset.fields.includes(valueAttr) ? valueAttr : numeric); // prettier-ignore
    const aggregate = this.choice?.aggregate ?? parseEnum(this.getAttribute('aggregate'), AGGREGATES, value ? 'sum' : 'count'); // prettier-ignore
    return { rows, columns, value, aggregate };
  }

  /** @type {{ rows: string[], columns: string[], values: string, aggregate: string }} */
  get settings() {
    const dataset = this.parse().dataset;
    const o = dataset
      ? this.options(dataset)
      : { rows: [], columns: [], value: '', aggregate: 'sum' };
    return { rows: o.rows, columns: o.columns, values: o.value, aggregate: o.aggregate };
  }

  set settings(value) {
    if (!value || typeof value !== 'object') return;
    this.choice = {
      rows: Array.isArray(value.rows) ? value.rows.map(String) : undefined,
      columns: Array.isArray(value.columns) ? value.columns.map(String) : undefined,
      value: typeof value.values === 'string' ? value.values : undefined,
      aggregate: AGGREGATES.includes(/** @type {any} */ (value.aggregate)) ? /** @type {Aggregate} */ (value.aggregate) : undefined, // prettier-ignore
    };
    for (const key of /** @type {(keyof PivotOptions)[]} */ (Object.keys(this.choice)))
      if (this.choice[key] === undefined) delete this.choice[key];
    if (this._connected) this.requestRender();
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { dataset, error } = this.parse();
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    const body = h('div', { class: 'body pv-body', part: 'body' });
    /** @type {(() => string) | null} */
    let csv = null;
    let badge = '';
    if (error || !dataset) body.append(noticeView(this.errorText(error)));
    else {
      const options = this.options(dataset);
      const result = pivot(dataset.records, options, this.locale);
      if (this.feature('controls')) body.append(this.controls(dataset, options));
      if (result.truncated) body.append(noticeView(t('pivotTruncated', { count: formatNumber(MAX_KEYS, this.locale) }))); // prettier-ignore
      body.append(this.tableView(result, options));
      const totals = this.feature('totals');
      csv = () => pivotToCsv(result, options, { totals, total: t('pivotTotal') });
      badge = t('pivotRecords', { count: formatNumber(dataset.records.length, this.locale) });
    }

    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('pv-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const table = /** @type {Element | null} */ (body.querySelector('table'));
    const actions = [
      table ? this.searchButton(new TextSearch(table)) : null,
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download') && csv ? this.downloadButton(csv, this.downloadName('pivot.csv'), 'text/csv') : null, // prettier-ignore
      this.feature('copy') && csv ? this.copyButton(csv, t('pivotCopyCsv')) : null,
    ];
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /**
   * @param {Error | null} error
   * @returns {string}
   */
  errorText(error) {
    const t = this.t;
    if (error instanceof PivotError) {
      if (error.message === 'empty') return t('pivotInvalidEmpty');
      if (error.message.startsWith('json:')) return t('pivotInvalidJson', { message: error.message.slice(5) }); // prettier-ignore
    }
    return t('pivotInvalidFormat');
  }

  /**
   * The lists that choose the fields and the calculation.
   *
   * @param {Dataset} dataset
   * @param {PivotOptions} options
   * @returns {HTMLElement}
   */
  controls(dataset, options) {
    const t = this.t;
    const box = h('div', {
      class: 'pv-controls',
      part: 'controls',
      attrs: { role: 'group', 'aria-label': t('pivotSettings') },
    });
    /**
     * @param {string} key
     * @param {StringKey} label
     * @param {[string, string][]} choices
     * @param {string} current
     * @param {(value: string) => Partial<PivotOptions>} change
     */
    const select = (key, label, choices, current, change) => {
      const id = `${this.panelId}-${key}`;
      const list = h('select', {
        class: 'pv-select',
        attrs: { id, 'data-focus-key': `select-${key}` },
        on: {
          change: () => {
            this.choice = { ...this.options(dataset), ...change(list.value) };
            this.render();
            const s = this.settings;
            emit(this, EVENTS.CHANGE, s);
          },
        },
      });
      for (const [value, text] of choices) {
        const option = h('option', { text, attrs: { value } });
        if (value === current) option.selected = true;
        list.append(option);
      }
      box.append(h('label', { class: 'pv-field', attrs: { for: id } }, h('span', { text: t(label) }), list)); // prettier-ignore
    };
    const fields = dataset.fields.map((f) => /** @type {[string, string]} */ ([f, f]));
    const none = /** @type {[string, string]} */ (['', t('pivotNone')]);
    select('rows', 'pivotRows', [none, ...fields], options.rows[0] ?? '', (v) => ({ rows: v ? [v] : [] })); // prettier-ignore
    select('columns', 'pivotColumns', [none, ...fields], options.columns[0] ?? '', (v) => ({ columns: v ? [v] : [] })); // prettier-ignore
    select('values', 'pivotValues', [none, ...fields], options.value, (v) => ({ value: v, aggregate: v ? options.aggregate : 'count' })); // prettier-ignore
    select(
      'aggregate',
      'pivotAggregate',
      AGGREGATES.map((a) => /** @type {[string, string]} */ ([a, t(/** @type {StringKey} */ (`pivotAgg_${a}`))])),
      options.aggregate,
      (v) => ({ aggregate: /** @type {Aggregate} */ (v) }),
    ); // prettier-ignore
    return box;
  }

  /**
   * @param {number | null} value
   * @returns {string}
   */
  format(value) {
    if (value === null) return '';
    const decimals = parseInteger(this.getAttribute('decimals'), { min: 0, max: 10, fallback: -1 });
    try {
      return new Intl.NumberFormat(this.locale, decimals < 0 ? { maximumFractionDigits: 2 } : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value); // prettier-ignore
    } catch {
      return String(value);
    }
  }

  /**
   * @param {PivotResult} result
   * @param {PivotOptions} options
   * @returns {HTMLElement}
   */
  tableView(result, options) {
    const t = this.t;
    const totals = this.feature('totals');
    const heat = parseBoolean(this.getAttribute('heat')) === true;
    const label = (/** @type {string[]} */ key) => key.map((k) => k || t('pivotEmptyKey')).join(' · ') || t('pivotTotal'); // prettier-ignore
    const valueName = options.aggregate === 'count'
      ? t('pivotAgg_count')
      : t('pivotOf', { aggregate: t(/** @type {StringKey} */ (`pivotAgg_${options.aggregate}`)), field: options.value }); // prettier-ignore
    const span = result.max - result.min || 1;

    /**
     * @param {number | null} value
     * @param {number | null} row
     * @param {number | null} col
     * @param {boolean} total
     */
    const cell = (value, row, col, total) => {
      const td = h('td', { class: `pv-cell${total ? ' pv-total' : ''}`, part: total ? 'cell total' : 'cell' }); // prettier-ignore
      if (value === null) {
        td.classList.add('pv-empty');
        return td;
      }
      if (heat && !total) {
        td.classList.add('pv-heat');
        td.style.setProperty(
          '--_heat',
          String(Math.round(((value - result.min) / span) * 100) / 100),
        );
      }
      const rowText = row === null ? t('pivotTotal') : label(result.rowKeys[row]);
      const colText = col === null ? t('pivotTotal') : label(result.colKeys[col]);
      td.append(
        h('button', {
          class: 'pv-value',
          text: this.format(value),
          attrs: {
            type: 'button',
            'aria-label': t('pivotCellLabel', { value: this.format(value), row: rowText, column: colText }), // prettier-ignore
            'data-focus-key': `cell-${row}-${col}`,
          },
          on: { click: () => this.choose(result, options, row, col, value) },
        }),
      );
      return td;
    };

    const headRow = h('tr');
    headRow.append(
      h('th', { class: 'pv-corner', part: 'header-cell', attrs: { scope: 'col' }, text: options.rows.join(' · ') || '' }), // prettier-ignore
    );
    for (const key of result.colKeys)
      headRow.append(h('th', { class: 'col-number', part: 'header-cell', attrs: { scope: 'col' }, text: options.columns.length ? label(key) : valueName })); // prettier-ignore
    if (totals && options.columns.length)
      headRow.append(h('th', { class: 'col-number pv-total', part: 'header-cell', attrs: { scope: 'col' }, text: t('pivotTotal') })); // prettier-ignore

    const body = h('tbody');
    result.rowKeys.slice(0, MAX_ROWS).forEach((key, r) => {
      const tr = h('tr', {}, h('th', { part: 'header-cell', attrs: { scope: 'row' }, text: options.rows.length ? label(key) : valueName })); // prettier-ignore
      result.colKeys.forEach((_, c) => tr.append(cell(result.cell(r, c), r, c, false)));
      if (totals && options.columns.length) tr.append(cell(result.rowTotal(r), r, null, true));
      body.append(tr);
    });
    const table = h(
      'table',
      { class: 'grid pv-table', part: 'table', attrs: { 'aria-label': valueName } },
      h('caption', { class: 'sr-only', text: valueName }),
      h('thead', {}, headRow),
      body,
    );
    if (totals && options.rows.length) {
      const foot = h('tr', {}, h('th', { class: 'pv-total', part: 'header-cell', attrs: { scope: 'row' }, text: t('pivotTotal') })); // prettier-ignore
      result.colKeys.forEach((_, c) => foot.append(cell(result.colTotal(c), null, c, true)));
      if (options.columns.length) foot.append(cell(result.total, null, null, true));
      table.append(h('tfoot', {}, foot));
    }
    return h('div', { class: 'pv-wrap', attrs: { tabindex: '0', role: 'region', 'aria-label': t('pivotTable') } }, table); // prettier-ignore
  }

  /**
   * @param {PivotResult} result
   * @param {PivotOptions} options
   * @param {number | null} row
   * @param {number | null} col
   * @param {number} value
   */
  choose(result, options, row, col, value) {
    const pick = (/** @type {string[]} */ fields, /** @type {string[] | undefined} */ key) =>
      key ? Object.fromEntries(fields.map((f, i) => [f, key[i]])) : null;
    emit(this, EVENTS.SELECT, {
      row: row === null ? null : pick(options.rows, result.rowKeys[row]),
      column: col === null ? null : pick(options.columns, result.colKeys[col]),
      value,
      records: result.records(row, col).slice(0, 10_000),
    });
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
