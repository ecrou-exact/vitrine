// @ts-check
import { afterEach, describe, expect, it } from 'vitest';
import {
  drawIcon,
  iconSvg,
  readIconSet,
  registerIconSet,
  searchIcons,
} from '../../src/components/icon-picker/icons.js';
import { VtIconPicker } from '../../src/components/icon-picker/vt-icon-picker.js';
import { parseSvg } from '../../scripts/icon-sets.js';

if (!customElements.get('vt-icon-picker')) customElements.define('vt-icon-picker', VtIconPicker);

const SET = {
  id: 'test',
  label: 'Test icons',
  license: 'MIT',
  licenseUrl: 'https://example.com/license',
  code: 'ti ti-{name}',
  viewBox: '0 0 24 24',
  attrs: { fill: 'currentColor', onload: 'alert(1)' },
  icons: [
    ['house', 'M3 10l9-7 9 7v10H3z', 'home building'],
    ['heart', 'M12 21l-8-8a5 5 0 0 1 8-6 5 5 0 0 1 8 6z', 'love like favorite'],
    ['user', [['circle', { cx: 12, cy: 8, r: 4 }], ['path', { d: 'M4 21a8 8 0 0 1 16 0' }]], 'person account profile'], // prettier-ignore
    ['bad', [['script', {}, 'alert(1)'], ['path', { d: 'M0 0', onclick: 'x', style: 'fill:red' }], ['use', { href: 'https://evil.example/x.svg#a' }], ['rect', { fill: 'url(javascript:alert(1))', width: 2 }]]], // prettier-ignore
    ['wide', 'M0 0h48v24H0z', 'rectangle', '0 0 48 24'],
  ],
};

registerIconSet(SET);

/**
 * @param {Record<string, string>} attributes
 * @returns {Promise<VtIconPicker>}
 */
async function mount(attributes) {
  const el = /** @type {VtIconPicker} */ (document.createElement('vt-icon-picker'));
  for (const [name, value] of Object.entries({ 'lang-ui': 'en', sets: 'test', ...attributes })) el.setAttribute(name, value); // prettier-ignore
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe('icon sets', () => {
  it('reads a set and keeps only safe attributes', () => {
    const set = readIconSet(SET);
    expect(set.attrs).toEqual({ fill: 'currentColor' });
    expect(set.icons).toHaveLength(5);
    expect(() => readIconSet({ id: 'no spaces allowed' })).toThrow();
  });

  it('searches names first, then keywords, every word', () => {
    const set = readIconSet(SET);
    expect(searchIcons(set, 'h').map((i) => i.name)).toEqual(['house', 'heart']);
    expect(searchIcons(set, 'love').map((i) => i.name)).toEqual(['heart']);
    expect(searchIcons(set, 'person profile').map((i) => i.name)).toEqual(['user']);
    expect(searchIcons(set, 'person house')).toEqual([]);
    expect(searchIcons(set, '')).toHaveLength(5);
  });

  it('draws icons with allowed elements and attributes only', () => {
    const set = readIconSet(SET);
    const bad = drawIcon(set, /** @type {any} */ (set.byName.get('bad')));
    expect(bad.querySelector('script')).toBeNull();
    expect(bad.querySelector('path')?.getAttribute('onclick')).toBeNull();
    expect(bad.querySelector('path')?.getAttribute('style')).toBeNull();
    expect(bad.querySelector('use')?.getAttribute('href')).toBeNull();
    expect(bad.querySelector('rect')?.getAttribute('fill')).toBeNull();
    expect(bad.getAttribute('aria-hidden')).toBe('true');
    expect(drawIcon(set, /** @type {any} */ (set.byName.get('wide'))).getAttribute('viewBox')).toBe('0 0 48 24'); // prettier-ignore
  });

  it('writes the SVG of an icon, escaped', () => {
    const set = readIconSet(SET);
    expect(iconSvg(set, /** @type {any} */ (set.byName.get('user')))).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>', // prettier-ignore
    );
    expect(iconSvg(set, /** @type {any} */ (set.byName.get('bad')))).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M0 0"/><use/><rect width="2"/></svg>'); // prettier-ignore
  });

  it('keeps the attribution of a set in the SVG copied, as a comment that cannot close early', () => {
    const set = readIconSet({ ...SET, attribution: 'Icons by X --> <script> (CC BY 4.0)' });
    expect(iconSvg(set, /** @type {any} */ (set.byName.get('house')))).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><!-- Icons by X - script (CC BY 4.0) --><path d="M3 10l9-7 9 7v10H3z"/></svg>', // prettier-ignore
    );
  });

  it('reads the SVG files of the packages at build time', () => {
    const svg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><!-- c --><path fill="#fff" d="M0 0h640"/><g transform="scale(2)"><circle r="1"/></g></svg>'); // prettier-ignore
    expect(svg.attrs.viewBox).toBe('0 0 640 480');
    expect(svg.children.map((c) => c.tag)).toEqual(['path', 'g']);
    expect(svg.children[1].children[0]).toEqual({ tag: 'circle', attrs: { r: '1' }, children: [] });
  });
});

describe('<vt-icon-picker>', () => {
  it('opens, searches, chooses, and submits set:name', async () => {
    const form = document.createElement('form');
    const el = /** @type {VtIconPicker} */ (document.createElement('vt-icon-picker'));
    el.setAttribute('sets', 'test');
    el.setAttribute('name', 'icon');
    el.setAttribute('lang-ui', 'en');
    form.append(el);
    document.body.append(form);
    await new Promise((resolve) => setTimeout(resolve, 0));
    /** @type {any[]} */
    const seen = [];
    el.addEventListener('vt-change', (e) => seen.push(/** @type {CustomEvent} */ (e).detail));
    /** @type {HTMLElement} */ (el.root.querySelector('.ip-trigger')).click();
    expect(el.root.querySelectorAll('.ip-option')).toHaveLength(5);
    const search = /** @type {HTMLInputElement} */ (el.root.querySelector('.ip-search'));
    search.value = 'love';
    search.dispatchEvent(new Event('input'));
    expect(el.root.querySelector('.ip-status')?.textContent).toBe('1 icons match');
    /** @type {HTMLElement} */ (el.root.querySelector('.ip-option')).click();
    expect(seen).toEqual([{ value: 'test:heart', set: 'test', name: 'heart' }]);
    expect(el.value).toBe('test:heart');
    expect(el.root.querySelector('.ip-panel')).toBeNull();
    expect(el.root.querySelector('.field-trigger-text')?.textContent).toBe('heart, Test icons');
    expect(el.icon).toMatchObject({ set: 'test', name: 'heart', code: 'ti ti-heart' });
  });

  it('shows recent icons and the preview, inline', async () => {
    localStorage.setItem('vitrine-icons:recent', JSON.stringify(['test:user', 'other:x']));
    const el = await mount({ inline: '', value: 'test:house' });
    expect([...el.root.querySelectorAll('.ip-recent-icon')].map((b) => b.getAttribute('aria-label'))).toEqual(['user']); // prettier-ignore
    expect(el.root.querySelector('.ip-option[aria-selected="true"]')?.getAttribute('data-name')).toBe('house'); // prettier-ignore
    expect(el.root.querySelector('.ip-code')?.textContent).toBe('ti ti-house');
  });
});
