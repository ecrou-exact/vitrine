// @ts-check
/**
 * Reads chart data and computes scales.
 *
 * Accepted data (detected automatically):
 *
 * - **CSV or TSV** with a header row: the first column (or `x`) holds the labels, the
 *   numeric columns (or `y`) are the series;
 * - **JSON**: an array of objects (`[{ "month": "Jan", "sales": 12 }]`), Chart.js style
 *   `{ "labels": [...], "datasets": [{ "label", "data" }] }`, `{ "labels", "series": [{
 *   "name", "data" }] }`, or a plain array of numbers.
 *
 * @module components/chart/data
 */
import { parseCsv } from '../csv/parser.js';

/**
 * @typedef {object} Series
 * @property {string} name
 * @property {(number | null)[]} values - `null` for a missing value (a gap).
 */

/**
 * @typedef {object} ChartData
 * @property {string[]} labels
 * @property {Series[]} series
 * @property {boolean} truncated - More than {@link MAX_POINTS} points: the rest is ignored.
 */

/** Points kept per series. */
export const MAX_POINTS = 5000;
/** Series kept. */
export const MAX_SERIES = 12;

/** Thrown when the data cannot be read. */
export class ChartDataError extends Error {}

/**
 * Reads a number written in data: `1,234.5`, `12%`, ` 7 `, `-3e2`. Empty cells are `null`.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value
    .trim()
    .replace(/[\s,_](?=\d{3}\b)/g, '')
    .replace(/%$/, '');
  if (!text || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

/**
 * @param {string | null} value - Column names separated by spaces or commas.
 * @returns {string[] | null}
 */
function columnList(value) {
  if (!value?.trim()) return null;
  return value
    .split(/[\s,]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * Builds chart data from a table: a header and rows of cells.
 *
 * @param {string[]} header
 * @param {unknown[][]} rows
 * @param {{ x?: string | null, y?: string | null }} options
 * @returns {ChartData}
 */
function fromTable(header, rows, options) {
  const truncated = rows.length > MAX_POINTS;
  const data = truncated ? rows.slice(0, MAX_POINTS) : rows;
  let xIndex = options.x ? header.indexOf(options.x) : -1;
  if (options.x && xIndex < 0) throw new ChartDataError(`No column named "${options.x}".`);
  const wanted = columnList(options.y ?? null);
  /** @type {number[]} */
  let yIndexes;
  if (wanted) {
    yIndexes = wanted.map((name) => {
      const index = header.indexOf(name);
      if (index < 0) throw new ChartDataError(`No column named "${name}".`);
      return index;
    });
  } else {
    // Numeric columns: most of their cells are numbers.
    const numeric = header.map((_, column) => {
      const cells = data.map((row) => row[column]).filter((cell) => cell !== '' && cell != null);
      return (
        cells.length > 0 &&
        cells.filter((cell) => toNumber(cell) !== null).length >= cells.length * 0.8
      );
    });
    if (xIndex < 0) xIndex = numeric.findIndex((isNumber) => !isNumber);
    if (xIndex < 0) xIndex = 0;
    yIndexes = header.map((_, i) => i).filter((i) => i !== xIndex && numeric[i]);
  }
  if (xIndex < 0) {
    // Labels: the first column that is not plotted.
    xIndex = header.findIndex((_, i) => !yIndexes.includes(i));
    if (xIndex < 0) xIndex = -1;
  }
  if (!yIndexes.length) throw new ChartDataError('No numeric column to plot.');
  return {
    labels: data.map((row, i) => String(row[xIndex] ?? i + 1)),
    series: yIndexes.slice(0, MAX_SERIES).map((index) => ({
      name: header[index] || `Series ${index + 1}`,
      values: data.map((row) => toNumber(row[index])),
    })),
    truncated,
  };
}

/**
 * @param {unknown} value
 * @returns {(number | null)[]}
 */
function numbers(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_POINTS).map((item) => toNumber(item));
}

/**
 * Reads chart data from text.
 *
 * @param {string} text
 * @param {{ x?: string | null, y?: string | null }} [options] - Label and series columns.
 * @returns {ChartData}
 * @throws {ChartDataError}
 */
export function parseChartData(text, options = {}) {
  const trimmed = text.trim();
  if (!trimmed) return { labels: [], series: [], truncated: false };
  if (/^[[{]/.test(trimmed)) {
    /** @type {any} */
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch (error) {
      throw new ChartDataError(error instanceof Error ? error.message : 'Invalid JSON.');
    }
    // [1, 2, 3]
    if (Array.isArray(data) && data.every((item) => typeof item !== 'object' || item === null)) {
      const values = numbers(data);
      return {
        labels: values.map((_, i) => String(i + 1)),
        series: [{ name: 'Value', values }],
        truncated: data.length > MAX_POINTS,
      };
    }
    // [{ month: "Jan", sales: 12 }]
    if (Array.isArray(data)) {
      const objects = data.filter(
        (item) => item && typeof item === 'object' && !Array.isArray(item),
      );
      const header = [...new Set(objects.flatMap((item) => Object.keys(item)))];
      return fromTable(
        header,
        objects.map((item) => header.map((key) => item[key])),
        options,
      );
    }
    if (data && typeof data === 'object') {
      const labels = Array.isArray(data.labels) ? data.labels.slice(0, MAX_POINTS).map(String) : [];
      const list = Array.isArray(data.datasets)
        ? data.datasets
        : Array.isArray(data.series)
          ? data.series
          : null;
      if (!list) throw new ChartDataError('Expected "labels" with "series" or "datasets".');
      const series = list
        .slice(0, MAX_SERIES)
        .map((/** @type {any} */ item, /** @type {number} */ i) => ({
          name: String(item?.name ?? item?.label ?? `Series ${i + 1}`),
          values: numbers(Array.isArray(item) ? item : item?.data),
        }));
      const length = Math.max(
        labels.length,
        ...series.map((/** @type {Series} */ s) => s.values.length),
      );
      while (labels.length < length) labels.push(String(labels.length + 1));
      return { labels, series, truncated: length > MAX_POINTS };
    }
    throw new ChartDataError('Unsupported JSON shape.');
  }
  const { rows } = parseCsv(trimmed);
  if (rows.length < 2) throw new ChartDataError('Expected a header row and at least one data row.');
  return fromTable(
    rows[0].map((cell) => cell.trim()),
    rows.slice(1),
    options,
  );
}

/**
 * Round tick values covering a range: steps of 1, 2, 2.5 or 5 times a power of ten.
 *
 * @param {number} min
 * @param {number} max
 * @param {number} [count] - Approximate number of intervals.
 * @returns {{ min: number, max: number, step: number, ticks: number[] }}
 */
export function niceScale(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return niceScale(0, 1, count);
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1;
    return niceScale(min - pad, max + pad, count);
  }
  const raw = (max - min) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * power).find((s) => s >= raw) ?? 10 * power;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  /** @type {number[]} */
  const ticks = [];
  // Fixed decimals avoid 0.30000000000000004.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  for (let value = start; value <= end + step / 2; value += step)
    ticks.push(Number(value.toFixed(decimals)));
  return { min: start, max: end, step, ticks };
}

/**
 * Domain of the values shown: zero is always included for bars and areas.
 *
 * @param {Series[]} series
 * @param {{ stacked: boolean, zero: boolean, min?: number | null, max?: number | null }} options
 * @returns {{ min: number, max: number }}
 */
export function valueRange(series, options) {
  let min = Infinity;
  let max = -Infinity;
  if (options.stacked) {
    const length = Math.max(0, ...series.map((s) => s.values.length));
    for (let i = 0; i < length; i += 1) {
      let positive = 0;
      let negative = 0;
      for (const s of series) {
        const v = s.values[i] ?? 0;
        if (v >= 0) positive += v;
        else negative += v;
      }
      max = Math.max(max, positive);
      min = Math.min(min, negative);
    }
  } else {
    for (const s of series) {
      for (const v of s.values) {
        if (v === null) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  if (!Number.isFinite(min)) {
    min = 0;
    max = 1;
  }
  if (options.zero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  return {
    min: options.min ?? min,
    max: options.max ?? max,
  };
}

/**
 * Turns chart data back into CSV (for copy and download).
 *
 * @param {ChartData} data
 * @returns {string}
 */
export function toCsvText(data) {
  const cell = (/** @type {string} */ value) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const header = ['label', ...data.series.map((s) => s.name)].map(cell).join(',');
  const rows = data.labels.map((label, i) =>
    [
      cell(label),
      ...data.series.map((s) =>
        s.values[i] === null || s.values[i] === undefined ? '' : String(s.values[i]),
      ),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}
