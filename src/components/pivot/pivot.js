// @ts-check
/**
 * Pivot tables for <vt-pivot>: records read from CSV or JSON, grouped by the values of some
 * fields in rows and others in columns, with a value aggregated in each cell and totals.
 *
 * @module components/pivot/pivot
 */
import { parseCsv } from '../csv/parser.js';

/** Records read. */
export const MAX_RECORDS = 200_000;
/** Distinct keys kept per axis. */
export const MAX_KEYS = 2000;

export const AGGREGATES = /** @type {const} */ (['sum', 'count', 'avg', 'min', 'max', 'distinct']); // prettier-ignore

/** @typedef {(typeof AGGREGATES)[number]} Aggregate */
/** @typedef {string | number | boolean | null} Value */
/** @typedef {Record<string, Value>} PivotRecord */

/**
 * @typedef {object} Dataset
 * @property {string[]} fields - In order of appearance.
 * @property {PivotRecord[]} records
 * @property {Set<string>} numeric - Fields whose every non-empty value is a number.
 */

/**
 * @typedef {object} PivotOptions
 * @property {string[]} rows
 * @property {string[]} columns
 * @property {string} value - Field aggregated; `""` for `count`.
 * @property {Aggregate} aggregate
 */

/**
 * @typedef {object} PivotResult
 * @property {string[][]} rowKeys - The values of the row fields, for each row.
 * @property {string[][]} colKeys
 * @property {(row: number, col: number) => number | null} cell
 * @property {(row: number) => number | null} rowTotal
 * @property {(col: number) => number | null} colTotal
 * @property {number | null} total
 * @property {(row: number | null, col: number | null) => PivotRecord[]} records - Records of a cell, a row, a column or all (`null`).
 * @property {number} min - Smallest cell value.
 * @property {number} max - Largest cell value.
 * @property {boolean} truncated - More distinct keys than {@link MAX_KEYS} on an axis.
 */

export class PivotError extends Error {}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A number read from a value: numbers, and text such as `1234.5`, `-3`, `1,234,567`, `12%`.
 *
 * @param {Value | undefined} value
 * @returns {number | null}
 */
export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value !== 'string') return null;
  let text = value.trim().replace(/[\s_\u00a0\u202f]/g, '');
  if (!text) return null;
  const percent = text.endsWith('%');
  if (percent) text = text.slice(0, -1);
  if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)) text = text.replace(/,/g, '');
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? (percent ? n / 100 : n) : null;
}

/**
 * Reads records from CSV (with a header row) or JSON (a list of objects, or an object
 * holding one under `rows`, `data`, `records` or `items`).
 *
 * @param {string} text
 * @returns {Dataset}
 */
export function readDataset(text) {
  const source = text.trim();
  if (!source) throw new PivotError('empty');
  /** @type {PivotRecord[]} */
  let records;
  if (/^[[{]/.test(source)) {
    /** @type {unknown} */
    let value;
    try {
      value = JSON.parse(source);
    } catch (error) {
      throw new PivotError(`json:${error instanceof Error ? error.message : ''}`);
    }
    /** @type {unknown[] | undefined} */
    const list = Array.isArray(value)
      ? value
      : isObject(value)
        ? // `rows` may also be the setting (a list of field names): the records hold objects.
          /** @type {unknown[] | undefined} */ (
            [value.data, value.records, value.items, value.rows].find(
              (candidate) =>
                Array.isArray(candidate) && (!candidate.length || isObject(candidate[0])),
            )
          )
        : undefined;
    if (!list) throw new PivotError('format');
    records = list
      .slice(0, MAX_RECORDS)
      .filter(isObject)
      .map((/** @type {Record<string, unknown>} */ item) => {
        /** @type {PivotRecord} */
        const record = {};
        for (const [key, v] of Object.entries(item).slice(0, 500))
        record[key.slice(0, 200)] = v === null || ['string', 'number', 'boolean'].includes(typeof v) ? /** @type {Value} */ (v) : JSON.stringify(v); // prettier-ignore
        return record;
      });
  } else {
    const { rows } = parseCsv(source);
    const [header, ...body] = rows;
    if (!header?.length) throw new PivotError('format');
    const names = header.map((name, i) => name.trim() || `${i + 1}`);
    records = body
      .filter((row) => row.some((cell) => cell.trim()))
      .slice(0, MAX_RECORDS)
      .map((row) => Object.fromEntries(names.map((name, i) => [name, row[i] ?? ''])));
  }
  /** @type {string[]} */
  const fields = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const record of records.slice(0, 1000))
    for (const key of Object.keys(record))
      if (!seen.has(key)) {
        seen.add(key);
        fields.push(key);
      }
  /** @type {Set<string>} */
  const numeric = new Set();
  for (const field of fields) {
    let count = 0;
    let ok = true;
    for (const record of records.slice(0, 2000)) {
      const v = record[field];
      if (v === null || v === undefined || v === '') continue;
      count += 1;
      if (toNumber(v) === null) {
        ok = false;
        break;
      }
    }
    if (ok && count) numeric.add(field);
  }
  return { fields, records, numeric };
}

/**
 * Text of a key value: empty values become `""`.
 *
 * @param {Value | undefined} value
 * @returns {string}
 */
function keyText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, 200);
}

/**
 * @typedef {{ count: number, n: number, sum: number, min: number, max: number, distinct: Set<string> | null }} Acc
 */

/** @returns {Acc} */
const acc = (/** @type {boolean} */ distinct) => ({ count: 0, n: 0, sum: 0, min: Infinity, max: -Infinity, distinct: distinct ? new Set() : null }); // prettier-ignore

/**
 * @param {Acc} a
 * @param {Value | undefined} value
 */
function add(a, value) {
  a.count += 1;
  if (a.distinct) {
    const text = keyText(value);
    if (text && a.distinct.size < 100_000) a.distinct.add(text);
  }
  const n = toNumber(value ?? null);
  if (n === null) return;
  a.n += 1;
  a.sum += n;
  if (n < a.min) a.min = n;
  if (n > a.max) a.max = n;
}

/**
 * @param {Acc | undefined} a
 * @param {Aggregate} aggregate
 * @returns {number | null}
 */
function finish(a, aggregate) {
  if (!a || !a.count) return null;
  switch (aggregate) {
    case 'count':
      return a.count;
    case 'distinct':
      return a.distinct?.size ?? 0;
    case 'sum':
      return a.n ? a.sum : null;
    case 'avg':
      return a.n ? a.sum / a.n : null;
    case 'min':
      return a.n ? a.min : null;
    case 'max':
      return a.n ? a.max : null;
  }
  return null;
}

/**
 * Natural order of keys: numbers by value, text by the locale, empty last.
 *
 * @param {string} locale
 */
function compareKeys(locale) {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  return (/** @type {string[]} */ a, /** @type {string[]} */ b) => {
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === b[i]) continue;
      if (!a[i]) return 1;
      if (!b[i]) return -1;
      return collator.compare(a[i], b[i]);
    }
    return 0;
  };
}

/**
 * Builds a pivot table.
 *
 * @param {PivotRecord[]} records
 * @param {PivotOptions} options
 * @param {string} [locale]
 * @returns {PivotResult}
 */
export function pivot(records, options, locale = 'en') {
  const { rows, columns, aggregate } = options;
  const value = aggregate === 'count' ? '' : options.value;
  const distinct = aggregate === 'distinct';
  /** @type {Map<string, string[]>} */
  const rowIndex = new Map();
  /** @type {Map<string, string[]>} */
  const colIndex = new Map();
  /** @type {Map<string, Acc>} */
  const cells = new Map();
  /** @type {Map<string, Acc>} */
  const rowAcc = new Map();
  /** @type {Map<string, Acc>} */
  const colAcc = new Map();
  const all = acc(distinct);
  /** @type {Map<string, number[]>} Record indexes by cell, for drilling down. */
  const members = new Map();
  let truncated = false;
  const keyOf = (/** @type {string[]} */ parts) => JSON.stringify(parts);

  records.forEach((record, index) => {
    const r = rows.map((field) => keyText(record[field]));
    const c = columns.map((field) => keyText(record[field]));
    const rk = keyOf(r);
    const ck = keyOf(c);
    if (!rowIndex.has(rk)) {
      if (rowIndex.size >= MAX_KEYS) {
        truncated = true;
        return;
      }
      rowIndex.set(rk, r);
    }
    if (!colIndex.has(ck)) {
      if (colIndex.size >= MAX_KEYS) {
        truncated = true;
        return;
      }
      colIndex.set(ck, c);
    }
    const v = value ? record[value] : 1;
    const key = `${rk}\u0000${ck}`;
    for (const [map, k] of /** @type {[Map<string, Acc>, string][]} */ ([[cells, key], [rowAcc, rk], [colAcc, ck]])) {
      let a = map.get(k);
      if (!a) map.set(k, (a = acc(distinct)));
      add(a, v);
    } // prettier-ignore
    add(all, v);
    const list = members.get(key);
    if (list) list.push(index);
    else members.set(key, [index]);
  });

  const order = compareKeys(locale);
  const rowKeys = [...rowIndex.values()].sort(order);
  const colKeys = [...colIndex.values()].sort(order);
  const rk = rowKeys.map(keyOf);
  const ck = colKeys.map(keyOf);
  let min = Infinity;
  let max = -Infinity;
  for (const r of rk)
    for (const c of ck) {
      const v = finish(cells.get(`${r}\u0000${c}`), aggregate);
      if (v === null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  return {
    rowKeys,
    colKeys,
    cell: (r, c) => finish(cells.get(`${rk[r]}\u0000${ck[c]}`), aggregate),
    rowTotal: (r) => finish(rowAcc.get(rk[r]), aggregate),
    colTotal: (c) => finish(colAcc.get(ck[c]), aggregate),
    total: finish(all, aggregate),
    records: (r, c) => {
      /** @type {number[]} */
      const indexes = [];
      for (const [key, list] of members) {
        const [kr, kc] = key.split('\u0000');
        if ((r === null || kr === rk[r]) && (c === null || kc === ck[c])) indexes.push(...list);
      }
      return indexes.sort((a, b) => a - b).map((i) => records[i]);
    },
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0,
    truncated,
  };
}

/**
 * The table as CSV: row headers, column headers, cells and totals.
 *
 * @param {PivotResult} result
 * @param {PivotOptions} options
 * @param {{ totals: boolean, total: string }} labels
 * @returns {string}
 */
export function pivotToCsv(result, options, labels) {
  const field = (/** @type {string | number | null} */ v) => {
    const text = v === null ? '' : String(v);
    // Formulas are neutralized for spreadsheets.
    const safe = /^[=+\-@\t\r]/.test(text) && typeof v !== 'number' ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = [
    ...options.rows,
    ...result.colKeys.map((k) => k.join(' · ') || '—'),
    ...(labels.totals ? [labels.total] : []),
  ];
  const lines = [head.map(field).join(',')];
  result.rowKeys.forEach((key, r) => {
    const cells = result.colKeys.map((_, c) => result.cell(r, c));
    lines.push([...key, ...cells, ...(labels.totals ? [result.rowTotal(r)] : [])].map(field).join(',')); // prettier-ignore
  });
  if (labels.totals) {
    const pad = options.rows.map((_, i) => (i === 0 ? labels.total : ''));
    lines.push([...pad, ...result.colKeys.map((_, c) => result.colTotal(c)), result.total].map(field).join(',')); // prettier-ignore
  }
  return lines.join('\n');
}
