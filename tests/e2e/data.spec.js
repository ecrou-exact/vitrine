import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, mount, recordEvents } from './helpers.js';

/**
 * <vt-pivot>, <vt-heatmap> and <vt-flame> on the strict CSP page: behavior, keyboard,
 * events and axe, with nothing refused or reported in the console.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SALES = 'region,year,sales\nNorth,2025,100\nNorth,2026,120\nSouth,2025,30\nSouth,2026,70';
const FOLDED = 'main;parse;tokenize 35\nmain;parse 10\nmain;render;paint 50\nmain;render;layout 20';

/** @param {import('@playwright/test').Page} page */
const axe = async (page) =>
  (await new AxeBuilder({ page }).include('#el').withTags(AXE_TAGS).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );

/** @param {import('@playwright/test').Page} page */
const events = (page) => page.evaluate(() => /** @type {any} */ (window).__events);

test.describe('data elements', () => {
  /** @type {string[]} */
  let errors;

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  for (const theme of ['light', 'dark']) {
    test(`<vt-pivot> pivots, changes with its lists and sends a cell (${theme})`, async ({
      page,
    }) => {
      await mount(page, 'vt-pivot', { variant: 'full', theme, columns: 'year', heat: '' }, SALES);
      await recordEvents(page, ['vt-select', 'vt-change']);
      const el = page.locator('#el');
      await expect(el.locator('tfoot')).toHaveText(/Total\s*130\s*190\s*320/);
      await el.getByRole('button', { name: /^120, North, 2026$/ }).click();
      await el.getByLabel('Aggregate').selectOption('avg');
      await expect(el.locator('tfoot')).toHaveText(/Total\s*65\s*95\s*80/);
      const recorded = await events(page);
      expect(recorded[0].detail).toMatchObject({ row: { region: 'North' }, column: { year: '2026' }, value: 120 }); // prettier-ignore
      expect(recorded[1].detail.aggregate).toBe('avg');
      expect(await axe(page)).toEqual([]);
    });

    test(`<vt-heatmap> is a grid for the keyboard (${theme})`, async ({ page }) => {
      await mount(
        page,
        'vt-heatmap',
        { variant: 'full', theme, from: '2026-01-05', to: '2026-03-01', 'first-day': '1', unit: 'commits', 'lang-ui': 'en' }, // prettier-ignore
        JSON.stringify({ '2026-01-06': 4, '2026-02-10': 9, '2026-03-01': 1 }),
      );
      await recordEvents(page, ['vt-select']);
      const el = page.locator('#el');
      const current = el.locator('[role="gridcell"][tabindex="0"]');
      await expect(current).toHaveAttribute('aria-label', 'Sunday, March 1, 2026: 1 commits');
      await current.focus();
      await page.keyboard.press('ArrowLeft');
      await expect(el.locator('[role="gridcell"][tabindex="0"]')).toHaveAttribute('aria-label', 'Sunday, February 22, 2026: no value'); // prettier-ignore
      await page.keyboard.press('Enter');
      expect((await events(page))[0].detail).toEqual({ date: '2026-02-22', value: null });
      await expect(el.locator('.hm-details')).toHaveText('Sunday, February 22, 2026: no value');
      expect(await axe(page)).toEqual([]);
    });

    test(`<vt-flame> zooms with the mouse and the keyboard (${theme})`, async ({ page }) => {
      await mount(page, 'vt-flame', { variant: 'full', theme, 'lang-ui': 'en' }, FOLDED);
      await recordEvents(page, ['vt-select']);
      const el = page.locator('#el');
      await el.locator('.fl-frame', { hasText: 'render' }).click();
      await expect(el.locator('.fl-crumbs')).toHaveText(/All\s*main\s*render/);
      expect((await events(page))[0].detail).toMatchObject({ name: 'render', total: 70 });
      await page.keyboard.press('ArrowDown');
      await expect(el.locator('.fl-frame[tabindex="0"]')).toHaveText('paint');
      await page.keyboard.press('Escape');
      await expect(el.locator('.fl-crumbs')).toHaveText(/All\s*main$/);
      await el.getByRole('tab', { name: 'Functions' }).click();
      await expect(el.locator('tbody tr').first()).toContainText('paint');
      expect(await axe(page)).toEqual([]);
    });
  }
});
