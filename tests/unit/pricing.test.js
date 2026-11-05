import { describe, expect, it } from 'vitest';
import { parsePricing, priceOf, savings } from '../../src/components/pricing/model.js';
import { VtPricing } from '../../src/components/pricing/vt-pricing.js';

/** @param {unknown} value */
function pricing(value) {
  const result = parsePricing(JSON.stringify(value));
  if (!result.ok) throw new Error('not pricing');
  return result.pricing;
}

const SAMPLE = {
  currency: 'EUR',
  periods: [
    { id: 'monthly', label: 'Monthly' },
    { id: 'yearly', label: 'Yearly', note: '2 months free' },
  ],
  plans: [
    { id: 'free', name: 'Free', price: 0 },
    { id: 'pro', name: 'Pro', price: { monthly: 10, yearly: 96 }, highlight: true },
    { id: 'big', name: 'Big', price: 'Contact us' },
  ],
};

describe('parsePricing', () => {
  it('reads plans, periods and currencies', () => {
    const value = pricing(SAMPLE);
    expect(value.currencies).toEqual(['EUR']);
    expect(value.periods.map((p) => [p.id, p.months])).toEqual([
      ['monthly', 1],
      ['yearly', 12],
    ]);
    expect(value.plans[1].highlight).toBe(true);
  });

  it('finds periods and currencies in the prices', () => {
    const value = pricing({
      plans: [
        { name: 'A', price: { yearly: { EUR: 96, USD: 100 }, monthly: { EUR: 10, USD: 11 } } },
      ],
    });
    expect(value.periods.map((p) => p.id)).toEqual(['monthly', 'yearly']);
    expect(value.currencies).toEqual(['EUR', 'USD']);
  });

  it('does not take currencies for periods', () => {
    const value = pricing({ plans: [{ name: 'A', price: { EUR: 10, USD: 11 } }] });
    expect(value.periods).toEqual([]);
    expect(value.currencies).toEqual(['EUR', 'USD']);
  });

  it('reads features with and without the included flag', () => {
    const [plan] = pricing({
      plans: [{ name: 'A', features: ['One', { text: 'Two', included: false }, '', 3] }],
    }).plans;
    expect(plan.features).toEqual([
      { text: 'One', included: true },
      { text: 'Two', included: false },
      { text: '3', included: true },
    ]);
  });

  it('keeps the comparison values by plan, on an object without a prototype', () => {
    const { rows } = pricing({
      plans: [{ id: 'a', name: 'A' }],
      compare: [{ name: 'Seats', group: 'Team', values: { a: '5', b: true } }, { group: 'x' }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].values.a).toBe('5');
    expect(rows[0].values.b).toBe(true);
    expect(rows[0].values.toString).toBeUndefined();
  });

  it('drops links with unsafe schemes', () => {
    const { plans } = pricing({
      plans: [
        { name: 'A', cta: { label: 'Go', url: 'javascript:alert(1)' } },
        { name: 'B', cta: { label: 'Go', url: 'https://example.com/buy' } },
        { name: 'C', url: '/buy', cta: 'Buy' },
      ],
    });
    expect(plans.map((plan) => plan.url)).toEqual([null, 'https://example.com/buy', '/buy']);
    expect(plans[2].cta).toBe('Buy');
  });

  it('rejects text that is not pricing', () => {
    expect(parsePricing('{nope')).toMatchObject({ ok: false, error: 'json' });
    expect(parsePricing('{"a":1}')).toMatchObject({ ok: false, error: 'shape' });
    expect(parsePricing('3')).toMatchObject({ ok: false, error: 'shape' });
  });

  it('accepts a plain list of plans, and ignores bad currency codes', () => {
    const value = pricing([{ name: 'A', price: 1 }]);
    expect(value.plans).toHaveLength(1);
    expect(value.currencies).toEqual(['USD']);
    expect(pricing({ currency: 'euros', plans: [] }).currencies).toEqual(['USD']);
  });
});

describe('priceOf', () => {
  const value = pricing({
    currencies: ['EUR', 'USD'],
    plans: [
      { name: 'Number', price: 5 },
      { name: 'Text', price: 'Contact us' },
      { name: 'Period', price: { monthly: 10, yearly: 96 } },
      { name: 'Currency', price: { EUR: 7, USD: 8 } },
      { name: 'Both', price: { monthly: { EUR: 9, USD: 10 }, yearly: 'Ask' } },
      { name: 'None' },
      { name: 'Negative', price: -1 },
      { name: 'Trap', price: { constructor: 3 } },
    ],
  });
  const of = (/** @type {number} */ i, /** @type {string | null} */ period, currency = 'EUR') =>
    priceOf(value.plans[i], period, currency);

  it('reads every form of price', () => {
    expect(of(0, 'monthly')).toEqual({ kind: 'amount', amount: 5 });
    expect(of(1, 'monthly')).toEqual({ kind: 'text', text: 'Contact us' });
    expect(of(2, 'yearly')).toEqual({ kind: 'amount', amount: 96 });
    expect(of(3, null, 'USD')).toEqual({ kind: 'amount', amount: 8 });
    expect(of(4, 'monthly', 'USD')).toEqual({ kind: 'amount', amount: 10 });
    expect(of(4, 'yearly', 'USD')).toEqual({ kind: 'text', text: 'Ask' });
  });

  it('has no price when nothing fits', () => {
    expect(of(5, 'monthly')).toEqual({ kind: 'none' });
    expect(of(6, null)).toEqual({ kind: 'text', text: '-1' });
    expect(of(3, null, 'GBP')).toEqual({ kind: 'none' });
    expect(priceOf(value.plans[7], 'constructor', 'EUR')).toEqual({ kind: 'amount', amount: 3 });
    expect(priceOf(value.plans[7], 'toString', 'toString')).toEqual({ kind: 'none' });
  });
});

describe('savings', () => {
  const value = pricing(SAMPLE);
  const [monthly, yearly] = value.periods;

  it('compares with the shortest period', () => {
    expect(savings(value.plans[1], value, yearly, 'EUR')).toBe(20);
    expect(savings(value.plans[1], value, monthly, 'EUR')).toBe(0);
  });

  it('is nothing for free plans, text prices and dearer periods', () => {
    expect(savings(value.plans[0], value, yearly, 'EUR')).toBe(0);
    expect(savings(value.plans[2], value, yearly, 'EUR')).toBe(0);
    const dearer = pricing({
      currency: 'EUR',
      plans: [{ name: 'A', price: { monthly: 10, yearly: 200 } }],
    });
    expect(savings(dearer.plans[0], dearer, dearer.periods[1], 'EUR')).toBe(0);
  });
});

describe('<vt-pricing>', () => {
  it('is a documented element', () => {
    expect(VtPricing.observedAttributes).toEqual(
      expect.arrayContaining(['period', 'currency', 'display', 'compare', 'link-target']),
    );
  });
});
