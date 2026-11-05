// @ts-check
/**
 * Data model of <vt-table>: input normalization, column inference, typed sorting,
 * filters, grouping, aggregates and export. Pure functions, no DOM.
 *
 * @module components/table/model
 */
import { parseCsv, toCsv } from '../csv/parser.js';

/** Column types. */
export const TYPES = /** @type {const} */ (['text', 'number', 'date', 'boolean', 'url']);
/** Aggregates a column footer can show. */
export const AGGREGATES = /** @type {const} */ (['none', 'count', 'sum', 'avg', 'min', 'max']);
/** Maximum number of columns kept. */
export const MAX_COLUMNS = 500;
/** Maximum number of rows kept. */
export const MAX_ROWS = 200_000;

/** @typedef {typeof TYPES[number]} ColumnType */
/** @typedef {typeof AGGREGATES[number]} Aggregate */
/** @typedef {Record<string, unknown>} Row */

/**
 * @typedef {object} ColumnDef
 * @property {string} key - Property of the row objects.
 * @property {string} [label] - Header text (default: the key).
 * @property {ColumnType} [type] - Value type (default: inferred).
 * @property {number} [width] - Width in pixels.
 * @property {"start"|"center"|"end"} [align]
 * @property {boolean} [hidden]
 * @property {boolean} [sortable] - Default `true`.
 * @property {boolean} [filterable] - Default `true`.
 * @property {boolean} [editable] - Default `false`.
 * @property {boolean} [resizable] - Default `true`.
 * @property {Aggregate} [aggregate] - Footer aggregate.
 * @property {(value: unknown, row: Row) => string} [format] - Display text.
 * @property {(value: unknown, row: Row) => Node | string} [render] - Custom cell content.
 * @property {string} [display] - How cells look: `text`, `number`, `badge`, `status`, `tags`, `progress`,
 *   `rating`, `link`, `email`, `image`, `avatar`, `code`, `date`, `relative`, `currency`, `percent`,
 *   `bytes`, `color`, `json` or `boolean` (default: from the type).
 * @property {Record<string, string>} [colors] - Badge, status and tag colors by value (`red`, `green`…).
 * @property {boolean} [autoColors] - Values missing from `colors` still get a color.
 * @property {Record<string, string>} [labels] - Badge text by value (e.g. `{ "1": "Open" }`).
 * @property {number} [maxLength] - Characters shown before "See all" (default 140 for text; 0: never cut).
 * @property {number} [lines] - Lines shown before "See all" when the cell wraps.
 * @property {number} [maxItems] - Tags shown before "+N" (default 3).
 * @property {boolean} [wrap] - Text of this column wraps.
 * @property {number} [max] - Maximum of `progress` (100) and `rating` (5).
 * @property {[number, number]} [thresholds] - `progress` ratios where red turns orange, then green.
 * @property {string} [tone] - Fixed `progress` color.
 * @property {string} [currency] - ISO code of `currency` (default `EUR`).
 * @property {boolean} [ratio] - `percent` values are ratios (0.42 → 42 %).
 * @property {number} [decimals] - Fraction digits of numbers.
 * @property {boolean} [grouping] - `false`: no digit grouping (1234 instead of 1,234).
 * @property {string} [prefix] - Text before numbers and text.
 * @property {string} [suffix] - Text after numbers and text.
 * @property {string} [dateStyle] - `short`, `medium`, `long`, `full`, `datetime` or `time`.
 * @property {string} [href] - Link template, e.g. `/users/{id}`.
 * @property {string} [linkText] - Link text template.
 * @property {string} [src] - Image template for `image` and `avatar`, e.g. `/avatars/{id}.png`.
 * @property {string} [alt] - Image text template.
 * @property {string} [subtitle] - Second line of `avatar`, e.g. `{email}`.
 * @property {number} [size] - Image size in pixels.
 * @property {string} [trueLabel] - Text of true booleans (shown as a badge).
 * @property {string} [falseLabel] - Text of false booleans.
 * @property {string} [emptyText] - Text of empty cells.
 */

/**
 * @typedef {Required<Pick<ColumnDef, 'key' | 'label' | 'type' | 'hidden' | 'sortable' | 'filterable' | 'editable' | 'resizable'>> &
 *   Omit<ColumnDef, 'key' | 'label' | 'type' | 'hidden' | 'sortable' | 'filterable' | 'editable' | 'resizable'> & { aggregate: Aggregate }} Column
 */

/** @typedef {{ key: string, direction: "ascending" | "descending" }} SortSpec */

/**
 * @typedef {object} Dataset
 * @property {Column[]} columns
 * @property {Row[]} rows
 * @property {string} [error]
 * @property {boolean} [truncated]
 */

const NUMBER = /^[-+]?(?:\d{1,3}(?:[ ,]\d{3})+|\d+)?(?:\.\d+)?(?:e[-+]?\d+)?%?$/i;
const DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const BOOLEAN = /^(?:true|false|yes|no)$/i;
const URL_LIKE = /^https?:\/\/[^\s]+$/i;

/**
 * Reads the table from text: JSON (array of objects, array of arrays, or
 * `{ columns, rows }`), or CSV / TSV.
 *
 * @param {string} text
 * @param {"auto"|"json"|"csv"} [format]
 * @returns {Dataset}
 */
export function parseTable(text, format = 'auto') {
  const trimmed = text.trim();
  if (!trimmed) return { columns: [], rows: [] };
  const json = format === 'json' || (format === 'auto' && /^[[{]/.test(trimmed));
  if (json) {
    /** @type {unknown} */
    let value;
    try {
      value = JSON.parse(trimmed);
    } catch (error) {
      return {
        columns: [],
        rows: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
    return fromValue(value);
  }
  const csv = parseCsv(text);
  const [header = [], ...body] = csv.rows;
  const keys = uniqueKeys(header.map((name, i) => name.trim() || `column${i + 1}`));
  const rows = body.map((cells) => Object.fromEntries(keys.map((key, i) => [key, cells[i] ?? ''])));
  const result = normalize(
    keys.map((key) => ({ key })),
    rows,
  );
  if (csv.error) result.error = `Unclosed quote from line ${csv.error.line}.`;
  return result;
}

/**
 * Normalizes a JavaScript value into a dataset.
 *
 * @param {unknown} value
 * @param {ColumnDef[] | null} [columns]
 * @returns {Dataset}
 */
export function fromValue(value, columns = null) {
  /** @type {unknown[]} */
  let list = [];
  /** @type {ColumnDef[] | null} */
  let defs = columns;
  if (Array.isArray(value)) list = value;
  else if (value && typeof value === 'object') {
    const object = /** @type {Record<string, unknown>} */ (value);
    if (Array.isArray(object.rows)) list = object.rows;
    else if (Array.isArray(object.data)) list = object.data;
    if (!defs && Array.isArray(object.columns))
      defs = object.columns.map((c) => (typeof c === 'string' ? { key: c } : c));
  }
  if (list.length && Array.isArray(list[0])) {
    // Array of arrays: the first row is the header unless columns are given.
    const arrays = /** @type {unknown[][]} */ (list.filter(Array.isArray));
    const header = defs
      ? defs.map((d) => d.key)
      : uniqueKeys(arrays[0].map((v, i) => toText(v) || `column${i + 1}`));
    const body = defs ? arrays : arrays.slice(1);
    list = body.map((cells) => Object.fromEntries(header.map((key, i) => [key, cells[i]])));
    if (!defs) defs = header.map((key) => ({ key }));
  }
  const rows = /** @type {Row[]} */ (
    list.filter((row) => row !== null && typeof row === 'object' && !Array.isArray(row))
  );
  return normalize(defs, rows);
}

/**
 * Fills missing column settings and infers types.
 *
 * @param {ColumnDef[] | null} defs
 * @param {Row[]} rows
 * @returns {Dataset}
 */
export function normalize(defs, rows) {
  const truncated = rows.length > MAX_ROWS;
  const kept = truncated ? rows.slice(0, MAX_ROWS) : rows;
  /** @type {ColumnDef[]} */
  let list = defs ? defs.filter((d) => d && typeof d.key === 'string' && d.key) : [];
  if (!list.length) {
    /** @type {Set<string>} */
    const keys = new Set();
    for (let i = 0; i < kept.length && i < 1000; i += 1)
      for (const key of Object.keys(kept[i])) keys.add(key);
    list = [...keys].map((key) => ({ key }));
  }
  const columns = list.slice(0, MAX_COLUMNS).map((def) => {
    const type = TYPES.includes(/** @type {ColumnType} */ (def.type))
      ? /** @type {ColumnType} */ (def.type)
      : inferType(kept, def.key);
    return /** @type {Column} */ ({
      ...def,
      label: def.label ?? humanize(def.key),
      type,
      hidden: Boolean(def.hidden),
      sortable: def.sortable !== false,
      filterable: def.filterable !== false,
      editable: Boolean(def.editable),
      resizable: def.resizable !== false,
      aggregate: AGGREGATES.includes(/** @type {Aggregate} */ (def.aggregate))
        ? def.aggregate
        : 'none',
    });
  });
  return { columns, rows: kept, truncated: truncated || list.length > MAX_COLUMNS };
}

/**
 * @param {string[]} names
 * @returns {string[]}
 */
function uniqueKeys(names) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count ? `${name}_${count + 1}` : name;
  });
}

/**
 * `first_name` / `firstName` → `First name`.
 *
 * @param {string} key
 * @returns {string}
 */
export function humanize(key) {
  const words = key
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

/**
 * Infers the type of a column from a sample of its values.
 *
 * @param {Row[]} rows
 * @param {string} key
 * @returns {ColumnType}
 */
export function inferType(rows, key) {
  let seen = 0;
  const counts = { number: 0, date: 0, boolean: 0, url: 0 };
  for (let i = 0; i < rows.length && seen < 500; i += 1) {
    const value = rows[i][key];
    if (value === null || value === undefined || value === '') continue;
    seen += 1;
    if (typeof value === 'number') counts.number += 1;
    else if (typeof value === 'boolean') counts.boolean += 1;
    else if (value instanceof Date) counts.date += 1;
    else if (typeof value === 'string') {
      const v = value.trim();
      if (NUMBER.test(v) && /\d/.test(v)) counts.number += 1;
      else if (DATE.test(v)) counts.date += 1;
      else if (BOOLEAN.test(v)) counts.boolean += 1;
      else if (URL_LIKE.test(v)) counts.url += 1;
    }
  }
  if (!seen) return 'text';
  for (const type of /** @type {const} */ (['number', 'date', 'boolean', 'url']))
    if (counts[type] === seen) return type;
  return 'text';
}

/**
 * Whether a value counts as empty (sorted last, skipped by aggregates).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isEmpty(value) {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (typeof value === 'number' && Number.isNaN(value))
  );
}

/**
 * Numeric value of a cell, or `NaN`.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string') return Number.NaN;
  const v = value.trim();
  if (!v) return Number.NaN;
  const n = Number(v.replace(/[ ,%]/g, ''));
  return n;
}

/**
 * Timestamp of a date cell, or `NaN`.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function toTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return typeof value === 'string' && value.trim() ? Date.parse(value.trim()) : Number.NaN;
}

/**
 * Boolean value of a cell, or `null`.
 *
 * @param {unknown} value
 * @returns {boolean | null}
 */
export function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === 'yes' || v === '1') return true;
  if (v === 'false' || v === 'no' || v === '0') return false;
  return null;
}

/**
 * Plain text of a value (for search, copy and export).
 *
 * @param {unknown} value
 * @returns {string}
 */
export function toText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      // Too deep, or a cycle: String() would overflow the stack too.
      return '';
    }
  }
  return String(value);
}

/**
 * Sort keys of a column (one per row): numbers, or strings compared with a collator.
 *
 * @param {Row[]} rows
 * @param {Column} column
 * @returns {(number | string | null)[]}
 */
export function sortKeys(rows, column) {
  const { key, type } = column;
  return rows.map((row) => {
    const value = row[key];
    if (isEmpty(value)) return null;
    if (type === 'number') {
      const n = toNumber(value);
      return Number.isNaN(n) ? null : n;
    }
    if (type === 'date') {
      const n = toTime(value);
      return Number.isNaN(n) ? null : n;
    }
    if (type === 'boolean') {
      const b = toBoolean(value);
      return b === null ? null : Number(b);
    }
    return toText(value);
  });
}

/**
 * Orders row indexes by several sort keys. Empty values always go last; equal rows
 * keep their original order.
 *
 * @param {number[]} indexes
 * @param {{ keys: (number | string | null)[], direction: "ascending" | "descending" }[]} specs
 * @param {Intl.Collator} collator
 * @returns {number[]}
 */
export function sortIndexes(indexes, specs, collator) {
  if (!specs.length) return indexes;
  return [...indexes].sort((a, b) => {
    for (const { keys, direction } of specs) {
      const ka = keys[a];
      const kb = keys[b];
      if (ka === kb) continue;
      if (ka === null) return 1;
      if (kb === null) return -1;
      const result =
        typeof ka === 'number' && typeof kb === 'number'
          ? ka - kb
          : collator.compare(String(ka), String(kb));
      if (result) return direction === 'ascending' ? result : -result;
    }
    return a - b;
  });
}

/**
 * @typedef {(value: unknown) => boolean} Predicate
 */

/**
 * Compiles a column filter. Text columns: words contained (`=x` exact, `!x` not
 * containing). Number and date columns also take `>`, `>=`, `<`, `<=`, `=`, `!=` and
 * ranges `a..b`. Boolean columns: `true` / `false`. `empty` / `!empty` match blanks.
 *
 * @param {string} query
 * @param {ColumnType} type
 * @returns {Predicate | null} `null` when the filter is empty.
 */
export function compileFilter(query, type) {
  const q = query.trim();
  if (!q) return null;
  const lower = q.toLowerCase();
  if (lower === 'empty') return (v) => isEmpty(v);
  if (lower === '!empty') return (v) => !isEmpty(v);
  if (type === 'boolean') {
    const wanted = toBoolean(q);
    if (wanted !== null) return (v) => toBoolean(v) === wanted;
  }
  if (type === 'number' || type === 'date') {
    const read = type === 'number' ? toNumber : toTime;
    const range = /^(.+?)\s*\.\.\s*(.+)$/.exec(q);
    if (range) {
      const lo = read(range[1]);
      const hi = read(range[2]);
      if (!Number.isNaN(lo) && !Number.isNaN(hi))
        return (v) => {
          const n = read(v);
          return n >= Math.min(lo, hi) && n <= Math.max(lo, hi);
        };
    }
    const op = /^(>=|<=|!=|>|<|=)\s*(.+)$/.exec(q);
    if (op) {
      const target = read(op[2]);
      if (!Number.isNaN(target)) {
        const compare = {
          '>': (/** @type {number} */ n) => n > target,
          '>=': (/** @type {number} */ n) => n >= target,
          '<': (/** @type {number} */ n) => n < target,
          '<=': (/** @type {number} */ n) => n <= target,
          '=': (/** @type {number} */ n) => n === target,
          '!=': (/** @type {number} */ n) => n !== target,
        }[/** @type {">"|">="|"<"|"<="|"="|"!="} */ (op[1])];
        return (v) => {
          const n = read(v);
          return !Number.isNaN(n) && compare(n);
        };
      }
    }
  }
  if (q.startsWith('=')) {
    const exact = lower.slice(1);
    return (v) => toText(v).toLowerCase() === exact;
  }
  if (q.startsWith('!') && q.length > 1) {
    const not = lower.slice(1);
    return (v) => !toText(v).toLowerCase().includes(not);
  }
  const words = lower.split(/\s+/);
  return (v) => {
    const text = toText(v).toLowerCase();
    return words.every((word) => text.includes(word));
  };
}

/**
 * Computes a footer aggregate.
 *
 * @param {Row[]} rows
 * @param {number[]} indexes
 * @param {Column} column
 * @param {Aggregate} aggregate
 * @returns {number | null}
 */
export function aggregate(rows, indexes, column, aggregate) {
  if (aggregate === 'none') return null;
  if (aggregate === 'count') {
    let count = 0;
    for (const i of indexes) if (!isEmpty(rows[i][column.key])) count += 1;
    return count;
  }
  const read = column.type === 'date' ? toTime : toNumber;
  let sum = 0;
  let count = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const i of indexes) {
    const n = read(rows[i][column.key]);
    if (Number.isNaN(n)) continue;
    sum += n;
    count += 1;
    if (n < min) min = n;
    if (n > max) max = n;
  }
  if (!count) return null;
  if (aggregate === 'sum') return sum;
  if (aggregate === 'avg') return sum / count;
  if (aggregate === 'min') return min;
  return max;
}

/**
 * Groups row indexes by the text of a column, keeping the current order.
 *
 * @param {Row[]} rows
 * @param {number[]} indexes
 * @param {string} key
 * @returns {{ value: string, indexes: number[] }[]}
 */
export function groupIndexes(rows, indexes, key) {
  /** @type {Map<string, number[]>} */
  const groups = new Map();
  for (const i of indexes) {
    const value = toText(rows[i][key]);
    const list = groups.get(value);
    if (list) list.push(i);
    else groups.set(value, [i]);
  }
  return [...groups].map(([value, list]) => ({ value, indexes: list }));
}

/**
 * Serializes rows for export or copy.
 *
 * @param {Row[]} rows
 * @param {Column[]} columns
 * @param {"csv"|"tsv"|"json"} format
 * @returns {string}
 */
export function serialize(rows, columns, format) {
  if (format === 'json') {
    const list = rows.map((row) =>
      Object.fromEntries(columns.map((c) => [c.key, row[c.key] ?? null])),
    );
    return JSON.stringify(list, null, 2);
  }
  // Cells starting with = + - @ are prefixed so spreadsheets do not run them as formulas.
  const safe = [
    columns.map((c) => c.label),
    ...rows.map((row) => columns.map((c) => toText(row[c.key]))),
  ].map((cells) => cells.map((c) => (/^[=+\-@\t\r]/.test(c) && !NUMBER.test(c) ? `'${c}` : c)));
  if (format === 'tsv')
    return safe
      .map((cells) => cells.map((c) => c.replace(/[\t\r\n]+/g, ' ')).join('\t'))
      .join('\n');
  return toCsv(safe, ',');
}

/**
 * Converts edited text back to the column type, keeping the original value type.
 *
 * @param {string} text
 * @param {Column} column
 * @param {unknown} previous
 * @returns {unknown}
 */
export function coerce(text, column, previous) {
  if (typeof previous === 'string' || previous === undefined || previous === null) {
    if (column.type === 'number' && typeof previous !== 'string' && text.trim() !== '') {
      const n = toNumber(text);
      return Number.isNaN(n) ? text : n;
    }
    return text;
  }
  if (typeof previous === 'number') {
    if (!text.trim()) return null;
    const n = toNumber(text);
    return Number.isNaN(n) ? text : n;
  }
  if (typeof previous === 'boolean') return toBoolean(text) ?? text;
  return text;
}
