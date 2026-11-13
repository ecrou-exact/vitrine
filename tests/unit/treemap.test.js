// @ts-check
import { describe, expect, it } from 'vitest';
import {
  TreemapError,
  parseTree,
  squarify,
  treeToCsv,
} from '../../src/components/treemap/treemap.js';
import { VtTreemap } from '../../src/components/treemap/vt-treemap.js';

if (!customElements.get('vt-treemap')) customElements.define('vt-treemap', VtTreemap);

/**
 * @param {Record<string, string>} attributes
 * @param {string} content
 * @returns {Promise<VtTreemap>}
 */
async function mount(attributes, content) {
  const el = /** @type {VtTreemap} */ (document.createElement('vt-treemap'));
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  el.content = content;
  document.body.replaceChildren(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

/** @param {import('../../src/components/treemap/treemap.js').TreeNode} n @returns {any} */
const shape = (n) => (n.children.length ? [n.name, n.total, n.children.map(shape)] : [n.name, n.total]); // prettier-ignore

describe('parseTree', () => {
  it('reads paths and sizes from CSV, largest first', () => {
    const tree = parseTree('path,size\nsrc/core/dom.js,30\nsrc/core/ui.js,50\nsrc/app.js,40\nREADME.md,5'); // prettier-ignore
    expect(tree.format).toBe('csv');
    expect(shape(tree.root)).toEqual(['', 125, [['src', 120, [['core', 80, [['ui.js', 50], ['dom.js', 30]]], ['app.js', 40]]], ['README.md', 5]]]); // prettier-ignore
  });

  it('reads a column per level', () => {
    const tree = parseTree('team,service,cost\nweb,cdn,10\nweb,api,30\ndata,db,25');
    expect(shape(tree.root)).toEqual(['', 65, [['web', 40, [['api', 30], ['cdn', 10]]], ['data', 25, [['db', 25]]]]]); // prettier-ignore
  });

  it('reads esbuild metafiles as bytes', () => {
    const meta = { inputs: {}, outputs: { 'out.js': { inputs: { 'src/a.js': { bytesInOutput: 100 }, 'node_modules/x/i.js': { bytesInOutput: 300 } } }, 'out.js.map': { inputs: {} } } }; // prettier-ignore
    const tree = parseTree(JSON.stringify(meta));
    expect(tree.format).toBe('esbuild');
    expect(tree.bytes).toBe(true);
    expect(shape(tree.root)).toEqual(['', 400, [['node_modules', 300, [['x', 300, [['i.js', 300]]]]], ['src', 100, [['a.js', 100]]]]]); // prettier-ignore
  });

  it('reads webpack stats, concatenated modules included', () => {
    const stats = { modules: [{ name: './src/a.js', size: 10 }, { name: './src/b.js + 2 modules', size: 30, modules: [{ name: './src/b.js', size: 20 }, { name: './src/c.js', size: 10 }] }] }; // prettier-ignore
    const tree = parseTree(JSON.stringify(stats));
    expect(tree.format).toBe('webpack');
    expect(shape(tree.root)).toEqual(['', 40, [['src', 40, [['b.js', 20], ['a.js', 10], ['c.js', 10]]]]]); // prettier-ignore
  });

  it('reads JSON trees: a value on a group is its total', () => {
    const tree = parseTree(JSON.stringify({ name: 'all', value: 100, children: [{ name: 'a', value: 60 }, { name: 'b', children: [{ name: 'c', value: 10 }] }] })); // prettier-ignore
    expect(tree.root.total).toBe(100);
    expect(tree.root.self).toBe(30);
    expect(shape(tree.root)).toEqual([
      '',
      100,
      [
        ['a', 60],
        ['b', 10, [['c', 10]]],
      ],
    ]);
  });

  it('reads du: directories hold their content', () => {
    const tree = parseTree('12\t./src/a.js\n8\t./src/b.js\n24\t./src\n4\t./README.md\n30\t.');
    expect(tree.format).toBe('du');
    expect(tree.root.total).toBe(30);
    expect(tree.root.children[0]).toMatchObject({ name: 'src', total: 24, self: 4 });
    expect(parseTree('1.5K\tdocs\n2M\tdist').root.children.map((n) => n.total)).toEqual([2 * 1024 ** 2, 1536]); // prettier-ignore
  });

  it('reads lists and reports errors', () => {
    expect(parseTree('[{"path":"a/b","size":3},["a/c",2]]').root.total).toBe(5);
    expect(() => parseTree('')).toThrow(TreemapError);
    expect(() => parseTree('{nope')).toThrow(/json:/);
    expect(() => parseTree('[{"path":"a","size":0}]')).toThrow('noSizes');
    expect(() => parseTree('a,b\nx,y')).toThrow('format');
  });
});

describe('squarify', () => {
  it('fills the rectangle with areas in proportion', () => {
    const rect = { x: 0, y: 0, w: 600, h: 400 };
    const rects = squarify([6, 6, 4, 3, 2, 2, 1], rect);
    const area = rects.reduce((s, r) => s + r.w * r.h, 0);
    expect(area).toBeCloseTo(600 * 400);
    rects.forEach((r, i) => expect(r.w * r.h).toBeCloseTo(([6, 6, 4, 3, 2, 2, 1][i] / 24) * 240000)); // prettier-ignore
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(400 + 1e-9);
      expect(Math.max(r.w / r.h, r.h / r.w)).toBeLessThan(4);
    }
  });

  it('gives empty rectangles to zeros', () => {
    const [zero] = squarify([0, 5], { x: 0, y: 0, w: 10, h: 10 });
    expect(zero.w * zero.h).toBe(0);
    expect(squarify([], { x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
  });
});

describe('treeToCsv', () => {
  it('writes the own sizes with their paths, formulas neutralized', () => {
    const tree = parseTree('path,size\n=cmd/a,3\nb,2');
    expect(treeToCsv(tree.root)).toBe("path,size\n'=cmd/a,3\nb,2");
  });
});

describe('<vt-treemap>', () => {
  it('draws the children, opens a group and goes back with Escape', async () => {
    const el = await mount({}, 'path,size\nsrc/a.js,60\nsrc/b.js,20\ndocs/c.md,20');
    const items = () => [...el.shadowRoot.querySelectorAll('[role="treeitem"]')].map((n) => n.getAttribute('aria-label')); // prettier-ignore
    expect(items()).toEqual(['src, 80, 80%, 2 items', 'docs, 20, 20%, 1 items']);
    /** @type {any[]} */
    const selected = [];
    el.addEventListener('vt-select', (e) => selected.push(/** @type {CustomEvent} */ (e).detail));
    /** @type {HTMLElement} */ (el.shadowRoot.querySelector('[role="treeitem"]')).click();
    expect(items()).toEqual(['a.js, 60, 60%', 'b.js, 20, 20%']);
    expect(selected[0]).toEqual({ name: 'src', path: ['src'], size: 80, leaf: false });
    el.shadowRoot.querySelector('[role="tree"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); // prettier-ignore
    expect(items()[0]).toMatch(/^src/);
  });

  it('writes bytes and lists the items', async () => {
    const el = await mount({ unit: 'bytes', tabs: '', 'default-tab': 'list' }, 'path,size\na,1500\nb,500'); // prettier-ignore
    const cells = [...el.shadowRoot.querySelectorAll('tbody td')].map((n) => n.textContent);
    expect(cells).toEqual(['1.5 kB', '75%', '500 bytes', '25%']);
  });

  it('shows an error for data it cannot read', async () => {
    const el = await mount({}, 'nothing here');
    expect(el.shadowRoot.textContent).toContain('Expected a JSON tree');
  });
});
