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

  test('split-preview places the preview on any side', async ({ page }) => {
    for (const [position, first, stacked] of [
      ['right', 'source', false],
      ['left', 'preview', false],
      ['bottom', 'source', true],
      ['top', 'preview', true],
    ]) {
      await mount(
        page,
        'vt-markdown',
        { 'default-tab': 'split', 'split-preview': position, tabs: 'preview,split' },
        DOC,
      );
      const panel = page.locator('#el .panel.split');
      await expect(panel).toHaveAttribute('data-preview', position);
      await expect(panel.locator('> .body').first()).toHaveAttribute(
        'part',
        new RegExp(`body ${first}`),
      );
      const [a, b] = await panel
        .locator('> .body')
        .evaluateAll((panes) => panes.map((p) => p.getBoundingClientRect()));
      if (stacked) expect(b.top).toBeGreaterThanOrEqual(a.bottom - 1);
      else expect(b.left).toBeGreaterThanOrEqual(a.right - 1);
    }
  });

  test('split buttons swap, stack and toggle sync', async ({ page }) => {
    await mount(page, 'vt-markdown', { variant: 'full', 'default-tab': 'split' }, DOC);
    await recordEvents(page, ['vt-layout-change']);
    const el = page.locator('#el');
    await el.getByRole('button', { name: 'Swap panes' }).click();
    await expect(el.locator('.panel')).toHaveAttribute('data-preview', 'left');
    await el.getByRole('button', { name: 'Stack panes' }).click();
    await expect(el.locator('.panel')).toHaveAttribute('data-preview', 'top');
    await expect(el.getByRole('button', { name: 'Stack panes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await el.getByRole('button', { name: 'Sync scrolling' }).click();
    await expect(el.getByRole('button', { name: 'Sync scrolling' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(await events(page)).toEqual([
      { type: 'vt-layout-change', detail: { preview: 'left', sync: true } },
      { type: 'vt-layout-change', detail: { preview: 'top', sync: true } },
      { type: 'vt-layout-change', detail: { preview: 'top', sync: false } },
    ]);
  });

  test('scroll sync keeps the same block at the top of both panes', async ({ page }) => {
    // Sections of very different heights, so a proportional mapping would drift.
    const doc = Array.from({ length: 40 }, (_, i) =>
      [
        `## Section ${i + 1}`,
        '',
        i % 3 === 0 ? '```js\n' + 'x();\n'.repeat(12) + '```' : 'Short paragraph.',
        '',
      ].join('\n'),
    ).join('\n');
    await mount(
      page,
      'vt-markdown',
      { 'default-tab': 'split', tabs: 'split,preview', 'max-height': '400px' },
      doc,
    );
    const source = page.locator('#el [part~="source"]');
    const preview = page.locator('#el [part~="preview"]');
    const line30 = doc.split('\n').indexOf('## Section 30') + 1;

    await source.evaluate((pane, line) => {
      const row = pane.querySelector(`.line[data-line="${line}"]`);
      pane.scrollTop =
        row.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
    }, line30);
    await expect
      .poll(() =>
        preview.evaluate((pane) => {
          const heading = Array.from(pane.querySelectorAll('h2')).find((h) =>
            h.textContent.startsWith('Section 30'),
          );
          return Math.abs(heading.getBoundingClientRect().top - pane.getBoundingClientRect().top);
        }),
      )
      .toBeLessThan(40);

    await page.waitForTimeout(250);
    await preview.evaluate((pane) => {
      const heading = Array.from(pane.querySelectorAll('h2')).find((h) =>
        h.textContent.startsWith('Section 10'),
      );
      pane.scrollTop =
        heading.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
    });
    const line10 = doc.split('\n').indexOf('## Section 10') + 1;
    await expect
      .poll(() =>
        source.evaluate((pane, line) => {
          const row = pane.querySelector(`.line[data-line="${line}"]`);
          return Math.abs(row.getBoundingClientRect().top - pane.getBoundingClientRect().top);
        }, line10),
      )
      .toBeLessThan(40);
  });

  test('sync-scroll="false" leaves the panes independent', async ({ page }) => {
    const doc = Array.from({ length: 80 }, (_, i) => `Paragraph ${i}\n`).join('\n');
    await mount(
      page,
      'vt-markdown',
      { 'default-tab': 'split', tabs: 'split', 'sync-scroll': 'false', 'max-height': '300px' },
      doc,
    );
    await page.locator('#el [part~="source"]').evaluate((pane) => (pane.scrollTop = 800));
    await page.waitForTimeout(300);
    expect(await page.locator('#el [part~="preview"]').evaluate((pane) => pane.scrollTop)).toBe(0);
  });

  test('content cannot forge source line markers', async ({ page }) => {
    await mount(
      page,
      'vt-markdown',
      { 'allow-html': '' },
      '<span data-vt-line="1:forged">x</span>\n\n<span data-vt-line="3"></span>',
    );
    const values = await page
      .locator('#el [data-vt-line]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-vt-line')));
    // Only the genuine markers (one per block, plain line numbers) remain.
    expect(values.every((v) => /^\d+$/.test(v))).toBe(true);
    expect(await page.locator('#el span:not([data-vt-line])', { hasText: 'x' }).count()).toBe(1);
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
