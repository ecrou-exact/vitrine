import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, mount } from './helpers.js';

const ITEMS = JSON.stringify([
  { label: 'Rename', shortcut: 'F2' },
  { label: 'Share', items: ['Copy link', { label: 'Email', id: 'mail' }] },
  '---',
  { type: 'radio', label: 'Sort by', group: 'sort', items: [{ label: 'Name', checked: true }, 'Date'] }, // prettier-ignore
  { type: 'checkbox', label: 'Show hidden' },
  { label: 'Archived', disabled: true },
  { label: 'Delete', danger: true },
]);

/** @param {import('@playwright/test').Page} page */
const focused = (page) =>
  page.evaluate(() => document.getElementById('el')?.shadowRoot?.activeElement?.textContent ?? '');

/** @param {import('@playwright/test').Page} page */
async function record(page) {
  await page.evaluate(() => {
    /** @type {any} */ (window).__events = [];
    for (const type of ['vt-select', 'vt-toggle'])
      document.getElementById('el')?.addEventListener(type, (event) => {
        /** @type {any} */ (window).__events.push([
          type,
          /** @type {CustomEvent} */ (event).detail,
        ]);
      });
  });
}

test.describe('<vt-menu>', () => {
  /** @type {string[]} */
  let errors;

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('opens from its button and works with the keyboard', async ({ page }) => {
    await mount(page, 'vt-menu', { 'lang-ui': 'en', label: 'File' }, ITEMS);
    await record(page);
    const el = page.locator('#el');
    const button = el.getByRole('button', { name: 'File' });
    await button.focus();
    await page.keyboard.press('ArrowDown');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(el.getByRole('menu', { name: 'File' })).toBeVisible();
    expect(await focused(page)).toContain('Rename');
    await page.keyboard.press('ArrowUp');
    expect(await focused(page)).toBe('Delete');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await expect(el.getByRole('menu', { name: 'Share' })).toBeVisible();
    expect(await focused(page)).toBe('Copy link');
    await page.keyboard.press('ArrowLeft');
    await expect(el.getByRole('menu', { name: 'Share' })).toHaveCount(0);
    expect(await focused(page)).toBe('Share');
    // Letters jump to the next item that starts with them; disabled items are skipped by none.
    await page.keyboard.press('d');
    expect(await focused(page)).toBe('Date');
    await page.keyboard.press('Enter');
    await expect(el.getByRole('menuitemradio', { name: 'Date' })).toHaveAttribute('aria-checked', 'true'); // prettier-ignore
    await expect(el.getByRole('menuitemradio', { name: 'Name' })).toHaveAttribute('aria-checked', 'false'); // prettier-ignore
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press(' ');
    await expect(el.getByRole('menuitemcheckbox', { name: 'Show hidden' })).toHaveAttribute('aria-checked', 'true'); // prettier-ignore
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(el.getByRole('menu')).toHaveCount(0);
    await expect(button).toBeFocused();
    expect(await page.evaluate(() => /** @type {any} */ (window).__events)).toEqual([
      ['vt-toggle', { expanded: true }],
      ['vt-select', { id: 'date', label: 'Date', value: 'date', checked: true, href: null }],
      ['vt-select', { id: 'show-hidden', label: 'Show hidden', value: 'show-hidden', checked: true, href: null }], // prettier-ignore
      ['vt-select', { id: 'delete', label: 'Delete', value: 'delete', checked: null, href: null }],
      ['vt-toggle', { expanded: false }],
    ]);
  });

  test('a click outside, Tab and Escape close it', async ({ page }) => {
    await mount(page, 'vt-menu', { 'lang-ui': 'en', label: 'File' }, ITEMS);
    const el = page.locator('#el');
    await el.getByRole('button', { name: 'File' }).click();
    await expect(el.getByRole('menu')).toBeVisible();
    await page.mouse.click(600, 500);
    await expect(el.getByRole('menu')).toHaveCount(0);
    await el.getByRole('button', { name: 'File' }).click();
    await el.getByRole('menuitem', { name: 'Share' }).hover();
    await expect(el.getByRole('menu', { name: 'Share' })).toBeVisible();
    await el.getByRole('menuitem', { name: 'Email' }).click();
    await expect(el.getByRole('menu')).toHaveCount(0);
    await el.getByRole('button', { name: 'File' }).click();
    await page.keyboard.press('Escape');
    await expect(el.getByRole('menu')).toHaveCount(0);
    await expect(el.getByRole('button', { name: 'File' })).toBeFocused();
  });

  test('a canceled choice does not follow its link', async ({ page }) => {
    await mount(
      page,
      'vt-menu',
      { 'lang-ui': 'en', trigger: 'icon', label: 'Row actions' },
      JSON.stringify([{ label: 'Open', href: '#opened' }, { label: 'Unsafe', href: 'javascript:alert(1)' }]), // prettier-ignore
    );
    const el = page.locator('#el');
    await page.evaluate(() =>
      document.getElementById('el')?.addEventListener('vt-select', (e) => e.preventDefault()),
    );
    await el.getByRole('button', { name: 'Row actions' }).click();
    await expect(el.getByRole('menuitem', { name: 'Unsafe' })).not.toHaveAttribute('href');
    await el.getByRole('menuitem', { name: 'Open' }).click();
    expect(await page.evaluate(() => location.hash)).toBe('');
  });

  test('a context menu opens on a right click and on Shift+F10, then gives the focus back', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.id = 'box';
      box.tabIndex = 0;
      box.textContent = 'Right click here';
      box.style.cssText = 'width:300px;height:120px';
      const menu = document.createElement('vt-menu');
      menu.id = 'el';
      menu.setAttribute('trigger', 'context');
      menu.setAttribute('lang-ui', 'en');
      menu.setAttribute('label', 'File actions');
      /** @type {any} */ (menu).data = ['Cut', 'Copy', 'Paste'];
      box.append(menu);
      document.getElementById('root')?.replaceChildren(box);
    });
    const el = page.locator('#el');
    await page.locator('#box').click({ button: 'right', position: { x: 40, y: 30 } });
    const menu = el.getByRole('menu', { name: 'File actions' });
    await expect(menu).toBeVisible();
    // The menu opens where the pointer was.
    const area = await page.locator('#box').boundingBox();
    const box = await menu.boundingBox();
    expect(Math.abs((box?.x ?? 0) - ((area?.x ?? 0) + 40))).toBeLessThan(2);
    expect(Math.abs((box?.y ?? 0) - ((area?.y ?? 0) + 34))).toBeLessThan(2);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await page.locator('#box').focus();
    await page.keyboard.press('Shift+F10');
    await expect(menu).toBeVisible();
    expect(await focused(page)).toBe('Cut');
    await page.keyboard.press('Escape');
    await expect(page.locator('#box')).toBeFocused();
  });

  test('an inline list of actions keeps one item in the tab order', async ({ page }) => {
    await mount(page, 'vt-menu', { 'lang-ui': 'en', trigger: 'inline', label: 'Tools' }, 'Cut\nCopy\nPaste'); // prettier-ignore
    const el = page.locator('#el');
    await expect(el.getByRole('menu', { name: 'Tools' })).toBeVisible();
    await expect(el.locator('[tabindex="0"]')).toHaveCount(1);
    await el.getByRole('menuitem', { name: 'Cut' }).focus();
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('Copy');
    await expect(el.getByRole('menuitem', { name: 'Copy' })).toHaveAttribute('tabindex', '0');
  });

  for (const theme of ['light', 'dark']) {
    test(`an open menu and submenu are accessible, ${theme} theme`, async ({ page }) => {
      await mount(page, 'vt-menu', { 'lang-ui': 'en', label: 'File', theme }, ITEMS);
      await page.locator('#el').getByRole('button', { name: 'File' }).click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#el').getByRole('menu', { name: 'Share' })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .include('#el')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([]);
    });
  }
});
