// @ts-check
/**
 * Profiles of datasets for <vt-describe>: for each column, its type, its missing and
 * distinct values, statistics of numbers and dates, a histogram and the most frequent values.
 *
 * @module components/describe/describe
 */
import { toDay } from '../heatmap/heatmap.js';
import { toNumber } from '../pivot/pivot.js';

/** Distinct values counted per column; beyond, the count is a lower bound. */
export const MAX_DISTINCT = 50_000;

/** Values read as missing. */
const MISSING = new Set(['', 'na', 'n/a', 'nan', 'null', 'none', 'nil', '-', '—', '?']);
const TRUE = new Set(['true', 'yes', 'y', 'oui', 'vrai']);
const FALSE = new Set(['false', 'no', 'n', 'non', 'faux']);

/** @typedef {import('../pivot/pivot.js').Dataset} Dataset */
/** @typedef {import('../pivot/pivot.js').Value} Value */
/** @typedef {"number" | "date" | "boolean" | "text"} ColumnType */

/**
 * @typedef {object} Histogram
 * @property {number} from - Lower bound of the first bin.
 * @property {number} to - Upper bound of the last bin.
 * @property {number[]} counts
 */

/**
 * @typedef {object} ColumnStats
 * @property {string} name
 * @property {ColumnType} type
 * @property {number} count - Values present.
 * @property {number} missing
 * @property {number} distinct
 * @property {boolean} capped - More distinct values than {@link MAX_DISTINCT}.
 * @property {{ min: number, max: number, mean: number, median: number, std: number, q1: number, q3: number, sum: number } | null} numbers - Numbers, and dates as day numbers.
 * @property {Histogram | null} histogram
 * @property {{ min: number, max: number } | null} length - Lengths of texts.
 * @property {{ value: string, count: number }[]} top - Most frequent values, most frequent first.
 */

/**
 * @typedef {object} Profile
 * @property {number} rows
 * @property {ColumnStats[]} columns
 */

/**
 * @param {Value | undefined} value
 * @returns {boolean}
 */
export function isMissing(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return Number.isNaN(value);
  if (typeof value === 'boolean') return false;
  return MISSING.has(value.trim().toLowerCase());
}

/**
 * @param {Value} value
 * @returns {boolean | null}
 */
function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  return TRUE.has(text) ? true : FALSE.has(text) ? false : null;
}

/**
 * The type of a column: every value present is a number, a date, a boolean, or it is text.
 *
 * @param {Value[]} values - Values present.
 * @returns {ColumnType}
 */
export function typeOf(values) {
  if (!values.length) return 'text';
  if (values.every((v) => typeof v !== 'boolean' && toNumber(v) !== null)) return 'number';
  if (values.every((v) => typeof v === 'string' && toDay(v) !== null)) return 'date';
  if (values.every((v) => toBoolean(v) !== null)) return 'boolean';
  return 'text';
}

/**
 * A quantile of sorted numbers, interpolated between the nearest two.
 *
 * @param {number[]} sorted
 * @param {number} q - From 0 to 1.
 */
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

/**
 * Equal-width bins between the smallest and the largest value. Integers spanning fewer
 * values than bins get one bin per value.
 *
 * @param {number[]} sorted
 * @param {number} bins
 * @returns {Histogram}
 */
export function histogram(sorted, bins) {
  const from = sorted[0];
  const last = sorted[sorted.length - 1];
  if (from === last) return { from, to: last, counts: [sorted.length] };
  const integers = sorted.every(Number.isInteger);
  const count = integers && last - from + 1 <= bins ? last - from + 1 : bins;
  const to = integers && count === last - from + 1 ? last + 1 : last;
  const width = (to - from) / count;
  const counts = new Array(count).fill(0);
  for (const v of sorted) counts[Math.min(count - 1, Math.floor((v - from) / width))] += 1;
  return { from, to, counts };
}

/**
 * The profile of a dataset.
 *
 * @param {Dataset} dataset
 * @param {{ bins?: number, top?: number, fields?: string[] }} [options]
 * @returns {Profile}
 */
export function describe(dataset, { bins = 12, top = 5, fields } = {}) {
  const names = fields?.length ? fields.filter((f) => dataset.fields.includes(f)) : dataset.fields;
  const columns = names.map((name) => {
    /** @type {Value[]} */
    const present = [];
    let missing = 0;
    for (const record of dataset.records) {
      const v = record[name];
      if (isMissing(v)) missing += 1;
      else present.push(/** @type {Value} */ (v));
    }
    const type = typeOf(present);
    /** @type {Map<string, number>} */
    const counts = new Map();
    let capped = false;
    for (const v of present) {
      const key = type === 'boolean' ? String(toBoolean(v)) : String(v).trim();
      const seen = counts.get(key);
      if (seen !== undefined) counts.set(key, seen + 1);
      else if (counts.size < MAX_DISTINCT) counts.set(key, 1);
      else capped = true;
    }
    /** @type {ColumnStats["numbers"]} */
    let numbers = null;
    /** @type {Histogram | null} */
    let hist = null;
    if (type === 'number' || type === 'date') {
      const sorted = present
        .map((v) =>
          type === 'number'
            ? /** @type {number} */ (toNumber(v))
            : /** @type {number} */ (toDay(v)),
        ) // prettier-ignore
        .sort((a, b) => a - b);
      const sum = sorted.reduce((s, v) => s + v, 0);
      const mean = sum / sorted.length;
      const variance = sorted.length > 1 ? sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (sorted.length - 1) : 0; // prettier-ignore
      numbers = {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean,
        median: quantile(sorted, 0.5),
        std: Math.sqrt(variance),
        q1: quantile(sorted, 0.25),
        q3: quantile(sorted, 0.75),
        sum,
      };
      hist = histogram(sorted, bins);
    }
    /** @type {{ min: number, max: number } | null} */
    let length = null;
    if (type === 'text' && present.length) {
      let min = Infinity;
      let max = 0;
      for (const v of present) {
        const n = [...String(v)].length;
        min = Math.min(min, n);
        max = Math.max(max, n);
      }
      length = { min, max };
    }
    const ranked = [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, Math.max(1, top))
      .map(([value, count]) => ({ value, count }));
    return { name, type, count: present.length, missing, distinct: counts.size, capped, numbers, histogram: hist, length, top: ranked }; // prettier-ignore
  });
  return { rows: dataset.records.length, columns };
}

/**
 * The profile as CSV, one row per column, with formulas neutralized for spreadsheets.
 *
 * @param {Profile} profile
 * @param {(stats: ColumnStats, value: number) => string | number} format - Writes a number or a date of a column.
 * @returns {string}
 */
export function profileToCsv(profile, format) {
  const field = (/** @type {string | number} */ v) => {
    const text = String(v);
    const formula = /^[=+\-@\t\r]/.test(text) && !/^-\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text);
    const safe = typeof v === 'string' && formula ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = [
    'column',
    'type',
    'count',
    'missing',
    'distinct',
    'min',
    'q1',
    'median',
    'mean',
    'q3',
    'max',
    'std',
    'top',
  ];
  const lines = [head.join(',')];
  for (const c of profile.columns) {
    const n = c.numbers;
    const num = (/** @type {number | undefined} */ v) => (n && v !== undefined ? format(c, v) : '');
    lines.push(
      [c.name, c.type, c.count, c.missing, c.distinct, num(n?.min), num(n?.q1), num(n?.median), num(n?.mean), num(n?.q3), num(n?.max), n && c.type === 'number' ? n.std : '', c.top[0]?.value ?? ''] // prettier-ignore
        .map(field)
        .join(','),
    );
  }
  return lines.join('\n');
}
