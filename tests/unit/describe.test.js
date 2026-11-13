// @ts-check
import { describe as suite, expect, it } from 'vitest';
import {
  describe,
  histogram,
  isMissing,
  profileToCsv,
  quantile,
  typeOf,
} from '../../src/components/describe/describe.js';
import { VtDescribe } from '../../src/components/describe/vt-describe.js';
import { readDataset } from '../../src/components/pivot/pivot.js';

if (!customElements.get('vt-describe')) customElements.define('vt-describe', VtDescribe);

const CSV = `id,city,revenue,signup,active
1,Paris,120,2026-01-05,yes
2,Lyon,80,2026-02-10,no
3,Paris,,2026-03-01,yes
4,Nice,200,2026-03-20,yes
5,Paris,40,N/A,no`;

/**
 * @param {Record<string, string>} attributes
 * @param {string} content
 * @returns {Promise<VtDescribe>}
 */
async function mount(attributes, content) {
  const el = /** @type {VtDescribe} */ (document.createElement('vt-describe'));
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  el.content = content;
  document.body.replaceChildren(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

suite('helpers', () => {
  it('finds missing values and types', () => {
    expect(['', ' NA ', 'null', null, undefined, Number.NaN].every(isMissing)).toBe(true);
    expect(isMissing(0)).toBe(false);
    expect(typeOf([1, '2', '3.5'])).toBe('number');
    expect(typeOf(['2026-01-05', '2026-02-01T10:00:00Z'])).toBe('date');
    expect(typeOf(['yes', 'No', true])).toBe('boolean');
    expect(typeOf(['a', 1])).toBe('text');
  });

  it('computes quantiles and histograms', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(histogram([1, 2, 2, 3], 10)).toEqual({ from: 1, to: 4, counts: [1, 2, 1] });
    expect(histogram([0, 5, 10], 2)).toEqual({ from: 0, to: 10, counts: [1, 2] });
    expect(histogram([7, 7], 5)).toEqual({ from: 7, to: 7, counts: [2] });
  });
});

suite('describe', () => {
  it('profiles each column', () => {
    const profile = describe(readDataset(CSV));
    expect(profile.rows).toBe(5);
    const [id, city, revenue, signup, active] = profile.columns;
    expect(id).toMatchObject({ type: 'number', distinct: 5, missing: 0 });
    expect(city).toMatchObject({ type: 'text', distinct: 3, length: { min: 4, max: 5 } });
    expect(city.top[0]).toEqual({ value: 'Paris', count: 3 });
    expect(revenue).toMatchObject({ type: 'number', count: 4, missing: 1 });
    expect(revenue.numbers).toMatchObject({ min: 40, max: 200, mean: 110, median: 100, sum: 440 });
    expect(signup).toMatchObject({ type: 'date', missing: 1 });
    expect(active.type).toBe('boolean');
    expect(active.top).toEqual([
      { value: 'true', count: 3 },
      { value: 'false', count: 2 },
    ]);
  });

  it('keeps the columns asked, and writes CSV', () => {
    const profile = describe(readDataset('name,score\n=cmd,-3\nb,5'), {
      fields: ['name', 'score', 'nope'],
    });
    expect(profile.columns.map((c) => c.name)).toEqual(['name', 'score']);
    const csv = profileToCsv(profile, (_, v) => v).split('\n');
    expect(csv[1]).toBe("name,text,2,0,2,,,,,,,,'=cmd");
    expect(csv[2].startsWith('score,number,2,0,2,-3,')).toBe(true);
  });
});

suite('<vt-describe>', () => {
  it('summarizes the columns and opens the details of one', async () => {
    const el = await mount({ 'lang-ui': 'en' }, CSV);
    const root = /** @type {ShadowRoot} */ (el.shadowRoot);
    const rows = [...root.querySelectorAll('tbody > tr')];
    expect(rows).toHaveLength(5);
    expect(rows[2].textContent).toContain('1 (20%)');
    const summary = (/** @type {number} */ i) => rows[i].querySelector('.ds-summary')?.textContent;
    expect(summary(2)).toBe('40 to 200 · mean 110 · median 100');
    expect(summary(1)).toBe('Paris: 60% · Lyon: 20%');
    expect(summary(0)).toBe('1 to 5 · mean 3 · median 3');
    expect(summary(3)).toBe('2026-01-05 to 2026-03-20');
    expect(rows[2].querySelector('[role="img"]')?.getAttribute('aria-label')).toMatch(
      /^4 values from 40 to 200/,
    );
    /** @type {any[]} */
    const toggles = [];
    el.addEventListener('vt-toggle', (e) => toggles.push(/** @type {CustomEvent} */ (e).detail));
    /** @type {HTMLButtonElement} */ (rows[1].querySelector('button')).click();
    expect(toggles).toEqual([{ column: 'city', open: true }]);
    expect(root.querySelector('.ds-details')?.textContent).toContain('Most frequent');
    expect(root.querySelector('tbody button[aria-expanded="true"]')?.textContent).toBe('city');
  });

  it('shows an error for data it cannot read', async () => {
    const el = await mount({}, '{nope');
    expect(el.shadowRoot?.textContent).toContain('The JSON could not be read');
  });
});
