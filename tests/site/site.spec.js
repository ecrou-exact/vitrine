/**
 * Website checks, run against the assembled site (`npm run site`).
 * The site uses the strict CSP with enforced Trusted Types it recommends, so any
 * console error here is a real problem.
 */
import { expect, test } from '@playwright/test';
import { collectErrors, isEngineNoise } from '../e2e/helpers.js';

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

test('docs table of contents stays beside the article and follows the current section', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto(`${SITE}/docs.html`);
  const toc = page.locator('#doc-toc');
  await expect(toc).toBeVisible();
  await expect(page.locator('#doc [part="toc"]')).toBeHidden();
  const article = await page.locator('#doc').boundingBox();
  const sidebar = await toc.boundingBox();
  expect(sidebar.x).toBeGreaterThan(article.x + article.width);
  expect(sidebar.height).toBeLessThanOrEqual(696);

  // The long contents list scrolls independently from the document.
  await toc.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => toc.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  const heading = page.locator('#doc #content-sources');
  const id = await heading.getAttribute('id');
  await heading.evaluate((el) => {
    window.scrollTo({
      top: window.scrollY + el.getBoundingClientRect().top - 104,
      behavior: 'instant',
    });
  });
  const active = toc.locator('[aria-current="location"]');
  await expect(active).toHaveAttribute('href', `#${id}`);
  expect((await toc.boundingBox()).y).toBe(88);
  const current = await active.boundingBox();
  const sticky = await toc.boundingBox();
  expect(current.y).toBeGreaterThanOrEqual(sticky.y);
  expect(current.y + current.height).toBeLessThanOrEqual(sticky.y + sticky.height);

  await toc.getByRole('link', { name: 'Installation', exact: true }).click();
  await expect(active).toHaveAttribute('href', '#installation');
  await expect
    .poll(async () => Math.round((await page.locator('#doc #installation').boundingBox()).y))
    .toBe(104);
  await expect(page).toHaveURL(/#installation$/);
  await page.reload();
  await expect(active).toHaveAttribute('href', '#installation');
  await expect
    .poll(async () => Math.round((await page.locator('#doc #installation').boundingBox()).y))
    .toBe(104);

  await page.locator('.docs-nav a[data-page="security"]').click();
  await expect(toc.locator('a').first()).toHaveText('Security');
  await expect(toc.locator('[aria-current="location"]')).toHaveCount(1);
});

test('docs table of contents remains inline on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`${SITE}/docs.html`);
  await expect(page.locator('#doc-toc')).toBeHidden();
  await expect(page.locator('#doc [part="toc"]')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test('docs title links navigate to nested headings and support Back and Forward', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto(`${SITE}/docs.html`);
  const toc = page.locator('#doc-toc');
  const active = toc.locator('[aria-current="location"]');
  const expectSection = async (id) => {
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(active).toHaveAttribute('href', `#${id}`);
    await expect
      .poll(async () => Math.round((await page.locator(`#doc #${id}`).boundingBox()).y))
      .toBe(104);
  };

  await toc.getByRole('link', { name: 'CDN (ES module)', exact: true }).click();
  await expectSection('cdn-es-module');
  await toc.getByRole('link', { name: 'Content sources', exact: true }).click();
  await expectSection('content-sources');
  await page.goBack();
  await expectSection('cdn-es-module');
  await page.goForward();
  await expectSection('content-sources');

  // Permalinks on the rendered titles share the sidebar's navigation.
  await page.locator('#doc #content-sources [part="anchor"]').click();
  await expectSection('content-sources');

  await page.locator('#doc #cdn-classic-script').evaluate((heading) => {
    window.scrollTo({
      top: scrollY + heading.getBoundingClientRect().top - 104,
      behavior: 'instant',
    });
  });
  await expect(active).toHaveAttribute('href', '#cdn-classic-script');
  await page.evaluate(() => {
    location.hash = '#cdn-es-module';
  });
  await expectSection('cdn-es-module');
});

test('every component doc has a closed preview that renders its real example', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = collectErrors(page);
  await page.goto(`${SITE}/docs.html`);
  const components = await page
    .locator('.docs-nav a[data-page^="components/"]')
    .evaluateAll((links) => links.map((link) => link.dataset.page));
  expect(components.length).toBeGreaterThan(30);
  const preview = page.locator('#doc-preview');
  for (const component of components) {
    await test.step(component, async () => {
      const name = component.slice('components/'.length);
      await page.locator(`.docs-nav a[data-page="${component}"]`).click();
      await expect(preview).toBeVisible();
      await expect(preview).not.toHaveAttribute('open');
      await expect(page.locator('#doc-preview-canvas > *')).toHaveCount(0);
      await expect(page.locator('#doc-preview-link')).toHaveAttribute(
        'href',
        `examples.html#${name}`,
      );
      const rendered = await page.evaluate(
        (name) =>
          new Promise((resolve) => {
            const canvas = document.getElementById('doc-preview-canvas');
            const done = (event) => {
              if (event.target.localName !== `vt-${name}`) return;
              canvas.removeEventListener('vt-ready', done);
              canvas.removeEventListener('vt-error', done);
              resolve({ type: event.type, message: event.detail?.message });
            };
            canvas.addEventListener('vt-ready', done);
            canvas.addEventListener('vt-error', done);
            document.getElementById('doc-preview').open = true;
          }),
        name,
      );
      expect(rendered, component).toEqual({ type: 'vt-ready', message: undefined });
      await expect(page.locator(`#doc-preview-canvas vt-${name}`)).toBeVisible();
    });
  }
  await page.locator('.docs-nav a[data-page="security"]').click();
  await expect(preview).toBeHidden();
  await expect(page.locator('#doc-preview-canvas > *')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('docs previews open with the keyboard and fit on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`${SITE}/docs.html?page=components/code`);
  const summary = page.locator('#doc-preview > summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#doc-preview-canvas vt-code [part="container"]')).toBeVisible();
  await expect(page.locator('#doc-preview-canvas vt-code')).toContainText('def greet');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#doc-preview-canvas')).toBeHidden();
});
