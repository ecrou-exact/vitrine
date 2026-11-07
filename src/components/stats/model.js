// @ts-check
/**
 * Figures read from JSON: values, how they changed, and their history.
 *
 * @module components/stats/model
 */
import { firstText, isObject, parseList, safeLink, text, toNumber } from '../../core/data.js';

/**
 * @typedef {object} StatPoint
 * @property {string} label
 * @property {number} value
 */

/**
 * @typedef {object} Stat
 * @property {string} label
 * @property {number | null} value
 * @property {string} display - The value when it is a text.
 * @property {string} format - `number`, `compact`, `currency`, `percent`, `bytes` or `duration`.
 * @property {string} unit - Written after the value.
 * @property {string} currency
 * @property {number | null} digits
 * @property {number | null} change - Change in percent.
 * @property {'up' | 'down' | 'none'} good - The direction that is good news.
 * @property {string} against - What the change compares with, such as "vs last month".
 * @property {string} description
 * @property {string | null} url
 * @property {StatPoint[]} series
 */

const FORMATS = new Set(['number', 'compact', 'currency', 'percent', 'bytes', 'duration']);
/** Points kept in a history. */
const MAX_POINTS = 500;

/**
 * @param {unknown} source
 * @returns {StatPoint[]}
 */
function readSeries(source) {
  if (!Array.isArray(source)) return [];
  /** @type {StatPoint[]} */
  const points = [];
  for (const item of source.slice(0, MAX_POINTS)) {
    const value = toNumber(isObject(item) ? (item.value ?? item.y) : item);
    if (value === null) continue;
    points.push({ label: isObject(item) ? text(item.label ?? item.x, 100) : '', value });
  }
  return points;
}

/**
 * The change in percent: as given, else worked out from the previous value. There is none from
 * zero, which would be infinite.
 *
 * @param {Record<string, any>} item
 * @param {number | null} value
 * @returns {number | null}
 */
export function readChange(item, value) {
  const given = toNumber(item.change ?? item.delta);
  if (given !== null) return given;
  const previous = toNumber(item.previous);
  if (previous === null || value === null || previous === 0) return null;
  return ((value - previous) / Math.abs(previous)) * 100;
}

/**
 * @param {Record<string, any>} item
 * @returns {Stat}
 */
function readStat(item) {
  const number = toNumber(item.value);
  const format = text(item.format, 20).toLowerCase();
  const digits = toNumber(item.digits);
  const good = text(item.good, 10).toLowerCase();
  return {
    label: firstText(item, ['label', 'name', 'title'], 200),
    value: number,
    display: number === null ? text(item.value, 100) : '',
    format: FORMATS.has(format) ? format : 'number',
    unit: text(item.unit, 40),
    currency: /^[A-Za-z]{3}$/.test(text(item.currency, 3))
      ? text(item.currency, 3).toUpperCase()
      : 'USD',
    digits: digits !== null && digits >= 0 && digits <= 6 ? Math.floor(digits) : null,
    change: readChange(item, number),
    good: good === 'down' || good === 'none' ? good : 'up',
    against: firstText(item, ['against', 'period', 'compare'], 100),
    description: text(item.description, 500),
    url: safeLink(item.url ?? item.href),
    series: readSeries(item.series ?? item.history ?? item.trend ?? item.spark),
  };
}

/**
 * @param {string} source
 * @returns {{ ok: true, stats: Stat[] } | { ok: false, error: 'json' | 'shape', message: string }}
 */
export function parseStats(source) {
  const result = parseList(source, ['stats', 'items', 'metrics', 'kpis']);
  if (!result.ok) return result;
  return {
    ok: true,
    stats: result.items.map(readStat).filter((stat) => stat.label || stat.value !== null),
  };
}

/**
 * @param {number} change
 * @param {'up' | 'down' | 'none'} good
 * @returns {'good' | 'bad' | 'neutral'}
 */
export function changeTone(change, good) {
  if (change === 0 || good === 'none') return 'neutral';
  return change > 0 === (good === 'up') ? 'good' : 'bad';
}

/**
 * Where the points of a history go in a box. A flat history runs through the middle.
 *
 * @param {StatPoint[]} points
 * @param {number} width
 * @param {number} height
 * @param {number} margin
 * @returns {{ x: number, y: number }[]}
 */
export function plotPoints(points, width, height, margin) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const span = Math.max(...values) - min;
  return points.map((point, index) => ({
    x:
      points.length > 1 ? margin + (index / (points.length - 1)) * (width - margin * 2) : width / 2,
    y: span ? height - margin - ((point.value - min) / span) * (height - margin * 2) : height / 2,
  }));
}
