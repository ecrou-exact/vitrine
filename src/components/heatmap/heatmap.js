// @ts-check
/**
 * Heat maps for <vt-heatmap>: values by day laid out as a calendar (weeks in columns, days
 * of the week in rows), or values by two categories laid out as a matrix.
 *
 * @module components/heatmap/heatmap
 */
import { parseCsv } from '../csv/parser.js';
import { dayNumber, parseIso, toIso, weekdayOf } from '../date-picker/dates.js';
import { toNumber } from '../pivot/pivot.js';

/** Days shown at most in a calendar: three years. */
export const MAX_DAYS = 3 * 366;
/** Categories kept per axis of a matrix. */
export const MAX_CATEGORIES = 500;

/**
 * @typedef {object} HeatData
 * @property {"calendar" | "matrix"} kind
 * @property {Map<number, number>} days - Value by day number (calendar).
 * @property {string[]} xs - Columns of a matrix, in order of appearance.
 * @property {string[]} ys - Rows of a matrix.
 * @property {Map<string, number>} cells - Value by `x\u0000y` (matrix).
 */

export class HeatmapError extends Error {}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A day from a date written in ISO 8601 (`2026-01-05`, or a date and time) or a timestamp.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function toDay(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Seconds or milliseconds since 1970.
    const ms = value < 1e11 ? value * 1000 : value;
    return Math.floor(ms / 864e5);
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const iso = parseIso(text.slice(0, 10));
  if (iso !== null && (text.length === 10 || /^\d{4}-\d\d-\d\d[T ]/.test(text))) return iso;
  return null;
}

/**
 * @param {Record<string, unknown>} item
 * @param {string[]} keys
 */
const pick = (item, keys) => keys.map((k) => item[k]).find((v) => v !== undefined && v !== null);

/**
 * Reads values by day or by two categories, from JSON (`{ "2026-01-05": 3 }`, a list of
 * `{ date, value }` or `{ x, y, value }`, or pairs `[date, value]`) or CSV (`date,value` or
 * `x,y,value`). Values of the same day or cell are added.
 *
 * @param {string} text
 * @returns {HeatData}
 */
export function readHeat(text) {
  const source = text.trim();
  if (!source) throw new HeatmapError('empty');
  /** @type {HeatData} */
  const data = { kind: 'calendar', days: new Map(), xs: [], ys: [], cells: new Map() };
  const addDay = (/** @type {number} */ day, /** @type {number} */ value) =>
    data.days.set(day, (data.days.get(day) ?? 0) + value);
  /** @type {Set<string>} */
  const xs = new Set();
  /** @type {Set<string>} */
  const ys = new Set();
  const addCell = (/** @type {unknown} */ x, /** @type {unknown} */ y, /** @type {number} */ value) => {
    const xt = String(x ?? '').slice(0, 100);
    const yt = String(y ?? '').slice(0, 100);
    if ((!xs.has(xt) && xs.size >= MAX_CATEGORIES) || (!ys.has(yt) && ys.size >= MAX_CATEGORIES)) return;
    xs.add(xt);
    ys.add(yt);
    const key = `${xt}\u0000${yt}`;
    data.cells.set(key, (data.cells.get(key) ?? 0) + value);
  }; // prettier-ignore

  if (/^[[{]/.test(source)) {
    /** @type {unknown} */
    let value;
    try {
      value = JSON.parse(source);
    } catch (error) {
      throw new HeatmapError(`json:${error instanceof Error ? error.message : ''}`);
    }
    if (isObject(value) && !Array.isArray(value.data) && !Array.isArray(value.values)) {
      for (const [date, v] of Object.entries(value).slice(0, MAX_DAYS * 2)) {
        const day = toDay(date);
        const n = toNumber(/** @type {any} */ (v));
        if (day !== null && n !== null) addDay(day, n);
      }
    } else {
      const list = Array.isArray(value) ? value : /** @type {unknown[]} */ ((isObject(value) && (value.data ?? value.values)) || []); // prettier-ignore
      for (const item of list.slice(0, 200_000)) {
        if (Array.isArray(item)) {
          const day = toDay(item[0]);
          const n = toNumber(item[item.length - 1]);
          if (item.length >= 3) {
            if (n !== null) addCell(item[0], item[1], n);
          } else if (day !== null && n !== null) addDay(day, n);
          continue;
        }
        if (!isObject(item)) continue;
        const n = toNumber(/** @type {any} */ (pick(item, ['value', 'count', 'n', 'total', 'y_value'])) ?? 1); // prettier-ignore
        if (n === null) continue;
        if ('x' in item && 'y' in item) addCell(item.x, item.y, n);
        else {
          const day = toDay(pick(item, ['date', 'day', 'time', 'timestamp']));
          if (day !== null) addDay(day, n);
        }
      }
    }
  } else {
    const { rows } = parseCsv(source);
    const [header, ...body] = rows;
    if (!header || header.length < 2) throw new HeatmapError('format');
    const names = header.map((h) => h.trim().toLowerCase());
    // A column named like a date holds dates only if most of its values are dates: "day"
    // may as well hold Mon, Tue… for a matrix.
    const named = names.findIndex((n) => ['date', 'day', 'time', 'timestamp'].includes(n));
    const sample = body.slice(0, 50).filter((row) => (row[named] ?? '').trim());
    const dateColumn =
      named >= 0 && sample.filter((row) => toDay(row[named]) !== null).length * 2 > sample.length
        ? named
        : -1;
    if (dateColumn >= 0) {
      const valueColumn = names.findIndex((n, i) => i !== dateColumn && ['value', 'count', 'n', 'total'].includes(n)); // prettier-ignore
      const column = valueColumn >= 0 ? valueColumn : dateColumn === 0 ? 1 : 0;
      for (const row of body) {
        const day = toDay(row[dateColumn]);
        const n = toNumber(row[column] ?? '') ?? (row[column] === undefined ? 1 : null);
        if (day !== null && n !== null) addDay(day, n);
      }
    } else if (header.length >= 3) {
      for (const row of body) {
        const n = toNumber(row[2] ?? '');
        if (n !== null && row[0] !== undefined) addCell(row[0], row[1], n);
      }
    } else {
      // Two columns without a date header: dates in the first one.
      for (const row of body) {
        const day = toDay(row[0]);
        const n = toNumber(row[1] ?? '');
        if (day !== null && n !== null) addDay(day, n);
      }
    }
  }
  if (data.cells.size) {
    data.kind = 'matrix';
    data.xs = [...xs];
    data.ys = [...ys];
  } else if (!data.days.size) throw new HeatmapError('noValues');
  return data;
}

/**
 * @typedef {object} CalendarCell
 * @property {number} day
 * @property {number} column - Week, from 0.
 * @property {number} row - Day of the week, from the first day of the week.
 * @property {number | null} value - `null` without a value.
 * @property {boolean} inRange
 */

/**
 * @typedef {object} CalendarLayout
 * @property {CalendarCell[]} cells
 * @property {number} columns
 * @property {{ column: number, month: number, year: number }[]} months - First week of each month.
 * @property {number} from
 * @property {number} to
 */

/**
 * Lays days out in weeks.
 *
 * @param {Map<number, number>} days
 * @param {{ from: number, to: number, firstDay: number }} options
 * @returns {CalendarLayout}
 */
export function calendarLayout(days, { from, to, firstDay }) {
  const end = Math.max(from, Math.min(to, from + MAX_DAYS - 1));
  const start = from - ((weekdayOf(from) - firstDay + 7) % 7);
  /** @type {CalendarCell[]} */
  const cells = [];
  /** @type {{ column: number, month: number, year: number }[]} */
  const months = [];
  for (let day = start; day <= end; day += 1) {
    const offset = day - start;
    const column = Math.floor(offset / 7);
    const inRange = day >= from;
    cells.push({ day, column, row: offset % 7, value: inRange ? (days.get(day) ?? null) : null, inRange }); // prettier-ignore
    const date = new Date(day * 864e5);
    if (
      inRange &&
      (date.getUTCDate() === 1 || day === from) &&
      !months.some((m) => m.column === column)
    )
      months.push({ column, month: date.getUTCMonth() + 1, year: date.getUTCFullYear() });
  }
  return { cells, columns: Math.floor((end - start) / 7) + 1, months, from, to: end };
}

/**
 * The days shown when the page sets no period: the year of `year`, or the year (365 days)
 * ending on the last day with a value.
 *
 * @param {Map<number, number>} days
 * @param {{ from?: string | null, to?: string | null, year?: string | null }} attrs
 * @returns {{ from: number, to: number }}
 */
export function period(days, attrs) {
  const year = Number(attrs.year);
  if (Number.isInteger(year) && year > 0 && year < 10_000)
    return { from: dayNumber(year, 1, 1), to: dayNumber(year, 12, 31) };
  const known = [...days.keys()];
  const last = known.length ? Math.max(...known) : Math.floor(Date.now() / 864e5);
  const to = toDay(attrs.to) ?? last;
  const from = toDay(attrs.from) ?? to - 364;
  return from <= to ? { from, to } : { from: to, to: from };
}

/**
 * The level of a value, from 0 (none) to `levels - 1`.
 *
 * @param {number | null} value
 * @param {number} max
 * @param {number} levels
 * @returns {number}
 */
export function levelOf(value, max, levels) {
  if (value === null || value <= 0 || max <= 0) return 0;
  return Math.min(levels - 1, Math.max(1, Math.ceil((value / max) * (levels - 1))));
}

/**
 * The data as CSV: `date,value` or `x,y,value`.
 *
 * @param {HeatData} data
 * @returns {string}
 */
export function heatToCsv(data) {
  const field = (/** @type {string} */ v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  if (data.kind === 'calendar')
    return ['date,value', ...[...data.days].sort((a, b) => a[0] - b[0]).map(([d, v]) => `${toIso(d)},${v}`)].join('\n'); // prettier-ignore
  const lines = ['x,y,value'];
  for (const [key, value] of data.cells) {
    const [x, y] = key.split('\u0000');
    lines.push(`${field(x)},${field(y)},${value}`);
  }
  return lines.join('\n');
}
