import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, mount, recordEvents } from './helpers.js';

/**
 * <vt-icon-picker>, <vt-workflow> and <vt-access-log> on the strict CSP page: behavior,
 * keyboard, events and axe, with nothing refused or reported in the console.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const WORKFLOW = JSON.stringify({
  name: 'CI',
  display_title: 'Add login page',
  status: 'completed',
  conclusion: 'failure',
  head_branch: 'feat/login',
  jobs: [
    { id: 'lint', name: 'Lint', conclusion: 'success', status: 'completed', duration: 45 },
    { id: 'test', name: 'Test', conclusion: 'failure', status: 'completed', needs: ['lint'], steps: [{ name: 'Run tests', conclusion: 'failure', status: 'completed', log: '##[group]npm test\nrunning\n##[endgroup]\n##[error]Process completed with exit code 1.' }] }, // prettier-ignore
    { id: 'build', name: 'Build', conclusion: 'success', status: 'completed', needs: ['lint'], steps: [{ name: 'Compile', conclusion: 'success', status: 'completed', log: 'built in 1.2s' }] }, // prettier-ignore
    { id: 'deploy', name: 'Deploy', conclusion: 'skipped', status: 'completed', needs: ['test', 'build'] }, // prettier-ignore
  ],
});
const ACCESS = [
  '203.0.113.7 - - [15/Nov/2026:10:00:01 +0100] "GET /index.html HTTP/2.0" 200 5120 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36" 0.012', // prettier-ignore
  '198.51.100.23 - alice [15/Nov/2026:10:05:40 +0100] "POST /login HTTP/1.1" 302 0 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Version/18.1 Mobile/15E148 Safari/604.1" 0.250', // prettier-ignore
  '66.249.66.1 - - [15/Nov/2026:10:20:00 +0100] "GET /old-page HTTP/1.1" 404 153 "-" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" 0.002', // prettier-ignore
  '192.0.2.44 - - [15/Nov/2026:10:31:12 +0100] "GET /api/orders HTTP/1.1" 500 87 "-" "curl/8.10.1" 1.734', // prettier-ignore
].join('\n');

/** @param {import('@playwright/test').Page} page */
const axe = async (page) =>
  (await new AxeBuilder({ page }).include('#el').withTags(AXE_TAGS).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );

/** @param {import('@playwright/test').Page} page */
const events = (page) => page.evaluate(() => /** @type {any} */ (window).__events);

test.describe('workspace elements', () => {
  /** @type {string[]} */
  let errors;

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
    await page.evaluate(() => localStorage.clear());
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  for (const theme of ['light', 'dark']) {
    test(`<vt-icon-picker> loads Font Awesome, searches and chooses with the keyboard (${theme})`, async ({
      page,
    }) => {
      await mount(page, 'vt-icon-picker', { theme, 'lang-ui': 'en', label: 'Menu icon', name: 'icon' }); // prettier-ignore
      await recordEvents(page, ['vt-change']);
      const el = page.locator('#el');
      await el.getByRole('button', { name: 'Menu icon Choose an icon' }).click();
      await expect(el.locator('.ip-status')).toHaveText(/^[\d,]+ icons$/);
      await page.keyboard.type('house');
      await expect(el.getByRole('option', { name: 'house', exact: true })).toBeVisible();
      await page.keyboard.press('ArrowDown');
      await expect(el.locator('.ip-option').first()).toBeFocused();
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('Enter');
      expect((await events(page))[0].detail).toEqual({ value: 'fa-solid:house', set: 'fa-solid', name: 'house' }); // prettier-ignore
      await expect(el.locator('.ip-trigger')).toBeFocused();
      await expect(el.locator('.ip-preview svg path')).toHaveCount(1);
    });

    test(`<vt-icon-picker> shows every flag, inline (${theme})`, async ({ page }) => {
      await mount(page, 'vt-icon-picker', { theme, 'lang-ui': 'en', label: 'Country', sets: 'flags', inline: '', required: '' }); // prettier-ignore
      const el = page.locator('#el');
      await expect(el.locator('.ip-status')).toHaveText(/^2\d\d icons$/);
      await el.locator('.ip-search').fill('france');
      await el.getByRole('option', { name: 'France' }).click();
      await expect(el.locator('.ip-code')).toHaveText('fi fi-fr');
      expect(await el.evaluate((node) => node.internals.validity.valid)).toBe(true);
      expect(await axe(page)).toEqual([]);
    });
  }

  for (const theme of ['light', 'dark']) {
    test(`<vt-workflow> moves through jobs with the keyboard and opens logs (${theme})`, async ({
      page,
    }) => {
      await mount(page, 'vt-workflow', { variant: 'full', theme, 'lang-ui': 'en', now: '2026-11-15T10:10:00Z' }, WORKFLOW); // prettier-ignore
      await recordEvents(page, ['vt-select', 'vt-toggle']);
      const el = page.locator('#el');
      await expect(el.locator('.wf-job.chosen')).toHaveAttribute('data-job', 'test');
      await expect(el.locator('.wf-line.error')).toContainText('exit code 1');
      expect(await axe(page)).toEqual([]);
      await el.locator('[data-job="lint"]').focus();
      await page.keyboard.press('ArrowRight');
      await expect(el.locator('[data-job="test"]')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(el.locator('[data-job="build"]')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(el.locator('.wf-details-name')).toHaveText('Build');
      await el.getByRole('button', { name: /Compile/ }).click();
      await expect(el.locator('.wf-step.open .wf-text').first()).toHaveText('built in 1.2s');
      expect((await events(page)).map((e) => e.detail)).toEqual([{ id: 'build', name: 'Build', status: 'success' }, { job: 'build', step: 'Compile', open: true }]); // prettier-ignore
      expect(await axe(page)).toEqual([]);
    });

    test(`<vt-access-log> filters requests and shows top lists (${theme})`, async ({ page }) => {
      await mount(page, 'vt-access-log', { variant: 'full', theme, 'lang-ui': 'en' }, ACCESS);
      await recordEvents(page, ['vt-filter-change']);
      const el = page.locator('#el');
      await expect(el.locator('tbody tr.ax-row')).toHaveCount(4);
      await el.getByRole('button', { name: /^5xx/ }).click();
      await expect(el.locator('tbody tr.ax-row')).toHaveCount(1);
      await el.locator('tbody .ax-toggle').click();
      await expect(el.locator('.ax-details')).toContainText('curl/8.10.1');
      expect(await axe(page)).toEqual([]);
      await el.getByRole('button', { name: /^All/ }).click();
      await el.getByRole('tab', { name: 'Top lists' }).click();
      await el.locator('.ax-top').filter({ hasText: 'Browsers and bots' }).getByRole('button', { name: /Googlebot/ }).click(); // prettier-ignore
      await expect(el.locator('tbody tr.ax-row')).toHaveCount(1);
      expect((await events(page)).at(-1).detail).toEqual({ status: null, filter: 'browser:Googlebot', shown: 1 }); // prettier-ignore
      expect(await axe(page)).toEqual([]);
    });
  }

  test('<vt-icon-picker> submits its value with a form', async ({ page }) => {
    await page.evaluate(() => {
      const form = document.createElement('form');
      form.id = 'form';
      const el = document.createElement('vt-icon-picker');
      el.id = 'el';
      el.setAttribute('name', 'icon');
      el.setAttribute('value', 'lucide:heart');
      el.setAttribute('sets', 'lucide');
      form.append(el);
      document.getElementById('root')?.replaceChildren(form);
    });
    await expect(page.locator('#el .ip-preview svg')).toBeVisible();
    expect(await page.evaluate(() => new FormData(/** @type {HTMLFormElement} */ (document.getElementById('form'))).get('icon'))).toBe('lucide:heart'); // prettier-ignore
  });
});
