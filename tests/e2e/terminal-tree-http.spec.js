import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, events, mount, recordEvents } from './helpers.js';

const ESC = '\u001b';

test.describe('<vt-terminal>', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('splits commands and output and renders ANSI styles', async ({ page }) => {
    await mount(
      page,
      'vt-terminal',
      { variant: 'full' },
      `$ npm test\n${ESC}[1;32mPASS${ESC}[0m all good\nloading 10%\rloading 100%\n$ echo done\ndone`,
    );
    const el = page.locator('#el');
    await expect(el.locator('[part~="command"]')).toHaveCount(2);
    await expect(el.locator('[part~="prompt"]').first()).toHaveText('$ ');
    await expect(el.locator('.fg-10.bold')).toHaveText('PASS');
    await expect(el.locator('[part~="output"]').first()).toContainText('loading 100%');
    await expect(el.locator('[part~="output"]').first()).not.toContainText('loading 10%');
    expect(await page.evaluate(() => document.getElementById('el').commands)).toEqual([
      'npm test',
      'echo done',
    ]);
  });

  test('copies a command without its prompt, and all commands from the header', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Clipboard permissions are Chromium-only in Playwright');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await mount(page, 'vt-terminal', { variant: 'full' }, 'ada@box:~$ ls -la\nfile\n$ pwd\n/home');
    const el = page.locator('#el');
    await el.locator('[part~="command"]').first().hover();
    await el.getByRole('button', { name: 'Copy command', exact: true }).first().click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('ls -la');
    await el.getByRole('button', { name: 'Copy commands' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('ls -la\npwd');
  });

  test('collapses long output and search opens it', async ({ page }) => {
    const output = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
    await mount(
      page,
      'vt-terminal',
      { variant: 'full', 'collapse-output': '5' },
      `$ make\n${output}`,
    );
    const el = page.locator('#el');
    const more = el.getByRole('button', { name: 'Show 25 more lines' });
    await expect(more).toBeVisible();
    await expect(el.getByText('line 20', { exact: true })).toBeHidden();
    await el.getByRole('button', { name: 'Search' }).click();
    await el.getByRole('searchbox').fill('line 20');
    await expect(el.locator('mark.current')).toBeVisible();
  });

  test('typing replay ends with the full transcript', async ({ page }) => {
    await page.evaluate(() => {
      const el = document.createElement('vt-terminal');
      el.id = 'el';
      el.setAttribute('typing', '');
      el.setAttribute('typing-speed', '5');
      el.content = '$ echo hi\nhi';
      window.__ended = new Promise((resolve) => el.addEventListener('vt-typing-end', resolve));
      document.getElementById('root').replaceChildren(el);
    });
    await page.evaluate(() => window.__ended);
    const el = page.locator('#el');
    await expect(el.locator('.typing-hidden')).toHaveCount(0);
    await expect(el.locator('[part~="command-text"]')).toHaveText('echo hi');
  });

  test('only http(s) links are kept', async ({ page }) => {
    await mount(
      page,
      'vt-terminal',
      { prompt: 'none' },
      `${ESC}]8;;https://example.com${ESC}\\docs${ESC}]8;;${ESC}\\ ${ESC}]8;;javascript:alert(1)${ESC}\\bad${ESC}]8;;${ESC}\\`,
    );
    const links = page.locator('#el a');
    await expect(links).toHaveCount(1);
    await expect(links).toHaveAttribute('href', 'https://example.com');
    await expect(links).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  });
});

test.describe('<vt-tree>', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  const TREE = 'src/\n  lib/\n    util.js\n  app.js  # entry\nREADME.md\npackage.json';

  test('renders an ARIA tree with levels, notes and counts', async ({ page }) => {
    await mount(page, 'vt-tree', { variant: 'full' }, TREE);
    const el = page.locator('#el');
    await expect(el.getByRole('tree')).toBeVisible();
    await expect(el.getByRole('treeitem')).toHaveCount(6);
    await expect(el.getByRole('treeitem', { name: /util\.js/ })).toHaveAttribute('aria-level', '3');
    await expect(el.locator('[part~="note"]')).toHaveText('entry');
    await expect(el.locator('[part="badge"]')).toHaveText('2 folders, 4 files');
  });

  test('keyboard: arrows, open and close, type-ahead, select', async ({ page }) => {
    await mount(page, 'vt-tree', { variant: 'full' }, TREE);
    await recordEvents(page, ['vt-select', 'vt-toggle']);
    const el = page.locator('#el');
    const src = el.getByRole('treeitem', { name: /^src/ });
    await src.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(src).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowDown');
    await expect(el.getByRole('treeitem', { name: /README/ })).toBeFocused();
    await page.keyboard.press('p');
    await expect(el.getByRole('treeitem', { name: /package/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(el.locator('[part="path"] code')).toHaveText('package.json');
    const recorded = await events(page);
    expect(recorded[0]).toEqual({ type: 'vt-toggle', detail: { path: 'src', expanded: false } });
    expect(recorded.at(-1)).toMatchObject({
      type: 'vt-select',
      detail: { path: 'package.json', type: 'file' },
    });
  });

  test('search filters the tree to matches and their folders', async ({ page }) => {
    await mount(page, 'vt-tree', { variant: 'full' }, TREE);
    const el = page.locator('#el');
    await el.getByRole('button', { name: 'Search' }).click();
    await el.getByRole('searchbox').fill('util');
    await expect(el.getByRole('treeitem')).toHaveCount(3);
    await el.getByRole('searchbox').fill('');
    await expect(el.getByRole('treeitem')).toHaveCount(6);
  });

  test('href-template links files and refuses unsafe URLs', async ({ page }) => {
    await mount(
      page,
      'vt-tree',
      { 'href-template': 'https://github.com/ada/app/blob/main/{path}' },
      'src/\n  a b.js',
    );
    await expect(page.locator('#el a')).toHaveAttribute(
      'href',
      'https://github.com/ada/app/blob/main/src/a%20b.js',
    );
    await mount(page, 'vt-tree', { 'href-template': 'javascript:alert(1)//{path}' }, 'a.js');
    await expect(page.locator('#el a')).toHaveCount(0);
  });

  test('depth closes deeper folders and expand all opens them', async ({ page }) => {
    await mount(page, 'vt-tree', { variant: 'full', depth: '0' }, TREE);
    const el = page.locator('#el');
    await expect(el.getByRole('treeitem')).toHaveCount(3);
    await el.getByRole('button', { name: 'Expand all' }).click();
    await expect(el.getByRole('treeitem')).toHaveCount(6);
  });
});

test.describe('<vt-http>', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  const RAW = [
    'POST /v1/tasks?api_key=demo_key_1234567890abcdef HTTP/1.1',
    'Host: api.example.com',
    'Content-Type: application/json',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
    '',
    '{"title":"Docs","n":9007199254740993}',
    '',
    'HTTP/1.1 201 Created',
    'Content-Type: application/json',
    '',
    '{"id":981}',
  ].join('\n');

  test('shows method, URL, status and a formatted body', async ({ page }) => {
    await mount(page, 'vt-http', { variant: 'full' }, RAW);
    const el = page.locator('#el');
    await expect(el.locator('[part~="method"]')).toHaveText('POST');
    await expect(el.locator('[part~="status"]')).toHaveText('201 Created');
    await expect(el.locator('[part~="status"]')).toHaveAttribute('part', /status-2xx/);
    await expect(el.locator('[part~="request"] [part~="message-body"]')).toContainText(
      '"n": 9007199254740993',
    );
  });

  test('masks secrets until revealed, everywhere', async ({ page }) => {
    await mount(page, 'vt-http', { variant: 'full' }, RAW);
    const el = page.locator('#el');
    await expect(el.locator('[part~="url"]')).toContainText('api_key=••••••••');
    await el
      .getByRole('tab', { name: /Headers/ })
      .first()
      .click();
    await expect(el.getByRole('cell', { name: 'Bearer ••••••••wxyz' })).toBeVisible();
    await el.getByRole('tab', { name: 'Code' }).click();
    await expect(el.locator('[part~="snippet"]')).not.toContainText('abcdefghijklmnop');
    await el.getByRole('button', { name: 'Show secrets' }).click();
    await expect(el.locator('[part~="snippet"]')).toContainText('abcdefghijklmnopqrstuvwxyz');
  });

  test('writes the request for each language', async ({ page }) => {
    await mount(page, 'vt-http', { variant: 'full', view: 'code', 'mask-secrets': 'false' }, RAW);
    await recordEvents(page, ['vt-tab-change']);
    const el = page.locator('#el');
    const snippet = el.locator('[part~="snippet"]');
    await expect(snippet).toContainText("curl 'https://api.example.com/v1/tasks?api_key=");
    await el.getByRole('tab', { name: 'Python' }).click();
    await expect(snippet).toContainText('requests.post(');
    await expect(snippet).toContainText('"n": 9007199254740993');
    await el.getByRole('tab', { name: 'fetch' }).click();
    await expect(snippet).toContainText('await fetch(');
    expect((await events(page)).map((e) => e.detail.tab)).toEqual(['python', 'fetch']);
  });

  test('reads a curl command', async ({ page }) => {
    await mount(
      page,
      'vt-http',
      { variant: 'full' },
      "curl -X PATCH 'https://x.dev/items/7' -H 'Accept: application/json' --data-raw '{\"done\":true}'",
    );
    const el = page.locator('#el');
    await expect(el.locator('[part~="method"]')).toHaveText('PATCH');
    await expect(el.locator('[part~="url"]')).toHaveText('https://x.dev/items/7');
  });

  test('explains what is wrong with an unreadable message', async ({ page }) => {
    await mount(page, 'vt-http', {}, 'curl -s');
    await expect(page.locator('#el [part~="notice"]')).toContainText(
      'The curl command has no URL.',
    );
  });
});
