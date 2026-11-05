// @ts-check
/**
 * Pricing data: plans, billing periods and currencies read from JSON, the price of a plan for a
 * period and currency, and what a longer period saves.
 *
 * @module components/pricing/model
 */
import { isSafeUrl } from '../../core/urls.js';

/**
 * @typedef {object} Period
 * @property {string} id
 * @property {string} label - Empty when the source gives none.
 * @property {number} months - Months the period covers; 0 for a price that does not repeat.
 * @property {string} note - Short text next to the period.
 */

/**
 * @typedef {object} PlanFeature
 * @property {string} text
 * @property {boolean} included
 */

/**
 * @typedef {object} Plan
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} badge
 * @property {boolean} highlight
 * @property {string} unit - What the price is for, such as "per seat".
 * @property {unknown} price - The price as written in the source: see {@link priceOf}.
 * @property {string} cta - Text of the button.
 * @property {string | null} url
 * @property {PlanFeature[]} features
 */

/**
 * @typedef {object} CompareRow
 * @property {string} name
 * @property {string} description
 * @property {string} group
 * @property {Record<string, boolean | string>} values - By plan id.
 */

/**
 * @typedef {object} Pricing
 * @property {string[]} currencies
 * @property {Period[]} periods
 * @property {Plan[]} plans
 * @property {CompareRow[]} rows
 * @property {string} note
 */

/**
 * @typedef {{ kind: 'amount', amount: number } | { kind: 'text', text: string } | { kind: 'none' }} Price
 */

/** @typedef {{ ok: true, pricing: Pricing } | { ok: false, error: 'json' | 'shape', message: string }} PricingResult */

/** Limits against oversized sources. */
export const LIMITS = Object.freeze({ plans: 12, rows: 500, features: 100, periods: 6 });

/** Months of the period names used most, when the source does not say. */
const KNOWN_MONTHS = Object.freeze({
  monthly: 1,
  month: 1,
  quarterly: 3,
  quarter: 3,
  yearly: 12,
  year: 12,
  annual: 12,
  annually: 12,
});

const CURRENCY = /^[A-Z]{3}$/;

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string}
 */
function text(value, max = 500) {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * @param {string} id
 * @returns {number} Months of a period name, 0 when it is not known.
 */
function knownMonths(id) {
  const key = id.toLowerCase();
  return Object.hasOwn(KNOWN_MONTHS, key)
    ? KNOWN_MONTHS[/** @type {keyof typeof KNOWN_MONTHS} */ (key)]
    : 0;
}

/**
 * @param {unknown} item
 * @returns {PlanFeature | null}
 */
function readPlanFeature(item) {
  if (isObject(item)) {
    const label = text(item.text ?? item.name);
    return label ? { text: label, included: item.included !== false } : null;
  }
  const label = text(item);
  return label ? { text: label, included: true } : null;
}

/**
 * @param {Record<string, any>} item
 * @param {number} index
 * @returns {Plan}
 */
function readPlan(item, index) {
  const cta = isObject(item.cta) ? item.cta : { label: item.cta, url: item.url };
  const url = text(cta.url, 2000);
  const features = Array.isArray(item.features) ? item.features : [];
  return {
    id: text(item.id, 100) || `plan-${index}`,
    name: text(item.name, 200),
    description: text(item.description),
    badge: text(item.badge, 60),
    highlight: item.highlight === true,
    unit: text(item.unit, 60),
    price: item.price,
    cta: text(cta.label, 100),
    url: url && isSafeUrl(url) ? url : null,
    features: features
      .slice(0, LIMITS.features)
      .map(readPlanFeature)
      .filter((feature) => feature !== null),
  };
}

/**
 * @param {unknown} source
 * @returns {Period[]}
 */
function readPeriods(source) {
  if (!Array.isArray(source)) return [];
  /** @type {Period[]} */
  const periods = [];
  for (const item of source.slice(0, LIMITS.periods)) {
    const entry = isObject(item) ? item : { id: item };
    const id = text(entry.id, 60);
    if (!id) continue;
    const months = Number(entry.months);
    periods.push({
      id,
      label: text(entry.label, 60),
      months: Number.isFinite(months) && months >= 0 ? months : knownMonths(id),
      note: text(entry.note, 60),
    });
  }
  return periods;
}

/**
 * Periods named by the prices, when the source does not list them: shortest first.
 *
 * @param {Plan[]} plans
 * @returns {Period[]}
 */
function inferPeriods(plans) {
  /** @type {Set<string>} */
  const ids = new Set();
  for (const plan of plans) {
    if (!isObject(plan.price)) continue;
    for (const key of Object.keys(plan.price)) if (!CURRENCY.test(key)) ids.add(key);
  }
  return [...ids]
    .slice(0, LIMITS.periods)
    .map((id) => ({ id, label: '', months: knownMonths(id), note: '' }))
    .sort((a, b) => a.months - b.months);
}

/**
 * @param {Plan[]} plans
 * @param {unknown} declared - `currency` or `currencies` of the source.
 * @returns {string[]} Declared currencies, else the ones named by the prices.
 */
function readCurrencies(plans, declared) {
  const list = (Array.isArray(declared) ? declared : [declared])
    .map((code) => text(code, 10).toUpperCase())
    .filter((code) => CURRENCY.test(code));
  if (list.length) return [...new Set(list)];
  /** @type {Set<string>} */
  const found = new Set();
  /** @param {unknown} price */
  const walk = (price) => {
    if (!isObject(price)) return;
    for (const [key, value] of Object.entries(price)) {
      if (CURRENCY.test(key)) found.add(key);
      else walk(value);
    }
  };
  for (const plan of plans) walk(plan.price);
  return found.size ? [...found] : ['USD'];
}

/**
 * The comparison table: `[{ name, group, values: { plan: true | "text" } }]`.
 *
 * @param {unknown} source
 * @returns {CompareRow[]}
 */
function readRows(source) {
  if (!Array.isArray(source)) return [];
  return source
    .filter(isObject)
    .slice(0, LIMITS.rows)
    .map((item) => {
      /** @type {Record<string, boolean | string>} */
      const values = Object.create(null);
      if (isObject(item.values)) {
        for (const [plan, value] of Object.entries(item.values))
          values[plan] = typeof value === 'boolean' ? value : text(value, 200);
      }
      return {
        name: text(item.name, 200),
        description: text(item.description),
        group: text(item.group, 200),
        values,
      };
    })
    .filter((row) => row.name);
}

/**
 * Parses pricing JSON.
 *
 * @param {string} source
 * @returns {PricingResult}
 */
export function parsePricing(source) {
  /** @type {any} */
  let data;
  try {
    data = JSON.parse(source);
  } catch (error) {
    return { ok: false, error: 'json', message: error instanceof Error ? error.message : '' };
  }
  if (Array.isArray(data)) data = { plans: data };
  if (!isObject(data) || !Array.isArray(data.plans))
    return { ok: false, error: 'shape', message: '' };
  const plans = data.plans.filter(isObject).slice(0, LIMITS.plans).map(readPlan);
  const periods = readPeriods(data.periods);
  return {
    ok: true,
    pricing: {
      currencies: readCurrencies(plans, data.currencies ?? data.currency),
      periods: periods.length ? periods : inferPeriods(plans),
      plans,
      rows: readRows(data.compare ?? data.rows),
      note: text(data.note, 1000),
    },
  };
}

/**
 * The price of a plan. `price` may be a number, a text ("Contact us"), an object by period,
 * an object by currency, or an object by period of objects by currency.
 *
 * @param {Plan} plan
 * @param {string | null} periodId
 * @param {string} currency
 * @returns {Price}
 */
export function priceOf(plan, periodId, currency) {
  let value = plan.price;
  if (isObject(value) && periodId !== null && Object.hasOwn(value, periodId))
    value = value[periodId];
  if (isObject(value)) value = Object.hasOwn(value, currency) ? value[currency] : null;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
    return { kind: 'amount', amount: value };
  const label = text(value, 60);
  return label ? { kind: 'text', text: label } : { kind: 'none' };
}

/**
 * What a period saves over the shortest period of the same plan, in whole percents.
 *
 * @param {Plan} plan
 * @param {Pricing} pricing
 * @param {Period} period
 * @param {string} currency
 * @returns {number} 0 when it saves nothing or cannot be told.
 */
export function savings(plan, pricing, period, currency) {
  if (period.months <= 0) return 0;
  const price = priceOf(plan, period.id, currency);
  if (price.kind !== 'amount' || price.amount === 0) return 0;
  const bases = pricing.periods.filter((p) => p.months > 0 && p.months < period.months);
  if (!bases.length) return 0;
  const shortest = bases.reduce((a, b) => (b.months < a.months ? b : a));
  const base = priceOf(plan, shortest.id, currency);
  if (base.kind !== 'amount' || base.amount === 0) return 0;
  const perMonth = price.amount / period.months;
  const basePerMonth = base.amount / shortest.months;
  return Math.max(0, Math.round((1 - perMonth / basePerMonth) * 100));
}
