// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import csvCss from '../../styles/csv.css?raw';
import { parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { buildCodeView, revealMatch } from '../../core/code-view.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { MAX_MATCHES, TextSearch } from '../../core/search.js';
import { createTabs, iconButton, noticeView } from '../../core/ui.js';
import { MAX_COLUMNS, inferType, parseCsv, sortKey } from './parser.js';

const VIEWS = /** @type {const} */ (['table', 'raw']);
const DELIMITER_NAMES = /** @type {Record<string, string>} */ ({
  ',': ',', comma: ',', ';': ';', semicolon: ';', tab: '\t', '\\t': '\t', '|': '|', pipe: '|',
}); // prettier-ignore
/** Characters of a cell shown before truncation (copy keeps the full text). */
const CELL_PREVIEW = 1000;

/** @typedef {typeof VIEWS[number]} View */
/** @typedef {import('./parser.js').CsvResult} CsvResult */
/** @typedef {import('./parser.js').ColumnType} ColumnType */

/**
 * Displays CSV or TSV data as an accessible, sortable and searchable table.
 *
 * The parser follows RFC 4180 (quoted fields, doubled quotes, line breaks inside
 * quotes) and detects the delimiter. Large files are paginated; cells are inserted as
 * text, never parsed as HTML.
 *
 * @element vt-csv
 * @since 0.5.0
 *
 * @attr {"auto"|","|";"|"tab"|"|"} delimiter - Field delimiter (default: detected).
 * @attr {boolean} header-row - The first row holds the column names (default on).
 * @attr {number} page-size - Rows per page, 10–1000 (default 100).
 * @attr {boolean} sortable - Column headers sort the table. Full variant: on.
 * @attr {boolean} line-numbers - Row numbers. Full variant: on.
 * @attr {boolean} tabs - Table / Raw tabs. Full variant: on.
 * @attr {"table"|"raw"} view - Initial view (default `table`, `raw` in edit mode).
 *
 * @prop {string} content - The CSV text.
 * @prop {string[][]} rows - The parsed rows (header included), read-only.
 *
 * @fires vt-sort - The table was sorted. Detail: `{ column, name, direction }`.
 *
 * @csspart table - The `<table>` element.
 * @csspart header-cell - A column header.
 * @csspart cell - A data cell.
 * @csspart row-number - A row number cell.
 * @csspart pager - The pagination bar.
 * @csspart status - Status bar under the editor.
 *
 * @example
 * <vt-csv variant="full">
 *   <template>name,score
 *   Ada,98
 *   Alan,95</template>
 * </vt-csv>
 */
export class VtCsv extends VtBase {
  static type = 'csv';

  static componentAttributes = Object.freeze([
    'delimiter', 'header-row', 'page-size', 'sortable', 'line-numbers', 'tabs', 'view',
  ]); // prettier-ignore

  static presets = {
    simple: { 'header-row': true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, tabs: true,
      sortable: true, 'line-numbers': true, 'header-row': true, fullscreen: true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, csvCss];

  constructor() {
    super();
    /** @type {{ key: string, result: CsvResult } | null} */
    this.parsed = null;
    /** @type {string | null} Text the cached parse was made from. */
    this.parsedText = null;
    /** @type {{ column: number, direction: "ascending" | "descending" } | null} */
    this.sort = null;
    this.page = 0;
    /** @type {View | null} */
    this.viewState = null;
    this.panelId = uid('panel');
    this.query = '';
    /** @type {{ row: number, column: number }[]} Matching cells, in display order. */
    this.searchMatches = [];
    this.current = -1;
    /** @type {HTMLElement | null} */
    this.tableHost = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {HTMLElement | null} */
    this.status = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.parseTimer = undefined;
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'view') this.viewState = null;
    if (name === 'page-size' || name === 'header-row') this.page = 0;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  contentChanged() {
    this.parsed = null;
    this.sort = null;
    this.page = 0;
  }

  /** @returns {string[][]} Parsed rows, header included. */
  get rows() {
    return this.parse().rows.map((row) => [...row]);
  }

  /** @returns {CsvResult} */
  parse() {
    const text = this.text ?? '';
    const requested = (this.getAttribute('delimiter') ?? '').trim().toLowerCase();
    const delimiter = DELIMITER_NAMES[requested];
    const key = `${delimiter ?? 'auto'}`;
    if (!this.parsed || this.parsed.key !== key || this.parsedText !== text) {
      this.parsed = { key, result: parseCsv(text, delimiter ? { delimiter } : {}) };
      this.parsedText = text;
    }
    return this.parsed.result;
  }

  /** @returns {View} */
  get view() {
    return (
      this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, this.editing ? 'raw' : 'table')
    );
  }

  /** @returns {number} */
  get pageSize() {
    return parseInteger(this.getAttribute('page-size'), { min: 10, max: 1000, fallback: 100 });
  }

  /**
   * Column names, types and data rows of the current document.
   *
   * @returns {{ names: string[], types: ColumnType[], data: string[][], result: CsvResult }}
   */
  model() {
    const result = this.parse();
    const headerRow = this.feature('header-row');
    const header = headerRow ? (result.rows[0] ?? []) : [];
    const data = headerRow ? result.rows.slice(1) : result.rows;
    const names = Array.from(
      { length: result.columns },
      (_, i) => header[i]?.trim() || this.t('column', { n: i + 1 }),
    );
    const types = names.map((_, i) => inferType(data, i));
    return { names, types, data, result };
  }

  /**
   * Data rows in display order (sorted, then filtered by the search).
   *
   * @param {string[][]} data
   * @param {ColumnType[]} types
   * @returns {number[]} Indexes into `data`.
   */
  order(data, types) {
    const indexes = data.map((_, i) => i);
    if (this.sort) {
      const { column, direction } = this.sort;
      const type = types[column] ?? 'text';
      const keys = data.map((row) =>
        (row[column] ?? '').trim() ? sortKey(row[column], type) : null,
      );
      const sign = direction === 'ascending' ? 1 : -1;
      indexes.sort((a, b) => {
        const ka = keys[a];
        const kb = keys[b];
        if (
          ka === null ||
          kb === null ||
          (typeof ka === 'number' && Number.isNaN(ka)) ||
          (typeof kb === 'number' && Number.isNaN(kb))
        ) {
          const ea = ka === null || Number.isNaN(ka);
          const eb = kb === null || Number.isNaN(kb);
          return ea === eb ? a - b : ea ? 1 : -1; // empty cells last, stable
        }
        if (ka < kb) return -sign;
        if (ka > kb) return sign;
        return a - b;
      });
    }
    if (!this.query) return indexes;
    const q = this.query.toLowerCase();
    return indexes.filter((i) => data[i].some((cell) => cell.toLowerCase().includes(q)));
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const view = this.view;
    const tabs = this.feature('tabs')
      ? createTabs({
          tabs: [
            { id: 'table', label: t('table'), icon: 'table' },
            { id: 'raw', label: t('raw'), icon: 'code' },
          ],
          selected: view,
          label: t('tabs'),
          panelId: this.panelId,
          onSelect: (id) => this.selectView(/** @type {View} */ (id)),
        })
      : null;
    const panel = h('div', {
      class: 'panel',
      attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null },
    });
    /** @type {{ run(query: string): { total: number, capped: boolean }, go(index: number): void, clear(): void }} */
    let target;
    /** @type {(HTMLElement | null)[]} */
    let extra = [];

    if (view === 'raw' && this.editing) {
      const editor = this.createEditor();
      panel.append(h('div', { class: 'body editor-body', part: 'body' }, editor.element));
      if (parseBoolean(this.getAttribute('status')) !== false)
        panel.append(/** @type {HTMLElement} */ (this.status));
      /** @type {TextSearch | null} */
      let search = null;
      target = {
        run: (query) => {
          search = new TextSearch(/** @type {Element} */ (editor.layer.querySelector('pre.code')));
          return search.run(query);
        },
        go: (index) => revealMatch(search?.go(index) ?? null),
        clear: () => search?.clear(),
      };
      extra = this.historyButtons(editor);
    } else if (view === 'raw') {
      const codeView = buildCodeView(this.text ?? '', {
        language: 'plaintext',
        lineNumbers: this.feature('line-numbers'),
        startLine: 1,
        highlightRanges: [],
        diff: false,
        highlightLimit: getConfig().highlightLimit,
      });
      panel.append(
        h(
          'div',
          {
            class: 'body',
            part: 'body',
            attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || 'CSV' },
          },
          codeView.element,
        ),
      );
      const search = new TextSearch(codeView.code);
      target = {
        run: (query) => search.run(query),
        go: (index) => revealMatch(search.go(index)),
        clear: () => search.clear(),
      };
    } else {
      this.tableHost = h('div', { class: 'table-host' });
      panel.append(...this.notices(), this.tableHost);
      this.renderTable();
      target = {
        run: (query) => this.search(query),
        go: (index) => this.goToMatch(index),
        clear: () => this.search(''),
      };
    }

    const actions = [
      this.searchButton(target),
      ...extra,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(() => this.text ?? '', this.downloadName('data.csv'), 'text/csv')
        : null,
      this.feature('copy') ? this.copyButton(() => this.text ?? '', t('copy')) : null,
    ];
    frame.append(...this.chrome({ badge: tabs ? '' : 'CSV', tabs, actions }), panel);
    this.editor?.align();
  }

  /** @returns {HTMLElement[]} Warnings about the data. */
  notices() {
    const { result } = this.model();
    const t = this.t;
    /** @type {HTMLElement[]} */
    const notices = [];
    if (result.error) notices.push(noticeView(t('csvUnclosed', { line: result.error.line })));
    if (result.truncatedColumns)
      notices.push(
        noticeView(t('tooManyColumns', { limit: formatNumber(MAX_COLUMNS, this.locale) })),
      );
    return notices;
  }

  /** Renders the table and the pager for the current sort, page and search. */
  renderTable() {
    if (!this.tableHost) return;
    const t = this.t;
    const { names, types, data } = this.model();
    const order = this.order(data, types);
    const pageSize = this.pageSize;
    const pages = Math.max(1, Math.ceil(order.length / pageSize));
    this.page = Math.min(this.page, pages - 1);
    const start = this.page * pageSize;
    const visible = order.slice(start, start + pageSize);
    const numbers = this.feature('line-numbers');
    const sortable = this.feature('sortable');

    const head = h('tr');
    if (numbers)
      head.append(
        h(
          'th',
          { class: 'row-number', attrs: { scope: 'col' } },
          h('span', { class: 'sr-only', text: t('rowNumber') }),
        ),
      );
    names.forEach((name, column) => {
      const sorted = this.sort?.column === column ? this.sort.direction : null;
      const th = h('th', {
        class: `col-${types[column]}`,
        part: 'header-cell',
        attrs: { scope: 'col', 'aria-sort': sortable ? (sorted ?? 'none') : null },
      });
      if (sortable) {
        const button = h(
          'button',
          {
            class: 'sort',
            attrs: {
              type: 'button',
              'data-focus-key': `sort-${column}`,
              title: t('sortBy', { name }),
            },
            on: { click: () => this.sortBy(column, name) },
          },
          h('span', { class: 'name', text: name }),
          icon(sorted === 'ascending' ? 'sort-up' : sorted === 'descending' ? 'sort-down' : 'sort'),
        );
        th.append(button);
      } else {
        th.append(h('span', { class: 'name', text: name }));
      }
      head.append(th);
    });

    const body = h('tbody');
    for (const index of visible) {
      const row = data[index];
      const tr = h('tr');
      if (numbers)
        tr.append(
          h('th', {
            class: 'row-number',
            part: 'row-number',
            attrs: { scope: 'row' },
            text: formatNumber(index + 1, this.locale),
          }),
        );
      for (let column = 0; column < names.length; column += 1) {
        const value = row[column] ?? '';
        tr.append(
          h('td', {
            class: `col-${types[column]}`,
            part: 'cell',
            attrs: { 'data-row': index, 'data-column': column },
            text: value.length > CELL_PREVIEW ? `${value.slice(0, CELL_PREVIEW)}…` : value,
          }),
        );
      }
      body.append(tr);
    }
    if (!visible.length) {
      body.append(
        h(
          'tr',
          {},
          h('td', {
            class: 'no-rows',
            attrs: { colspan: names.length + (numbers ? 1 : 0) },
            text: t('noRows'),
          }),
        ),
      );
    }

    const table = h(
      'table',
      { class: 'grid', part: 'table' },
      h('caption', { class: 'sr-only', text: this.heading || 'CSV' }),
      h('thead', {}, head),
      body,
    );
    const scroller = h(
      'div',
      {
        class: 'body table-body',
        part: 'body',
        attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || t('table') },
      },
      table,
    );
    this.tableHost.replaceChildren(scroller, this.pager(order.length, pages));
    if (this.query) this.highlightMatches(body);
  }

  /**
   * Pagination bar.
   *
   * @param {number} total
   * @param {number} pages
   * @returns {HTMLElement}
   */
  pager(total, pages) {
    const t = this.t;
    const from = total ? this.page * this.pageSize + 1 : 0;
    const to = Math.min(total, (this.page + 1) * this.pageSize);
    const go = (/** @type {number} */ page) => {
      this.page = Math.max(0, Math.min(pages - 1, page));
      this.renderTable();
    };
    const button = (
      /** @type {string} */ name,
      /** @type {"firstPage"|"previousPage"|"nextPage"|"lastPage"} */ label,
      /** @type {number} */ page,
      /** @type {boolean} */ disabled,
    ) => {
      const b = iconButton({ icon: name, label: t(label), key: label, onClick: () => go(page) });
      b.disabled = disabled;
      return b;
    };
    const info = this.query
      ? `${t('matchingRows', { count: formatNumber(total, this.locale) })} · ${t('rowsRange', { from: formatNumber(from, this.locale), to: formatNumber(to, this.locale), total: formatNumber(total, this.locale) })}`
      : t('rowsRange', {
          from: formatNumber(from, this.locale),
          to: formatNumber(to, this.locale),
          total: formatNumber(total, this.locale),
        });
    return h(
      'div',
      { class: 'pager', part: 'pager' },
      h('span', { class: 'pager-info', attrs: { 'aria-live': 'polite' }, text: info }),
      pages > 1
        ? h(
            'div',
            { class: 'toolbar' },
            button('chevrons-left', 'firstPage', 0, this.page === 0),
            button('chevron-left', 'previousPage', this.page - 1, this.page === 0),
            button('chevron-right', 'nextPage', this.page + 1, this.page >= pages - 1),
            button('chevrons-right', 'lastPage', pages - 1, this.page >= pages - 1),
          )
        : null,
    );
  }

  /**
   * Sorts by a column: ascending, then descending, then original order.
   *
   * @param {number} column
   * @param {string} name
   */
  sortBy(column, name) {
    /** @type {"ascending" | "descending" | null} */
    const next =
      this.sort?.column !== column
        ? 'ascending'
        : this.sort.direction === 'ascending'
          ? 'descending'
          : null;
    this.sort = next ? { column, direction: next } : null;
    this.page = 0;
    this.renderTable();
    /** @type {HTMLElement | null} */ (
      this.root.querySelector(`[data-focus-key="sort-${column}"]`)
    )?.focus();
    emit(this, EVENTS.SORT, { column, name, direction: next ?? 'none' });
  }

  /**
   * Filters rows containing the query and lists the matching cells.
   *
   * @param {string} query
   * @returns {{ total: number, capped: boolean }}
   */
  search(query) {
    this.query = query;
    this.page = 0;
    this.searchMatches = [];
    this.current = -1;
    let capped = false;
    if (query) {
      const { types, data } = this.model();
      const q = query.toLowerCase();
      for (const row of this.order(data, types)) {
        data[row].forEach((cell, column) => {
          if (this.searchMatches.length >= MAX_MATCHES) capped = true;
          else if (cell.toLowerCase().includes(q)) this.searchMatches.push({ row, column });
        });
        if (capped) break;
      }
    }
    this.renderTable();
    return { total: this.searchMatches.length, capped };
  }

  /**
   * Shows the page of a match and marks it as current.
   *
   * @param {number} index
   */
  goToMatch(index) {
    const match = this.searchMatches[index];
    if (!match) return;
    this.current = index;
    const { types, data } = this.model();
    const position = this.order(data, types).indexOf(match.row);
    const page = Math.floor(position / this.pageSize);
    if (page !== this.page) {
      this.page = page;
      this.renderTable();
    } else {
      this.highlightMatches(/** @type {HTMLElement} */ (this.tableHost?.querySelector('tbody')));
    }
  }

  /**
   * Marks the query in visible cells; the current match gets the `current` class.
   *
   * @param {HTMLElement} body
   */
  highlightMatches(body) {
    const current = this.searchMatches[this.current];
    for (const cell of body.querySelectorAll('td[data-row]')) {
      const search = new TextSearch(cell);
      search.clear();
      if (!search.run(this.query).total) continue;
      const isCurrent =
        current &&
        Number(cell.getAttribute('data-row')) === current.row &&
        Number(cell.getAttribute('data-column')) === current.column;
      if (isCurrent) {
        for (const group of search.matches) for (const mark of group) mark.classList.add('current');
        revealMatch(search.matches[0]?.[0] ?? null);
      }
    }
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    const editor = new CodeEditor({
      text: this.text ?? '',
      language: 'plaintext',
      lineNumbers: this.feature('line-numbers'),
      wrap: false,
      highlightLimit: getConfig().highlightLimit,
      label: this.heading || `CSV ${this.t('editor').toLowerCase()}`,
      placeholder: this.getAttribute('placeholder') ?? undefined,
      onInput: (text) => this.edited(text),
      onChange: (text) => emit(this, EVENTS.CHANGE, { value: text }),
      history: this.editHistory ?? undefined,
    });
    this.editor = editor;
    this.status = h('div', { class: 'edit-status', part: 'status', attrs: { role: 'status' } });
    this.showStatus();
    return editor;
  }

  /** Shows the size of the parsed table, or the parse problem. */
  showStatus() {
    if (!this.status) return;
    const { names, data, result } = this.model();
    const t = this.t;
    const ok = !result.error;
    this.status.className = `edit-status ${ok ? 'ok' : 'bad'}`;
    const message = ok
      ? t('csvStatus', {
          rows: formatNumber(data.length, this.locale),
          columns: formatNumber(names.length, this.locale),
        })
      : t('csvUnclosed', {
          line: /** @type {import('./parser.js').CsvError} */ (result.error).line,
        });
    this.status.replaceChildren(icon(ok ? 'check' : 'alert'), h('span', { text: message }));
  }

  /** The text was edited: update the status shortly after typing stops. */
  contentEdited() {
    this.parsed = null;
    clearTimeout(this.parseTimer);
    this.parseTimer = setTimeout(() => {
      this.showStatus();
      if (this.searchOpen && this.searchQuery) this.searchBar?.run();
    }, 150);
  }

  /**
   * @param {View} view
   */
  selectView(view) {
    if (view === this.view) return;
    this.viewState = view;
    this.render();
    /** @type {HTMLElement | null} */ (this.root.querySelector(`[data-tab="${view}"]`))?.focus();
    emit(this, EVENTS.TAB_CHANGE, { tab: view });
  }

  disconnectedCallback() {
    clearTimeout(this.parseTimer);
    this.editor?.destroy();
    super.disconnectedCallback();
  }
}
