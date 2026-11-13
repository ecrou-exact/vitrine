// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import csvCss from '../../styles/csv.css?raw';
import sqlCss from '../../styles/sql.css?raw';
import { parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { buildCodeView } from '../../core/code-view.js';
import { getConfig } from '../../core/config.js';
import { jsonText } from '../../core/data-input.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { isLanguageLoaded, loadLanguage, resolveLanguage } from '../../core/highlighter.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { TextSearch } from '../../core/search.js';
import { iconButton, noticeView } from '../../core/ui.js';
import { inferType, sortKey } from '../csv/parser.js';
import { formatSql, parseSql, resultToCsv, statementKind } from './sql.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./sql.js').Statement} Statement */
/** @typedef {import('./sql.js').ResultSet} ResultSet */
/** @typedef {import('../csv/parser.js').ColumnType} ColumnType */

const DIALECTS = /** @type {const} */ (['sql', 'postgresql', 'mysql', 'sqlite', 'mssql', 'oracle']);
const DIALECT_NAMES = {
  sql: 'SQL',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite',
  mssql: 'SQL Server',
  oracle: 'Oracle',
};

/**
 * JSON for `<vt-sql>`: the value is read as JSON results, and `dialect` (or `database`)
 * sets the attribute.
 *
 * @param {unknown} value
 * @returns {string | import('../../core/data-input.js').DataResult}
 */
function sqlFromData(value) {
  if (typeof value === 'string') return value;
  /** @type {Record<string, unknown>} */
  const attributes = {};
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = /** @type {Record<string, unknown>} */ (value);
    const dialect = record.dialect ?? record.database;
    if (typeof dialect === 'string') attributes.dialect = dialect;
  }
  return { content: jsonText(value), attributes };
}

/**
 * Shows SQL queries and their results: a query alone, highlighted and laid out on demand;
 * a terminal session of psql, mysql, MariaDB, sqlite3 or DuckDB with its result tables;
 * or JSON (`{ query, params, columns, rows, rowCount, duration }`, a node-postgres result,
 * or a list of them).
 *
 * Results are tables sorted by a click on a column, with `NULL` told apart from an empty
 * string, row counts, timings, errors and command tags. Nothing is ever run: the element
 * only reads text.
 *
 * @element vt-sql
 * @since 0.14.0
 *
 * @attr {"sql"|"postgresql"|"mysql"|"sqlite"|"mssql"|"oracle"} dialect - Database, for the badge and the highlighting (default `sql`).
 * @attr {boolean} format - Lays the queries out: keywords in capitals, one clause per line.
 * @attr {boolean} format-toggle - A button that lays the queries out or shows them as written. Full variant: on.
 * @attr {boolean} line-numbers - Line numbers in the queries.
 * @attr {number} max-rows - Rows shown per result before "Show more" (default 200).
 * @attr {boolean} results - Result tables (default on).
 * @attr {boolean} query - Queries (default on); off shows only the results.
 * @attr {boolean} sortable - Sorts a result by a click on a column (default on).
 *
 * @prop {string} content - The SQL, the session or the JSON.
 * @prop {Statement[]} statements - Statements read from the content (read-only copies).
 *
 * @fires vt-sort - A result was sorted. Detail: `{ statement, column, name, direction }`.
 *
 * @csspart statement - A statement: its query, parameters and result.
 * @csspart query - The query.
 * @csspart params - The parameters of a query.
 * @csspart result - A result: its summary and table.
 * @csspart summary - Row count, time and command tag of a result.
 * @csspart table - A result table.
 * @csspart header-cell - A column header.
 * @csspart cell - A cell.
 * @csspart null - A `NULL` cell.
 * @csspart sql-error - The error of a statement.
 *
 * @example
 * <vt-sql variant="full" dialect="postgresql">
 *   <template>
 *     app=# SELECT id, name FROM users LIMIT 2;
 *      id | name
 *     ----+------
 *       1 | Ada
 *       2 | Alan
 *     (2 rows)
 *   </template>
 * </vt-sql>
 */
export class VtSql extends VtBase {
  static type = 'sql';

  static fromData = sqlFromData;

  static dataAttributes = Object.freeze(['dialect']);

  static componentAttributes = Object.freeze([
    'dialect', 'format', 'format-toggle', 'line-numbers', 'max-rows', 'results', 'query',
    'sortable',
  ]); // prettier-ignore

  static presets = {
    simple: { results: true, query: true, sortable: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      results: true, query: true, sortable: true, 'format-toggle': true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, csvCss, sqlCss];

  constructor() {
    super();
    /** @type {{ text: string, statements: Statement[], error: Error | null } | null} */
    this.parsed = null;
    /** @type {boolean | null} Layout chosen with the button; `null` follows `format`. */
    this.formatChoice = null;
    /** @type {Map<number, { column: number, direction: "ascending" | "descending" }>} */
    this.sorts = new Map();
    /** @type {Map<number, number>} Rows shown per statement after "Show more". */
    this.shown = new Map();
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
    this.sorts.clear();
    this.shown.clear();
  }

  /** @returns {{ statements: Statement[], error: Error | null }} */
  parse() {
    const text = this.text ?? '';
    if (this.parsed?.text === text) return this.parsed;
    try {
      this.parsed = { text, statements: parseSql(text), error: null };
    } catch (error) {
      this.parsed = {
        text,
        statements: [],
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
    return this.parsed;
  }

  /** @returns {Statement[]} */
  get statements() {
    return structuredClone(this.parse().statements);
  }

  /** @returns {(typeof DIALECTS)[number]} */
  get dialect() {
    const value = (this.getAttribute('dialect') ?? '').trim().toLowerCase();
    const alias = /** @type {Record<string, string>} */ ({
      postgres: 'postgresql',
      pg: 'postgresql',
      pgsql: 'postgresql',
      mariadb: 'mysql',
      sqlite3: 'sqlite',
      'sql-server': 'mssql',
      sqlserver: 'mssql',
      tsql: 'mssql',
      plsql: 'oracle',
    })[value];
    return parseEnum(alias ?? value, DIALECTS, 'sql');
  }

  /** Canonical highlight.js language of the dialect. */
  get language() {
    const name = resolveLanguage(this.dialect === 'postgresql' ? 'pgsql' : 'sql') ?? 'plaintext';
    // Loaded once: a render after loading must not ask again, or it would render forever.
    if (name !== 'plaintext' && !isLanguageLoaded(name))
      loadLanguage(name).then((ok) => ok && this.requestRender());
    return name;
  }

  /** Whether the queries are laid out. */
  get formatted() {
    return this.formatChoice ?? this.feature('format');
  }

  /**
   * A feature that is on unless set to false, whatever the variant.
   *
   * @param {string} name
   */
  flag(name) {
    return this.feature(name) && parseBoolean(this.getAttribute(name)) !== false;
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { statements, error } = this.parse();
    const body = h('div', { class: 'body sql-body', part: 'body' });
    if (error) body.append(noticeView(t('sqlInvalid', { message: error.message })));
    else
      statements.forEach((s, index) =>
        body.append(this.statementView(s, index, statements.length)),
      );
    if (!error && !statements.length)
      body.append(h('div', { class: 'empty', part: 'empty', text: t('empty') }));

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('sql-edit');
      panel.append(
        h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
        body,
      );
      history = this.historyButtons(editor);
    } else panel.append(body);

    const search = new TextSearch(body);
    const json = /^\s*[[{]/.test(this.text ?? '');
    const sql = () =>
      statements
        .map((s) => (this.formatted ? formatSql(s.sql) : s.sql))
        .filter(Boolean)
        .join('\n\n');
    const actions = [
      this.searchButton(search),
      ...history,
      this.feature('format-toggle') && statements.some((s) => s.sql)
        ? iconButton({
            icon: 'wrap',
            label: this.formatted ? t('sqlAsWritten') : t('sqlFormat'),
            key: 'format',
            part: 'format-button',
            pressed: this.formatted,
            onClick: () => {
              this.formatChoice = !this.formatted;
              this.render();
            },
          })
        : null,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(
            () => this.text ?? '',
            this.downloadName(json ? 'results.json' : 'query.sql'),
            json ? 'application/json' : 'application/sql',
          )
        : null,
      this.feature('copy') && statements.some((s) => s.sql)
        ? this.copyButton(sql, t('sqlCopyQuery'))
        : null,
    ];
    const badge =
      statements.length > 1
        ? `${DIALECT_NAMES[this.dialect]} · ${t('sqlStatements', { count: formatNumber(statements.length, this.locale) })}`
        : DIALECT_NAMES[this.dialect];
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /**
   * @param {Statement} statement
   * @param {number} index
   * @param {number} count
   * @returns {HTMLElement}
   */
  statementView(statement, index, count) {
    const t = this.t;
    const label = count > 1 ? t('sqlStatement', { index: index + 1 }) : t('sqlQuery');
    const section = h('section', {
      class: 'sql-statement',
      part: 'statement',
      attrs: { 'aria-label': label, 'data-kind': statementKind(statement.sql).toLowerCase() },
    });
    if (statement.sql && this.flag('query')) {
      const view = buildCodeView(this.formatted ? formatSql(statement.sql) : statement.sql, {
        language: this.language,
        lineNumbers: this.feature('line-numbers'),
        startLine: 1,
        highlightRanges: [],
        diff: false,
        highlightLimit: getConfig().highlightLimit,
      });
      section.append(h('div', { class: 'sql-query', part: 'query' }, view.element));
    }
    if (statement.params.length) section.append(this.paramsView(statement));
    if (statement.error) {
      section.append(
        h(
          'div',
          { class: 'sql-error', part: 'sql-error', attrs: { role: 'note' } },
          icon('alert'),
          h('span', { class: 'sr-only', text: `${t('sqlError')}: ` }),
          h('pre', { text: statement.error }),
        ),
      );
    }
    const summary = this.summaryText(statement);
    if (this.flag('results') && (statement.result || summary)) {
      const result = h('div', { class: 'sql-result', part: 'result' });
      const bar = h('div', { class: 'sql-summary', part: 'summary' });
      if (summary) bar.append(h('span', { text: summary }));
      if (statement.result?.columns.length && this.feature('copy')) {
        const set = statement.result;
        bar.append(
          h('span', { class: 'spacer' }),
          this.copyTextButton(() => resultToCsv(set), t('sqlCopyCsv'), `csv-${index}`),
        );
      }
      if (bar.childElementCount) result.append(bar);
      if (statement.result?.columns.length)
        result.append(this.tableView(statement.result, index, count));
      section.append(result);
    }
    return section;
  }

  /**
   * @param {Statement} statement
   * @returns {HTMLElement}
   */
  paramsView(statement) {
    const list = h('dl', { class: 'sql-params', part: 'params' });
    for (const param of statement.params)
      list.append(h('dt', { text: param.name }), h('dd', {}, h('code', { text: param.value })));
    return h(
      'div',
      { class: 'sql-params-box' },
      h('span', { class: 'sql-label', text: this.t('sqlParams') }),
      list,
    );
  }

  /**
   * "3 rows · 12 ms · INSERT 0 1".
   *
   * @param {Statement} statement
   * @returns {string}
   */
  summaryText(statement) {
    const t = this.t;
    /** @type {string[]} */
    const parts = [];
    const result = statement.result;
    if (result) {
      const total = result.total ?? result.rows.length;
      parts.push(
        total === 0
          ? t('sqlNoRows')
          : total === 1
            ? t('sqlRow')
            : t('sqlRows', { count: formatNumber(total, this.locale) }),
      );
    }
    if (statement.duration !== null) parts.push(this.formatDuration(statement.duration));
    if (statement.message) parts.push(statement.message);
    return parts.join(' · ');
  }

  /**
   * @param {number} ms
   * @returns {string}
   */
  formatDuration(ms) {
    const format = (/** @type {number} */ value, /** @type {number} */ digits) =>
      new Intl.NumberFormat(this.locale, { maximumFractionDigits: digits }).format(value);
    if (ms >= 1000) return `${format(ms / 1000, 2)} s`;
    return `${format(ms, ms < 10 ? 3 : 0)} ms`;
  }

  /**
   * @param {ResultSet} result
   * @param {number} index
   * @param {number} count
   * @returns {HTMLElement}
   */
  tableView(result, index, count) {
    const t = this.t;
    const types = result.columns.map(
      (_, column) =>
        /** @type {ColumnType} */ (
          inferType(
            result.rows.map((row) => row.map((v) => v ?? '')),
            column,
          )
        ),
    );
    const order = this.rowOrder(result, index, types);
    const step = parseInteger(this.getAttribute('max-rows'), {
      min: 1,
      max: 100000,
      fallback: 200,
    });
    const limit = this.shown.get(index) ?? step;
    const sortable = this.flag('sortable');
    const sort = this.sorts.get(index);

    const head = h('tr');
    result.columns.forEach((column, position) => {
      const sorted = sort?.column === position ? sort.direction : null;
      const name = column.name || String(position + 1);
      const th = h('th', {
        class: `col-${types[position]}`,
        part: 'header-cell',
        attrs: {
          scope: 'col',
          'aria-sort': sortable ? (sorted ?? 'none') : null,
          title: column.type || null,
        },
      });
      const label = h('span', { class: 'name', text: name });
      if (sortable) {
        th.append(
          h(
            'button',
            {
              class: 'sort',
              attrs: {
                type: 'button',
                'data-focus-key': `sort-${index}-${position}`,
                title: t('sqlSortBy', { name }),
              },
              on: { click: () => this.sortBy(index, position, name) },
            },
            label,
            icon(
              sorted === 'ascending' ? 'sort-up' : sorted === 'descending' ? 'sort-down' : 'sort',
            ),
          ),
        );
      } else th.append(label);
      head.append(th);
    });

    const body = h('tbody');
    for (const rowIndex of order.slice(0, limit)) {
      const tr = h('tr');
      result.rows[rowIndex].forEach((value, position) => {
        tr.append(
          value === null
            ? h('td', {
                class: `col-${types[position]} sql-null`,
                part: 'cell null',
                text: t('sqlNull'),
              })
            : h('td', { class: `col-${types[position]}`, part: 'cell', text: value }),
        );
      });
      body.append(tr);
    }
    if (!result.rows.length) {
      body.append(
        h(
          'tr',
          {},
          h('td', {
            class: 'no-rows',
            attrs: { colspan: result.columns.length },
            text: t('sqlNoRows'),
          }),
        ),
      );
    }
    const table = h('table', { class: 'grid', part: 'table' }, h('thead', {}, head), body);
    const wrap = h(
      'div',
      {
        class: 'sql-table',
        attrs: {
          tabindex: '0',
          role: 'region',
          'aria-label':
            count > 1 ? t('sqlResult', { index: index + 1 }) : t('sqlResult', { index: 1 }),
        },
      },
      table,
    );
    const rest = order.length - limit;
    if (rest <= 0) return wrap;
    const more = h('button', {
      class: 'text-btn sql-more',
      text: t('sqlShowRows', { count: formatNumber(Math.min(rest, step), this.locale) }),
      attrs: { type: 'button', 'data-focus-key': `more-${index}` },
      on: {
        click: () => {
          this.shown.set(index, limit + step);
          this.render();
        },
      },
    });
    return h(
      'div',
      {},
      wrap,
      h(
        'div',
        { class: 'sql-more-bar' },
        h('span', {
          text: t('sqlRowsShown', {
            shown: formatNumber(limit, this.locale),
            count: formatNumber(order.length, this.locale),
          }),
        }),
        more,
      ),
    );
  }

  /**
   * Row indexes in the order chosen for a result.
   *
   * @param {ResultSet} result
   * @param {number} index
   * @param {ColumnType[]} types
   * @returns {number[]}
   */
  rowOrder(result, index, types) {
    const order = result.rows.map((_, i) => i);
    const sort = this.sorts.get(index);
    if (!sort) return order;
    const type = types[sort.column];
    const sign = sort.direction === 'ascending' ? 1 : -1;
    const keys = result.rows.map((row) => {
      const value = row[sort.column];
      return value === null || value === '' ? null : sortKey(value, type);
    });
    return order.sort((a, b) => {
      const x = keys[a];
      const y = keys[b];
      // NULL and empty cells always go last.
      if (x === null || (typeof x === 'number' && Number.isNaN(x))) return y === null ? a - b : 1;
      if (y === null || (typeof y === 'number' && Number.isNaN(y))) return -1;
      const cmp =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), this.locale, { numeric: true });
      return cmp * sign || a - b;
    });
  }

  /**
   * @param {number} statement
   * @param {number} column
   * @param {string} name
   */
  sortBy(statement, column, name) {
    const current = this.sorts.get(statement);
    /** @type {"ascending" | "descending" | null} */
    const direction =
      current?.column !== column
        ? 'ascending'
        : current.direction === 'ascending'
          ? 'descending'
          : null;
    if (direction) this.sorts.set(statement, { column, direction });
    else this.sorts.delete(statement);
    this.render();
    emit(this, EVENTS.SORT, { statement, column, name, direction: direction ?? 'none' });
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: /^\s*[[{]/.test(this.text ?? '') ? 'json' : this.language,
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
    this.previewTimer = setTimeout(() => this.render(), 200);
  }
}
