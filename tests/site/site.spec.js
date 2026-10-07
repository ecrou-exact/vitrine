/**
 * Website checks, run against the assembled site (`npm run site`).
 * The site uses the strict CSP with enforced Trusted Types it recommends, so any
 * console error here is a real problem.
 */
import { expect, test } from '@playwright/test';

const SITE = 'http://localhost:4174';
const PAGES = [
  '/',
  '/docs.html',
  '/docs.html?page=security',
  '/examples.html',
  '/playground.html',
  '/themes.html',
  '/lab.html',
];

for (const path of PAGES) {
  test(`${path} loads without console errors`, async ({ page }) => {
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(SITE + path);
    await page.waitForLoadState('networkidle');
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
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test('every stress lab trial ends safely', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`${SITE}/lab.html`);
  const trials = page.locator('.trial');
  const count = await trials.count();
  expect(count).toBeGreaterThan(5);
  for (let i = 0; i < count; i += 1) {
    await trials.nth(i).click();
    const verdict = page.locator('#verdict');
    await expect(verdict).toContainText('Scripts executed', { timeout: 30_000 });
    await expect(
      verdict.locator('.bad'),
      await trials.nth(i).locator('strong').textContent(),
    ).toHaveCount(0);
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
