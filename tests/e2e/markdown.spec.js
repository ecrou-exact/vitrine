import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, events, mount, recordEvents } from './helpers.js';

const DOC = [
  '# Title',
  '',
  'Intro with **bold**, a [section link](#usage) and an [external link](https://example.com).',
  '',
  '## Usage',
  '',
  '- [x] done',
  '- [ ] todo',
  '',
  '| a | b |',
  '|:-|-:|',
  '| 1 | 2 |',
  '',
  '```js',
  'const answer = 42;',
  '```',
  '',
  '## Usage',
  '',
  'Duplicate heading.',
].join('\n');

test.describe('<vt-markdown>', () => {
  /** @type {string[]} */
  let errors;

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });

  test.afterEach(() => expect(errors).toEqual([]));

  test('renders GitHub Flavored Markdown', async ({ page }) => {
    const result = await mount(page, 'vt-markdown', {}, DOC);
    expect(result.event).toBe('vt-ready');
    const md = page.locator('#el [part="markdown"]');
    await expect(md.locator('h1')).toHaveText('Title');
    await expect(md.locator('strong')).toHaveText('bold');
    await expect(md.locator('input[type="checkbox"]')).toHaveCount(2);
    await expect(md.locator('input[type="checkbox"]').first()).toBeDisabled();
    await expect(md.locator('table th')).toHaveCount(2);
    await expect(md.locator('.hljs-keyword')).toHaveText('const');
  });

  test('gives headings unique ids', async ({ page }) => {
    await mount(page, 'vt-markdown', {}, DOC);
    const ids = await page.locator('#el h2').evaluateAll((hs) => hs.map((h) => h.id));
    expect(ids).toEqual(['usage', 'usage-1']);
  });

  test('shows raw HTML as text by default', async ({ page }) => {
    await mount(page, 'vt-markdown', {}, 'Hello <b>world</b>\n\n<div class="x">block</div>');
    const md = page.locator('#el [part="markdown"]');
    await expect(md.locator('b')).toHaveCount(0);
    await expect(md).toContainText('Hello <b>world</b>');
    await expect(md).toContainText('<div class="x">block</div>');
  });

  test('allow-html renders safe HTML only', async ({ page }) => {
    await mount(
      page,
      'vt-markdown',
      { 'allow-html': '' },
      'Hello <b>world</b> <kbd>Ctrl</kbd> <u onclick="x()">u</u>',
    );
    const md = page.locator('#el [part="markdown"]');
    await expect(md.locator('b')).toHaveText('world');
    await expect(md.locator('kbd')).toHaveText('Ctrl');
    expect(await md.locator('u').getAttribute('onclick')).toBe(null);
  });

  test('external links open in a new tab without opener or referrer', async ({ page }) => {
    await mount(page, 'vt-markdown', {}, DOC);
    const link = page.locator('#el a', { hasText: 'external link' });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    await mount(page, 'vt-markdown', { 'external-links': 'same' }, DOC);
    await expect(page.locator('#el a', { hasText: 'external link' })).not.toHaveAttribute(
      'target',
      '_blank',
    );
  });

  test('in-document links scroll to the heading inside the shadow root', async ({ page }) => {
    await mount(page, 'vt-markdown', { 'max-height': '120px' }, DOC);
    await page.locator('#el a', { hasText: 'section link' }).click();
    await expect(page.locator('#el h2').first()).toBeFocused();
    expect(new URL(page.url()).hash).toBe('');
  });

  test('full variant: tabs with keyboard support and vt-tab-change', async ({ page }) => {
    await mount(page, 'vt-markdown', { variant: 'full' }, DOC);
    await recordEvents(page, ['vt-tab-change']);
    const el = page.locator('#el');
    const preview = el.getByRole('tab', { name: 'Preview' });
    await expect(preview).toHaveAttribute('aria-selected', 'true');
    await preview.focus();
    await page.keyboard.press('ArrowRight');
    await expect(el.getByRole('tab', { name: 'Source' })).toBeFocused();
    await expect(el.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
    await expect(el.locator('pre.code .line')).toHaveCount(DOC.split('\n').length);
    await page.keyboard.press('End');
    await expect(el.getByRole('tab', { name: 'Split' })).toHaveAttribute('aria-selected', 'true');
    await expect(el.locator('[part~="body"]')).toHaveCount(2);
    await page.keyboard.press('Home');
    await expect(preview).toHaveAttribute('aria-selected', 'true');
    expect((await events(page)).map((e) => e.detail.tab)).toEqual(['source', 'split', 'preview']);
  });

  test('tabs and default-tab attributes', async ({ page }) => {
    await mount(
      page,
      'vt-markdown',
      { tabs: 'source,preview,evil', 'default-tab': 'source', header: '' },
      DOC,
    );
    const el = page.locator('#el');
    await expect(el.getByRole('tab')).toHaveText(['Source', 'Preview']);
    await expect(el.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
  });

  test('table of contents links to headings', async ({ page }) => {
    await mount(page, 'vt-markdown', { toc: '' }, DOC);
    const toc = page.locator('#el [part="toc"]');
    await expect(toc.locator('a')).toHaveText(['Title', 'Usage', 'Usage']);
    await toc.locator('a').nth(2).click();
    await expect(page.locator('#el h2').nth(1)).toBeFocused();
  });

  test('search works in the preview and in split view', async ({ page }) => {
    await mount(page, 'vt-markdown', { variant: 'full' }, DOC);
    const el = page.locator('#el');
    await el.getByRole('button', { name: 'Search' }).click();
    await el.getByRole('searchbox').fill('usage');
    await expect(el.locator('[part="search-count"]')).toHaveText('1 / 2');
    // Split: 2 headings in the preview + 3 source lines ("## Usage" twice and "#usage").
    await el.getByRole('tab', { name: 'Split' }).click();
    await expect(el.locator('[part="search-count"]')).toHaveText('1 / 5');
  });

  test('image policy: block and same-origin never request external images', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    const md = '![pixel](https://tracker.example/p.png?id=1) ![local](/brand/favicon.svg)';
    await mount(page, 'vt-markdown', { images: 'block' }, md);
    await expect(page.locator('#el .vt-blocked-image')).toHaveCount(2);
    await mount(page, 'vt-markdown', { images: 'same-origin' }, md);
    await expect(page.locator('#el .vt-blocked-image')).toHaveText(['pixel']);
    await expect(page.locator('#el img')).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(requests.filter((url) => url.includes('tracker.example'))).toEqual([]);
  });

  test('relative links and images resolve against the src file', async ({ page }) => {
    await page.route('**/docs/guide/intro.md', (route) =>
      route.fulfill({ body: '[next](next.md) ![logo](img/logo.png)' }),
    );
    await page.route('**/docs/guide/img/logo.png', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      }),
    );
    await mount(page, 'vt-markdown', { src: '/docs/guide/intro.md' });
    await expect(page.locator('#el a')).toHaveAttribute('href', /\/docs\/guide\/next\.md$/);
    await expect(page.locator('#el img')).toHaveAttribute('src', /\/docs\/guide\/img\/logo\.png$/);
  });

  test('code blocks get a copy button', async ({ page, browserName, context }) => {
    test.skip(browserName === 'webkit', 'Clipboard permissions are not grantable in WebKit.');
    if (browserName === 'chromium')
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await mount(page, 'vt-markdown', { copy: '' }, DOC);
    await recordEvents(page, ['vt-copy']);
    const block = page.locator('#el [part="code-block"]');
    await block.hover();
    await block.getByRole('button', { name: 'Copy code' }).click();
    await expect
      .poll(() => events(page))
      .toEqual([{ type: 'vt-copy', detail: { text: 'const answer = 42;' } }]);
  });

  test('pathological nesting does not freeze or crash the page', async ({ page }) => {
    const start = Date.now();
    await mount(
      page,
      'vt-markdown',
      {},
      '>'.repeat(20_000) + ' deep\n\n' + '- '.repeat(5_000) + 'list\n\n' + '['.repeat(50_000),
    );
    expect(Date.now() - start).toBeLessThan(15_000);
    await expect(page.locator('#el [part="container"]')).toBeVisible();
    expect(await page.evaluate(() => 1 + 1)).toBe(2);
  });
});
