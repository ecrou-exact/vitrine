// @ts-check
import { describe, expect, it } from 'vitest';
import {
  PivotError,
  pivot,
  pivotToCsv,
  readDataset,
  toNumber,
} from '../../src/components/pivot/pivot.js';
import { VtPivot } from '../../src/components/pivot/vt-pivot.js';

if (!customElements.get('vt-pivot')) customElements.define('vt-pivot', VtPivot);

const CSV = `region,year,product,sales
North,2025,A,100
North,2025,B,50
North,2026,A,"1,200"
South,2025,A,30
South,2026,B,
West,2026,A,70`;

/**
 * @param {Record<string, string>} attributes
 * @param {string} content
 * @returns {Promise<VtPivot>}
 */
async function mount(attributes, content) {
  const el = /** @type {VtPivot} */ (document.createElement('vt-pivot'));
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  el.content = content;
  document.body.replaceChildren(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

describe('toNumber', () => {
  it('reads numbers as people write them', () => {
    expect(toNumber('1,234,567.5')).toBe(1234567.5);
    expect(toNumber(' 12 345 ')).toBe(12345);
    expect(toNumber('-3e2')).toBe(-300);
    expect(toNumber('15%')).toBeCloseTo(0.15);
    expect(toNumber(true)).toBe(1);
    expect(toNumber('1,5')).toBeNull();
    expect(toNumber('abc')).toBeNull();
    expect(toNumber('')).toBeNull();
  });
});

describe('readDataset', () => {
  it('reads CSV with a header, and tells the numeric fields', () => {
    const data = readDataset(CSV);
    expect(data.fields).toEqual(['region', 'year', 'product', 'sales']);
    expect(data.records).toHaveLength(6);
    expect([...data.numeric]).toEqual(['year', 'sales']);
  });

  it('reads JSON lists, and lists under a key, never the rows setting', () => {
    expect(readDataset('[{"a":1},{"a":2,"b":"x"}]').fields).toEqual(['a', 'b']);
    const data = readDataset('{"rows":["a"],"data":[{"a":"x","n":{"deep":1}}]}');
    expect(data.records).toEqual([{ a: 'x', n: '{"deep":1}' }]);
  });

  it('refuses what holds no records', () => {
    expect(() => readDataset('')).toThrow(PivotError);
    expect(() => readDataset('{"a":1}')).toThrow('format');
    expect(() => readDataset('[oops')).toThrow(/^json:/);
  });
});

describe('pivot', () => {
  const { records } = readDataset(CSV);

  it('sums by rows and columns, with totals', () => {
    const result = pivot(records, { rows: ['region'], columns: ['year'], value: 'sales', aggregate: 'sum' }); // prettier-ignore
    expect(result.rowKeys).toEqual([['North'], ['South'], ['West']]);
    expect(result.colKeys).toEqual([['2025'], ['2026']]);
    expect(result.cell(0, 0)).toBe(150);
    expect(result.cell(0, 1)).toBe(1200);
    // South 2026 has an empty value: no sum.
    expect(result.cell(1, 1)).toBeNull();
    expect(result.cell(2, 0)).toBeNull();
    expect(result.rowTotal(0)).toBe(1350);
    expect(result.colTotal(1)).toBe(1270);
    expect(result.total).toBe(1450);
    expect([result.min, result.max]).toEqual([30, 1200]);
  });

  it('counts, averages, takes extremes and distinct values', () => {
    const by = (/** @type {any} */ aggregate) =>
      pivot(records, { rows: ['region'], columns: [], value: 'product', aggregate });
    expect(by('count').rowTotal(0)).toBe(3);
    expect(by('distinct').rowTotal(0)).toBe(2);
    const avg = pivot(records, { rows: [], columns: [], value: 'sales', aggregate: 'avg' });
    expect(avg.total).toBe(290);
    const max = pivot(records, {
      rows: ['product'],
      columns: [],
      value: 'sales',
      aggregate: 'max',
    });
    expect(max.rowTotal(0)).toBe(1200);
  });

  it('gives the records of a cell, a row or everything', () => {
    const result = pivot(records, { rows: ['region'], columns: ['year'], value: 'sales', aggregate: 'sum' }); // prettier-ignore
    expect(result.records(0, 0).map((r) => r.product)).toEqual(['A', 'B']);
    expect(result.records(0, null)).toHaveLength(3);
    expect(result.records(null, null)).toHaveLength(6);
  });

  it('writes CSV with totals, and keeps formulas from running', () => {
    const data = readDataset('name,n\n=HYPERLINK("x"),1\nb,2');
    const options = { rows: ['name'], columns: [], value: 'n', aggregate: /** @type {const} */ ('sum') }; // prettier-ignore
    const csv = pivotToCsv(pivot(data.records, options), options, { totals: true, total: 'Total' });
    expect(csv).toBe(`name,—,Total\n"'=HYPERLINK(""x"")",1,1\nb,2,2\nTotal,3,3`);
  });
});

describe('<vt-pivot>', () => {
  it('chooses sensible fields, writes totals and shades cells', async () => {
    const el = await mount({ columns: 'year', heat: '' }, CSV);
    expect(el.settings).toEqual({ rows: ['region'], columns: ['year'], values: 'sales', aggregate: 'sum' }); // prettier-ignore
    const body = Array.from(el.root.querySelectorAll('tbody tr'), (tr) => tr.textContent);
    expect(body[0]).toBe('North1501,2001,350');
    expect(el.root.querySelector('tfoot')?.textContent).toBe('Total1801,2701,450');
    const heat = /** @type {HTMLElement} */ (el.root.querySelector('.pv-heat'));
    expect(heat.style.getPropertyValue('--_heat')).toBe('0.1');
  });

  it('sends the records of a cell, and changes with the lists', async () => {
    const el = await mount({ variant: 'full', columns: 'year' }, CSV);
    /** @type {any[]} */
    const events = [];
    el.addEventListener('vt-select', (e) => events.push(/** @type {CustomEvent} */ (e).detail));
    el.addEventListener('vt-change', (e) => events.push(/** @type {CustomEvent} */ (e).detail));
    /** @type {HTMLButtonElement} */ (el.root.querySelector('tbody .pv-value')).click();
    expect(events[0]).toMatchObject({ row: { region: 'North' }, column: { year: '2025' }, value: 150 });
    expect(events[0].records).toHaveLength(2);
    const aggregate = /** @type {HTMLSelectElement} */ (el.root.querySelector('[data-focus-key="select-aggregate"]'));
    aggregate.value = 'count';
    aggregate.dispatchEvent(new Event('change'));
    expect(events[1]).toEqual({ rows: ['region'], columns: ['year'], values: 'sales', aggregate: 'count' });
    expect(el.root.querySelector('tfoot')?.textContent).toBe('Total336');
  }); // prettier-ignore

  it('shows names as text', async () => {
    const el = await mount({}, 'name,n\n<img src=x onerror=alert(1)>,1');
    expect(el.root.querySelector('img')).toBeNull();
    expect(el.root.querySelector('tbody th')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});
