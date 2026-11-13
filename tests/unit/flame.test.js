// @ts-check
import { describe, expect, it } from 'vitest';
import {
  FlameError,
  parseProfile,
  pathOf,
  toFolded,
  topFunctions,
} from '../../src/components/flame/flame.js';
import { VtFlame } from '../../src/components/flame/vt-flame.js';

if (!customElements.get('vt-flame')) customElements.define('vt-flame', VtFlame);

const FOLDED = `main;parse;tokenize 30
main;parse 10
main;render;paint 50
main;render;layout 20
# a comment
main;parse;tokenize 5`;

/**
 * @param {Record<string, string>} attributes
 * @param {string} content
 * @returns {Promise<VtFlame>}
 */
async function mount(attributes, content) {
  const el = /** @type {VtFlame} */ (document.createElement('vt-flame'));
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  el.content = content;
  document.body.replaceChildren(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

/** @param {import('../../src/components/flame/flame.js').Frame} f @returns {any} */
const shape = (f) => [f.name, f.self, f.total, f.children.map(shape)];

describe('parseProfile', () => {
  it('reads folded stacks, merging the same stacks', () => {
    const { root, unit, format } = parseProfile(FOLDED);
    expect([unit, format]).toEqual(['samples', 'folded']);
    expect(shape(root)).toEqual([
      'all', 0, 115,
      [['main', 0, 115, [
        ['parse', 10, 45, [['tokenize', 35, 35, []]]],
        ['render', 0, 70, [['layout', 20, 20, []], ['paint', 50, 50, []]]],
      ]]],
    ]); // prettier-ignore
  });

  it('reads a CPU profile, in milliseconds when it has the times of its samples', () => {
    const profile = {
      nodes: [
        { id: 1, callFrame: { functionName: '(root)', url: '' }, children: [2] },
        { id: 2, callFrame: { functionName: 'main', url: 'app.js', lineNumber: 9 }, children: [3, 4] }, // prettier-ignore
        { id: 3, callFrame: { functionName: 'work', url: 'app.js', lineNumber: 19 }, hitCount: 3 },
        { id: 4, callFrame: { functionName: '', url: '' }, hitCount: 1 },
      ],
      samples: [3, 3, 4, 3],
      timeDeltas: [0, 1000, 2000, 500],
    };
    const timed = parseProfile(JSON.stringify(profile));
    expect(timed.unit).toBe('ms');
    expect(shape(timed.root)).toEqual(['all', 0, 3.5, [['main', 0, 3.5, [['(anonymous)', 0.5, 0.5, []], ['work', 3, 3, []]]]]]); // prettier-ignore
    expect(timed.root.children[0].children[1].file).toBe('app.js:20');
    const counted = parseProfile(JSON.stringify({ nodes: profile.nodes }));
    expect([counted.unit, counted.root.total]).toEqual(['samples', 4]);
  });

  it('reads a JSON tree whose values are totals', () => {
    const { root } = parseProfile('{"name":"root","value":10,"children":[{"name":"a","value":6,"children":[{"name":"b","value":4}]}]}'); // prettier-ignore
    expect(shape(root)).toEqual(['root', 4, 10, [['a', 2, 6, [['b', 4, 4, []]]]]]);
  });

  it('refuses what is not a profile', () => {
    expect(() => parseProfile('')).toThrow(FlameError);
    expect(() => parseProfile('no counts here')).toThrow('format');
    expect(() => parseProfile('{"nodes":[{"id":1}]}')).toThrow('noSamples');
  });
});

describe('helpers', () => {
  it('counts a recursive function once in its total', () => {
    const { root } = parseProfile('a;b;a;b 10\na 5');
    expect(topFunctions(root)).toEqual([
      { name: 'b', file: '', self: 10, total: 10 },
      { name: 'a', file: '', self: 5, total: 15 },
    ]);
  });

  it('gives the path of a frame, and folded stacks again', () => {
    const { root } = parseProfile(FOLDED);
    const tokenize = root.children[0].children[0].children[0];
    expect(pathOf(tokenize).map((f) => f.name)).toEqual(['all', 'main', 'parse', 'tokenize']);
    expect(toFolded(root)).toBe(
      'main;parse 10\nmain;parse;tokenize 35\nmain;render;layout 20\nmain;render;paint 50',
    );
  });
});

describe('<vt-flame>', () => {
  it('draws frames as wide as their time, names as text', async () => {
    const el = await mount({}, `${FOLDED}\nmain;<img src=x onerror=alert(1)> 1`);
    expect(el.root.querySelector('img')).toBeNull();
    const frames = el.root.querySelectorAll('[role="treeitem"]');
    const render = Array.from(frames).find((f) => f.textContent === 'render');
    expect(/** @type {HTMLElement} */ (render).style.width).toBe(`${(70 / 116) * 100}%`);
  });

  it('zooms into a frame, reports it, and zooms out with Escape', async () => {
    const el = await mount({}, FOLDED);
    /** @type {any[]} */
    const events = [];
    el.addEventListener('vt-select', (e) => events.push(/** @type {CustomEvent} */ (e).detail));
    const render = /** @type {HTMLElement} */ (Array.from(el.root.querySelectorAll('.fl-frame')).find((f) => f.textContent === 'render')); // prettier-ignore
    render.click();
    expect(events[0]).toMatchObject({ name: 'render', total: 70, path: ['main', 'render'] });
    const paint = Array.from(el.root.querySelectorAll('.fl-frame')).find((f) => f.textContent === 'paint'); // prettier-ignore
    expect(/** @type {HTMLElement} */ (paint).style.width).toBe(`${(50 / 70) * 100}%`);
    expect(el.root.querySelector('.fl-crumbs')?.textContent).toBe('Allmainrender');
    const focused = /** @type {HTMLElement} */ (el.root.querySelector('.fl-frame[tabindex="0"]'));
    focused.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(el.root.querySelector('.fl-crumbs')?.textContent).toBe('Allmain');
  });

  it('lists the costliest functions', async () => {
    const el = await mount({ variant: 'full', 'default-tab': 'functions', 'lang-ui': 'en' }, FOLDED); // prettier-ignore
    const first = el.root.querySelector('tbody tr');
    expect(first?.querySelector('th')?.textContent).toBe('paint');
    expect(first?.textContent).toContain('50 samples');
  });
});
