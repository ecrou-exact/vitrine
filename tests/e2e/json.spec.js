import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, events, mount, recordEvents } from './helpers.js';

const BIG_ID = '12345678901234567890';
// Written as text on purpose: a JS number literal would already have lost precision.
const DOC = `{
  "users": [
    { "id": 1, "name": "Ada", "admin": true, "tags": ["math"] },
    { "id": ${BIG_ID}, "name": "Alan", "admin": false, "manager": null }
  ],
  "meta": { "weird key": "x", "nested": { "deep": { "deeper": "needle" } } }
}`;

test.describe('<vt-json>', () => {
  /** @type {string[]} */
  let errors;

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });

  test.afterEach(() => expect(errors).toEqual([]));

  test('simple variant shows pretty-printed JSON with exact numbers', async ({ page }) => {
    const result = await mount(page, 'vt-json', {}, `{"id": ${BIG_ID}, "ok": true}`);
    expect(result.event).toBe('vt-ready');
    await expect(page.locator('#el pre.code')).toHaveText(`{\n  "id": ${BIG_ID},\n  "ok": true\n}`);
  });

  test('indent and sort-keys shape the raw view', async ({ page }) => {
    await mount(page, 'vt-json', { indent: '4', 'sort-keys': '' }, '{"b":1,"a":[2]}');
    await expect(page.locator('#el pre.code')).toHaveText(
      '{\n    "a": [\n        2\n    ],\n    "b": 1\n}',
    );
    await mount(page, 'vt-json', { indent: '0' }, '{"b":1,"a":[2]}');
    await expect(page.locator('#el pre.code')).toHaveText('{"b":1,"a":[2]}');
  });

  test('full variant shows a tree expanded to the configured depth', async ({ page }) => {
    await mount(page, 'vt-json', { variant: 'full' }, DOC);
    const tree = page.locator('#el [role="tree"]');
    await expect(tree).toBeVisible();
    // depth 2: root and its children are expanded.
    await expect(tree.locator('[role="treeitem"][aria-level="2"]')).toHaveCount(2);
    await expect(tree.locator('[role="treeitem"][aria-level="3"]')).toHaveCount(4);
    await expect(tree.locator('[role="treeitem"][aria-level="4"]')).toHaveCount(0);
    await expect(tree.locator('[part="count"]').first()).toHaveText('2 keys');
    await mount(page, 'vt-json', { variant: 'full', depth: '0' }, DOC);
    await expect(page.locator('#el [role="treeitem"]')).toHaveCount(1);
    await expect(page.locator('#el [role="treeitem"]')).toHaveAttribute('aria-expanded', 'false');
  });

  test('keyboard navigation follows the WAI-ARIA tree pattern', async ({ page }) => {
    await mount(page, 'vt-json', { variant: 'full', depth: '1' }, DOC);
    const tree = page.locator('#el [role="tree"]');
    const root = tree.locator('[role="treeitem"]').first();
    await root.focus();
    await page.keyboard.press('ArrowDown');
    const users = tree.locator('[role="treeitem"][aria-level="2"]').first();
    await expect(users).toBeFocused();
    await expect(users).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowRight');
    await expect(tree.locator('[role="treeitem"][aria-level="2"]').first()).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await page.keyboard.press('ArrowRight');
    await expect(tree.locator('[role="treeitem"][aria-level="3"]').first()).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(tree.locator('[role="treeitem"][aria-level="2"]').first()).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(tree.locator('[role="treeitem"][aria-level="2"]').first()).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await page.keyboard.press('End');
    await expect(tree.locator('[role="treeitem"]').last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(root).toBeFocused();
    // Only one item is in the tab order (roving tabindex).
    await expect(tree.locator('[tabindex="0"]')).toHaveCount(1);
  });

  test('path bar shows and copies the JSONPath of the selection', async ({
    page,
    browserName,
    context,
  }) => {
    test.skip(browserName === 'webkit', 'Clipboard permissions are not grantable in WebKit.');
    if (browserName === 'chromium')
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await mount(page, 'vt-json', { variant: 'full', depth: '3' }, DOC);
    await recordEvents(page, ['vt-copy']);
    const el = page.locator('#el');
    await el.locator('[part="key"]', { hasText: 'weird key' }).click();
    await expect(el.locator('.path-text')).toHaveText('$.meta["weird key"]');
    await el.getByRole('button', { name: 'Copy path' }).click();
    await el.getByRole('button', { name: 'Copy value' }).click();
    await expect
      .poll(() => events(page))
      .toEqual([
        { type: 'vt-copy', detail: { text: '$.meta["weird key"]' } },
        { type: 'vt-copy', detail: { text: 'x' } },
      ]);
  });

  test('search finds keys and values inside collapsed nodes', async ({ page }) => {
    await mount(page, 'vt-json', { variant: 'full', depth: '1' }, DOC);
    const el = page.locator('#el');
    await el.getByRole('button', { name: 'Search' }).click();
    await el.getByRole('searchbox').fill('needle');
    await expect(el.locator('[part="search-count"]')).toHaveText('1 / 1');
    await expect(el.locator('mark.current')).toHaveText('needle');
    await expect(el.locator('.path-text')).toHaveText('$.meta.nested.deep.deeper');
    await el.getByRole('searchbox').fill('name');
    await expect(el.locator('[part="search-count"]')).toHaveText('1 / 2');
  });

  test('large arrays are paginated', async ({ page }) => {
    await mount(
      page,
      'vt-json',
      { variant: 'full' },
      JSON.stringify({ list: Array.from({ length: 250 }, (_, i) => i) }),
    );
    const el = page.locator('#el');
    await expect(el.locator('[role="treeitem"][aria-level="3"]:not([data-action])')).toHaveCount(
      100,
    );
    await el.locator('[part="more-item"]').click();
    await expect(el.locator('[role="treeitem"][aria-level="3"]:not([data-action])')).toHaveCount(
      200,
    );
    await el.locator('[part="more-item"]').click();
    await expect(el.locator('[role="treeitem"][aria-level="3"]:not([data-action])')).toHaveCount(
      250,
    );
    await expect(el.locator('[part="more-item"]')).toHaveCount(0);
  });

  test('expand all is bounded on huge documents', async ({ page }) => {
    // 100 visible objects × 80-item arrays = 8,000 rows: more than the 5,000 rows budget.
    const huge = JSON.stringify(
      Array.from({ length: 3000 }, (_, i) => ({
        id: i,
        list: Array.from({ length: 80 }, (_, j) => j),
      })),
    );
    await mount(page, 'vt-json', { variant: 'full', depth: '1' }, huge);
    const el = page.locator('#el');
    await el.getByRole('button', { name: 'Expand all' }).click();
    const rows = await el.locator('[role="treeitem"]').count();
    expect(rows).toBeGreaterThan(100);
    expect(rows).toBeLessThan(6000);
    await expect(el.locator('[aria-live]')).toHaveText('Partially expanded: too many nodes.');
    await el.getByRole('button', { name: 'Collapse all' }).click();
    // Root + first page of 100 children + the "Show 100 more" row.
    await expect(el.locator('[role="treeitem"]')).toHaveCount(102);
  });

  test('long strings are truncated with an explicit action', async ({ page }) => {
    await mount(
      page,
      'vt-json',
      { variant: 'full' },
      JSON.stringify({ long: 'x'.repeat(100_000) }),
    );
    const el = page.locator('#el');
    const value = el.locator('[part="value"]');
    expect((await value.textContent()).length).toBeLessThan(600);
    await el.getByRole('button', { name: /Show full string \(100,000 characters\)/ }).click();
    expect((await el.locator('[part="value"]').textContent()).length).toBe(100_002);
  });

  test('Tree / Raw tabs', async ({ page }) => {
    await mount(page, 'vt-json', { variant: 'full' }, DOC);
    await recordEvents(page, ['vt-tab-change']);
    const el = page.locator('#el');
    await el.getByRole('tab', { name: 'Raw' }).click();
    await expect(el.locator('pre.code')).toContainText(BIG_ID);
    expect(await events(page)).toEqual([{ type: 'vt-tab-change', detail: { tab: 'raw' } }]);
  });

  test('invalid JSON: error with position and highlighted line', async ({ page }) => {
    const result = await mount(
      page,
      'vt-json',
      { variant: 'full' },
      '{\n  "a": 1,\n  "b": [1, 2,],\n}',
    );
    expect(result.event).toBe('vt-error');
    expect(result.detail).toBe('Invalid JSON at line 3, column 13: Trailing comma.');
    const el = page.locator('#el');
    await expect(el.locator('[part="error"]')).toContainText('line 3, column 13');
    await expect(el.locator('.line.highlighted')).toHaveAttribute('data-line', '3');
  });

  test('invalid JSON with on-invalid="raw" shows the text and a notice', async ({ page }) => {
    await mount(page, 'vt-json', { 'on-invalid': 'raw' }, '{oops}');
    const el = page.locator('#el');
    await expect(el.locator('[part="notice"]')).toHaveText(
      'Invalid JSON at line 1, column 2 — showing raw text.',
    );
    await expect(el.locator('[part="error"]')).toHaveCount(0);
    await expect(el.locator('pre.code')).toHaveText('{oops}');
  });

  test('extreme nesting is rejected quickly', async ({ page }) => {
    const start = Date.now();
    await mount(page, 'vt-json', {}, '['.repeat(500_000) + ']'.repeat(500_000));
    expect(Date.now() - start).toBeLessThan(5000);
    await expect(page.locator('#el [part="error"]')).toContainText(
      'Nesting is too deep (limit 512).',
    );
  });

  test('data property accepts values and reports unserializable ones', async ({ page }) => {
    await page.evaluate(() => {
      const el = document.createElement('vt-json');
      el.id = 'el';
      document.getElementById('root').append(el);
      el.data = { a: [1, 2], b: 'x' };
    });
    await expect(page.locator('#el pre.code')).toContainText('"b": "x"');
    await page.evaluate(() => {
      const value = { self: null };
      value.self = value;
      document.getElementById('el').data = value;
    });
    await expect(page.locator('#el [part="error"]')).toContainText('cannot be converted to JSON');
  });
});
