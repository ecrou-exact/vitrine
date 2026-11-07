/**
 * Website checks, run against the assembled site (`npm run site`).
 * The site uses the strict CSP with enforced Trusted Types it recommends, so any
 * console error here is a real problem.
 */
import { expect, test } from '@playwright/test';
import { isEngineNoise } from '../e2e/helpers.js';

const SITE = 'http://localhost:4174';

/**
 * Waits until a page has loaded and its network went quiet. Firefox sometimes never reports a
 * quiet network on the longest pages although no request is open, so that part is best effort:
 * the checks that follow still run on the loaded page.
 *
 * @param {import('@playwright/test').Page} page
 */
async function settle(page) {
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}
const PAGES = [
  '/',
  '/docs.html',
  '/docs.html?page=security',
  '/examples.html',
  '/integrations.html',
  '/playground.html',
  '/themes.html',
  '/lab.html',
];

for (const path of PAGES) {
  test(`${path} loads without console errors`, async ({ page }) => {
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !isEngineNoise(page, m.text())) errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(SITE + path);
    await settle(page);
    expect(errors).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
  });
}

test('pages have no horizontal overflow on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const path of PAGES) {
    await page.goto(SITE + path);
    await settle(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test('every stress lab trial ends safely', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`${SITE}/lab.html`);
  const trials = page.locator('.trial');
  const count = await trials.count();
  expect(count).toBeGreaterThan(5);
  for (let i = 0; i < count; i += 1) {
    const title = (await trials.nth(i).locator('strong').textContent()) ?? `trial ${i}`;
    await test.step(title, async () => {
      await trials.nth(i).click();
      const verdict = page.locator('#verdict');
      await expect(verdict).toContainText('Scripts executed', { timeout: 30_000 });
      await expect(verdict.locator('.bad'), title).toHaveCount(0);
    });
  }
});

test('theme switch persists and drives the components', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(SITE);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.install .vt')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('docs only load listed pages', async ({ page }) => {
  const requests = [];
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  await page.goto(`${SITE}/docs.html?page=../../etc/passwd`);
  await page.waitForLoadState('networkidle');
  expect(requests.some((p) => p.includes('passwd'))).toBe(false);
  expect(requests).toContain('/docs/getting-started.md');
});
