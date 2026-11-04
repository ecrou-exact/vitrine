// @ts-check
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { en as strings, fr as stringsFr } from './strings.js';
import tableCss from '../../styles/table.css?raw';
import { parseEnum, parseInteger } from '../../core/attributes.js';
import { copyText, downloadText } from '../../core/actions.js';
import { VtBase } from '../../core/base-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { icon } from '../../core/icons.js';
import { TextSearch } from '../../core/search.js';
import { iconButton, noticeView } from '../../core/ui.js';
import {
  AGGREGATES,
  aggregate,
  coerce,
  compileFilter,
  fromValue,
  groupIndexes,
  isEmpty,
  parseTable,
  serialize,
  sortIndexes,
  sortKeys,
  toBoolean,
  toText,
} from './model.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./model.js').Column} Column */
/** @typedef {import('./model.js').ColumnDef} ColumnDef */
/** @typedef {import('./model.js').Row} Row */
/** @typedef {import('./model.js').SortSpec} SortSpec */
/** @typedef {import('./model.js').Dataset} Dataset */
/** @typedef {import('./model.js').Aggregate} Aggregate */
/**
 * @typedef {{ kind: 'group', value: string, indexes: number[] }
 *   | { kind: 'row', index: number }
 *   | { kind: 'detail', index: number }} Item
 */
/** @typedef {{ id: string, label: string, icon?: string, danger?: boolean }} BulkAction */
/**
 * @typedef {object} TableState
 * @property {{ key: string, hidden: boolean, width?: number, aggregate?: Aggregate }[]} [columns]
 * @property {SortSpec[]} [sort]
 * @property {Record<string, string>} [filters]
 * @property {string | null} [groupBy]
 * @property {"compact"|"normal"|"comfortable"} [density]
 * @property {number} [pageSize]
 * @property {number} [pinned]
 */

const DENSITIES = /** @type {const} */ (['compact', 'normal', 'comfortable']);
const ROW_HEIGHT = { compact: 30, normal: 37, comfortable: 46 };
const LAYOUTS = /** @type {const} */ (['auto', 'table', 'cards']);
const SELECTION = /** @type {const} */ (['none', 'single', 'multiple']);
const FORMATS = /** @type {const} */ (['auto', 'json', 'csv']);
const PAGE_SIZES = [10, 25, 50, 100, 250, 500, 0];
/** Rows rendered beyond the visible window when virtual scrolling. */
const OVERSCAN = 8;
const MIN_WIDTH = 56;
const MAX_WIDTH = 1200;
/** Rows a card list shows at most when paging is off. */
const CARD_LIMIT = 200;

/**
 * A data table: typed sorting on several columns, filters per column, global search,
 * row selection with bulk actions, grouping, expandable rows, column chooser, resizing,
 * reordering and pinning, footer aggregates, cell editing, virtual scrolling,
 * keyboard navigation, export and a card layout on narrow screens.
 *
 * Data comes from JSON (array of objects, array of arrays, or `{ columns, rows }`),
 * CSV / TSV text, or the `data` and `columns` properties. Cells are inserted as text.
 *
 * @element vt-table
 * @since 0.9.0
 *
 * @attr {"auto"|"json"|"csv"} format - Format of the text content (default: detected).
 * @attr {boolean} sortable - Headers sort the table (Shift+click: several columns). Default on.
 * @attr {boolean} filters - Filter row under the headers. Full variant: on.
 * @attr {"none"|"single"|"multiple"} selectable - Row selection. Full variant: `multiple`.
 * @attr {boolean} column-menu - Header menus and the column chooser. Full variant: on.
 * @attr {boolean} resizable - Column widths can be dragged. Default on.
 * @attr {boolean} reorderable - Columns can be dragged or moved with Alt+arrows. Full variant: on.
 * @attr {string} group-by - Column key to group the rows by.
 * @attr {boolean} expandable - Rows open to show all their fields. Full variant: on.
 * @attr {boolean} editable - Cells of columns marked `editable` can be edited (all columns when no column is marked).
 * @attr {boolean} footer - Footer with aggregates (sums of number columns by default).
 * @attr {"compact"|"normal"|"comfortable"} density - Row height (default `normal`).
 * @attr {"auto"|"table"|"cards"} layout - `auto` shows cards below `card-breakpoint`.
 * @attr {number} card-breakpoint - Width in pixels under which `auto` shows cards (default 560).
 * @attr {number} page-size - Rows per page; `0` shows every row with virtual scrolling (default 50).
 * @attr {number} pinned - Number of leading columns kept visible when scrolling sideways.
 * @attr {boolean} row-numbers - Row numbers. Full variant: on.
 * @attr {boolean} wrap - Long cell text wraps instead of being cut.
 * @attr {string} row-key - Property identifying each row (default: its position).
 * @attr {string} persist - Key under which the layout (columns, sort, density) is saved in `localStorage`.
 *
 * @prop {Row[]} data - The rows. Setting it takes precedence over the text content; `null` goes back to it.
 * @prop {ColumnDef[]} columns - Column definitions (key, label, type, width, hidden, editable, aggregate, format, render…).
 * @prop {BulkAction[]} bulkActions - Extra buttons of the selection bar; a click fires `vt-bulk-action`.
 * @prop {TableState} state - Layout and query state (columns, sort, filters, grouping, density, page size).
 * @prop {Row[]} selection - Selected rows, read-only.
 * @prop {string[]} selectedKeys - Keys of the selected rows.
 *
 * @fires vt-sort - Sort changed. Detail: `{ column, name, direction, sort }`.
 * @fires vt-filter-change - Filters or search changed. Detail: `{ filters, query, shown }`.
 * @fires vt-select - Selection changed. Detail: `{ keys, rows, count }`.
 * @fires vt-bulk-action - A selection bar action was chosen. Detail: `{ action, keys, rows }`.
 * @fires vt-cell-edit - A cell was edited (cancelable). Detail: `{ key, column, value, previous, row }`.
 * @fires vt-column-change - Columns shown, moved, resized or pinned. Detail: `{ columns }`.
 * @fires vt-row-activate - Enter or double-click on a row. Detail: `{ key, row }`.
 * @fires vt-toggle - A group or row opened or closed. Detail: `{ group?, key?, expanded }`.
 *
 * @csspart table - The `<table>` element.
 * @csspart header-cell - A column header.
 * @csspart cell - A data cell.
 * @csspart row - A data row.
 * @csspart group-row - A group header row.
 * @csspart filter - A filter field.
 * @csspart bulk-bar - The selection bar.
 * @csspart pager - The pagination bar.
 * @csspart card - A row in the card layout.
 * @csspart menu - Header menus and the column chooser.
 *
 * @example
 * <vt-table variant="full" row-key="id">
 *   <template>[{"id":1,"name":"Ada","score":98},{"id":2,"name":"Alan","score":95}]</template>
 * </vt-table>
 */
export class VtTable extends VtBase {
  static type = 'table';
  static allowEmpty = true;
  static upgradeProperties = ['content', 'data', 'columns', 'bulkActions', 'state'];

  static componentAttributes = Object.freeze([
    'format', 'sortable', 'filters', 'selectable', 'column-menu', 'resizable', 'reorderable',
    'group-by', 'expandable', 'editable', 'footer', 'density', 'layout', 'card-breakpoint',
    'page-size', 'pinned', 'row-numbers', 'wrap', 'row-key', 'persist',
  ]); // prettier-ignore

  static presets = {
    simple: { sortable: true, resizable: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      sortable: true, filters: true, 'column-menu': true, resizable: true, reorderable: true,
      expandable: true, 'row-numbers': true,
    },
  }; // prettier-ignore

  static styles = [tableCss];

  constructor() {
    super();
    /** @type {Row[] | null} */
    this._data = null;
    /** @type {ColumnDef[] | null} */
    this._columnDefs = null;
    /** @type {BulkAction[]} */
    this._bulkActions = [];
    /** @type {Dataset | null} */
    this.cache = null;
    /** @type {string | null} */
    this.cacheText = null;
    /** @type {Map<string, (number | string | null)[]>} */
    this.keyCache = new Map();
    /** @type {Map<string, string[]>} Lower-case text per column, for search. */
    this.textCache = new Map();
    /** @type {{ items: Item[], order: number[], key: string } | null} */
    this.viewCache = null;
    /** @type {string[] | null} Column keys in display order. */
    this.order = null;
    /** @type {Set<string>} */
    this.hiddenKeys = new Set();
    /** @type {Set<string>} */
    this.shown = new Set();
    /** @type {Map<string, number>} */
    this.widths = new Map();
    /** @type {Map<string, Aggregate>} */
    this.aggregates = new Map();
    /** @type {SortSpec[] | null} */
    this.sortState = null;
    /** @type {Map<string, string>} */
    this.filterValues = new Map();
    this.filtersOpen = /** @type {boolean | null} */ (null);
    /** @type {string | null | undefined} `undefined` follows `group-by`. */
    this.groupState = undefined;
    /** @type {Set<string>} */
    this.collapsed = new Set();
    /** @type {Set<number>} */
    this.expanded = new Set();
    /** @type {Set<string>} */
    this.selected = new Set();
    /** @type {number | null} Item index the Shift selection starts from. */
    this.anchor = null;
    /** @type {"compact"|"normal"|"comfortable" | null} */
    this.densityState = null;
    /** @type {number | null} */
    this.pageSizeState = null;
    /** @type {number | null} */
    this.pinnedState = null;
    this.page = 0;
    this.query = '';
    /** @type {{ r: number, c: number }} Focused cell: `r` item index (-1 header), `c` column. */
    this.focusPos = { r: -1, c: 0 };
    /** @type {{ r: number, c: number } | null} */
    this.editingCell = null;
    /** @type {"columns" | "help" | { column: string } | null} */
    this.panel = null;
    /** @type {Map<number, number>} Measured heights of detail rows. */
    this.detailHeights = new Map();
    /** @type {HTMLElement | null} */
    this.host = null;
    /** @type {HTMLElement | null} */
    this.scroller = null;
    /** @type {HTMLTableElement | null} */
    this.table = null;
    /** @type {HTMLTableSectionElement | null} */
    this.tbody = null;
    /** @type {ResizeObserver | null} */
    this.resizeObserver = null;
    this.narrow = false;
    this.restored = false;
    this.scrollFrame = 0;
    /** @type {string | null} */
    this.dragKey = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.filterTimer = undefined;
    this.tableId = uid('table');
    /** @type {Record<string, number>} Left offsets of sticky cells. */
    this.pinOffsets = {};
    /** @type {[number, number] | null} Items rendered when virtual scrolling. */
    this.windowRange = null;
    this.resizing = false;
    /** @type {(event: PointerEvent) => void} */
    this.onOutside = (event) => {
      if (!this.panel) return;
      const path = event.composedPath();
      if (
        path.some(
          (el) => el instanceof Element && el.matches?.('.tb-popover, [data-popover-anchor]'),
        )
      )
        return;
      this.closePanel(false);
    };
  }

  // ---------------------------------------------------------------- lifecycle

  connectedCallback() {
    super.connectedCallback();
    this.restoreState();
    this.root.addEventListener('pointerdown', /** @type {EventListener} */ (this.onOutside));
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(([entry]) => {
        const narrow = entry.contentRect.width > 0 && entry.contentRect.width < this.cardBreakpoint;
        if (narrow !== this.narrow) {
          this.narrow = narrow;
          if (this.layoutAttr === 'auto') this.requestRender();
        }
      });
      this.resizeObserver.observe(this);
    }
  }

  disconnectedCallback() {
    this.root.removeEventListener('pointerdown', /** @type {EventListener} */ (this.onOutside));
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    cancelAnimationFrame(this.scrollFrame);
    clearTimeout(this.filterTimer);
    super.disconnectedCallback();
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'group-by') this.groupState = undefined;
    if (name === 'density') this.densityState = null;
    if (name === 'page-size') this.pageSizeState = null;
    if (name === 'pinned') this.pinnedState = null;
    if (name === 'format' || name === 'row-key') this.invalidateData();
    else this.invalidateView();
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  contentChanged() {
    if (!this._data) this.invalidateData();
  }

  // ---------------------------------------------------------------- public API

  /** @type {Row[]} */
  get data() {
    return this.getDataset().rows;
  }

  set data(value) {
    this._data = Array.isArray(value) ? value : null;
    this.invalidateData();
    this.requestRender();
  }

  /** @type {ColumnDef[]} */
  get columns() {
    return this.allColumns().map(({ format, render, ...rest }) => ({ ...rest, format, render }));
  }

  set columns(value) {
    this._columnDefs = Array.isArray(value) ? value : null;
    this.order = null;
    this.invalidateData();
    this.requestRender();
  }

  /** @type {BulkAction[]} */
  get bulkActions() {
    return this._bulkActions;
  }

  set bulkActions(value) {
    this._bulkActions = Array.isArray(value)
      ? value.filter((a) => a && typeof a.id === 'string' && typeof a.label === 'string')
      : [];
    this.requestRender();
  }

  /** @type {Row[]} */
  get selection() {
    const rows = this.getDataset().rows;
    /** @type {Row[]} */
    const list = [];
    rows.forEach((row, i) => {
      if (this.selected.has(this.rowKey(i))) list.push(row);
    });
    return list;
  }

  /** @type {string[]} */
  get selectedKeys() {
    return [...this.selected];
  }

  /**
   * Selects rows by key.
   *
   * @param {Iterable<string | number>} keys
   * @param {{ add?: boolean }} [options] - `add` keeps the current selection.
   */
  select(keys, options = {}) {
    if (!options.add) this.selected.clear();
    for (const key of keys) this.selected.add(String(key));
    this.selectionChanged();
  }

  /** Clears the selection. */
  clearSelection() {
    if (!this.selected.size) return;
    this.selected.clear();
    this.selectionChanged();
  }

  /** Selects every row matching the filters. */
  selectAll() {
    if (this.selectionMode !== 'multiple') return;
    for (const i of this.view().order) this.selected.add(this.rowKey(i));
    this.selectionChanged();
  }

  /**
   * Rows in display order.
   *
   * @param {{ filtered?: boolean, selected?: boolean }} [options]
   * @returns {Row[]}
   */
  getRows(options = {}) {
    const rows = this.getDataset().rows;
    const indexes = options.filtered === false ? rows.map((_, i) => i) : this.view().order;
    return indexes
      .filter((i) => !options.selected || this.selected.has(this.rowKey(i)))
      .map((i) => rows[i]);
  }

  /**
   * Serializes rows (visible columns, display order).
   *
   * @param {"csv"|"tsv"|"json"} [format]
   * @param {{ selected?: boolean }} [options]
   * @returns {string}
   */
  exportData(format = 'csv', options = {}) {
    return serialize(this.getRows(options), this.visibleColumns(), format);
  }

  /**
   * Changes fields of a row and re-renders.
   *
   * @param {string | number} key
   * @param {Row} patch
   * @returns {boolean} Whether the row was found.
   */
  updateRow(key, patch) {
    const index = this.indexOfKey(String(key));
    if (index < 0) return false;
    Object.assign(this.getDataset().rows[index], patch);
    this.invalidateValues();
    this.renderGrid();
    return true;
  }

  /**
   * Appends rows.
   *
   * @param {Row[]} rows
   */
  addRows(rows) {
    const data = this.getDataset();
    data.rows.push(...rows.filter((r) => r && typeof r === 'object'));
    this.invalidateValues();
    this.renderGrid();
  }

  /**
   * Removes rows by key (also from the selection).
   *
   * @param {Iterable<string | number>} keys
   */
  removeRows(keys) {
    const remove = new Set([...keys].map(String));
    const data = this.getDataset();
    const kept = data.rows.filter((_, i) => !remove.has(this.rowKey(i)));
    // Keys by position shift when rows are removed: keep them on the remaining rows.
    const keptKeys = data.rows.map((_, i) => this.rowKey(i)).filter((k) => !remove.has(k));
    data.rows.splice(0, data.rows.length, ...kept);
    if (this.hasAttribute('row-key')) for (const key of remove) this.selected.delete(key);
    else {
      const next = new Set();
      keptKeys.forEach((k, i) => this.selected.has(k) && next.add(this.rowKey(i)));
      this.selected = next;
    }
    this.expanded.clear();
    this.invalidateValues();
    this.renderGrid();
    this.selectionChanged();
  }

  /** Opens every group, or every row when not grouped. */
  expandAll() {
    if (this.groupKey) this.collapsed.clear();
    else if (this.feature('expandable'))
      for (const i of this.view().order.slice(0, 1000)) this.expanded.add(i);
    this.invalidateView();
    this.renderGrid();
  }

  /** Closes every group, or every row when not grouped. */
  collapseAll() {
    if (this.groupKey)
      for (const item of this.view().items) {
        if (item.kind === 'group') this.collapsed.add(item.value);
      }
    else this.expanded.clear();
    this.invalidateView();
    this.renderGrid();
  }

  /** Goes back to the column layout of the definitions (order, visibility, widths). */
  resetLayout() {
    this.order = null;
    this.hiddenKeys.clear();
    this.shown.clear();
    this.widths.clear();
    this.aggregates.clear();
    this.pinnedState = null;
    this.columnsChanged();
  }

  /** @type {TableState} */
  get state() {
    return {
      columns: this.allColumns().map((c) => ({
        key: c.key,
        hidden: this.isHidden(c),
        width: this.widths.get(c.key),
        aggregate: this.aggregates.get(c.key),
      })),
      sort: this.sortSpecs.map((s) => ({ ...s })),
      filters: Object.fromEntries([...this.filterValues].filter(([, v]) => v.trim())),
      groupBy: this.groupKey,
      density: this.density,
      pageSize: this.pageSize,
      pinned: this.pinned,
    };
  }

  set state(value) {
    if (!value || typeof value !== 'object') return;
    this.applyState(value);
    this.invalidateView();
    this.requestRender();
  }

  // ---------------------------------------------------------------- settings

  /** @returns {"none"|"single"|"multiple"} */
  get selectionMode() {
    const attr = this.getAttribute('selectable');
    if (attr === null) return this.variant === 'full' ? 'multiple' : 'none';
    const value = attr.trim().toLowerCase();
    if (value === '' || value === 'true') return 'multiple';
    if (value === 'false') return 'none';
    return parseEnum(value, SELECTION, 'none');
  }

  get density() {
    return this.densityState ?? parseEnum(this.getAttribute('density'), DENSITIES, 'normal');
  }

  get pageSize() {
    if (this.pageSizeState !== null) return this.pageSizeState;
    const value = this.getAttribute('page-size');
    if (value !== null && value.trim() === '0') return 0;
    return parseInteger(value, { min: 5, max: 1000, fallback: 50 });
  }

  get pinned() {
    return (
      this.pinnedState ??
      parseInteger(this.getAttribute('pinned'), { min: 0, max: 20, fallback: 0 })
    );
  }

  get layoutAttr() {
    return parseEnum(this.getAttribute('layout'), LAYOUTS, 'auto');
  }

  get cardBreakpoint() {
    return parseInteger(this.getAttribute('card-breakpoint'), { min: 0, max: 4000, fallback: 560 });
  }

  get cards() {
    return this.layoutAttr === 'cards' || (this.layoutAttr === 'auto' && this.narrow);
  }

  /** @returns {string | null} */
  get groupKey() {
    const key = this.groupState === undefined ? this.getAttribute('group-by') : this.groupState;
    return key && this.allColumns().some((c) => c.key === key) ? key : null;
  }

  get sortSpecs() {
    return (this.sortState ?? []).filter((s) => this.allColumns().some((c) => c.key === s.key));
  }

  get showFilters() {
    return this.filtersOpen ?? this.feature('filters');
  }

  /** Virtual scrolling: every row in one scroll area, only the visible ones rendered. */
  get virtual() {
    return this.pageSize === 0 && !this.cards && !this.feature('wrap');
  }

  /** Rows per page, with the fallbacks of layouts that cannot scroll virtually. */
  get effectivePageSize() {
    const size = this.pageSize;
    if (size) return size;
    return this.virtual ? Infinity : CARD_LIMIT;
  }

  // ---------------------------------------------------------------- data

  /** @returns {Dataset} */
  getDataset() {
    if (this._data) {
      if (!this.cache || this.cacheText !== null) {
        this.cache = fromValue(this._data, this._columnDefs);
        this.cache.rows = this._data;
        this.cacheText = null;
      }
      return this.cache;
    }
    const text = this.text ?? '';
    if (!this.cache || this.cacheText !== text) {
      const format = parseEnum(this.getAttribute('format'), FORMATS, 'auto');
      const parsed = parseTable(text, format);
      this.cache = this._columnDefs
        ? { ...fromValue(parsed.rows, this._columnDefs), error: parsed.error }
        : parsed;
      this.cacheText = text;
    }
    return this.cache;
  }

  invalidateData() {
    this.cache = null;
    this.cacheText = null;
    this.selected.clear();
    this.expanded.clear();
    this.collapsed.clear();
    this.detailHeights.clear();
    this.page = 0;
    this.invalidateValues();
  }

  /** Cell values changed: drop sort and search caches. */
  invalidateValues() {
    this.keyCache.clear();
    this.textCache.clear();
    this.invalidateView();
  }

  invalidateView() {
    this.viewCache = null;
  }

  /** @returns {Column[]} Every column, in display order, with the user's changes. */
  allColumns() {
    const { columns } = this.getDataset();
    const byKey = new Map(columns.map((c) => [c.key, c]));
    const keys = (this.order ?? []).filter((k) => byKey.has(k));
    for (const c of columns) if (!keys.includes(c.key)) keys.push(c.key);
    return keys.map((key) => {
      const column = /** @type {Column} */ (byKey.get(key));
      const width = this.widths.get(key);
      const agg = this.aggregates.get(key);
      return { ...column, width: width ?? column.width, aggregate: agg ?? column.aggregate };
    });
  }

  /**
   * @param {Column} column
   * @returns {boolean}
   */
  isHidden(column) {
    if (this.hiddenKeys.has(column.key)) return true;
    if (this.shown.has(column.key)) return false;
    return column.hidden;
  }

  /** @returns {Column[]} */
  visibleColumns() {
    return this.allColumns().filter((c) => !this.isHidden(c));
  }

  /**
   * @param {number} index - Index in the dataset.
   * @returns {string}
   */
  rowKey(index) {
    const key = this.getAttribute('row-key');
    const row = this.getDataset().rows[index];
    if (key && row && !isEmpty(row[key])) return toText(row[key]);
    return String(index);
  }

  /**
   * @param {string} key
   * @returns {number}
   */
  indexOfKey(key) {
    const rows = this.getDataset().rows;
    for (let i = 0; i < rows.length; i += 1) if (this.rowKey(i) === key) return i;
    return -1;
  }

  /**
   * @param {Column} column
   * @returns {(number | string | null)[]}
   */
  keysOf(column) {
    let keys = this.keyCache.get(column.key);
    if (!keys) {
      keys = sortKeys(this.getDataset().rows, column);
      this.keyCache.set(column.key, keys);
    }
    return keys;
  }

  /**
   * @param {Column} column
   * @returns {string[]}
   */
  textOf(column) {
    let texts = this.textCache.get(column.key);
    if (!texts) {
      const rows = this.getDataset().rows;
      texts = rows.map((row) => this.displayText(column, row).toLowerCase());
      this.textCache.set(column.key, texts);
    }
    return texts;
  }

  /** @returns {Intl.Collator} */
  get collator() {
    return new Intl.Collator(this.locale, { numeric: true, sensitivity: 'base' });
  }

  /**
   * Filtered and sorted rows, and the items shown (groups, rows, details).
   *
   * @returns {{ items: Item[], order: number[] }}
   */
  view() {
    const columns = this.allColumns();
    const key = JSON.stringify([
      this.sortSpecs,
      [...this.filterValues],
      this.query,
      this.groupKey,
      [...this.collapsed],
      [...this.expanded],
      columns.map((c) => [c.key, c.type, this.isHidden(c)]),
    ]);
    if (this.viewCache?.key === key) return this.viewCache;
    const { rows } = this.getDataset();
    let order = rows.map((_, i) => i);

    // Column filters.
    for (const column of columns) {
      const value = this.filterValues.get(column.key) ?? '';
      const test = compileFilter(value, column.type);
      if (test) order = order.filter((i) => test(rows[i][column.key]));
    }
    // Global search over the visible columns.
    const q = this.query.trim().toLowerCase();
    if (q) {
      const texts = columns.filter((c) => !this.isHidden(c)).map((c) => this.textOf(c));
      order = order.filter((i) => texts.some((list) => list[i].includes(q)));
    }
    // Sort.
    const specs = this.sortSpecs
      .map((s) => {
        const column = columns.find((c) => c.key === s.key);
        return column ? { keys: this.keysOf(column), direction: s.direction } : null;
      })
      .filter((s) => s !== null);
    order = sortIndexes(order, /** @type {any} */ (specs), this.collator);

    /** @type {Item[]} */
    const items = [];
    const expandable = this.feature('expandable');
    const pushRow = (/** @type {number} */ i) => {
      items.push({ kind: 'row', index: i });
      if (expandable && this.expanded.has(i)) items.push({ kind: 'detail', index: i });
    };
    const group = this.groupKey;
    if (group) {
      for (const g of groupIndexes(rows, order, group)) {
        items.push({ kind: 'group', value: g.value, indexes: g.indexes });
        if (!this.collapsed.has(g.value)) g.indexes.forEach(pushRow);
      }
    } else order.forEach(pushRow);
    this.viewCache = { items, order, key };
    return this.viewCache;
  }

  /**
   * Text shown in a cell (also searched).
   *
   * @param {Column} column
   * @param {Row} row
   * @returns {string}
   */
  displayText(column, row) {
    const value = row[column.key];
    if (column.format) {
      try {
        return String(column.format(value, row) ?? '');
      } catch {
        return toText(value);
      }
    }
    if (typeof value === 'number' && column.type === 'number' && !isIdentifier(column.key))
      return formatNumber(value, this.locale);
    if (value instanceof Date && !Number.isNaN(value.getTime()))
      return value.toLocaleString(this.locale);
    if (typeof value === 'boolean') return this.t(value ? 'tableYes' : 'tableNo');
    return toText(value);
  }

  // ---------------------------------------------------------------- state

  /**
   * @param {TableState} state
   */
  applyState(state) {
    if (Array.isArray(state.columns)) {
      this.order = state.columns.map((c) => c.key);
      this.hiddenKeys = new Set(state.columns.filter((c) => c.hidden).map((c) => c.key));
      this.shown = new Set(state.columns.filter((c) => !c.hidden).map((c) => c.key));
      this.widths = new Map(
        state.columns
          .filter((c) => typeof c.width === 'number' && c.width > 0)
          .map((c) => [c.key, clampWidth(/** @type {number} */ (c.width))]),
      );
      this.aggregates = new Map(
        state.columns
          .filter((c) => c.aggregate && AGGREGATES.includes(c.aggregate))
          .map((c) => [c.key, /** @type {Aggregate} */ (c.aggregate)]),
      );
    }
    if (Array.isArray(state.sort))
      this.sortState = state.sort
        .filter((s) => s && typeof s.key === 'string')
        .map((s) => ({
          key: s.key,
          direction: s.direction === 'descending' ? 'descending' : 'ascending',
        }));
    if (state.filters && typeof state.filters === 'object')
      this.filterValues = new Map(Object.entries(state.filters).map(([k, v]) => [k, String(v)]));
    if (state.groupBy !== undefined) this.groupState = state.groupBy || null;
    if (state.density && DENSITIES.includes(state.density)) this.densityState = state.density;
    if (typeof state.pageSize === 'number')
      this.pageSizeState = PAGE_SIZES.includes(state.pageSize) ? state.pageSize : null;
    if (typeof state.pinned === 'number')
      this.pinnedState = Math.max(0, Math.min(20, state.pinned));
  }

  /** Reads the layout saved under `persist`. */
  restoreState() {
    const key = this.storageKey;
    if (!key || this.restored) return;
    this.restored = true;
    try {
      const saved = localStorage.getItem(key);
      if (saved) this.applyState(JSON.parse(saved));
    } catch {
      // Storage blocked or invalid: keep the defaults.
    }
  }

  saveState() {
    const key = this.storageKey;
    if (!key) return;
    const { filters, ...layout } = this.state;
    void filters;
    try {
      localStorage.setItem(key, JSON.stringify(layout));
    } catch {
      // Storage full or blocked.
    }
  }

  get storageKey() {
    const name = this.getAttribute('persist')?.trim();
    return name ? `vitrine-table:${name.slice(0, 100)}` : null;
  }

  columnsChanged() {
    this.invalidateView();
    this.saveState();
    this.render();
    emit(this, EVENTS.COLUMN_CHANGE, { columns: this.state.columns });
  }

  selectionChanged() {
    const keys = [...this.selected];
    this.renderGrid();
    this.announce(this.t('tableSelected', { count: formatNumber(keys.length, this.locale) }));
    emit(this, EVENTS.SELECT, { keys, rows: this.selection, count: keys.length });
  }

  // ---------------------------------------------------------------- rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const data = this.getDataset();
    this.frame.dataset.density = this.density;
    this.frame.toggleAttribute('data-wrap', this.feature('wrap'));
    const expandable = this.feature('expandable') || Boolean(this.groupKey);
    const actions = [
      this.searchButton({
        run: (query) => this.search(query),
        go: (index) => this.goToResult(index),
        clear: () => this.search(''),
      }),
      this.feature('column-menu') || this.feature('filters')
        ? iconButton({
            icon: 'filter',
            label: t(this.showFilters ? 'tableHideFilters' : 'tableShowFilters'),
            key: 'filters',
            pressed: this.showFilters,
            onClick: () => {
              this.filtersOpen = !this.showFilters;
              this.render();
            },
          })
        : null,
      this.feature('column-menu')
        ? iconButton({
            icon: 'columns',
            label: t('tableColumns'),
            key: 'columns',
            pressed: this.panel === 'columns',
            onClick: () => this.togglePanel('columns'),
          })
        : null,
      iconButton({
        icon: 'rows',
        label: t('tableDensity', {
          density: t(/** @type {any} */ (`tableDensity_${this.density}`)),
        }),
        key: 'density',
        onClick: () => this.cycleDensity(),
      }),
      expandable
        ? iconButton({
            icon: 'expand-all',
            label: t('expandAll'),
            key: 'expand-all',
            onClick: () => this.expandAll(),
          })
        : null,
      expandable
        ? iconButton({
            icon: 'collapse-all',
            label: t('collapseAll'),
            key: 'collapse-all',
            onClick: () => this.collapseAll(),
          })
        : null,
      iconButton({
        icon: 'keyboard',
        label: t('tableShortcuts'),
        key: 'help',
        pressed: this.panel === 'help',
        onClick: () => this.togglePanel('help'),
      }),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(
            () => this.exportData('csv'),
            this.downloadName('table.csv'),
            'text/csv',
          )
        : null,
      this.feature('copy')
        ? this.copyButton(() => this.exportData('tsv'), t('tableCopyRows'))
        : null,
    ];
    for (const button of actions) button?.setAttribute('data-popover-anchor', '');
    const notices = [];
    if (data.error) notices.push(noticeView(t('tableInvalid', { message: data.error })));
    if (data.truncated) notices.push(noticeView(t('tableTruncated')));
    this.host = h('div', { class: 'tb', part: 'table-host' });
    frame.append(
      ...this.chrome({ badge: this.cards ? '' : t('table'), actions }),
      ...notices,
      this.host,
    );
    this.scroller = null;
    this.renderGrid();
  }

  /** Renders everything under the header: bars, table or cards, pager and popover. */
  renderGrid() {
    if (!this.host) return;
    const scrollTop = this.scroller?.scrollTop ?? 0;
    const scrollLeft = this.scroller?.scrollLeft ?? 0;
    const focusKey = this.activeFocusKey();
    const hadGridFocus =
      this.root.activeElement?.closest?.('.tb-grid, .tb-cards') !== null &&
      this.root.activeElement !== null;

    const { order, items } = this.view();
    const size = this.effectivePageSize;
    const pages = Number.isFinite(size) ? Math.max(1, Math.ceil(items.length / size)) : 1;
    this.page = Math.min(this.page, pages - 1);

    const scroller = h('div', {
      class: `body tb-body${this.virtual ? ' virtual' : ''}`,
      part: 'body',
      attrs: {
        tabindex: this.cards ? '0' : null,
        role: this.cards ? 'region' : null,
        'aria-label': this.heading || this.t('table'),
      },
    });
    this.scroller = scroller;
    if (this.virtual) scroller.addEventListener('scroll', () => this.onScroll(), { passive: true });

    if (this.cards) scroller.append(this.renderCards(items));
    else scroller.append(this.renderTable());

    this.host.replaceChildren(
      ...[
        this.bulkBar(order),
        this.stateBar(),
        scroller,
        this.pager(items.length, order.length, pages),
        this.renderPanel(),
      ].filter((n) => n !== null),
    );
    scroller.scrollTop = scrollTop;
    scroller.scrollLeft = scrollLeft;
    if (this.virtual) this.renderBody();
    if (focusKey) this.restoreFocus(focusKey);
    else if (hadGridFocus) this.focusCell(this.focusPos.r, this.focusPos.c, false);
  }

  /** @returns {HTMLElement} */
  renderTable() {
    const t = this.t;
    const columns = this.visibleColumns();
    const controls = this.controlColumns();
    const widths = columns.map((c) => this.widthOf(c));
    const total = controls.reduce((a, c) => a + c.width, 0) + widths.reduce((a, b) => a + b, 0);
    const table = h('table', {
      class: 'tb-grid',
      part: 'table',
      attrs: {
        id: this.tableId,
        role: 'grid',
        'aria-label': this.heading || t('table'),
        'aria-rowcount': this.view().order.length + 1,
        'aria-colcount': columns.length,
        'aria-multiselectable': this.selectionMode === 'multiple' ? 'true' : null,
      },
      on: {
        keydown: (event) => this.onGridKey(/** @type {KeyboardEvent} */ (event)),
        click: (event) => this.onGridClick(/** @type {MouseEvent} */ (event)),
        dblclick: (event) => this.onGridDoubleClick(/** @type {MouseEvent} */ (event)),
        focusin: (event) => this.onGridFocus(/** @type {FocusEvent} */ (event)),
      },
    });
    table.style.width = `max(100%, ${total}px)`;
    const colgroup = h('colgroup');
    for (const c of controls)
      colgroup.append(
        h('col', { class: `tb-col-${c.id}`, attrs: { style: `width:${c.width}px` } }),
      );
    columns.forEach((c, i) =>
      colgroup.append(h('col', { attrs: { 'data-key': c.key, style: `width:${widths[i]}px` } })),
    );
    this.table = table;
    this.tbody = h('tbody');
    table.append(colgroup, this.renderHead(columns, controls), this.tbody);
    const foot = this.renderFoot(columns, controls);
    if (foot) table.append(foot);
    this.applyPinning(table, columns, controls, widths);
    if (!this.virtual) this.renderBody();
    return table;
  }

  /** @returns {{ id: string, width: number }[]} Leading columns: selection, expander, row number. */
  controlColumns() {
    /** @type {{ id: string, width: number }[]} */
    const list = [];
    if (this.selectionMode !== 'none') list.push({ id: 'select', width: 40 });
    if (this.feature('expandable')) list.push({ id: 'expand', width: 34 });
    if (this.feature('row-numbers')) {
      const digits = String(this.getDataset().rows.length).length;
      list.push({ id: 'number', width: Math.max(44, digits * 8 + 24) });
    }
    return list;
  }

  /**
   * Width of a column: chosen, defined, or estimated from a sample of its text.
   *
   * @param {Column} column
   * @returns {number}
   */
  widthOf(column) {
    if (column.width) return clampWidth(column.width);
    const rows = this.getDataset().rows;
    // The header also holds the sort icon and the menu button.
    let longest = column.label.length + 7;
    const step = Math.max(1, Math.floor(rows.length / 200));
    for (let i = 0; i < rows.length; i += step) {
      const length = this.displayText(column, rows[i]).length;
      if (length > longest) longest = length;
    }
    const px = Math.round(longest * 7.6 + 34);
    return Math.max(
      column.type === 'boolean' ? 72 : 90,
      Math.min(column.type === 'text' ? 340 : 220, px),
    );
  }

  /**
   * Makes the control columns and the first `pinned` columns sticky.
   *
   * @param {HTMLTableElement} table
   * @param {Column[]} columns
   * @param {{ id: string, width: number }[]} controls
   * @param {number[]} widths
   */
  applyPinning(table, columns, controls, widths) {
    let left = 0;
    const offsets = /** @type {Record<string, number>} */ ({});
    for (const c of controls) {
      offsets[`ctl-${c.id}`] = left;
      left += c.width;
    }
    const pinned = Math.min(this.pinned, columns.length);
    for (let i = 0; i < pinned; i += 1) {
      offsets[`col-${i}`] = left;
      left += widths[i];
    }
    table.style.setProperty('--_pin-edge', `${left}px`);
    this.pinOffsets = offsets;
  }

  /**
   * Sticky style of a cell.
   *
   * @param {HTMLElement} cell
   * @param {string} id - `ctl-<id>` or `col-<index>`.
   */
  pin(cell, id) {
    const left = this.pinOffsets?.[id];
    if (left === undefined) return;
    cell.classList.add('pinned');
    cell.style.left = `${left}px`;
    const columns = this.visibleColumns();
    const last = this.pinned > 0 ? `col-${Math.min(this.pinned, columns.length) - 1}` : null;
    if (id === last) cell.classList.add('pin-edge');
  }

  /**
   * @param {Column[]} columns
   * @param {{ id: string, width: number }[]} controls
   * @returns {HTMLTableSectionElement}
   */
  renderHead(columns, controls) {
    const t = this.t;
    const head = h('tr', { attrs: { role: 'row', 'aria-rowindex': 1 } });
    const { order } = this.view();
    for (const c of controls) {
      const th = h('th', {
        class: `tb-ctl tb-ctl-${c.id}`,
        attrs: { role: 'columnheader', scope: 'col' },
      });
      if (c.id === 'select') {
        if (this.selectionMode === 'multiple') {
          const count = order.filter((i) => this.selected.has(this.rowKey(i))).length;
          const box = h('input', {
            class: 'tb-check',
            attrs: {
              type: 'checkbox',
              'aria-label': t('tableSelectAll'),
              'data-focus-key': 'select-all',
              tabindex: '-1',
            },
            on: {
              change: () =>
                count === order.length && count ? this.clearSelection() : this.selectAll(),
            },
          });
          box.checked = count > 0 && count === order.length;
          box.indeterminate = count > 0 && count < order.length;
          th.append(box);
        } else th.append(h('span', { class: 'sr-only', text: t('tableSelect') }));
      } else if (c.id === 'expand')
        th.append(h('span', { class: 'sr-only', text: t('tableDetails') }));
      else th.append(h('span', { class: 'sr-only', text: t('rowNumber') }));
      this.pin(th, `ctl-${c.id}`);
      head.append(th);
    }
    const sortable = this.feature('sortable');
    const specs = this.sortSpecs;
    columns.forEach((column, index) => {
      const at = specs.findIndex((s) => s.key === column.key);
      const direction = at >= 0 ? specs[at].direction : null;
      const th = h('th', {
        class: `tb-head type-${column.type}${column.align ? ` align-${column.align}` : ''}`,
        part: 'header-cell',
        attrs: {
          role: 'columnheader',
          scope: 'col',
          'aria-colindex': index + 1,
          'aria-sort': sortable && column.sortable ? (direction ?? 'none') : null,
          'data-r': -1,
          'data-c': index,
          'data-key': column.key,
          tabindex: '-1',
          draggable: this.feature('reorderable') ? 'true' : null,
          title: column.label,
        },
      });
      const inner = h('div', { class: 'tb-head-inner' });
      inner.append(h('span', { class: 'tb-label', text: column.label }));
      if (direction) {
        inner.append(icon(direction === 'ascending' ? 'sort-up' : 'sort-down'));
        if (specs.length > 1)
          inner.append(
            h('span', {
              class: 'tb-sort-rank',
              text: String(at + 1),
              attrs: { 'aria-hidden': 'true' },
            }),
          );
      } else if (sortable && column.sortable)
        inner.append(h('span', { class: 'tb-sort-hint' }, icon('sort')));
      if (this.feature('column-menu')) {
        inner.append(
          h(
            'button',
            {
              class: 'tb-menu-btn',
              attrs: {
                type: 'button',
                tabindex: '-1',
                'aria-haspopup': 'menu',
                'aria-label': t('tableColumnMenu', { name: column.label }),
                'data-popover-anchor': '',
                'data-focus-key': `menu-${column.key}`,
              },
              on: {
                click: (event) => {
                  event.stopPropagation();
                  this.togglePanel({ column: column.key });
                },
              },
            },
            icon('chevron-down'),
          ),
        );
      }
      th.append(inner);
      if (this.feature('resizable') && column.resizable) th.append(this.resizer(column));
      if (this.feature('reorderable')) this.makeDraggable(th, column.key);
      this.pin(th, `col-${index}`);
      head.append(th);
    });
    const thead = h('thead', {}, head);
    if (this.showFilters) thead.append(this.filterRow(columns, controls));
    return thead;
  }

  /**
   * @param {Column[]} columns
   * @param {{ id: string, width: number }[]} controls
   * @returns {HTMLTableRowElement}
   */
  filterRow(columns, controls) {
    const t = this.t;
    const tr = h('tr', { class: 'tb-filters' });
    for (const c of controls) {
      const th = h('th', { class: `tb-ctl tb-ctl-${c.id}` });
      this.pin(th, `ctl-${c.id}`);
      tr.append(th);
    }
    columns.forEach((column, index) => {
      const th = h('th');
      this.pin(th, `col-${index}`);
      if (!column.filterable) {
        tr.append(th);
        return;
      }
      const value = this.filterValues.get(column.key) ?? '';
      const label = t('tableFilterBy', { name: column.label });
      /** @type {HTMLInputElement | HTMLSelectElement} */
      let field;
      if (column.type === 'boolean') {
        field = h(
          'select',
          {
            class: 'tb-filter',
            part: 'filter',
            attrs: { 'aria-label': label, 'data-focus-key': `filter-${column.key}` },
          },
          h('option', { attrs: { value: '' }, text: t('tableAll') }),
          h('option', { attrs: { value: 'true' }, text: t('tableYes') }),
          h('option', { attrs: { value: 'false' }, text: t('tableNo') }),
          h('option', { attrs: { value: 'empty' }, text: t('tableEmpty') }),
        );
        field.value = value;
        field.addEventListener('change', () => this.setFilter(column.key, field.value, true));
      } else {
        field = h('input', {
          class: 'tb-filter',
          part: 'filter',
          attrs: {
            type: 'search',
            'aria-label': label,
            placeholder: t(
              column.type === 'number' || column.type === 'date'
                ? 'tableFilterRange'
                : 'tableFilterText',
            ),
            autocomplete: 'off',
            spellcheck: 'false',
            maxlength: 200,
            'data-focus-key': `filter-${column.key}`,
          },
        });
        field.value = value;
        field.addEventListener('input', () => this.setFilter(column.key, field.value, false));
        field.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' && field.value) {
            event.stopPropagation();
            field.value = '';
            this.setFilter(column.key, '', true);
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.focusCell(this.firstRowItem(), index);
          }
        });
      }
      th.append(field);
      tr.append(th);
    });
    return tr;
  }

  /**
   * @param {Column[]} columns
   * @param {{ id: string, width: number }[]} controls
   * @returns {HTMLTableSectionElement | null}
   */
  renderFoot(columns, controls) {
    const footer = this.feature('footer');
    const aggs = columns.map((c) => {
      if (c.aggregate !== 'none') return c.aggregate;
      return footer && c.type === 'number' && !isIdentifier(c.key) ? 'sum' : 'none';
    });
    if (!footer && aggs.every((a) => a === 'none')) return null;
    const { rows } = this.getDataset();
    const { order } = this.view();
    const tr = h('tr', { class: 'tb-foot' });
    controls.forEach((c, i) => {
      const td = h('td', {
        class: `tb-ctl tb-ctl-${c.id}`,
        text: i === 0 ? formatNumber(order.length, this.locale) : '',
        attrs: { title: i === 0 ? this.t('tableRowCount', { count: order.length }) : null },
      });
      this.pin(td, `ctl-${c.id}`);
      tr.append(td);
    });
    columns.forEach((column, index) => {
      const agg = /** @type {Aggregate} */ (aggs[index]);
      const value = aggregate(rows, order, column, agg);
      const td = h('td', {
        class: `type-${column.type}${column.align ? ` align-${column.align}` : ''}`,
      });
      if (value !== null) {
        const text =
          column.type === 'date' && agg !== 'count'
            ? new Date(value).toLocaleDateString(this.locale)
            : formatNumber(Math.round(value * 100) / 100, this.locale);
        td.append(
          h('span', { class: 'tb-agg', text: this.t(/** @type {any} */ (`tableAgg_${agg}`)) }),
          ' ',
          h('strong', { text }),
        );
      } else if (index === 0 && !controls.length)
        td.textContent = this.t('tableRowCount', {
          count: formatNumber(order.length, this.locale),
        });
      this.pin(td, `col-${index}`);
      tr.append(td);
    });
    return h('tfoot', {}, tr);
  }

  /** Renders the rows of the current page, or of the visible window when virtual. */
  renderBody() {
    const tbody = this.tbody;
    if (!tbody) return;
    const { items } = this.view();
    const columns = this.visibleColumns();
    const controls = this.controlColumns();
    const span = columns.length + controls.length;
    /** @type {Node[]} */
    const rows = [];
    let from;
    let to;
    let before = 0;
    let after = 0;
    if (this.virtual && this.scroller) {
      const rowHeight = ROW_HEIGHT[this.density];
      const heights = items.map((item) => itemHeight(item, rowHeight, this.detailHeights));
      const head = /** @type {HTMLElement | null} */ (this.table?.tHead ?? null);
      const top = Math.max(0, this.scroller.scrollTop - (head?.offsetHeight ?? 0));
      const viewport = this.scroller.clientHeight || 480;
      let y = 0;
      from = 0;
      while (from < items.length && y + heights[from] < top) y += heights[from++];
      from = Math.max(0, from - OVERSCAN);
      before = heights.slice(0, from).reduce((a, b) => a + b, 0);
      let shown = 0;
      to = from;
      while (to < items.length && shown < viewport + OVERSCAN * 2 * rowHeight)
        shown += heights[to++];
      after = heights.slice(to).reduce((a, b) => a + b, 0);
      this.windowRange = [from, to];
    } else {
      const size = this.effectivePageSize;
      from = this.page * size;
      to = Math.min(items.length, from + size);
    }
    if (before)
      rows.push(
        h(
          'tr',
          { class: 'tb-spacer', attrs: { 'aria-hidden': 'true' } },
          h('td', { attrs: { colspan: span, style: `height:${before}px` } }),
        ),
      );
    for (let r = from; r < to; r += 1) rows.push(this.renderItem(items[r], r, columns, controls));
    if (after)
      rows.push(
        h(
          'tr',
          { class: 'tb-spacer', attrs: { 'aria-hidden': 'true' } },
          h('td', { attrs: { colspan: span, style: `height:${after}px` } }),
        ),
      );
    if (!items.length)
      rows.push(
        h(
          'tr',
          {},
          h('td', {
            class: 'tb-empty',
            attrs: { colspan: span },
            text: this.getDataset().rows.length ? this.t('tableNoMatch') : this.t('noRows'),
          }),
        ),
      );
    tbody.replaceChildren(...rows);
    if (this.query) this.highlight(tbody);
    if (this.virtual) {
      let changed = false;
      for (const tr of tbody.querySelectorAll('tr.tb-detail')) {
        const index = Number(tr.getAttribute('data-index'));
        const height = /** @type {HTMLElement} */ (tr).offsetHeight;
        if (height && this.detailHeights.get(index) !== height) {
          this.detailHeights.set(index, height);
          changed = true;
        }
      }
      if (changed) requestAnimationFrame(() => this.renderBody());
    }
    this.syncTabStop();
  }

  onScroll() {
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = requestAnimationFrame(() => {
      const focused = this.root.activeElement;
      const hadFocus = focused instanceof HTMLElement && this.tbody?.contains(focused);
      this.renderBody();
      if (hadFocus) this.focusCell(this.focusPos.r, this.focusPos.c, false);
    });
  }

  /**
   * @param {Item} item
   * @param {number} r - Item index.
   * @param {Column[]} columns
   * @param {{ id: string, width: number }[]} controls
   * @returns {HTMLTableRowElement}
   */
  renderItem(item, r, columns, controls) {
    const t = this.t;
    const span = columns.length + controls.length;
    if (item.kind === 'group') {
      const open = !this.collapsed.has(item.value);
      const column = this.allColumns().find((c) => c.key === this.groupKey);
      const label =
        item.value === ''
          ? t('tableEmpty')
          : column
            ? this.displayText(column, {
                [column.key]: this.getDataset().rows[item.indexes[0]][column.key],
              })
            : item.value;
      const selectedCount = item.indexes.filter((i) => this.selected.has(this.rowKey(i))).length;
      const cell = h(
        'td',
        {
          class: 'tb-group-cell',
          attrs: { colspan: span, 'data-r': r, 'data-c': 0, tabindex: '-1', role: 'gridcell' },
        },
        h(
          'span',
          { class: 'tb-group-inner' },
          h('span', { class: 'tb-chevron' }, icon(open ? 'chevron-down' : 'chevron-right')),
          this.selectionMode === 'multiple'
            ? this.groupCheckbox(item.indexes, selectedCount)
            : null,
          h('span', { class: 'tb-group-name', text: column ? `${column.label}: ` : '' }),
          h('strong', { text: label }),
          h('span', { class: 'tb-count', text: formatNumber(item.indexes.length, this.locale) }),
        ),
      );
      return h(
        'tr',
        {
          class: 'tb-group',
          part: 'group-row',
          attrs: {
            role: 'row',
            'aria-expanded': String(open),
            'data-group': item.value,
            'data-r': r,
          },
        },
        cell,
      );
    }
    const { rows } = this.getDataset();
    const row = rows[item.index];
    const key = this.rowKey(item.index);
    if (item.kind === 'detail') {
      const list = h('dl', { class: 'tb-detail-list' });
      for (const column of this.allColumns()) {
        list.append(h('dt', { text: column.label }), h('dd', {}, this.cellContent(column, row)));
      }
      return h(
        'tr',
        { class: 'tb-detail', attrs: { 'data-index': item.index, role: 'row' } },
        h('td', { attrs: { colspan: span, role: 'gridcell' } }, list),
      );
    }
    const selected = this.selected.has(key);
    const tr = h('tr', {
      class: `tb-row${selected ? ' selected' : ''}`,
      part: 'row',
      attrs: {
        role: 'row',
        'aria-rowindex': r + 2,
        'aria-selected': this.selectionMode !== 'none' ? String(selected) : null,
        'data-r': r,
        'data-key': key,
      },
    });
    for (const c of controls) {
      const td = h('td', { class: `tb-ctl tb-ctl-${c.id}` });
      if (c.id === 'select') {
        td.append(
          h('input', {
            class: 'tb-check',
            attrs: {
              type: 'checkbox',
              tabindex: '-1',
              'aria-label': t('tableSelectRow', { n: item.index + 1 }),
            },
            on: {
              click: (event) => {
                event.stopPropagation();
                const mouse = /** @type {MouseEvent} */ (event);
                if (mouse.shiftKey && this.anchor !== null) this.selectRange(this.anchor, r);
                else this.toggleRow(r);
              },
            },
          }),
        );
        /** @type {HTMLInputElement} */ (td.firstChild).checked = selected;
      } else if (c.id === 'expand') {
        const open = this.expanded.has(item.index);
        td.append(
          h(
            'button',
            {
              class: 'tb-expand',
              attrs: {
                type: 'button',
                tabindex: '-1',
                'aria-expanded': String(open),
                'aria-label': t(open ? 'tableCollapseRow' : 'tableExpandRow'),
              },
              on: { click: (event) => (event.stopPropagation(), this.toggleDetail(item.index)) },
            },
            icon(open ? 'chevron-down' : 'chevron-right'),
          ),
        );
      } else td.textContent = formatNumber(item.index + 1, this.locale);
      this.pin(td, `ctl-${c.id}`);
      tr.append(td);
    }
    columns.forEach((column, c) => {
      const td = h('td', {
        class: `tb-cell type-${column.type}${column.align ? ` align-${column.align}` : ''}${this.canEdit(column) ? ' editable' : ''}`,
        part: 'cell',
        attrs: {
          role: 'gridcell',
          'data-r': r,
          'data-c': c,
          tabindex: '-1',
          'aria-colindex': c + 1,
        },
      });
      if (this.editingCell?.r === r && this.editingCell.c === c)
        td.append(this.editor(column, row, r, c));
      else td.append(this.cellContent(column, row));
      this.pin(td, `col-${c}`);
      tr.append(td);
    });
    return tr;
  }

  /**
   * @param {number[]} indexes
   * @param {number} selectedCount
   * @returns {HTMLInputElement}
   */
  groupCheckbox(indexes, selectedCount) {
    const box = h('input', {
      class: 'tb-check',
      attrs: { type: 'checkbox', tabindex: '-1', 'aria-label': this.t('tableSelectGroup') },
      on: {
        click: (event) => {
          event.stopPropagation();
          const all = selectedCount === indexes.length;
          for (const i of indexes) {
            const key = this.rowKey(i);
            if (all) this.selected.delete(key);
            else this.selected.add(key);
          }
          this.selectionChanged();
        },
      },
    });
    box.checked = selectedCount > 0 && selectedCount === indexes.length;
    box.indeterminate = selectedCount > 0 && selectedCount < indexes.length;
    return box;
  }

  /**
   * Content of a cell: the column `render` hook, a link, a yes/no mark, or text.
   *
   * @param {Column} column
   * @param {Row} row
   * @returns {Node}
   */
  cellContent(column, row) {
    const value = row[column.key];
    if (column.render) {
      try {
        const out = column.render(value, row);
        if (out instanceof Node) return out;
        return document.createTextNode(String(out ?? ''));
      } catch {
        // Fall back to the text below.
      }
    }
    if (column.type === 'boolean' && !column.format) {
      const b = toBoolean(value);
      if (b !== null)
        return h(
          'span',
          { class: `tb-bool ${b ? 'yes' : 'no'}` },
          icon(b ? 'check' : 'close'),
          h('span', { class: 'sr-only', text: this.t(b ? 'tableYes' : 'tableNo') }),
        );
    }
    const text = this.displayText(column, row);
    if (column.type === 'url' && typeof value === 'string') {
      const href = safeUrl(value);
      if (href)
        return h('a', {
          class: 'tb-link',
          text,
          attrs: { href, target: '_blank', rel: 'noopener noreferrer nofollow', tabindex: '-1' },
        });
    }
    return h('span', {
      class: 'tb-text',
      text,
      attrs: { title: text.length > 24 ? text.slice(0, 500) : null },
    });
  }

  /**
   * @param {Item[]} items
   * @returns {HTMLElement}
   */
  renderCards(items) {
    const t = this.t;
    const columns = this.visibleColumns();
    const size = this.effectivePageSize;
    const from = this.page * size;
    const list = h('div', {
      class: 'tb-cards',
      attrs: { role: 'list', 'aria-label': this.heading || t('table') },
    });
    const sortable = this.feature('sortable');
    const spec = this.sortSpecs[0];
    const tools = h('div', { class: 'tb-card-tools' });
    if (this.selectionMode === 'multiple') {
      const { order } = this.view();
      const count = order.filter((i) => this.selected.has(this.rowKey(i))).length;
      const box = h('input', {
        class: 'tb-check',
        attrs: { type: 'checkbox', 'aria-label': t('tableSelectAll') },
        on: {
          change: () =>
            count === order.length && count ? this.clearSelection() : this.selectAll(),
        },
      });
      box.checked = count > 0 && count === order.length;
      box.indeterminate = count > 0 && count < order.length;
      tools.append(
        h('label', { class: 'tb-card-all' }, box, h('span', { text: t('tableSelectAll') })),
      );
    }
    if (sortable) {
      const select = h(
        'select',
        {
          class: 'tb-filter',
          attrs: { 'aria-label': t('tableSortField'), 'data-focus-key': 'card-sort' },
        },
        h('option', { attrs: { value: '' }, text: t('tableNoSort') }),
        ...columns
          .filter((c) => c.sortable)
          .map((c) => h('option', { attrs: { value: c.key }, text: c.label })),
      );
      select.value = spec?.key ?? '';
      select.addEventListener('change', () =>
        this.setSort(
          select.value ? [{ key: select.value, direction: spec?.direction ?? 'ascending' }] : [],
        ),
      );
      tools.append(select);
      if (spec)
        tools.append(
          iconButton({
            icon: spec.direction === 'ascending' ? 'sort-up' : 'sort-down',
            label: t(spec.direction === 'ascending' ? 'tableSortAsc' : 'tableSortDesc'),
            key: 'card-direction',
            onClick: () =>
              this.setSort([
                {
                  key: spec.key,
                  direction: spec.direction === 'ascending' ? 'descending' : 'ascending',
                },
              ]),
          }),
        );
    }
    const wrap = h('div', { class: 'tb-cards-wrap' }, tools, list);
    const { rows } = this.getDataset();
    for (let r = from; r < Math.min(items.length, from + size); r += 1) {
      const item = items[r];
      if (item.kind === 'detail') continue;
      if (item.kind === 'group') {
        const open = !this.collapsed.has(item.value);
        list.append(
          h(
            'button',
            {
              class: 'tb-card-group',
              part: 'group-row',
              attrs: { type: 'button', 'aria-expanded': String(open), role: 'listitem' },
              on: { click: () => this.toggleGroup(item.value) },
            },
            icon(open ? 'chevron-down' : 'chevron-right'),
            h('strong', { text: item.value || t('tableEmpty') }),
            h('span', { class: 'tb-count', text: formatNumber(item.indexes.length, this.locale) }),
          ),
        );
        continue;
      }
      const row = rows[item.index];
      const key = this.rowKey(item.index);
      const selected = this.selected.has(key);
      const card = h('article', {
        class: `tb-card${selected ? ' selected' : ''}`,
        part: 'card',
        attrs: { role: 'listitem', 'data-key': key },
      });
      const [first, ...rest] = columns;
      const top = h('div', { class: 'tb-card-top' });
      if (this.selectionMode !== 'none') {
        const box = h('input', {
          class: 'tb-check',
          attrs: { type: 'checkbox', 'aria-label': t('tableSelectRow', { n: item.index + 1 }) },
          on: { change: () => this.toggleRow(r) },
        });
        box.checked = selected;
        top.append(box);
      }
      if (first) top.append(h('strong', { class: 'tb-card-title' }, this.cellContent(first, row)));
      card.append(top);
      const dl = h('dl', { class: 'tb-card-fields' });
      for (const column of rest)
        dl.append(h('dt', { text: column.label }), h('dd', {}, this.cellContent(column, row)));
      card.append(dl);
      list.append(card);
    }
    if (!items.length)
      list.append(
        h('p', { class: 'tb-empty', text: rows.length ? t('tableNoMatch') : t('noRows') }),
      );
    if (this.query) this.highlight(list);
    return wrap;
  }

  /**
   * Selection bar: count, select all matching, copy, export, custom actions, clear.
   *
   * @param {number[]} order
   * @returns {HTMLElement | null}
   */
  bulkBar(order) {
    if (!this.selected.size || this.selectionMode === 'none') return null;
    const t = this.t;
    const count = this.selected.size;
    const bar = h('div', {
      class: 'tb-bulk',
      part: 'bulk-bar',
      attrs: { role: 'toolbar', 'aria-label': t('tableSelectionActions') },
    });
    bar.append(
      h('span', {
        class: 'tb-bulk-count',
        text: t('tableSelected', { count: formatNumber(count, this.locale) }),
      }),
    );
    const matching = order.filter((i) => this.selected.has(this.rowKey(i))).length;
    if (this.selectionMode === 'multiple' && matching < order.length)
      bar.append(
        this.textButton(
          t('tableSelectAllMatching', { count: formatNumber(order.length, this.locale) }),
          'bulk-all',
          () => this.selectAll(),
        ),
      );
    bar.append(h('span', { class: 'spacer' }));
    bar.append(
      this.textButton(
        t('copy'),
        'bulk-copy',
        async (button) => {
          const ok = await copyText(this.exportData('tsv', { selected: true }), this.root);
          button.classList.toggle('done', ok);
          this.announce(t(ok ? 'copied' : 'copyFailed'));
        },
        'copy',
      ),
      this.textButton(
        'CSV',
        'bulk-csv',
        () =>
          downloadText(
            this.exportData('csv', { selected: true }),
            this.downloadName('selection.csv'),
            'text/csv',
          ),
        'download',
      ),
      this.textButton(
        'JSON',
        'bulk-json',
        () =>
          downloadText(
            this.exportData('json', { selected: true }),
            'selection.json',
            'application/json',
          ),
        'download',
      ),
    );
    for (const action of this._bulkActions) {
      const button = this.textButton(
        action.label,
        `bulk-${action.id}`,
        () => {
          emit(this, EVENTS.BULK_ACTION, {
            action: action.id,
            keys: [...this.selected],
            rows: this.selection,
          });
        },
        action.icon,
      );
      if (action.danger) button.classList.add('danger');
      bar.append(button);
    }
    bar.append(
      iconButton({
        icon: 'close',
        label: t('tableClearSelection'),
        key: 'bulk-clear',
        onClick: () => this.clearSelection(),
      }),
    );
    return bar;
  }

  /**
   * Chips of the active query: sort, filters, grouping, with a reset.
   *
   * @returns {HTMLElement | null}
   */
  stateBar() {
    const t = this.t;
    const chips = [];
    const columns = this.allColumns();
    const label = (/** @type {string} */ key) => columns.find((c) => c.key === key)?.label ?? key;
    for (const [key, value] of this.filterValues) {
      if (!value.trim()) continue;
      chips.push(
        this.chip(`${label(key)}: ${value}`, t('tableRemoveFilter', { name: label(key) }), () =>
          this.setFilter(key, '', true),
        ),
      );
    }
    const group = this.groupKey;
    if (group)
      chips.push(
        this.chip(t('tableGroupedBy', { name: label(group) }), t('tableUngroup'), () =>
          this.setGroup(null),
        ),
      );
    const specs = this.sortSpecs;
    if (specs.length > 1)
      chips.push(
        this.chip(
          t('tableSortedBy', { names: specs.map((s) => label(s.key)).join(', ') }),
          t('tableClearSort'),
          () => this.setSort([]),
        ),
      );
    if (!chips.length) return null;
    return h(
      'div',
      { class: 'tb-state' },
      ...chips,
      chips.length > 1
        ? this.textButton(t('tableClearAll'), 'clear-all', () => this.clearQuery())
        : null,
    );
  }

  /**
   * @param {string} text
   * @param {string} removeLabel
   * @param {() => void} onRemove
   * @returns {HTMLElement}
   */
  chip(text, removeLabel, onRemove) {
    return h(
      'span',
      { class: 'tb-chip' },
      h('span', { text }),
      h(
        'button',
        {
          class: 'tb-chip-x',
          attrs: { type: 'button', 'aria-label': removeLabel, title: removeLabel },
          on: { click: onRemove },
        },
        icon('close'),
      ),
    );
  }

  /**
   * @param {string} label
   * @param {string} key
   * @param {(button: HTMLButtonElement) => void} onClick
   * @param {string} [iconName]
   * @returns {HTMLButtonElement}
   */
  textButton(label, key, onClick, iconName) {
    const button = h('button', {
      class: 'text-btn',
      attrs: { type: 'button', 'data-focus-key': key },
    });
    if (iconName) button.append(icon(iconName));
    button.append(h('span', { text: label }));
    button.addEventListener('click', () => onClick(button));
    return button;
  }

  /**
   * @param {number} itemCount
   * @param {number} rowCount
   * @param {number} pages
   * @returns {HTMLElement}
   */
  pager(itemCount, rowCount, pages) {
    const t = this.t;
    const total = this.getDataset().rows.length;
    const size = this.effectivePageSize;
    const fmt = (/** @type {number} */ n) => formatNumber(n, this.locale);
    let info;
    if (Number.isFinite(size) && pages > 1) {
      const from = itemCount ? this.page * size + 1 : 0;
      const to = Math.min(itemCount, (this.page + 1) * size);
      info = t('rowsRange', { from: fmt(from), to: fmt(to), total: fmt(itemCount) });
    } else info = t('tableRows', { count: fmt(rowCount) });
    if (rowCount !== total) info += ` · ${t('tableFiltered', { total: fmt(total) })}`;
    const go = (/** @type {number} */ page) => {
      this.page = Math.max(0, Math.min(pages - 1, page));
      this.renderGrid();
      this.scroller?.scrollTo({ top: 0 });
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
    const sizeSelect = h(
      'select',
      {
        class: 'tb-size',
        attrs: { 'aria-label': t('tablePageSize'), 'data-focus-key': 'page-size' },
      },
      ...PAGE_SIZES.map((n) =>
        h('option', { attrs: { value: n }, text: n ? String(n) : t('tableAll') }),
      ),
    );
    sizeSelect.value = String(this.pageSize);
    sizeSelect.addEventListener('change', () => {
      this.pageSizeState = Number(sizeSelect.value);
      this.page = 0;
      this.saveState();
      this.renderGrid();
    });
    return h(
      'div',
      { class: 'pager tb-pager', part: 'pager' },
      h('span', { class: 'pager-info', attrs: { 'aria-live': 'polite' }, text: info }),
      h(
        'div',
        { class: 'toolbar' },
        h('label', { class: 'tb-size-label' }, h('span', { text: t('tablePerPage') }), sizeSelect),
        pages > 1 ? button('chevrons-left', 'firstPage', 0, this.page === 0) : null,
        pages > 1 ? button('chevron-left', 'previousPage', this.page - 1, this.page === 0) : null,
        pages > 1
          ? h('span', {
              class: 'tb-page',
              text: t('tablePage', { page: fmt(this.page + 1), pages: fmt(pages) }),
            })
          : null,
        pages > 1
          ? button('chevron-right', 'nextPage', this.page + 1, this.page >= pages - 1)
          : null,
        pages > 1 ? button('chevrons-right', 'lastPage', pages - 1, this.page >= pages - 1) : null,
      ),
    );
  }

  // ---------------------------------------------------------------- popovers

  /**
   * @param {"columns" | "help" | { column: string }} which
   */
  togglePanel(which) {
    const same =
      typeof which === 'string'
        ? this.panel === which
        : typeof this.panel === 'object' && this.panel?.column === which.column;
    this.panel = same ? null : which;
    this.renderGrid();
    if (this.panel)
      /** @type {HTMLElement | null} */ (
        this.root.querySelector(
          '.tb-popover [data-autofocus], .tb-popover button, .tb-popover input',
        )
      )?.focus();
  }

  /**
   * @param {boolean} [refocus]
   */
  closePanel(refocus = true) {
    const was = this.panel;
    if (!was) return;
    this.panel = null;
    this.renderGrid();
    if (!refocus) return;
    const key =
      typeof was === 'string' ? (was === 'help' ? 'help' : 'columns') : `menu-${was.column}`;
    const target = /** @type {HTMLElement | null} */ (
      this.root.querySelector(`[data-focus-key="${CSS.escape(key)}"]`)
    );
    if (target) target.focus();
    else if (typeof was === 'object') this.focusHeader(was.column);
  }

  /** @returns {HTMLElement | null} */
  renderPanel() {
    const popover = this.panel;
    if (!popover) return null;
    const box = h('div', {
      class: 'tb-popover',
      part: 'menu',
      on: {
        keydown: (event) => {
          const e = /** @type {KeyboardEvent} */ (event);
          if (e.key === 'Escape') {
            e.stopPropagation();
            this.closePanel();
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (e.altKey) return;
            const items = /** @type {HTMLElement[]} */ ([
              ...box.querySelectorAll(
                '[role="menuitem"], [role="menuitemradio"], .tb-col-item input',
              ),
            ]);
            const at = items.indexOf(/** @type {HTMLElement} */ (this.root.activeElement));
            if (!items.length) return;
            e.preventDefault();
            items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
          }
        },
      },
    });
    if (popover === 'help') this.helpPanel(box);
    else if (popover === 'columns') this.columnsPanel(box);
    else this.columnMenu(box, popover.column);
    // Header menus open under their column.
    if (typeof popover === 'object') {
      queueMicrotask(() => {
        const th = /** @type {HTMLElement | null} */ (
          this.root.querySelector(`th[data-key="${CSS.escape(popover.column)}"]`)
        );
        const host = this.host;
        if (!th || !host) return;
        const a = th.getBoundingClientRect();
        const b = host.getBoundingClientRect();
        const left = Math.max(4, Math.min(a.left - b.left, b.width - box.offsetWidth - 4));
        box.style.left = `${left}px`;
        box.style.right = 'auto';
        box.style.top = `${a.bottom - b.top + 2}px`;
      });
    }
    return box;
  }

  /**
   * @param {HTMLElement} box
   * @param {string} key
   */
  columnMenu(box, key) {
    const t = this.t;
    const column = this.allColumns().find((c) => c.key === key);
    if (!column) return;
    box.setAttribute('role', 'menu');
    box.setAttribute('aria-label', t('tableColumnMenu', { name: column.label }));
    const item = (
      /** @type {string} */ label,
      /** @type {string} */ iconName,
      /** @type {() => void} */ run,
      /** @type {boolean} */ disabled = false,
    ) => {
      const b = h(
        'button',
        { class: 'tb-menu-item', attrs: { type: 'button', role: 'menuitem', disabled } },
        icon(iconName),
        h('span', { text: label }),
      );
      b.addEventListener('click', () => {
        run();
      });
      return b;
    };
    const visible = this.visibleColumns();
    const at = visible.findIndex((c) => c.key === key);
    const sort = this.sortSpecs.find((s) => s.key === key);
    if (this.feature('sortable') && column.sortable) {
      box.append(
        item(t('tableSortAsc'), 'sort-up', () =>
          this.menuDone(() => this.setSort([{ key, direction: 'ascending' }])),
        ),
        item(t('tableSortDesc'), 'sort-down', () =>
          this.menuDone(() => this.setSort([{ key, direction: 'descending' }])),
        ),
      );
      if (sort)
        box.append(
          item(t('tableClearSort'), 'sort', () =>
            this.menuDone(() => this.setSort(this.sortSpecs.filter((s) => s.key !== key))),
          ),
        );
      box.append(h('hr'));
    }
    if (column.filterable)
      box.append(
        item(t('tableFilter'), 'filter', () => {
          this.filtersOpen = true;
          this.panel = null;
          this.render();
          /** @type {HTMLElement | null} */ (
            this.root.querySelector(`[data-focus-key="filter-${CSS.escape(key)}"]`)
          )?.focus();
        }),
      );
    box.append(
      this.groupKey === key
        ? item(t('tableUngroup'), 'list', () => this.menuDone(() => this.setGroup(null)))
        : item(t('tableGroupBy'), 'list', () => this.menuDone(() => this.setGroup(key))),
      h('hr'),
      item(
        t('tableMoveLeft'),
        'chevron-left',
        () => this.menuDone(() => this.moveColumn(key, -1)),
        at <= 0,
      ),
      item(
        t('tableMoveRight'),
        'chevron-right',
        () => this.menuDone(() => this.moveColumn(key, 1)),
        at >= visible.length - 1,
      ),
      item(this.pinned > at ? t('tableUnpin') : t('tablePin'), 'lock', () =>
        this.menuDone(() => this.setPinned(this.pinned > at ? at : at + 1)),
      ),
      item(t('tableAutoFit'), 'columns', () => this.menuDone(() => this.autoFit(key))),
      item(
        t('tableHideColumn'),
        'eye-off',
        () => this.menuDone(() => this.setHidden(key, true)),
        visible.length <= 1,
      ),
    );
    const aggs =
      column.type === 'number' || column.type === 'date'
        ? AGGREGATES
        : /** @type {const} */ (['none', 'count']);
    box.append(h('hr'), h('div', { class: 'tb-menu-title', text: t('tableFooter') }));
    const current = column.aggregate;
    for (const agg of aggs) {
      if (column.type === 'date' && (agg === 'sum' || agg === 'avg')) continue;
      const b = h(
        'button',
        {
          class: 'tb-menu-item',
          attrs: { type: 'button', role: 'menuitemradio', 'aria-checked': String(current === agg) },
        },
        icon(current === agg ? 'check' : 'status-circle'),
        h('span', { text: t(/** @type {any} */ (`tableAggName_${agg}`)) }),
      );
      b.addEventListener('click', () =>
        this.menuDone(() => {
          this.aggregates.set(key, agg);
          this.columnsChanged();
        }),
      );
      box.append(b);
    }
    const first = /** @type {HTMLElement | null} */ (box.querySelector('button:not([disabled])'));
    first?.setAttribute('data-autofocus', '');
  }

  /**
   * Runs a menu command, then closes the menu and focuses the column header.
   *
   * @param {() => void} run
   */
  menuDone(run) {
    const was = this.panel;
    this.panel = null;
    run();
    this.renderGrid();
    if (typeof was === 'object' && was) this.focusHeader(was.column);
  }

  /**
   * @param {HTMLElement} box
   */
  columnsPanel(box) {
    const t = this.t;
    box.classList.add('tb-columns');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', t('tableColumns'));
    box.append(h('div', { class: 'tb-menu-title', text: t('tableColumns') }));
    const list = h('ul', { class: 'tb-col-list' });
    const columns = this.allColumns();
    const visibleCount = columns.filter((c) => !this.isHidden(c)).length;
    columns.forEach((column, index) => {
      const shown = !this.isHidden(column);
      const box2 = h('input', {
        attrs: {
          type: 'checkbox',
          'data-focus-key': `col-${column.key}`,
          'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown',
        },
        on: {
          change: () =>
            this.setHidden(column.key, !(/** @type {HTMLInputElement} */ (box2).checked), true),
          keydown: (event) => {
            const e = /** @type {KeyboardEvent} */ (event);
            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              e.preventDefault();
              this.moveColumn(column.key, e.key === 'ArrowUp' ? -1 : 1, true);
            }
          },
        },
      });
      box2.checked = shown;
      box2.disabled = shown && visibleCount <= 1;
      const move = (
        /** @type {number} */ delta,
        /** @type {string} */ name,
        /** @type {string} */ label,
        /** @type {boolean} */ disabled,
      ) => {
        const b = iconButton({
          icon: name,
          label,
          key: `col-${column.key}-${delta}`,
          onClick: () => this.moveColumn(column.key, delta, true),
        });
        b.disabled = disabled;
        return b;
      };
      list.append(
        h(
          'li',
          { class: 'tb-col-item' },
          h('label', {}, box2, h('span', { text: column.label })),
          move(-1, 'chevron-up', t('tableMoveUp', { name: column.label }), index === 0),
          move(
            1,
            'chevron-down',
            t('tableMoveDown', { name: column.label }),
            index === columns.length - 1,
          ),
        ),
      );
    });
    box.append(
      list,
      h(
        'div',
        { class: 'tb-col-actions' },
        this.textButton(t('tableShowAll'), 'show-all', () => {
          this.hiddenKeys.clear();
          for (const c of columns) this.shown.add(c.key);
          this.columnsChanged();
        }),
        this.textButton(t('tableResetLayout'), 'reset-layout', () => this.resetLayout()),
      ),
    );
  }

  /**
   * @param {HTMLElement} box
   */
  helpPanel(box) {
    const t = this.t;
    box.classList.add('tb-help');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', t('tableShortcuts'));
    const mod = /Mac|iP(?:hone|ad)/.test(globalThis.navigator?.platform ?? '') ? '⌘' : 'Ctrl';
    const rows = /** @type {[string, string][]} */ ([
      ['↑ ↓ ← →', t('tableKeyMove')],
      ['Home / End', t('tableKeyRowEnds')],
      [`${mod}+Home / End`, t('tableKeyTableEnds')],
      ['PageUp / PageDown', t('tableKeyPage')],
      ['Space', t('tableKeySelect')],
      ['Shift+↑ ↓', t('tableKeyRange')],
      [`${mod}+A`, t('tableKeySelectAll')],
      ['Esc', t('tableKeyClear')],
      ['Enter', t('tableKeyEnter')],
      ['F2', t('tableKeyEdit')],
      ['+ / −', t('tableKeyExpand')],
      [`${mod}+C`, t('tableKeyCopy')],
      ['Shift+Enter', t('tableKeyMultiSort')],
      ['Alt+← →', t('tableKeyMoveColumn')],
      ['Alt+Shift+← →', t('tableKeyResize')],
      ['/', t('tableKeySearch')],
    ]);
    box.append(h('div', { class: 'tb-menu-title', text: t('tableShortcuts') }));
    const dl = h('dl', { class: 'tb-keys' });
    for (const [keys, what] of rows)
      dl.append(h('dt', {}, h('kbd', { text: keys })), h('dd', { text: what }));
    box.append(dl, h('p', { class: 'tb-hint', text: t('tableMouseHint') }));
    const close = iconButton({
      icon: 'close',
      label: t('searchClose'),
      key: 'help-close',
      onClick: () => this.closePanel(),
    });
    close.classList.add('tb-popover-close');
    close.setAttribute('data-autofocus', '');
    box.prepend(close);
  }

  // ---------------------------------------------------------------- commands

  /**
   * @param {SortSpec[]} specs
   */
  setSort(specs) {
    this.sortState = specs;
    this.page = 0;
    this.invalidateView();
    this.saveState();
    this.renderGrid();
    const first = specs[0];
    const column = this.allColumns().find((c) => c.key === first?.key);
    this.announce(
      first
        ? this.t('tableSortedAnnounce', {
            name: column?.label ?? first.key,
            direction: this.t(
              first.direction === 'ascending' ? 'tableAscending' : 'tableDescending',
            ),
          })
        : this.t('tableUnsorted'),
    );
    emit(this, EVENTS.SORT, {
      column: first?.key ?? null,
      name: column?.label ?? null,
      direction: first?.direction ?? 'none',
      sort: specs.map((s) => ({ ...s })),
    });
  }

  /**
   * Header click: ascending, descending, then none. `add` keeps the other columns.
   *
   * @param {string} key
   * @param {boolean} add
   */
  cycleSort(key, add) {
    const column = this.allColumns().find((c) => c.key === key);
    if (!column?.sortable || !this.feature('sortable')) return;
    const specs = this.sortSpecs;
    const current = specs.find((s) => s.key === key);
    /** @type {SortSpec | null} */
    const next = !current
      ? { key, direction: 'ascending' }
      : current.direction === 'ascending'
        ? { key, direction: 'descending' }
        : null;
    if (add) {
      const rest = specs.filter((s) => s.key !== key);
      this.setSort(
        next ? (current ? specs.map((s) => (s.key === key ? next : s)) : [...rest, next]) : rest,
      );
    } else this.setSort(next ? [next] : []);
    this.focusHeader(key);
  }

  /**
   * @param {string} key
   * @param {string} value
   * @param {boolean} now - Apply now instead of after typing stops.
   */
  setFilter(key, value, now) {
    this.filterValues.set(key, value);
    if (!value) this.filterValues.delete(key);
    clearTimeout(this.filterTimer);
    const apply = () => {
      this.page = 0;
      this.invalidateView();
      const focusKey = this.activeFocusKey();
      if (now) this.renderGrid();
      else this.refreshRows();
      if (focusKey) this.restoreFocus(focusKey);
      this.filterChanged();
    };
    if (now) apply();
    else this.filterTimer = setTimeout(apply, 140);
  }

  /** Re-renders rows, footer, pager and bars, keeping the header (and a focused filter). */
  refreshRows() {
    if (!this.host || !this.table || this.cards) {
      this.renderGrid();
      return;
    }
    const { order, items } = this.view();
    const size = this.effectivePageSize;
    const pages = Number.isFinite(size) ? Math.max(1, Math.ceil(items.length / size)) : 1;
    this.page = Math.min(this.page, pages - 1);
    this.renderBody();
    const columns = this.visibleColumns();
    const controls = this.controlColumns();
    const foot = this.renderFoot(columns, controls);
    if (this.table.tFoot) this.table.tFoot.remove();
    if (foot) this.table.append(foot);
    // Header checkbox state.
    const all = /** @type {HTMLInputElement | null} */ (
      this.table.querySelector('thead .tb-check')
    );
    if (all) {
      const count = order.filter((i) => this.selected.has(this.rowKey(i))).length;
      all.checked = count > 0 && count === order.length;
      all.indeterminate = count > 0 && count < order.length;
    }
    for (const el of this.host.querySelectorAll(
      ':scope > .tb-bulk, :scope > .tb-state, :scope > .tb-pager',
    ))
      el.remove();
    const bulk = this.bulkBar(order);
    const state = this.stateBar();
    if (state) this.host.prepend(state);
    if (bulk) this.host.prepend(bulk);
    this.scroller?.after(this.pager(items.length, order.length, pages));
  }

  filterChanged() {
    const { order } = this.view();
    emit(this, EVENTS.FILTER_CHANGE, {
      filters: Object.fromEntries(this.filterValues),
      query: this.query,
      shown: order.length,
    });
  }

  clearQuery() {
    this.filterValues.clear();
    this.groupState = null;
    this.sortState = [];
    this.page = 0;
    this.invalidateView();
    this.saveState();
    this.renderGrid();
    this.filterChanged();
  }

  /**
   * @param {string | null} key
   */
  setGroup(key) {
    this.groupState = key;
    this.collapsed.clear();
    this.page = 0;
    this.invalidateView();
    this.saveState();
    this.render();
  }

  /**
   * @param {string} key
   * @param {boolean} hidden
   * @param {boolean} [keepPopover]
   */
  setHidden(key, hidden, keepPopover = false) {
    if (hidden) {
      this.hiddenKeys.add(key);
      this.shown.delete(key);
    } else {
      this.hiddenKeys.delete(key);
      this.shown.add(key);
    }
    if (!keepPopover) this.panel = null;
    this.columnsChanged();
    if (keepPopover) this.restoreFocus(`col-${key}`);
  }

  /**
   * Moves a column among all columns (hidden ones included).
   *
   * @param {string} key
   * @param {number} delta
   * @param {boolean} [inPanel]
   */
  moveColumn(key, delta, inPanel = false) {
    const keys = this.allColumns().map((c) => c.key);
    const visible = this.visibleColumns().map((c) => c.key);
    const from = keys.indexOf(key);
    let to;
    if (inPanel) to = from + delta;
    else {
      // In the table, jump over hidden columns.
      const v = visible.indexOf(key) + delta;
      if (v < 0 || v >= visible.length) return;
      to = keys.indexOf(visible[v]);
    }
    if (from < 0 || to < 0 || to >= keys.length) return;
    keys.splice(from, 1);
    keys.splice(to, 0, key);
    this.order = keys;
    this.columnsChanged();
    if (inPanel) this.restoreFocus(`col-${key}`);
    else this.focusHeader(key);
    const column = this.allColumns().find((c) => c.key === key);
    this.announce(
      this.t('tableMoved', {
        name: column?.label ?? key,
        position: this.visibleColumns().findIndex((c) => c.key === key) + 1,
      }),
    );
  }

  /**
   * @param {number} count
   */
  setPinned(count) {
    this.pinnedState = count;
    this.columnsChanged();
  }

  /**
   * @param {string} key
   * @param {number} width
   * @param {boolean} [commit]
   */
  setWidth(key, width, commit = true) {
    const w = clampWidth(width);
    this.widths.set(key, w);
    const col = /** @type {HTMLElement | null} */ (
      this.table?.querySelector(`col[data-key="${CSS.escape(key)}"]`)
    );
    if (col) col.style.width = `${w}px`;
    if (this.table) {
      let total = 0;
      for (const c of this.table.querySelectorAll('col'))
        total += parseFloat(/** @type {HTMLElement} */ (c).style.width) || 0;
      this.table.style.width = `max(100%, ${total}px)`;
    }
    if (commit) {
      if (this.pinned) this.columnsChanged();
      else {
        this.saveState();
        emit(this, EVENTS.COLUMN_CHANGE, { columns: this.state.columns });
      }
    }
  }

  /**
   * Fits a column to its widest text.
   *
   * @param {string} key
   */
  autoFit(key) {
    this.widths.delete(key);
    const column = this.allColumns().find((c) => c.key === key);
    if (!column) return;
    this.setWidth(key, this.widthOf({ ...column, width: undefined }));
  }

  cycleDensity() {
    const next = DENSITIES[(DENSITIES.indexOf(this.density) + 1) % DENSITIES.length];
    this.densityState = next;
    this.saveState();
    this.render();
    this.announce(
      this.t('tableDensity', { density: this.t(/** @type {any} */ (`tableDensity_${next}`)) }),
    );
  }

  /**
   * @param {string} value
   */
  toggleGroup(value) {
    const open = this.collapsed.has(value);
    if (open) this.collapsed.delete(value);
    else this.collapsed.add(value);
    this.invalidateView();
    this.renderGrid();
    emit(this, EVENTS.TOGGLE, { group: value, expanded: open });
  }

  /**
   * @param {number} index - Dataset index.
   */
  toggleDetail(index) {
    const open = !this.expanded.has(index);
    if (open) this.expanded.add(index);
    else this.expanded.delete(index);
    this.invalidateView();
    this.renderGrid();
    emit(this, EVENTS.TOGGLE, { key: this.rowKey(index), expanded: open });
  }

  /**
   * @param {number} r - Item index.
   */
  toggleRow(r) {
    const item = this.view().items[r];
    if (!item || item.kind !== 'row' || this.selectionMode === 'none') return;
    const key = this.rowKey(item.index);
    if (this.selected.has(key)) this.selected.delete(key);
    else {
      if (this.selectionMode === 'single') this.selected.clear();
      this.selected.add(key);
    }
    this.anchor = r;
    this.selectionChanged();
  }

  /**
   * Selects the rows between two items (inclusive).
   *
   * @param {number} a
   * @param {number} b
   */
  selectRange(a, b) {
    if (this.selectionMode !== 'multiple') {
      this.toggleRow(b);
      return;
    }
    const { items } = this.view();
    for (let r = Math.min(a, b); r <= Math.max(a, b); r += 1) {
      const item = items[r];
      if (item?.kind === 'row') this.selected.add(this.rowKey(item.index));
    }
    this.selectionChanged();
  }

  /**
   * @param {string} query
   * @returns {{ total: number, capped: boolean }}
   */
  search(query) {
    this.query = query;
    this.page = 0;
    this.invalidateView();
    this.refreshRows();
    this.filterChanged();
    return { total: query ? this.view().order.length : 0, capped: false };
  }

  /**
   * @param {number} index - Index of the matching row.
   */
  goToResult(index) {
    const { items, order } = this.view();
    const target = order[index];
    const r = items.findIndex((item) => item.kind === 'row' && item.index === target);
    if (r >= 0)
      this.revealItem(r, () => {
        const tr = this.root.querySelector(`tr[data-r="${r}"]`);
        for (const el of this.root.querySelectorAll('tr.current')) el.classList.remove('current');
        tr?.classList.add('current');
        tr?.scrollIntoView({ block: 'nearest' });
      });
  }

  /**
   * @param {HTMLElement} root
   */
  highlight(root) {
    for (const el of root.querySelectorAll('.tb-text, .tb-link')) {
      new TextSearch(el).run(this.query);
    }
  }

  // ---------------------------------------------------------------- editing

  /**
   * @param {Column} column
   * @returns {boolean}
   */
  canEdit(column) {
    if (!this.feature('editable') || column.render) return false;
    const marked = this.getDataset().columns.some((c) => c.editable);
    return marked ? column.editable : true;
  }

  /**
   * @param {Column} column
   * @param {Row} row
   * @param {number} r
   * @param {number} c
   * @returns {HTMLElement}
   */
  editor(column, row, r, c) {
    const value = row[column.key];
    const input = h('input', {
      class: 'tb-edit',
      attrs: {
        type: column.type === 'number' ? 'text' : 'text',
        inputmode: column.type === 'number' ? 'decimal' : null,
        'aria-label': this.t('tableEditCell', { name: column.label }),
        'data-focus-key': 'cell-editor',
      },
    });
    input.value = value instanceof Date ? value.toISOString() : toText(value);
    let done = false;
    const finish = (/** @type {boolean} */ save, /** @type {number} */ move = 0) => {
      if (done) return;
      done = true;
      this.editingCell = null;
      if (save) this.commitEdit(column, row, input.value);
      this.renderBody();
      if (move) {
        const next = this.nextEditable(r, c, move);
        if (next) {
          this.startEdit(next.r, next.c);
          return;
        }
      }
      this.focusCell(r, c);
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        finish(true, event.shiftKey ? -1 : 1);
      }
    });
    input.addEventListener('blur', () => finish(true));
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
    return input;
  }

  /**
   * @param {number} r
   * @param {number} c
   * @param {number} delta
   * @returns {{ r: number, c: number } | null}
   */
  nextEditable(r, c, delta) {
    const columns = this.visibleColumns();
    const { items } = this.view();
    let rr = r;
    let cc = c + delta;
    for (let guard = 0; guard < 10000; guard += 1) {
      if (cc >= columns.length) {
        cc = 0;
        rr += 1;
      } else if (cc < 0) {
        cc = columns.length - 1;
        rr -= 1;
      }
      if (rr < 0 || rr >= items.length) return null;
      if (items[rr].kind === 'row' && this.canEdit(columns[cc])) return { r: rr, c: cc };
      cc += delta;
    }
    return null;
  }

  /**
   * @param {number} r
   * @param {number} c
   */
  startEdit(r, c) {
    const item = this.view().items[r];
    const column = this.visibleColumns()[c];
    if (!item || item.kind !== 'row' || !column || !this.canEdit(column)) return false;
    this.revealItem(r, () => {
      this.editingCell = { r, c };
      this.focusPos = { r, c };
      this.renderBody();
    });
    return true;
  }

  /**
   * @param {Column} column
   * @param {Row} row
   * @param {string} text
   */
  commitEdit(column, row, text) {
    const previous = row[column.key];
    if (toText(previous) === text) return;
    const value = coerce(text, column, previous);
    const index = this.getDataset().rows.indexOf(row);
    const ok = emit(this, EVENTS.CELL_EDIT, {
      key: this.rowKey(index),
      column: column.key,
      value,
      previous,
      row,
    });
    if (!ok) return;
    row[column.key] = value;
    this.keyCache.delete(column.key);
    this.textCache.delete(column.key);
    this.invalidateView();
    if (this.table?.tFoot) {
      const foot = this.renderFoot(this.visibleColumns(), this.controlColumns());
      this.table.tFoot.remove();
      if (foot) this.table.append(foot);
    }
  }

  // ---------------------------------------------------------------- keyboard and mouse

  /** Index of the first row item, or -1. */
  firstRowItem() {
    const size = this.effectivePageSize;
    const from = Number.isFinite(size) ? this.page * size : 0;
    const { items } = this.view();
    return items.length ? Math.min(from, items.length - 1) : -1;
  }

  /**
   * Shows the page (or scrolls the window) holding an item, then runs `then`.
   *
   * @param {number} r
   * @param {() => void} then
   */
  revealItem(r, then) {
    if (r < 0) {
      then();
      return;
    }
    const size = this.effectivePageSize;
    if (Number.isFinite(size)) {
      const page = Math.floor(r / size);
      if (page !== this.page) {
        this.page = page;
        this.renderGrid();
      }
    } else if (this.virtual && this.scroller && this.windowRange) {
      const [from, to] = this.windowRange;
      if (r < from + 1 || r >= to - 1) {
        const rowHeight = ROW_HEIGHT[this.density];
        const { items } = this.view();
        let y = 0;
        for (let i = 0; i < r; i += 1) y += itemHeight(items[i], rowHeight, this.detailHeights);
        const head = this.table?.tHead?.offsetHeight ?? 0;
        const viewport = this.scroller.clientHeight;
        const top = this.scroller.scrollTop;
        if (y < top) this.scroller.scrollTop = y;
        else if (y + rowHeight + head > top + viewport)
          this.scroller.scrollTop = y + rowHeight + head - viewport;
        this.renderBody();
      }
    }
    then();
  }

  /**
   * Moves the keyboard focus to a cell.
   *
   * @param {number} r - Item index, -1 for the header row.
   * @param {number} c - Visible column index.
   * @param {boolean} [reveal]
   */
  focusCell(r, c, reveal = true) {
    const { items } = this.view();
    const columns = this.visibleColumns();
    if (!columns.length) return;
    const row = Math.max(-1, Math.min(items.length - 1, r));
    const col = Math.max(0, Math.min(columns.length - 1, c));
    this.focusPos = { r: row, c: col };
    const go = () => {
      this.syncTabStop();
      const cell = this.cellAt(row, col);
      cell?.focus({ preventScroll: !reveal });
      if (reveal) cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    if (reveal) this.revealItem(row, go);
    else go();
  }

  /**
   * @param {number} r
   * @param {number} c
   * @returns {HTMLElement | null}
   */
  cellAt(r, c) {
    if (!this.table) return null;
    if (r === -1) return this.table.querySelector(`th[data-r="-1"][data-c="${c}"]`);
    return (
      this.table.querySelector(`td[data-r="${r}"][data-c="${c}"]`) ??
      this.table.querySelector(`td[data-r="${r}"][data-c="0"]`)
    );
  }

  /** Only the focused cell is in the tab order (roving tabindex). */
  syncTabStop() {
    if (!this.table) return;
    for (const el of this.table.querySelectorAll('[data-c][tabindex="0"]'))
      el.setAttribute('tabindex', '-1');
    const { r, c } = this.focusPos;
    const cell = this.cellAt(r, c) ?? this.cellAt(-1, 0);
    cell?.setAttribute('tabindex', '0');
  }

  /**
   * @param {string} key
   */
  focusHeader(key) {
    const c = this.visibleColumns().findIndex((col) => col.key === key);
    if (c >= 0) this.focusCell(-1, c);
  }

  /**
   * @param {FocusEvent} event
   */
  onGridFocus(event) {
    const cell = /** @type {HTMLElement} */ (event.target).closest?.('[data-c]');
    if (!cell) return;
    const r = Number(cell.getAttribute('data-r'));
    const c = Number(cell.getAttribute('data-c'));
    if (r !== this.focusPos.r || c !== this.focusPos.c) {
      this.focusPos = { r, c };
      this.syncTabStop();
    }
  }

  /**
   * @param {MouseEvent} event
   */
  onGridClick(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest('input, select, a, .tb-resizer')) return;
    const th = target.closest('th[data-r="-1"]');
    if (th) {
      if (this.resizing) return;
      this.cycleSort(/** @type {string} */ (th.getAttribute('data-key')), event.shiftKey);
      return;
    }
    const group = target.closest('tr.tb-group');
    if (group) {
      this.toggleGroup(/** @type {string} */ (group.getAttribute('data-group')));
      this.focusCell(Number(group.getAttribute('data-r')), 0, false);
      return;
    }
    const cell = target.closest('td[data-c]');
    if (!cell) return;
    const r = Number(cell.getAttribute('data-r'));
    const c = Number(cell.getAttribute('data-c'));
    this.focusPos = { r, c };
    if (this.selectionMode !== 'none') {
      if (event.shiftKey && this.anchor !== null) {
        event.preventDefault();
        this.selectRange(this.anchor, r);
      } else if (event.ctrlKey || event.metaKey) this.toggleRow(r);
      else this.anchor = r;
    }
    this.syncTabStop();
  }

  /**
   * @param {MouseEvent} event
   */
  onGridDoubleClick(event) {
    const cell = /** @type {HTMLElement} */ (event.target).closest('td[data-c]');
    if (!cell || /** @type {HTMLElement} */ (event.target).closest('input')) return;
    const r = Number(cell.getAttribute('data-r'));
    const c = Number(cell.getAttribute('data-c'));
    if (!this.startEdit(r, c)) this.activate(r);
  }

  /**
   * @param {number} r
   */
  activate(r) {
    const item = this.view().items[r];
    if (item?.kind !== 'row') return;
    emit(this, EVENTS.ROW_ACTIVATE, {
      key: this.rowKey(item.index),
      row: this.getDataset().rows[item.index],
    });
  }

  /**
   * @param {KeyboardEvent} event
   */
  onGridKey(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.matches('input, select, textarea')) return;
    const cell = target.closest('[data-c]');
    if (!cell) return;
    const { items } = this.view();
    const columns = this.visibleColumns();
    const r = Number(cell.getAttribute('data-r'));
    const c = Number(cell.getAttribute('data-c'));
    const mod = event.ctrlKey || event.metaKey;
    const item = r >= 0 ? items[r] : null;
    const page = Math.max(
      5,
      Math.floor((this.scroller?.clientHeight ?? 400) / ROW_HEIGHT[this.density]) - 1,
    );
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    /** Next focusable item, skipping detail rows. */
    const step = (/** @type {number} */ from, /** @type {number} */ delta) => {
      let next = from + delta;
      while (next >= 0 && next < items.length && items[next].kind === 'detail')
        next += delta > 0 ? 1 : -1;
      if (next < -1) next = -1;
      if (next >= items.length) next = from;
      return next;
    };
    const key = event.key;

    if (r === -1) {
      const column = columns[c];
      if (event.altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
        handled();
        if (event.shiftKey) {
          if (this.feature('resizable'))
            this.setWidth(column.key, this.widthOf(column) + (key === 'ArrowLeft' ? -16 : 16));
        } else if (this.feature('reorderable'))
          this.moveColumn(column.key, key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (key === 'Enter' || key === ' ') {
        handled();
        this.cycleSort(column.key, event.shiftKey);
        return;
      }
      if ((key === 'ArrowDown' && event.altKey) || key === 'ContextMenu') {
        handled();
        if (this.feature('column-menu')) this.togglePanel({ column: column.key });
        return;
      }
    }

    switch (key) {
      case 'ArrowRight':
        handled();
        if (item?.kind === 'group') this.collapsed.has(item.value) && this.toggleGroup(item.value);
        this.focusCell(r, c + 1);
        return;
      case 'ArrowLeft':
        handled();
        if (item?.kind === 'group' && !this.collapsed.has(item.value)) this.toggleGroup(item.value);
        this.focusCell(r, c - 1);
        return;
      case 'ArrowDown': {
        handled();
        const next = step(r, 1);
        if (event.shiftKey && item && this.selectionMode === 'multiple') {
          if (this.anchor === null) this.anchor = r;
          this.focusPos = { r: next, c };
          this.selectRange(this.anchor, next);
        }
        this.focusCell(next, c);
        return;
      }
      case 'ArrowUp': {
        handled();
        const next = step(r, -1);
        if (event.shiftKey && item && next >= 0 && this.selectionMode === 'multiple') {
          if (this.anchor === null) this.anchor = r;
          this.focusPos = { r: next, c };
          this.selectRange(this.anchor, next);
        }
        this.focusCell(next, c);
        return;
      }
      case 'Home':
        handled();
        this.focusCell(mod ? step(-1, 1) : r, 0);
        return;
      case 'End':
        handled();
        this.focusCell(mod ? items.length - 1 : r, columns.length - 1);
        return;
      case 'PageDown':
        handled();
        this.focusCell(Math.min(items.length - 1, Math.max(0, r) + page), c);
        return;
      case 'PageUp':
        handled();
        this.focusCell(Math.max(0, r - page), c);
        return;
      default:
    }
    if (!item) {
      if (key === '/' && this.feature('search')) {
        handled();
        this.openSearch();
      } else if (key === '?') {
        handled();
        this.togglePanel('help');
      }
      return;
    }
    if (item.kind === 'group') {
      if (key === 'Enter' || key === ' ' || key === '+' || key === '-') {
        handled();
        if (
          key === '+'
            ? this.collapsed.has(item.value)
            : key === '-'
              ? !this.collapsed.has(item.value)
              : true
        )
          this.toggleGroup(item.value);
        this.focusCell(r, 0, false);
      }
      return;
    }
    const index = item.index;
    if (key === ' ') {
      handled();
      if (event.shiftKey && this.anchor !== null) this.selectRange(this.anchor, r);
      else this.toggleRow(r);
      this.focusCell(r, c, false);
    } else if (key === 'Enter') {
      handled();
      if (!this.startEdit(r, c)) {
        if (this.feature('expandable')) {
          this.toggleDetail(index);
          this.focusCell(r, c, false);
        } else this.activate(r);
      }
    } else if (key === 'F2') {
      handled();
      this.startEdit(r, c);
    } else if (key === '+' || key === '-') {
      if (!this.feature('expandable')) return;
      handled();
      if (this.expanded.has(index) !== (key === '+')) this.toggleDetail(index);
      this.focusCell(r, c, false);
    } else if (mod && key.toLowerCase() === 'a') {
      if (this.selectionMode !== 'multiple') return;
      handled();
      this.selectAll();
      this.focusCell(r, c, false);
    } else if (mod && key.toLowerCase() === 'c') {
      handled();
      const text = this.selected.size
        ? this.exportData('tsv', { selected: true })
        : this.displayText(columns[c], this.getDataset().rows[index]);
      copyText(text, this.root).then((ok) => {
        this.announce(this.t(ok ? 'copied' : 'copyFailed'));
        if (ok) emit(this, EVENTS.COPY, { text });
      });
    } else if (key === 'Escape') {
      if (!this.selected.size) return;
      handled();
      this.clearSelection();
      this.focusCell(r, c, false);
    } else if (key === '/' && this.feature('search')) {
      handled();
      this.openSearch();
    } else if (key === '?') {
      handled();
      this.togglePanel('help');
    }
  }

  openSearch() {
    if (!this.searchOpen) {
      /** @type {VtBase} */ (this).searchOpen = true;
      this.render();
    }
    /** @type {import('../../core/ui.js').SearchBar | null} */ (this.searchBar)?.focus();
  }

  /**
   * Drag handle that resizes a column; double-click fits it to its content.
   *
   * @param {Column} column
   * @returns {HTMLElement}
   */
  resizer(column) {
    const handle = h('span', {
      class: 'tb-resizer',
      attrs: { 'aria-hidden': 'true', title: this.t('tableResize') },
    });
    handle.addEventListener('click', (event) => event.stopPropagation());
    handle.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      this.autoFit(column.key);
    });
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const th = /** @type {HTMLElement} */ (handle.parentElement);
      const start = event.clientX;
      const width = th.getBoundingClientRect().width;
      const rtl = getComputedStyle(this).direction === 'rtl';
      this.resizing = true;
      handle.setPointerCapture?.(event.pointerId);
      handle.classList.add('active');
      const move = (/** @type {PointerEvent} */ e) =>
        this.setWidth(column.key, width + (rtl ? start - e.clientX : e.clientX - start), false);
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        handle.classList.remove('active');
        this.setWidth(column.key, this.widths.get(column.key) ?? width);
        // The click that ends a drag must not sort.
        setTimeout(() => (this.resizing = false), 0);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
    return handle;
  }

  /**
   * Drag and drop of headers to reorder columns.
   *
   * @param {HTMLElement} th
   * @param {string} key
   */
  makeDraggable(th, key) {
    th.addEventListener('dragstart', (event) => {
      if (this.resizing) {
        event.preventDefault();
        return;
      }
      this.dragKey = key;
      event.dataTransfer?.setData('text/plain', key);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      th.classList.add('dragging');
    });
    th.addEventListener('dragend', () => {
      this.dragKey = null;
      th.classList.remove('dragging');
      for (const el of this.root.querySelectorAll('.drop-before, .drop-after'))
        el.classList.remove('drop-before', 'drop-after');
    });
    th.addEventListener('dragover', (event) => {
      if (!this.dragKey || this.dragKey === key) return;
      event.preventDefault();
      const rect = th.getBoundingClientRect();
      const after = event.clientX > rect.left + rect.width / 2;
      th.classList.toggle('drop-after', after);
      th.classList.toggle('drop-before', !after);
    });
    th.addEventListener('dragleave', () => th.classList.remove('drop-before', 'drop-after'));
    th.addEventListener('drop', (event) => {
      event.preventDefault();
      const from = this.dragKey;
      if (!from || from === key) return;
      const after = th.classList.contains('drop-after');
      const keys = this.allColumns()
        .map((c) => c.key)
        .filter((k) => k !== from);
      keys.splice(keys.indexOf(key) + (after ? 1 : 0), 0, from);
      this.order = keys;
      this.dragKey = null;
      this.columnsChanged();
      this.focusHeader(from);
    });
  }
}

/**
 * Height of an item when virtual scrolling: rows are fixed, details measured.
 *
 * @param {Item} item
 * @param {number} rowHeight
 * @param {Map<number, number>} measured
 * @returns {number}
 */
function itemHeight(item, rowHeight, measured) {
  return item.kind === 'detail' ? (measured.get(item.index) ?? 160) : rowHeight;
}

/**
 * Whether a key names an identifier (`id`, `user_id`, `orderId`): shown and summed
 * as a plain number, without digit grouping.
 *
 * @param {string} key
 * @returns {boolean}
 */
function isIdentifier(key) {
  return /^id$|[_-]id$|[a-z]Id$/i.test(key) && !/[a-z]id$/.test(key.slice(-3));
}

/**
 * @param {number} width
 * @returns {number}
 */
function clampWidth(width) {
  return Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width)));
}

/**
 * Keeps http(s) links only.
 *
 * @param {string} value
 * @returns {string | null}
 */
function safeUrl(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
