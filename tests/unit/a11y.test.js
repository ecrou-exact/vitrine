import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { byImpact, fixes, parseA11y, wcag } from '../../src/components/a11y/a11y.js';
import { VtA11y, toCsv } from '../../src/components/a11y/vt-a11y.js';

const AXE = readFileSync(join(import.meta.dirname, 'fixtures', 'web', 'axe.json'), 'utf8');

const results = (text = AXE) => {
  const r = parseA11y(text);
  if (!r.ok) throw new Error(r.error);
  return r.results;
};

describe('parseA11y', () => {
  it('reads axe results, most severe first', () => {
    const r = results();
    expect(r).toMatchObject({ engine: 'axe-core 4.10.2', pages: ['https://shop.example/checkout'], passes: 3, inapplicable: 1 }); // prettier-ignore
    expect(r.violations.map((v) => [v.id, v.impact, v.criteria, v.level, v.total])).toEqual([
      ['label', 'critical', ['4.1.2', '1.3.1'], 'A', 1],
      ['color-contrast', 'serious', ['1.4.3'], 'AA', 2],
      ['region', 'moderate', [], '', 1],
    ]);
    // Shadow DOM paths join with >>>; unsafe help links are dropped.
    expect(r.violations[0].nodes[0].target).toBe('#payment-frame >>> input[name="zip"]');
    expect(r.violations[2].helpUrl).toBeNull();
    expect(r.incomplete).toHaveLength(1);
    expect(byImpact(r.violations).serious).toEqual({ rules: 1, nodes: 2 });
  });

  it('reads several pages and Pa11y', () => {
    const two = JSON.parse(AXE);
    const many = results(JSON.stringify([two, { ...two, url: 'https://shop.example/cart' }]));
    expect(many.pages).toHaveLength(2);
    expect(many.violations).toHaveLength(6);
    const pa11y = results(JSON.stringify({ pageUrl: 'https://a.example/', issues: [{ code: 'WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.Fail', type: 'error', message: 'Low contrast', selector: 'p', context: '<p>x</p>' }, { code: 'x', type: 'notice' }] })); // prettier-ignore
    expect(pa11y.violations.map((v) => [v.criteria, v.level, v.total])).toEqual([[['1.4.3'], 'AA', 1]]); // prettier-ignore
  });

  it('reads tags and fixes', () => {
    expect(wcag(['wcag21aa', 'wcag1410', 'wcag2a'])).toEqual({ criteria: ['1.4.10'], level: 'A' });
    expect(fixes('Fix all of the following:\n  a\n  b\n\nFix any of the following:\n  c')).toEqual([
      { title: 'Fix all of the following:', items: ['a', 'b'] },
      { title: 'Fix any of the following:', items: ['c'] },
    ]);
    expect(parseA11y('{"a":1}')).toEqual({ ok: false, error: 'format' });
  });

  it('writes CSV without formulas', () => {
    const r = results();
    r.violations[0].nodes[0].target = '=cmd';
    expect(toCsv(r.violations).split('\n')[1]).toContain(`"'=cmd"`);
  });
});

describe('<vt-a11y>', () => {
  if (!customElements.get('vt-a11y')) customElements.define('vt-a11y', VtA11y);

  it('shows violations, filters them and the checks to review', () => {
    const el = /** @type {VtA11y} */ (document.createElement('vt-a11y'));
    el.setAttribute('variant', 'full');
    el.setAttribute('lang-ui', 'en');
    el.content = AXE;
    document.body.append(el);
    el.render();
    const root = el.root;
    expect([...root.querySelectorAll('.a11y-rule')].map((r) => r.getAttribute('data-rule'))).toEqual(['label', 'color-contrast', 'region']); // prettier-ignore
    expect(root.querySelector('[data-rule="label"] .a11y-fix li')?.textContent).toBe('Form element does not have an implicit (wrapped) <label>'); // prettier-ignore
    expect(root.querySelector('[data-rule="label"] .a11y-html code')?.textContent).toBe('<input type="text" name="zip">'); // prettier-ignore
    expect(root.querySelector('[data-rule="region"] a')).toBeNull();
    /** @type {HTMLButtonElement} */ (
      root.querySelector('[data-focus-key="filter-serious"]')
    ).click();
    expect(el.root.querySelectorAll('.a11y-rule')).toHaveLength(1);
    /** @type {HTMLButtonElement} */ (el.root.querySelector('[data-tab="review"]')).click();
    expect(el.root.querySelector('.a11y-rule')?.getAttribute('data-rule')).toBe('color-contrast');
    /** @type {HTMLElement | null} */ (document.activeElement)?.blur();
    el.remove();
  });
});
