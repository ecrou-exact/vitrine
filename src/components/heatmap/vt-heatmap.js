// @ts-check
import heatmapCss from '../../styles/heatmap.css?raw';
import { cleanLabel, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { noticeView } from '../../core/ui.js';
import { firstDayOfWeek, toIso } from '../date-picker/dates.js';
import { HeatmapError, calendarLayout, heatToCsv, levelOf, period, readHeat } from './heatmap.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./heatmap.js').HeatData} HeatData */

/**
 * A heat map: values by day as a calendar of weeks, like the contributions of a profile,
 * or values by two categories as a matrix (hours by weekday, servers by metric…). Each
 * cell is shaded by its value, and its date or categories and its value are written for
 * screen readers and shown on hover and focus.
 *
 * Reads JSON (`{ "2026-01-05": 3 }`, `[{ date, value }]`, `[{ x, y, value }]`) or CSV
 * (`date,value` or `x,y,value`).
 *
 * @element vt-heatmap
 * @since 0.15.0
 *
 * @attr {string} from - First day shown (`YYYY-MM-DD`). Default: a year before `to`.
 * @attr {string} to - Last day shown. Default: the last day with a value.
 * @attr {string} year - A calendar year, instead of `from` and `to`.
 * @attr {number} first-day - First day of the week, 0 (Sunday) to 6. Default: from the language.
 * @attr {number} levels - Shades, from 3 to 9 (default 5, the first for no value).
 * @attr {number} max - Value of the darkest shade (default: the largest value).
 * @attr {string} unit - Word after a value, such as `contributions`.
 *
 * @prop {string} content - The values, as JSON or CSV.
 *
 * @fires vt-select - A cell was chosen. Detail: `{ date, value }`, or `{ x, y, value }` for a matrix.
 *
 * @csspart grid - The cells.
 * @csspart cell - A cell (also `cell-0` to `cell-8` by shade).
 * @csspart legend - The scale.
 * @csspart summary - The total and the largest value.
 *
 * @example
 * <vt-heatmap variant="full" unit="commits" src="/stats/commits.json"></vt-heatmap>
 */
export class VtHeatmap extends VtBase {
  static type = 'heatmap';

  static dataAttributes = Object.freeze(['from', 'to', 'year', 'unit']);

  static componentAttributes = Object.freeze(['from', 'to', 'year', 'first-day', 'levels', 'max', 'unit']); // prettier-ignore

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true },
  };

  static styles = [heatmapCss];

  constructor() {
    super();
    /** @type {{ text: string, data: HeatData | null, error: Error | null } | null} */
    this.parsed = null;
    /** Position of the cell with the keyboard focus. */
    this.focusAt = { row: -1, column: -1 };
    this.panelId = uid('panel');
    /** @type {HTMLElement | null} */
    this.details = null;
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
    this.focusAt = { row: -1, column: -1 };
  }

  /** @returns {{ data: HeatData | null, error: Error | null }} */
  parse() {
    const text = this.text ?? '';
    if (this.parsed?.text === text) return this.parsed;
    try {
      this.parsed = { text, data: readHeat(text), error: null };
    } catch (error) {
      this.parsed = { text, data: null, error: error instanceof Error ? error : new Error(String(error)) }; // prettier-ignore
    }
    return this.parsed;
  }

  get levels() {
    return parseInteger(this.getAttribute('levels'), { min: 3, max: 9, fallback: 5 });
  }

  /**
   * "3 contributions", or the number alone.
   *
   * @param {number | null} value
   * @returns {string}
   */
  valueText(value) {
    if (value === null) return this.t('heatNoValue');
    const unit = cleanLabel(this.getAttribute('unit'), 40);
    const n = formatNumber(Math.round(value * 100) / 100, this.locale);
    return unit ? `${n} ${unit}` : n;
  }

  /**
   * @param {number} day
   * @param {Intl.DateTimeFormatOptions} options
   */
  dayText(day, options) {
    try {
      return new Intl.DateTimeFormat(this.locale, { timeZone: 'UTC', ...options }).format(day * 864e5); // prettier-ignore
    } catch {
      return toIso(day);
    }
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { data, error } = this.parse();
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    const body = h('div', { class: 'body hm-body', part: 'body' });
    let badge = '';
    if (error || !data) body.append(noticeView(this.errorText(error)));
    else {
      const view = data.kind === 'calendar' ? this.calendarView(data) : this.matrixView(data);
      badge = view.badge;
      body.append(view.element);
    }

    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('hm-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);
    const csv = data ? () => heatToCsv(data) : null;
    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download') && csv ? this.downloadButton(csv, this.downloadName('heatmap.csv'), 'text/csv') : null, // prettier-ignore
      this.feature('copy') && csv ? this.copyButton(csv, t('heatCopyCsv')) : null,
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
    if (error instanceof HeatmapError) {
      if (error.message === 'empty') return t('heatInvalidEmpty');
      if (error.message === 'noValues') return t('heatInvalidNoValues');
      if (error.message.startsWith('json:')) return t('heatInvalidJson', { message: error.message.slice(5) }); // prettier-ignore
    }
    return t('heatInvalidFormat');
  }

  /**
   * @param {HeatData} data
   * @returns {{ element: HTMLElement, badge: string }}
   */
  calendarView(data) {
    const t = this.t;
    const { from, to } = period(data.days, {
      from: this.getAttribute('from'),
      to: this.getAttribute('to'),
      year: this.getAttribute('year'),
    });
    const firstDay = parseInteger(this.getAttribute('first-day'), { min: 0, max: 6, fallback: firstDayOfWeek(this.locale) }); // prettier-ignore
    const layout = calendarLayout(data.days, { from, to, firstDay });
    const shown = layout.cells.filter((c) => c.inRange && c.value !== null);
    const max = parseInteger(this.getAttribute('max'), { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: 0 }) || Math.max(0, ...shown.map((c) => /** @type {number} */ (c.value))); // prettier-ignore
    const levels = this.levels;

    /** @type {(HTMLElement | null)[][]} */
    const grid = Array.from({ length: 7 }, () => new Array(layout.columns).fill(null));
    const rows = Array.from({ length: 7 }, (_, row) => {
      const weekday = this.dayText(layout.cells[row]?.day ?? 0, { weekday: 'short' });
      return h('div', { class: 'hm-row', attrs: { role: 'row' } }, h('span', { class: 'hm-day', attrs: { role: 'rowheader' }, text: row % 2 ? weekday : '' }, h('span', { class: 'sr-only', text: row % 2 ? '' : weekday }))); // prettier-ignore
    });
    for (const cell of layout.cells) {
      const level = cell.inRange ? levelOf(cell.value, max, levels) : 0;
      const label = this.dayText(cell.day, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); // prettier-ignore
      const el = h('span', {
        class: `hm-cell${cell.inRange ? '' : ' out'}`,
        part: `cell cell-${level}`,
        attrs: {
          role: 'gridcell',
          tabindex: '-1',
          'aria-label': cell.inRange
            ? t('heatCell', { label, value: this.valueText(cell.value) })
            : null,
          'aria-hidden': cell.inRange ? null : 'true',
          'data-day': cell.day,
        },
      });
      el.style.setProperty('--_level', String(levels > 1 ? level / (levels - 1) : 0));
      if (cell.inRange) this.bindCell(el, () => ({ date: toIso(cell.day), value: cell.value }), `${label}: ${this.valueText(cell.value)}`); // prettier-ignore
      grid[cell.row][cell.column] = cell.inRange ? el : null;
      rows[cell.row].append(el);
    }
    const months = h('div', { class: 'hm-months', attrs: { 'aria-hidden': 'true' } });
    months.style.setProperty('--_columns', String(layout.columns));
    for (const m of layout.months) {
      const label = h('span', { text: this.dayText(Date.UTC(m.year, m.month - 1, 1) / 864e5, { month: 'short' }) }); // prettier-ignore
      label.style.gridColumn = String(m.column + 2);
      months.append(label);
    }
    const table = this.gridElement(rows, grid, t('heatGrid'));
    table.style.setProperty('--_columns', String(layout.columns));

    const total = shown.reduce((sum, c) => sum + /** @type {number} */ (c.value), 0);
    const best = shown.reduce((a, c) => (a && /** @type {number} */ (a.value) >= /** @type {number} */ (c.value) ? a : c), /** @type {typeof shown[0] | null} */ (null)); // prettier-ignore
    const summary = best
      ? t('heatTotal', { total: this.valueText(total), max: this.valueText(best.value), day: this.dayText(best.day, { dateStyle: 'medium' }) }) // prettier-ignore
      : '';
    return {
      element: this.wrap(h('div', { class: 'hm-calendar' }, months, table), summary, levels),
      badge: `${this.dayText(layout.from, { dateStyle: 'medium' })} – ${this.dayText(layout.to, { dateStyle: 'medium' })}`, // prettier-ignore
    };
  }

  /**
   * @param {HeatData} data
   * @returns {{ element: HTMLElement, badge: string }}
   */
  matrixView(data) {
    const t = this.t;
    const levels = this.levels;
    const values = [...data.cells.values()];
    const max = parseInteger(this.getAttribute('max'), { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: 0 }) || Math.max(0, ...values); // prettier-ignore
    const head = h('div', { class: 'hm-row hm-head', attrs: { role: 'row' } }, h('span', { class: 'hm-day', attrs: { role: 'columnheader' } })); // prettier-ignore
    for (const x of data.xs) head.append(h('span', { class: 'hm-x', attrs: { role: 'columnheader' }, text: x })); // prettier-ignore
    /** @type {(HTMLElement | null)[][]} */
    const grid = [];
    const rows = data.ys.map((y) => {
      const row = h('div', { class: 'hm-row', attrs: { role: 'row' } }, h('span', { class: 'hm-day', attrs: { role: 'rowheader' }, text: y })); // prettier-ignore
      /** @type {HTMLElement[]} */
      const line = [];
      for (const x of data.xs) {
        const value = data.cells.get(`${x}\u0000${y}`) ?? null;
        const level = levelOf(value, max, levels);
        const el = h('span', {
          class: 'hm-cell',
          part: `cell cell-${level}`,
          attrs: { role: 'gridcell', tabindex: '-1', 'aria-label': t('heatCell', { label: `${y}, ${x}`, value: this.valueText(value) }) }, // prettier-ignore
        });
        el.style.setProperty('--_level', String(level / (levels - 1)));
        this.bindCell(el, () => ({ x, y, value }), `${y}, ${x}: ${this.valueText(value)}`);
        row.append(el);
        line.push(el);
      }
      grid.push(line);
      return row;
    });
    const table = this.gridElement([head, ...rows], [[], ...grid], this.heading || t('heatGridMatrix'), 1); // prettier-ignore
    table.classList.add('hm-matrix');
    table.style.setProperty('--_columns', String(data.xs.length));
    const total = values.reduce((a, b) => a + b, 0);
    return {
      element: this.wrap(table, t('heatTotalMatrix', { total: this.valueText(total), max: this.valueText(Math.max(...values)) }), levels), // prettier-ignore
      badge: `${formatNumber(data.ys.length, this.locale)} × ${formatNumber(data.xs.length, this.locale)}`,
    };
  }

  /**
   * Shows the text of a cell on hover and focus, and sends it when chosen.
   *
   * @param {HTMLElement} el
   * @param {() => Record<string, unknown>} detail
   * @param {string} text
   */
  bindCell(el, detail, text) {
    const show = () => {
      if (this.details) this.details.textContent = text;
    };
    el.addEventListener('mouseenter', show);
    el.addEventListener('focus', show);
    el.addEventListener('click', () => {
      el.focus();
      emit(this, EVENTS.SELECT, detail());
    });
    el.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      emit(this, EVENTS.SELECT, detail());
    });
  }

  /**
   * The grid pattern of WAI-ARIA: one cell in the tab order, arrows move between cells.
   *
   * @param {HTMLElement[]} rows
   * @param {(HTMLElement | null)[][]} grid - Cells by row and column (`null` for none).
   * @param {string} label
   * @param {number} [firstRow] - First row with cells.
   * @returns {HTMLElement}
   */
  gridElement(rows, grid, label, firstRow = 0) {
    const table = h('div', { class: 'hm-grid', part: 'grid', attrs: { role: 'grid', 'aria-label': label } }, ...rows); // prettier-ignore
    const cells = grid.flatMap((line, r) => line.map((el, c) => (el ? { el, r, c } : null))).filter((x) => x !== null); // prettier-ignore
    if (!cells.length) return table;
    const start = cells.find((x) => x.r === this.focusAt.row && x.c === this.focusAt.column) ?? cells[cells.length - 1]; // prettier-ignore
    start.el.setAttribute('tabindex', '0');
    const at = (/** @type {number} */ r, /** @type {number} */ c) => grid[r]?.[c] ?? null;
    table.addEventListener('keydown', (event) => {
      const current = cells.find((x) => x.el === event.target);
      if (!current) return;
      let { r, c } = current;
      /** @type {HTMLElement | null} */
      let next = null;
      const width = Math.max(...grid.map((line) => line.length));
      switch (event.key) {
        case 'ArrowRight':
          for (c += 1; c < width && !(next = at(r, c)); c += 1);
          break;
        case 'ArrowLeft':
          for (c -= 1; c >= 0 && !(next = at(r, c)); c -= 1);
          break;
        case 'ArrowDown':
          for (r += 1; r < grid.length && !(next = at(r, c)); r += 1);
          break;
        case 'ArrowUp':
          for (r -= 1; r >= firstRow && !(next = at(r, c)); r -= 1);
          break;
        case 'Home':
          next = cells.find((x) => x.r === r)?.el ?? null;
          break;
        case 'End':
          next = [...cells].reverse().find((x) => x.r === r)?.el ?? null;
          break;
        default:
          return;
      }
      event.preventDefault();
      if (!next) return;
      current.el.setAttribute('tabindex', '-1');
      next.setAttribute('tabindex', '0');
      const found = cells.find((x) => x.el === next);
      if (found) this.focusAt = { row: found.r, column: found.c };
      next.focus();
    });
    return table;
  }

  /**
   * @param {HTMLElement} content
   * @param {string} summary
   * @param {number} levels
   * @returns {HTMLElement}
   */
  wrap(content, summary, levels) {
    const t = this.t;
    const legend = h('div', { class: 'hm-legend', part: 'legend', attrs: { role: 'img', 'aria-label': t('heatLegend') } }); // prettier-ignore
    legend.append(h('span', { text: t('heatLess') }));
    for (let i = 0; i < levels; i += 1) {
      const swatch = h('span', { class: 'hm-cell', part: `cell cell-${i}` });
      swatch.style.setProperty('--_level', String(i / (levels - 1)));
      legend.append(swatch);
    }
    legend.append(h('span', { text: t('heatMore') }));
    this.details = h('p', { class: 'hm-details', attrs: { 'aria-hidden': 'true' } });
    return h(
      'div',
      { class: 'hm-view' },
      h('div', { class: 'hm-scroll' }, content),
      h('div', { class: 'hm-footer' }, h('p', { class: 'hm-summary', part: 'summary', text: summary }), legend), // prettier-ignore
      this.details,
    );
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
