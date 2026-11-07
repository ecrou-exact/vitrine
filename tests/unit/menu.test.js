import { describe, expect, it } from 'vitest';
import {
  MAX_ITEMS,
  findItem,
  focusable,
  parseItems,
  placeMenu,
} from '../../src/components/menu/items.js';
import { VtMenu } from '../../src/components/menu/vt-menu.js';

describe('<vt-menu> items', () => {
  it('reads JSON: strings, separators, submenus, links and unique ids', () => {
    const items = parseItems(
      JSON.stringify([
        'Copy',
        'Copy',
        '---',
        '---',
        { label: 'Share', items: ['Link', { label: 'Email', href: '/mail' }] },
        { label: 'Delete', danger: true, shortcut: 'Del', icon: 'trash' },
        '---',
      ]),
    );
    expect(items.map((i) => i.type)).toEqual(['item', 'item', 'separator', 'item', 'item']);
    expect(items[0].id).toBe('copy');
    expect(items[1].id).toBe('copy-2');
    expect(items[3].items.map((i) => i.label)).toEqual(['Link', 'Email']);
    expect(items[3].items[1].href).toBe('/mail');
    expect(items[4]).toMatchObject({ danger: true, shortcut: 'Del', icon: 'trash' });
    expect(findItem(items, 'email')?.label).toBe('Email');
  });

  it('reads radio groups and check boxes', () => {
    const items = parseItems([
      { type: 'radio', label: 'Sort by', group: 'sort', items: [{ label: 'Name', checked: true }, 'Date'] }, // prettier-ignore
      { type: 'checkbox', label: 'Wrap lines', checked: true },
    ]);
    expect(items.map((i) => [i.type, i.label, i.group, i.checked])).toEqual([
      ['heading', 'Sort by', '', false],
      ['radio', 'Name', 'sort', true],
      ['radio', 'Date', 'sort', false],
      ['checkbox', 'Wrap lines', '', true],
    ]);
    expect(focusable(items)).toHaveLength(3);
  });

  it('reads lines of text', () => {
    const items = parseItems('# File\nNew | Ctrl+N\nOpen recent\n  a.txt\n  b.txt\n---\n[x] Autosave\n[ ] Spell check'); // prettier-ignore
    expect(items.map((i) => i.type)).toEqual(['heading', 'item', 'item', 'separator', 'checkbox', 'checkbox']); // prettier-ignore
    expect(items[1].shortcut).toBe('Ctrl+N');
    expect(items[2].items.map((i) => i.label)).toEqual(['a.txt', 'b.txt']);
    expect(items[4].checked).toBe(true);
    expect(items[5].checked).toBe(false);
  });

  it('limits size and depth, and skips what it cannot read', () => {
    expect(parseItems(Array.from({ length: 2000 }, (_, i) => `Item ${i}`))).toHaveLength(MAX_ITEMS);
    let deep = /** @type {any} */ ({ label: 'x' });
    for (let i = 0; i < 20; i += 1) deep = { label: `l${i}`, items: [deep] };
    let level = parseItems([deep])[0];
    let depth = 1;
    while (level.items.length) {
      level = level.items[0];
      depth += 1;
    }
    expect(depth).toBe(4);
    expect(parseItems([null, 3, {}, { label: '' }, ['x']])).toEqual([
      expect.objectContaining({ label: '3' }),
    ]);
    expect(parseItems('{"items":["A"]}')[0].label).toBe('A');
    expect(parseItems('{ not json')[0].label).toBe('{ not json');
  });

  it('places menus inside the window', () => {
    const view = { width: 400, height: 300 };
    const menu = { width: 200, height: 150 };
    expect(placeMenu({ left: 10, top: 10, right: 90, bottom: 40 }, menu, view)).toEqual({ left: 10, top: 44 }); // prettier-ignore
    // No room below: above the button.
    expect(placeMenu({ left: 10, top: 250, right: 90, bottom: 280 }, menu, view).top).toBe(96);
    // No room on the right: pushed back in.
    expect(placeMenu({ left: 350, top: 10, right: 390, bottom: 40 }, menu, view).left).toBe(192);
    expect(placeMenu({ left: 10, top: 10, right: 90, bottom: 40 }, menu, view, { align: 'end' }).left).toBe(8); // prettier-ignore
    // A submenu without room on the right opens on the left.
    expect(placeMenu({ left: 250, top: 50, right: 390, bottom: 80 }, menu, view, { side: 'right' }).left).toBe(46); // prettier-ignore
  });

  it('reads JSON settings', () => {
    const result = VtMenu.fromData({ label: 'More', trigger: 'icon', items: ['A'] });
    expect(result.attributes).toEqual({ label: 'More', trigger: 'icon' });
    expect(JSON.parse(String(result.content))).toEqual(['A']);
  });
});
