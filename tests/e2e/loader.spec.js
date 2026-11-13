import { expect, test } from '@playwright/test';
import { collectErrors } from './helpers.js';

/**
 * dist/vitrine-loader.js under a strict CSP with Trusted Types: it loads only the
 * elements on the page, applies data-config first, and follows elements added later.
 */

/** @param {import('@playwright/test').Page} page */
function scripts(page) {
  /** @type {string[]} */
  const urls = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('.js')) urls.push(url.pathname.replace(/^.*\/dist\//, ''));
  });
  return urls;
}

test.describe('vitrine-loader.js', () => {
  test('loads only the elements on the page, with data-config applied first', async ({ page }) => {
    const errors = collectErrors(page);
    const urls = scripts(page);
    await page.goto('/tests/e2e/fixtures/loader.html');
    const sql = page.locator('#sql');
    await expect(sql.locator('.sql-query')).toHaveText('SELECT 1;');
    // data-config set the language before the element was defined.
    await expect(sql.getByRole('button', { name: 'Copier la requête' })).toBeVisible();
    expect(urls).toContain('esm/vt-sql.js');
    expect(urls).toContain('esm/api.js');
    expect(urls.filter((url) => /^esm\/vt-/.test(url))).toEqual(['esm/vt-sql.js']);
    expect(urls.some((url) => /vitrine\.(min|esm)\.js$/.test(url))).toBe(false);
    // An unknown vt-* name is never turned into a URL.
    expect(urls.some((url) => url.includes('vt-nope'))).toBe(false);

    // Elements added later are loaded too.
    await page.evaluate(() => {
      const math = document.createElement('vt-math');
      math.textContent = 'x^2';
      document.getElementById('root')?.append(math);
    });
    await expect(page.locator('vt-math math')).toHaveCount(1);
    expect(urls).toContain('esm/vt-math.js');
    expect(urls).not.toContain('esm/vt-chart.js');

    // The API of the loader.
    const defined = await page.evaluate(async () => {
      const loader = /** @type {any} */ (window).VitrineLoader;
      await loader.load('vt-cron');
      await loader.ready();
      const unknown = await loader.load('vt-nope').then(
        () => 'loaded',
        (error) => error.message,
      );
      return { cron: Boolean(customElements.get('vt-cron')), unknown };
    });
    expect(defined).toEqual({ cron: true, unknown: '[vitrine] Unknown element <vt-nope>.' });
    expect(errors).toEqual([]);
  });

  test('with data-lazy, loads an element when it comes near the screen', async ({ page }) => {
    const errors = collectErrors(page);
    const urls = scripts(page);
    await page.goto('/tests/e2e/fixtures/loader-lazy.html');
    await expect(page.locator('#near .code')).toContainText('const a = 1;');
    expect(urls).not.toContain('esm/vt-json.js');
    expect(await page.evaluate(() => Boolean(customElements.get('vt-json')))).toBe(false);
    await page.locator('#far').scrollIntoViewIfNeeded();
    await expect(page.locator('#far [part="body"]')).toContainText('far');
    expect(urls).toContain('esm/vt-json.js');
    expect(errors).toEqual([]);
  });
});
