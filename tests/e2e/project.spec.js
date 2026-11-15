import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, mount, recordEvents } from './helpers.js';

/**
 * <vt-install>, <vt-download> and <vt-contributors> on the strict CSP page: behavior, keyboard,
 * events and axe, with nothing refused or reported in the console.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const HASH = 'ab'.repeat(32);
const file = (/** @type {string} */ name, size = 1000) => ({ name, size, browser_download_url: `/tests/e2e/fixtures/${name}` }); // prettier-ignore
const RELEASE = JSON.stringify({
  tag_name: 'v2.1.0',
  html_url: '/releases/v2.1.0',
  published_at: '2026-11-01T10:00:00Z',
  assets: [
    { ...file('App-2.1.0-universal.dmg', 90_000_000), digest: `sha256:${HASH}` },
    file('App-Setup-2.1.0.exe', 80_000_000),
    file('App-2.1.0.AppImage', 95_000_000),
    file('app_2.1.0_amd64.deb', 70_000_000),
    file('SHA256SUMS', 300),
  ],
});
const PEOPLE = JSON.stringify({
  contributors: [
    { login: 'ada', name: 'Ada Lovelace', profile: 'https://example.com/ada', contributions: ['code', 'doc'] }, // prettier-ignore
    { login: 'alan', name: 'Alan Turing', profile: 'https://example.com/alan', contributions: ['bug'] }, // prettier-ignore
    { login: 'grace', name: 'Grace Hopper', contributions: ['code', 'review'] },
  ],
});

/** @param {import('@playwright/test').Page} page */
const axe = async (page) =>
  (await new AxeBuilder({ page }).include('#el').withTags(AXE_TAGS).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );

/** @param {import('@playwright/test').Page} page */
const events = (page) => page.evaluate(() => /** @type {any} */ (window).__events);

test.describe('project elements', () => {
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
    test(`<vt-install> switches managers with the keyboard (${theme})`, async ({ page }) => {
      await mount(page, 'vt-install', { variant: 'full', theme, 'lang-ui': 'en' }, 'npm i -D vitrine'); // prettier-ignore
      await recordEvents(page, ['vt-tab-change']);
      const el = page.locator('#el');
      await expect(el.locator('.ins-code')).toHaveText('$ npm install -D vitrine');
      await el.getByRole('tab', { name: 'npm', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(el.getByRole('tab', { name: 'pnpm' })).toBeFocused();
      await expect(el.locator('.ins-code')).toHaveText('$ pnpm add -D vitrine');
      expect((await events(page))[0].detail).toEqual({ tab: 'pnpm' });
      expect(await page.evaluate(() => localStorage.getItem('vitrine-install:install'))).toBe('pnpm'); // prettier-ignore
      expect(await axe(page)).toEqual([]);
    });

    test(`<vt-download> recommends a file and lists them all (${theme})`, async ({ page }) => {
      await mount(page, 'vt-download', { variant: 'full', theme, 'lang-ui': 'en', platform: 'linux-x64' }, RELEASE); // prettier-ignore
      await recordEvents(page, ['vt-download']);
      await page.evaluate(() => document.getElementById('el')?.addEventListener('vt-download', (e) => e.preventDefault())); // prettier-ignore
      const el = page.locator('#el');
      const button = el.locator('.dl-button');
      await expect(button).toContainText('Download for Linux');
      await expect(button).toContainText('App-2.1.0.AppImage');
      await button.click();
      expect((await events(page))[0].detail).toMatchObject({ name: 'App-2.1.0.AppImage', recommended: true }); // prettier-ignore
      await el.locator('summary').click();
      await expect(el.locator('tbody tr')).toHaveCount(4);
      await expect(el.locator('.dl-verify-files')).toContainText('SHA256SUMS');
      expect(await axe(page)).toEqual([]);
    });

    test(`<vt-download> shows the check of a file (${theme})`, async ({ page }) => {
      await mount(page, 'vt-download', { theme, 'lang-ui': 'en', platform: 'macos' }, RELEASE);
      const el = page.locator('#el');
      await expect(el.locator('.dl-hash')).toHaveText(HASH);
      await expect(el.locator('.dl-command pre')).toHaveText('shasum -a 256 App-2.1.0-universal.dmg'); // prettier-ignore
      expect(await axe(page)).toEqual([]);
    });

    test(`<vt-contributors> filters people by contribution (${theme})`, async ({ page }) => {
      await mount(page, 'vt-contributors', { variant: 'full', theme, 'lang-ui': 'en' }, PEOPLE);
      await recordEvents(page, ['vt-filter-change']);
      const el = page.locator('#el');
      await expect(el.locator('.ct-person')).toHaveCount(3);
      await el.getByRole('button', { name: /Bug reports/ }).click();
      await expect(el.locator('.ct-name')).toHaveText(['Alan Turing']);
      expect((await events(page))[0].detail).toEqual({ type: 'bug' });
      await expect(el.getByRole('button', { name: /Bug reports/ })).toHaveAttribute('aria-pressed', 'true'); // prettier-ignore
      expect(await axe(page)).toEqual([]);
    });
  }
});
