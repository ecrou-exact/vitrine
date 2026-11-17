// @ts-check
/**
 * Reads a Lighthouse report (the JSON of the CLI, of Chrome DevTools or of the PageSpeed
 * Insights API): category scores, lab metrics with their rating, Core Web Vitals measured on
 * real visits (CrUX field data in a PageSpeed Insights answer), opportunities with their
 * estimated savings, diagnostics and failed audits by category.
 *
 * @module components/lighthouse/lighthouse
 */
import { isObject, safeLink, text } from '../../core/data.js';

/** Metrics shown, in Lighthouse's order, with their good / poor thresholds (lab, mobile). */
export const METRICS = Object.freeze([
  { id: 'first-contentful-paint', short: 'FCP', unit: 'ms' },
  { id: 'largest-contentful-paint', short: 'LCP', unit: 'ms' },
  { id: 'total-blocking-time', short: 'TBT', unit: 'ms' },
  { id: 'cumulative-layout-shift', short: 'CLS', unit: '' },
  { id: 'speed-index', short: 'SI', unit: 'ms' },
  { id: 'interactive', short: 'TTI', unit: 'ms' },
  { id: 'interaction-to-next-paint', short: 'INP', unit: 'ms' },
]);

/** Core Web Vitals of CrUX: field names, thresholds (good below the first, poor above the second). */
export const FIELD = Object.freeze([
  { key: 'LARGEST_CONTENTFUL_PAINT_MS', short: 'LCP', good: 2500, poor: 4000, unit: 'ms' },
  { key: 'INTERACTION_TO_NEXT_PAINT', short: 'INP', good: 200, poor: 500, unit: 'ms' },
  { key: 'CUMULATIVE_LAYOUT_SHIFT_SCORE', short: 'CLS', good: 10, poor: 25, unit: 'cls' },
  { key: 'FIRST_CONTENTFUL_PAINT_MS', short: 'FCP', good: 1800, poor: 3000, unit: 'ms' },
  { key: 'EXPERIMENTAL_TIME_TO_FIRST_BYTE', short: 'TTFB', good: 800, poor: 1800, unit: 'ms' },
]);

/**
 * @typedef {"good" | "average" | "poor" | "none"} Rating
 * @typedef {object} Audit
 * @property {string} id
 * @property {string} title
 * @property {string} description - Markdown-like text, links removed to their text.
 * @property {string | null} learnMore - First link of the description.
 * @property {number | null} score - 0 to 1, `null` for informative audits.
 * @property {string} mode - `binary`, `numeric`, `informative`, `notApplicable`, `manual`, `error`, `metricSavings`.
 * @property {string} display - `displayValue`.
 * @property {number | null} numeric
 * @property {number} savingsMs
 * @property {number} savingsBytes
 * @property {{ label: string, value: string }[][]} items - First rows of its table, as text.
 * @property {string[]} headings
 * @property {string} group - Group in its category (`load-opportunities`, `diagnostics`…).
 * @property {number} weight
 * @typedef {object} Category
 * @property {string} id
 * @property {string} title
 * @property {number | null} score - 0 to 1.
 * @property {Audit[]} audits - Failed ones first.
 * @typedef {{ short: string, key: string, percentile: number, category: string, distribution: number[] }} FieldMetric
 * @typedef {object} Report
 * @property {string} url
 * @property {string} fetchTime
 * @property {string} version - Lighthouse version.
 * @property {string} formFactor - `mobile` or `desktop`.
 * @property {string} userAgent
 * @property {Category[]} categories
 * @property {{ id: string, short: string, title: string, value: string, numeric: number | null, score: number | null, unit: string }[]} metrics
 * @property {Audit[]} opportunities - Sorted by savings.
 * @property {{ scope: string, overall: string, metrics: FieldMetric[] }[]} field - Page and origin.
 * @property {string[]} warnings - `runWarnings`.
 * @property {string} error - `runtimeError.message`.
 * @typedef {{ ok: true, report: Report } | { ok: false, error: "empty" | "json" | "format", detail?: string }} ParseResult
 */

/**
 * @param {number | null} score
 * @returns {Rating}
 */
export function rating(score) {
  if (score === null || !Number.isFinite(score)) return 'none';
  if (score >= 0.9) return 'good';
  if (score >= 0.5) return 'average';
  return 'poor';
}

/**
 * Lighthouse descriptions: `[text](url)` links become their text, the first URL is kept apart.
 *
 * @param {string} description
 * @returns {{ text: string, link: string | null }}
 */
export function cleanDescription(description) {
  /** @type {string | null} */
  let link = null;
  // URLs may hold one level of parentheses.
  const out = description.replace(
    /\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g,
    (_, label, url) => {
      if (!link && /^https?:\/\//i.test(url)) link = safeLink(url);
      return label;
    },
  );
  return { text: out.replace(/`/g, ''), link };
}

/**
 * A table cell of an audit's details, as text.
 *
 * @param {unknown} value
 * @param {string} type - Value type of its heading.
 * @returns {string}
 */
function cell(value, type) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (type === 'bytes') return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MiB` : `${(value / 1024).toFixed(1)} KiB`; // prettier-ignore
    if (type === 'ms' || type === 'timespanMs') return `${Math.round(value)} ms`;
    return String(Math.round(value * 1000) / 1000);
  }
  if (typeof value === 'string') return text(value, 300);
  if (isObject(value)) {
    if (value.type === 'node') return text(value.snippet, 200) || text(value.nodeLabel, 200) || text(value.selector, 200); // prettier-ignore
    if (value.type === 'source-location')
      return `${text(value.url, 200)}:${Number(value.line) + 1}`;
    if (value.type === 'url' || value.type === 'link') return text(value.value ?? value.url ?? value.text, 300); // prettier-ignore
    if (value.type === 'code') return text(value.value, 200);
    if (typeof value.value !== 'undefined') return cell(value.value, type);
  }
  return '';
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} raw
 * @returns {Audit}
 */
function readAudit(id, raw) {
  const { text: description, link } = cleanDescription(text(raw.description, 1500));
  const details = isObject(raw.details) ? raw.details : {};
  const metricSavings = isObject(raw.metricSavings) ? raw.metricSavings : {};
  const headings = (Array.isArray(details.headings) ? details.headings : []).filter(isObject);
  const keys = headings.map((h) => ({ key: text(h.key, 60), label: text(h.label ?? h.text, 80), type: text(h.valueType ?? h.itemType, 30) })).filter((h) => h.key); // prettier-ignore
  const rows = (Array.isArray(details.items) ? details.items : []).filter(isObject).slice(0, 10);
  return {
    id,
    title: text(raw.title, 300) || id,
    description,
    learnMore: link,
    score: typeof raw.score === 'number' ? raw.score : null,
    mode: text(raw.scoreDisplayMode, 30),
    display: text(raw.displayValue, 120),
    numeric: typeof raw.numericValue === 'number' ? raw.numericValue : null,
    savingsMs: typeof details.overallSavingsMs === 'number' ? details.overallSavingsMs : typeof metricSavings.LCP === 'number' ? metricSavings.LCP : 0, // prettier-ignore
    savingsBytes: typeof details.overallSavingsBytes === 'number' ? details.overallSavingsBytes : 0,
    items: rows.map((row) =>
      keys.map((k) => ({ label: k.label, value: cell(row[k.key], k.type) })),
    ),
    headings: keys.map((k) => k.label),
    group: '',
    weight: 0,
  };
}

/**
 * Reads a report.
 *
 * @param {string} input
 * @returns {ParseResult}
 */
export function parseLighthouse(input) {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'empty' };
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(trimmed);
  } catch (error) {
    return { ok: false, error: 'json', detail: error instanceof Error ? error.message.slice(0, 200) : '' }; // prettier-ignore
  }
  if (!isObject(data)) return { ok: false, error: 'format' };
  // A PageSpeed Insights answer wraps the report and adds field data.
  const lhr = isObject(data.lighthouseResult) ? data.lighthouseResult : data;
  if (!isObject(lhr.categories) || !isObject(lhr.audits)) {
    if (isObject(data.loadingExperience)) return { ok: true, report: { ...emptyReport(), url: text(data.id, 500), field: readField(data) } }; // prettier-ignore
    return { ok: false, error: 'format' };
  }
  const audits = /** @type {Record<string, unknown>} */ (lhr.audits);
  /** @type {Map<string, Audit>} */
  const byId = new Map();
  for (const [id, raw] of Object.entries(audits))
    if (isObject(raw)) byId.set(id, readAudit(id, raw));
  /** @type {Category[]} */
  const categories = [];
  for (const [id, raw] of Object.entries(/** @type {Record<string, unknown>} */ (lhr.categories))) {
    if (!isObject(raw)) continue;
    const refs = (Array.isArray(raw.auditRefs) ? raw.auditRefs : []).filter(isObject);
    const list = refs
      .map((ref) => {
        const audit = byId.get(text(ref.id, 120));
        if (!audit) return null;
        return { ...audit, group: text(ref.group, 60), weight: typeof ref.weight === 'number' ? ref.weight : 0 }; // prettier-ignore
      })
      .filter((a) => a !== null)
      // Metrics are shown on their own.
      .filter((a) => a.group !== 'metrics');
    const failed = (/** @type {Audit} */ a) => a.score !== null && a.score < 0.9 && !['informative', 'notApplicable', 'manual'].includes(a.mode); // prettier-ignore
    list.sort((a, b) => Number(failed(b)) - Number(failed(a)) || (a.score ?? 1) - (b.score ?? 1) || b.weight - a.weight); // prettier-ignore
    categories.push({ id, title: text(raw.title, 100) || id, score: typeof raw.score === 'number' ? raw.score : null, audits: list }); // prettier-ignore
  }
  const metrics = METRICS.filter((m) => byId.has(m.id)).map((m) => {
    const a = /** @type {Audit} */ (byId.get(m.id));
    return { id: m.id, short: m.short, title: a.title, value: a.display, numeric: a.numeric, score: a.score, unit: m.unit }; // prettier-ignore
  });
  const opportunities = [...byId.values()]
    .filter((a) => (a.savingsMs > 0 || a.savingsBytes > 0) && a.score !== null && a.score < 0.9)
    .sort((a, b) => b.savingsMs - a.savingsMs || b.savingsBytes - a.savingsBytes);
  const settings = isObject(lhr.configSettings) ? lhr.configSettings : {};
  const env = isObject(lhr.environment) ? lhr.environment : {};
  const runtime = isObject(lhr.runtimeError) ? lhr.runtimeError : {};
  return {
    ok: true,
    report: {
      url: text(lhr.finalDisplayedUrl, 500) || text(lhr.finalUrl, 500) || text(lhr.requestedUrl, 500), // prettier-ignore
      fetchTime: text(lhr.fetchTime, 40),
      version: text(lhr.lighthouseVersion, 20),
      formFactor: text(settings.formFactor, 20) || text(settings.emulatedFormFactor, 20),
      userAgent: text(env.networkUserAgent, 300),
      categories,
      metrics,
      opportunities,
      field: readField(data),
      warnings: (Array.isArray(lhr.runWarnings) ? lhr.runWarnings : []).map((w) => text(w, 500)).filter(Boolean), // prettier-ignore
      error: text(runtime.message, 500),
    },
  };
}

/** @returns {Report} */
const emptyReport = () => ({ url: '', fetchTime: '', version: '', formFactor: '', userAgent: '', categories: [], metrics: [], opportunities: [], field: [], warnings: [], error: '' }); // prettier-ignore

/**
 * Field data of a PageSpeed Insights answer: the page, then the whole origin.
 *
 * @param {Record<string, unknown>} data
 * @returns {Report["field"]}
 */
function readField(data) {
  /** @type {Report["field"]} */
  const out = [];
  for (const [scope, key] of /** @type {const} */ ([
    ['page', 'loadingExperience'],
    ['origin', 'originLoadingExperience'],
  ])) {
    // prettier-ignore
    const exp = data[key];
    if (!isObject(exp) || !isObject(exp.metrics)) continue;
    const metrics = /** @type {Record<string, unknown>} */ (exp.metrics);
    /** @type {FieldMetric[]} */
    const list = [];
    for (const f of FIELD) {
      const m = metrics[f.key];
      if (!isObject(m) || typeof m.percentile !== 'number') continue;
      const distribution = (Array.isArray(m.distributions) ? m.distributions : []).filter(isObject).map((d) => (typeof d.proportion === 'number' ? d.proportion : 0)); // prettier-ignore
      list.push({ short: f.short, key: f.key, percentile: m.percentile, category: text(m.category, 20), distribution }); // prettier-ignore
    }
    if (list.length) out.push({ scope, overall: text(exp.overall_category, 20), metrics: list });
  }
  return out;
}

/**
 * The rating of a field metric from its 75th percentile.
 *
 * @param {FieldMetric} metric
 * @returns {Rating}
 */
export function fieldRating(metric) {
  const f = FIELD.find((x) => x.key === metric.key);
  if (!f) return 'none';
  if (metric.percentile <= f.good) return 'good';
  if (metric.percentile <= f.poor) return 'average';
  return 'poor';
}
