import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, events, mount, recordEvents } from './helpers.js';

const PY = 'def hello(name):\n    return f"Hello {name}"\n\nprint(hello("a"))\nprint(hello("b"))\n';

test.describe('<vt-code>', () => {
  /** @type {string[]} */
  let errors;

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });

  test.afterEach(() => {
    // Strict CSP + enforced Trusted Types: nothing may be reported.
    expect(errors).toEqual([]);
  });

  test('renders highlighted lines with numbers and emphasized lines', async ({ page }) => {
    const result = await mount(
      page,
      'vt-code',
      { language: 'python', 'line-numbers': '', 'highlight-lines': '2,4-5', 'start-line': '10' },
      PY,
    );
    expect(result.event).toBe('vt-ready');
    const el = page.locator('#el');
    await expect(el.locator('.line')).toHaveCount(5);
    await expect(el.locator('.line.highlighted')).toHaveCount(0);
    await mount(
      page,
      'vt-code',
      { language: 'python', 'line-numbers': '', 'highlight-lines': '11,13-14', 'start-line': '10' },
      PY,
    );
    await expect(el.locator('.line.highlighted')).toHaveCount(3);
    await expect(el.locator('.hljs-keyword').first()).toHaveText('def');
    await expect(el.locator('[part~="line-number"]')).toHaveCount(5);
    // Line numbers are drawn from data-n and start at start-line.
    await expect(el.locator('.gutter').first()).toHaveAttribute('data-n', '10');
    await expect(el.locator('.line').first()).toHaveAttribute('data-line', '10');
  });

  test('simple variant shows only the body; full variant adds the header and actions', async ({
    page,
  }) => {
    await mount(page, 'vt-code', { language: 'js' }, 'let a = 1;');
    const el = page.locator('#el');
    await expect(el.locator('[part="header"]')).toHaveCount(0);
    await expect(el.locator('.gutter')).toHaveCount(0);
    await mount(page, 'vt-code', { language: 'js', variant: 'full', label: 'a.js' }, 'let a = 1;');
    await expect(el.locator('[part="header"]')).toBeVisible();
    await expect(el.locator('[part="title"]')).toHaveText('a.js');
    await expect(el.locator('[part="badge"]')).toHaveText('JavaScript');
    for (const label of ['Search', 'Toggle line wrap', 'Download', 'Copy code']) {
      await expect(el.getByRole('button', { name: label })).toBeVisible();
    }
  });

  test('individual attributes override the variant preset', async ({ page }) => {
    await mount(
      page,
      'vt-code',
      { variant: 'full', copy: 'false', search: 'off', 'line-numbers': 'no' },
      'x',
    );
    const el = page.locator('#el');
    await expect(el.getByRole('button', { name: 'Copy code' })).toHaveCount(0);
    await expect(el.getByRole('button', { name: 'Search' })).toHaveCount(0);
    await expect(el.locator('.gutter')).toHaveCount(0);
  });

  test('copy button copies the exact source and fires vt-copy', async ({
    page,
    browserName,
    context,
  }) => {
    test.skip(browserName === 'webkit', 'Clipboard permissions are not grantable in WebKit.');
    if (browserName === 'chromium')
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await mount(page, 'vt-code', { variant: 'full' }, PY);
    await recordEvents(page, ['vt-copy']);
    await page.locator('#el').getByRole('button', { name: 'Copy code' }).click();
    await expect.poll(() => events(page)).toEqual([{ type: 'vt-copy', detail: { text: PY } }]);
    await expect(page.locator('#el [aria-live]')).toHaveText('Copied');
  });

  test('search highlights matches, navigates and cleans up', async ({ page }) => {
    await mount(page, 'vt-code', { variant: 'full', language: 'python' }, PY);
    await recordEvents(page, ['vt-search']);
    const el = page.locator('#el');
    await el.getByRole('button', { name: 'Search' }).click();
    const input = el.getByRole('searchbox');
    await expect(input).toBeFocused();
    await input.fill('hello');
    // Case-insensitive: "hello" (x3) and "Hello" in the f-string.
    await expect(el.locator('[part="search-count"]')).toHaveText('1 / 4');
    await expect(el.locator('mark.current')).toHaveCount(1);
    await input.press('Enter');
    await expect(el.locator('[part="search-count"]')).toHaveText('2 / 4');
    await input.press('Shift+Enter');
    await input.press('Shift+Enter');
    await expect(el.locator('[part="search-count"]')).toHaveText('4 / 4');
    await input.fill('zzz');
    await expect(el.locator('[part="search-count"]')).toHaveText('No matches');
    await input.press('Escape');
    await expect(input).toHaveValue('');
    await input.press('Escape');
    await expect(el.getByRole('searchbox')).toHaveCount(0);
    await expect(el.locator('mark')).toHaveCount(0);
    await expect(el.getByRole('button', { name: 'Search' })).toBeFocused();
    const recorded = await events(page);
    expect(recorded.some((e) => e.detail.query === 'hello' && e.detail.matches === 4)).toBe(true);
  });

  test('search query is plain text, not a pattern', async ({ page }) => {
    await mount(page, 'vt-code', { variant: 'full' }, 'a.b axb (a.b)');
    const el = page.locator('#el');
    await el.getByRole('button', { name: 'Search' }).click();
    await el.getByRole('searchbox').fill('a.b');
    await expect(el.locator('[part="search-count"]')).toHaveText('1 / 2');
    await el.getByRole('searchbox').fill('(.*');
    await expect(el.locator('[part="search-count"]')).toHaveText('No matches');
  });

  test('wrap toggle is a pressed/unpressed button', async ({ page }) => {
    await mount(page, 'vt-code', { variant: 'full' }, 'x'.repeat(500));
    const el = page.locator('#el');
    const button = el.getByRole('button', { name: 'Toggle line wrap' });
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await button.click();
    await expect(el.getByRole('button', { name: 'Toggle line wrap' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(el.locator('.vt')).toHaveClass(/wrap/);
  });

  test('collapsible shows a "show all" button, and search reveals hidden lines', async ({
    page,
  }) => {
    const code = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n');
    await mount(page, 'vt-code', { collapsible: '5', search: '', header: '' }, code);
    const el = page.locator('#el');
    const more = el.getByRole('button', { name: 'Show all 40 lines' });
    await expect(more).toBeVisible();
    await el.getByRole('button', { name: 'Search' }).click();
    await el.getByRole('searchbox').fill('line 39');
    await expect(more).toHaveCount(0);
    await expect(el.locator('.vt')).not.toHaveClass(/collapsed/);
  });

  test('lazy-loads a non-bundled language from the languages folder only', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await mount(
      page,
      'vt-code',
      { language: 'rust', variant: 'full' },
      'fn main() { println!("hi"); }',
    );
    const el = page.locator('#el');
    await expect(el.locator('[part="badge"]')).toHaveText('Rust');
    await expect(el.locator('.hljs-keyword').first()).toHaveText('fn');
    expect(requests).toContain('/dist/languages/rust.js');
  });

  test('never turns an unknown or malicious language into a request', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    for (const language of [
      '../../evil',
      'https://evil.example/x',
      'nope',
      '__proto__',
      'constructor',
    ]) {
      await mount(page, 'vt-code', { language }, 'x');
    }
    expect(requests.filter((url) => url.includes('/languages/') || url.includes('evil'))).toEqual(
      [],
    );
  });

  test('auto detects the language', async ({ page }) => {
    await mount(
      page,
      'vt-code',
      { language: 'auto', variant: 'full' },
      'import os\n\ndef main():\n    print(os.getcwd())\n',
    );
    await expect(page.locator('#el [part="badge"]')).toHaveText('Python');
  });

  test('diff mode marks added and removed lines', async ({ page }) => {
    await mount(
      page,
      'vt-code',
      { diff: '', 'line-numbers': '' },
      '@@ -1 +1 @@\n keep\n-old\n+new',
    );
    const el = page.locator('#el');
    await expect(el.locator('.line.removed .content')).toHaveText('old');
    await expect(el.locator('.line.added .content')).toHaveText('new');
    await expect(el.locator('.line.hunk')).toHaveCount(1);
  });

  test('content property overrides inline content; null restores it', async ({ page }) => {
    await page.evaluate(() => {
      const el = document.createElement('vt-code');
      el.id = 'el';
      el.textContent = 'inline';
      document.getElementById('root').append(el);
    });
    const el = page.locator('#el');
    await expect(el.locator('.content')).toHaveText('inline');
    await page.evaluate(() => (document.getElementById('el').content = 'from property'));
    await expect(el.locator('.content')).toHaveText('from property');
    await page.evaluate(() => (document.getElementById('el').content = null));
    await expect(el.locator('.content')).toHaveText('inline');
    await page.evaluate(() => (document.getElementById('el').textContent = 'changed'));
    await expect(el.locator('.content')).toHaveText('changed');
  });

  test('shows the empty state', async ({ page }) => {
    await mount(page, 'vt-code', {}, '');
    await expect(page.locator('#el [part="empty"]')).toHaveText('Nothing to display');
  });

  test('download uses a safe file name', async ({ page }) => {
    await mount(page, 'vt-code', { variant: 'full', download: '../../etc/evil.sh' }, 'echo hi');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#el').getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('evil.sh');
  });

  test('UI strings follow lang-ui', async ({ page }) => {
    await mount(page, 'vt-code', { variant: 'full', 'lang-ui': 'fr' }, 'x');
    await expect(page.locator('#el').getByRole('button', { name: 'Copier le code' })).toBeVisible();
    await expect(page.locator('#el').getByRole('button', { name: 'Rechercher' })).toBeVisible();
  });

  test('long code is split in blocks and keeps correct line numbers', async ({ page }) => {
    const code = Array.from({ length: 2500 }, (_, i) => `line ${i + 1}`).join('\n');
    await mount(
      page,
      'vt-code',
      { 'line-numbers': '', 'max-height': '200px', search: '', header: '' },
      code,
    );
    const el = page.locator('#el');
    await expect(el.locator('.chunk')).toHaveCount(13);
    await expect(el.locator('.line[data-line="1201"] .gutter')).toHaveAttribute('data-n', '1201');
    await el.getByRole('button', { name: 'Search' }).click();
    await el.getByRole('searchbox').fill('line 2499');
    await expect(el.locator('mark.current')).toBeInViewport();
  });

  test('large content skips highlighting but stays responsive', async ({ page }) => {
    const big = 'const value = "x";\n'.repeat(20_000);
    const start = Date.now();
    await mount(page, 'vt-code', { language: 'js', variant: 'full' }, big);
    expect(Date.now() - start).toBeLessThan(10_000);
    const el = page.locator('#el');
    await expect(el.locator('[part="notice"]')).toContainText('syntax highlighting is disabled');
    await expect(el.locator('.hljs-keyword')).toHaveCount(0);
  });

  test('refuses content above the size limit', async ({ page }) => {
    await page.evaluate(() => window.Vitrine.configure({ maxSize: 1000 }));
    const result = await mount(page, 'vt-code', {}, 'x'.repeat(1001));
    expect(result.event).toBe('vt-error');
    await expect(page.locator('#el [part="error"]')).toContainText(
      'Content is too large (1,001 characters, limit 1,000).',
    );
  });

  test('max-height only accepts plain lengths', async ({ page }) => {
    await mount(page, 'vt-code', { 'max-height': '120px' }, 'a\n'.repeat(100));
    const body = page.locator('#el [part="body"]');
    expect(Math.round((await body.boundingBox()).height)).toBe(120);
    await mount(page, 'vt-code', { 'max-height': '1px; display: none' }, 'a\n'.repeat(100));
    expect((await page.locator('#el [part="body"]').boundingBox()).height).toBeGreaterThan(500);
  });
});

test.describe('<vt-code> src loading', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/virtual/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/slow.js')) await new Promise((r) => setTimeout(r, 800));
      if (url.pathname.endsWith('/missing.js')) return route.fulfill({ status: 404, body: 'nope' });
      if (url.pathname.endsWith('/huge.txt'))
        return route.fulfill({ body: 'x'.repeat(3 * 1024 * 1024) });
      return route.fulfill({ body: `// ${url.pathname}` });
    });
    await page.goto(STRICT);
  });

  test('loads same-origin content', async ({ page }) => {
    const result = await mount(page, 'vt-code', { src: '/virtual/a.js' });
    expect(result.event).toBe('vt-ready');
    await expect(page.locator('#el .content')).toHaveText('// /virtual/a.js');
  });

  test('blocks cross-origin URLs unless allow-remote is set', async ({ page }) => {
    const result = await mount(page, 'vt-code', { src: 'https://example.com/x.js' });
    expect(result.event).toBe('vt-error');
    await expect(page.locator('#el [part="error"]')).toContainText('Cross-origin URL blocked');
  });

  test('blocks non-http URLs', async ({ page }) => {
    for (const src of ['javascript:alert(1)', 'data:text/plain,hi', 'file:///etc/passwd']) {
      const result = await mount(page, 'vt-code', { src });
      expect(result.event, src).toBe('vt-error');
      await expect(page.locator('#el [part="error"]')).toContainText('only http(s) URLs');
    }
  });

  test('reports HTTP errors', async ({ page }) => {
    const result = await mount(page, 'vt-code', { src: '/virtual/missing.js' });
    expect(result.event).toBe('vt-error');
    await expect(page.locator('#el [part="error"]')).toContainText('HTTP 404');
  });

  test('stops reading responses above the size limit', async ({ page }) => {
    const result = await mount(page, 'vt-code', { src: '/virtual/huge.txt' });
    expect(result.event).toBe('vt-error');
    await expect(page.locator('#el [part="error"]')).toContainText('Content is too large');
  });

  test('the latest src wins when it changes quickly', async ({ page }) => {
    await page.evaluate(() => {
      const el = document.createElement('vt-code');
      el.id = 'el';
      el.setAttribute('src', '/virtual/slow.js');
      document.getElementById('root').append(el);
      el.setAttribute('src', '/virtual/fast.js');
    });
    await page.waitForTimeout(1200);
    await expect(page.locator('#el .content')).toHaveText('// /virtual/fast.js');
  });

  test('shows a loading skeleton while fetching', async ({ page }) => {
    await page.evaluate(() => {
      const el = document.createElement('vt-code');
      el.id = 'el';
      el.setAttribute('src', '/virtual/slow.js');
      document.getElementById('root').append(el);
    });
    await expect(page.locator('#el [part="loading"]')).toBeVisible();
    await expect(page.locator('#el .content')).toHaveText('// /virtual/slow.js');
  });
});
