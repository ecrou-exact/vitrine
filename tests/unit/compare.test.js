// @ts-check
import { describe, expect, it } from 'vitest';
import {
  chooseKey,
  compareDatasets,
  comparisonToCsv,
  sameValue,
} from '../../src/components/compare/compare.js';
import { VtCompare } from '../../src/components/compare/vt-compare.js';
import { readDataset } from '../../src/components/pivot/pivot.js';

if (!customElements.get('vt-compare')) customElements.define('vt-compare', VtCompare);

const BEFORE = 'id,name,price\n1,Pen,1.50\n2,Book,12\n3,Lamp,30';
const AFTER = 'id,name,price,stock\n1,Pen,1.5,10\n3,Lamp,35,2\n4,Mug,8,40';

/**
 * @param {Record<string, string>} attributes
 * @param {string} original
 * @param {string} modified
 * @returns {Promise<VtCompare>}
 */
async function mount(attributes, original, modified) {
  const el = /** @type {VtCompare} */ (document.createElement('vt-compare'));
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  el.original = original;
  el.modified = modified;
  document.body.replaceChildren(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

describe('compareDatasets', () => {
  it('pairs rows by key and sorts them out', () => {
    const c = compareDatasets(readDataset(BEFORE), readDataset(AFTER));
    expect(c.key).toEqual(['id']);
    expect(c.addedFields).toEqual(['stock']);
    expect(c.rows.map((r) => [r.status, r.key[0], r.changed])).toEqual([
      ['same', '1', []],
      ['removed', '2', []],
      ['changed', '3', ['price']],
      ['added', '4', []],
    ]);
    expect(c.counts).toEqual({ added: 1, removed: 1, changed: 1, same: 1 });
  });

  it('chooses a key, or pairs by position', () => {
    const a = readDataset('sku,qty\nA,1\nB,2');
    const b = readDataset('sku,qty\nB,3\nA,1');
    expect(chooseKey(a, b)).toEqual(['sku']);
    expect(chooseKey(readDataset('x,y\n1,a\n1,b'), readDataset('x,y\n1,a'))).toEqual([]);
    expect(chooseKey(a, b, ['qty'])).toEqual(['qty']);
    const c = compareDatasets(readDataset('x,y\n1,a\n1,b'), readDataset('x,y\n1,a\n2,b'));
    expect(c.key).toEqual([]);
    expect(c.rows.map((r) => [r.status, r.key[0]])).toEqual([
      ['same', '1'],
      ['changed', '2'],
    ]);
    const d = compareDatasets(readDataset('k,v\n1,a\n1,b'), readDataset('k,v\n1,a\n1,c'), {
      key: ['k'],
    });
    expect(d.duplicates).toBe(2);
    expect(d.rows.map((r) => r.status)).toEqual(['same', 'changed']);
  });

  it('compares numbers as numbers and missing values together', () => {
    expect(sameValue('1.50', 1.5)).toBe(true);
    expect(sameValue('', null)).toBe(true);
    expect(sameValue(' a ', 'a')).toBe(true);
    expect(sameValue('a', 'A')).toBe(false);
  });

  it('writes CSV with old and new values, formulas neutralized', () => {
    const c = compareDatasets(readDataset('id,v\n1,a\n2,=b'), readDataset('id,v\n1,c'));
    expect(comparisonToCsv(c, c.rows)).toBe("status,id,v\nchanged,1,a → c\nremoved,2,'=b");
  });
});

describe('<vt-compare>', () => {
  it('shows the changes and filters them', async () => {
    const el = await mount({ filters: '', 'lang-ui': 'en' }, BEFORE, AFTER);
    const root = /** @type {ShadowRoot} */ (el.shadowRoot);
    const rows = () => [...root.querySelectorAll('tbody tr')].map((tr) => tr.className);
    expect(rows()).toEqual(['cmp-removed', 'cmp-changed', 'cmp-added']);
    const cell = root.querySelector('td.cmp-cell-changed');
    expect(cell?.querySelector('del')?.textContent).toBe('30');
    expect(cell?.querySelector('ins')?.textContent).toBe('35');
    expect(root.querySelector('.cmp-notes')?.textContent).toContain('New columns: stock.');
    /** @type {any[]} */
    const events = [];
    el.addEventListener('vt-filter-change', (e) =>
      events.push(/** @type {CustomEvent} */ (e).detail),
    );
    /** @type {HTMLButtonElement} */ (root.querySelector('.f-all')).click();
    expect(rows()).toEqual(['cmp-same', 'cmp-removed', 'cmp-changed', 'cmp-added']);
    expect(events).toEqual([{ filter: 'all' }]);
  });

  it('reads templates and data', async () => {
    const el = /** @type {VtCompare} */ (document.createElement('vt-compare'));
    const a = document.createElement('template');
    a.setAttribute('data-original', '');
    a.content.append('id,v\n1,a');
    const b = document.createElement('template');
    b.setAttribute('data-modified', '');
    b.content.append('id,v\n1,b');
    el.append(a, b);
    document.body.replaceChildren(el);
    await new Promise((resolve) => setTimeout(resolve, 0));
    el.render();
    expect(el.comparison?.counts.changed).toBe(1);
    el.data = {
      before: [{ k: 1, v: 1 }],
      after: [
        { k: 1, v: 1 },
        { k: 2, v: 2 },
      ],
      key: 'k',
    };
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(el.comparison?.key).toEqual(['k']);
    expect(el.comparison?.counts.added).toBe(1);
  });

  it('asks for both datasets', async () => {
    const el = await mount({}, 'id\n1', '');
    expect(el.shadowRoot?.textContent).toContain('give the two datasets');
  });
});
