import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanDescription, fieldRating, parseLighthouse, rating } from '../../src/components/lighthouse/lighthouse.js'; // prettier-ignore
import { VtLighthouse } from '../../src/components/lighthouse/vt-lighthouse.js';

const PSI = readFileSync(join(import.meta.dirname, 'fixtures', 'web', 'psi.json'), 'utf8');

const report = (text = PSI) => {
  const r = parseLighthouse(text);
  if (!r.ok) throw new Error(r.error);
  return r.report;
};

describe('parseLighthouse', () => {
  it('reads scores, metrics and opportunities', () => {
    const r = report();
    expect(r).toMatchObject({ url: 'https://shop.example/', version: '12.2.1', formFactor: 'mobile' }); // prettier-ignore
    expect(r.categories.map((c) => [c.id, c.score])).toEqual([['performance', 0.62], ['accessibility', 0.88], ['best-practices', 0.96], ['seo', 1]]); // prettier-ignore
    expect(r.metrics.map((m) => `${m.short} ${m.value}`)).toEqual(['FCP 2.2 s', 'LCP 4.6 s', 'TBT 420 ms', 'CLS 0.08', 'SI 4.9 s']); // prettier-ignore
    expect(r.opportunities.map((o) => [o.id, o.savingsMs])).toEqual([['render-blocking-resources', 780], ['uses-optimized-images', 300]]); // prettier-ignore
    expect(r.opportunities[0].items[0]).toEqual([
      { label: 'URL', value: 'https://shop.example/css/app.css' },
      { label: 'Transfer Size', value: '47.1 KiB' },
      { label: 'Potential Savings', value: '540 ms' },
    ]);
    // Metrics are not repeated among the audits; failed audits come first.
    expect(r.categories[0].audits.map((a) => a.id)).toEqual(['render-blocking-resources', 'uses-optimized-images', 'dom-size']); // prettier-ignore
    expect(r.categories[1].audits[0]).toMatchObject({ id: 'color-contrast', score: 0 });
    expect(r.warnings).toHaveLength(1);
  });

  it('reads field data', () => {
    const [page] = report().field;
    expect(page.scope).toBe('page');
    expect(page.metrics.map((m) => [m.short, m.percentile, fieldRating(m)])).toEqual([['LCP', 2900, 'average'], ['INP', 180, 'good'], ['CLS', 31, 'poor']]); // prettier-ignore
  });

  it('rates and cleans', () => {
    expect([rating(0.95), rating(0.5), rating(0.49), rating(null)]).toEqual(['good', 'average', 'poor', 'none']); // prettier-ignore
    expect(cleanDescription('See [the docs](https://example.com/a) and [x](javascript:alert(1)).')).toEqual({ text: 'See the docs and x.', link: 'https://example.com/a' }); // prettier-ignore
    expect(parseLighthouse('{"a":1}')).toEqual({ ok: false, error: 'format' });
    expect(parseLighthouse('')).toEqual({ ok: false, error: 'empty' });
  });
});

describe('<vt-lighthouse>', () => {
  if (!customElements.get('vt-lighthouse')) customElements.define('vt-lighthouse', VtLighthouse);

  it('shows gauges, field data, metrics and audits by category', () => {
    const el = /** @type {VtLighthouse} */ (document.createElement('vt-lighthouse'));
    el.setAttribute('variant', 'full');
    el.setAttribute('lang-ui', 'en');
    el.content = PSI;
    document.body.append(el);
    el.render();
    const root = el.root;
    expect([...root.querySelectorAll('.lh-score')].map((s) => s.textContent)).toEqual(['62', '88', '96', '100']); // prettier-ignore
    expect(root.querySelector('[data-category="performance"] .sr-only')?.textContent).toBe('Performance: 62 out of 100, needs improvement'); // prettier-ignore
    expect(root.querySelector('.lh-field-metric[data-metric="CLS"] .lh-metric-value')?.textContent).toBe('0.31'); // prettier-ignore
    expect(root.querySelectorAll('.lh-opps .lh-audit')).toHaveLength(2);
    /** @type {HTMLButtonElement} */ (root.querySelector('[data-tab="accessibility"]')).click();
    expect(el.root.querySelector('.lh-failed [data-audit="color-contrast"]')).not.toBeNull();
    expect(el.root.querySelector('.lh-audit code')?.textContent).toBe('<a class="muted">Terms</a>');
    /** @type {HTMLElement | null} */ (document.activeElement)?.blur();
    el.remove();
  });
});
