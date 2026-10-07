import { expect, test } from '@playwright/test';
import { STRICT, collectErrors, events, mount, recordEvents } from './helpers.js';

const CSV =
  'name,score,joined\nAda,98.5,1842-10-01\nAlan,,1936-05-28\n"Hopper, Grace",91,1944-01-01\nMargaret,99,1969-07-20\n';

test.describe('<vt-csv>', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('renders a table with typed columns', async ({ page }) => {
    await mount(page, 'vt-csv', { variant: 'full' }, CSV);
    const table = page.locator('#el table');
    await expect(table.locator('thead th[scope="col"]')).toHaveCount(4);
    await expect(table.locator('tbody tr')).toHaveCount(4);
    await expect(table.locator('tbody td').nth(3)).toHaveText('Alan');
    await expect(table.locator('td.col-number').first()).toHaveText('98.5');
  });

  test('sorts numbers by value, empty cells last, then restores the order', async ({ page }) => {
    await mount(page, 'vt-csv', { variant: 'full' }, CSV);
    const score = page.locator('#el').getByRole('button', { name: /score/ });
    const names = () => page.locator('#el tbody td[data-column="0"]').allTextContents();
    await score.click();
    expect(await names()).toEqual(['Hopper, Grace', 'Ada', 'Margaret', 'Alan']);
    await expect(page.locator('#el th[aria-sort="ascending"]')).toHaveCount(1);
    await score.click();
    expect(await names()).toEqual(['Margaret', 'Ada', 'Hopper, Grace', 'Alan']);
    await score.click();
    expect(await names()).toEqual(['Ada', 'Alan', 'Hopper, Grace', 'Margaret']);
  });

  test('paginates and filters with search', async ({ page }) => {
    const rows = Array.from({ length: 250 }, (_, i) => `row ${i},${i}`).join('\n');
    await mount(
      page,
      'vt-csv',
      { variant: 'full', 'header-row': 'false', 'page-size': '50' },
      rows,
    );
    const el = page.locator('#el');
    await expect(el.locator('[part="pager"]')).toContainText('Rows 1–50 of 250');
    await el.getByRole('button', { name: 'Last page' }).click();
    await expect(el.locator('[part="pager"]')).toContainText('Rows 201–250 of 250');
    await el.getByRole('button', { name: 'Search' }).click();
    await el.getByRole('searchbox').fill('row 24');
    await expect(el.locator('tbody tr')).toHaveCount(11);
  });

  test('warns about an unclosed quote but still shows the rows', async ({ page }) => {
    await mount(page, 'vt-csv', {}, 'a,b\n1,2\n"open,3\n4,5');
    await expect(page.locator('#el [part="notice"]')).toHaveText(
      'Unclosed quote starting at line 3.',
    );
    await expect(page.locator('#el tbody tr')).toHaveCount(2);
  });
});

test.describe('<vt-diff>', () => {
  /** @type {string[]} */
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  /** @param {import('@playwright/test').Page} page */
  async function mountDiff(page, attrs, original, modified) {
    await page.evaluate(
      ({ attrs, original, modified }) => {
        const el = document.createElement('vt-diff');
        el.id = 'el';
        for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
        el.original = original;
        el.modified = modified;
        document.getElementById('root').replaceChildren(el);
      },
      { attrs, original, modified },
    );
    await page.locator('#el .diff-host > *').waitFor();
  }

  const A =
    'export function area(r) {\n  return 2 * 3.14 * r;\n}\none\ntwo\nthree\nfour\nfive\nsix\nend\n';
  const B =
    'export function area(r) {\n  return 2 * Math.PI * r;\n}\none\ntwo\nthree\nfour\nfive\nsix\nend\nadded\n';

  test('side by side: paired lines, word marks, stats', async ({ page }) => {
    await mountDiff(page, { variant: 'full', context: '1' }, A, B);
    const el = page.locator('#el');
    await expect(el.locator('[part="badge"]')).toHaveText('+2 −1');
    await expect(el.locator('.row.delete.insert')).toHaveCount(1);
    await expect(el.locator('.left mark.word-change')).toHaveText(['3', '14']);
    await expect(el.locator('.right mark.word-change')).toHaveText(['Math', 'PI']);
  });

  test('folds unchanged lines and expands them', async ({ page }) => {
    await mountDiff(page, { view: 'unified', context: '1' }, A, B);
    const fold = page.locator('#el [part="fold"]');
    // 8 unchanged lines between the changes, minus 1 line of context on each side.
    await expect(fold).toHaveText('Show 6 unchanged lines');
    await fold.click();
    await expect(page.locator('#el [part="fold"]')).toHaveCount(0);
  });

  test('the patch property is a standard unified patch', async ({ page }) => {
    await mountDiff(page, { 'original-label': 'a/x.js', 'modified-label': 'b/x.js' }, A, B);
    const patch = await page.evaluate(() => document.getElementById('el').patch);
    expect(patch.split('\n').slice(0, 3)).toEqual(['--- a/x.js', '+++ b/x.js', '@@ -1,5 +1,5 @@']);
  });

  test('reads a git patch', async ({ page }) => {
    await mount(
      page,
      'vt-diff',
      { view: 'unified' },
      '--- a/f\n+++ b/f\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n@@ -10,1 +10,2 @@\n x\n+y\n',
    );
    const el = page.locator('#el');
    await expect(el.locator('.row.insert')).toHaveCount(2);
    await expect(el.locator('[part="hunk"]')).toHaveCount(1);
  });

  test('edit mode recomputes the comparison', async ({ page }) => {
    await mountDiff(page, { mode: 'edit', view: 'unified' }, 'a\nb\n', 'a\nb\n');
    const el = page.locator('#el');
    await expect(el.locator('[part="empty"]')).toHaveText('No differences');
    await el.locator('textarea').nth(1).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('c\n');
    await expect(el.locator('.row.insert')).toHaveCount(1);
  });

  test('arrows and n / p move between changes', async ({ page }) => {
    const original = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
    const modified = original.map((line, i) => (i % 50 === 10 ? `${line} changed` : line));
    await mountDiff(
      page,
      { variant: 'full', context: 'all', 'max-height': '200px' },
      original.join('\n'),
      modified.join('\n'),
    );
    await recordEvents(page, ['vt-change-navigate']);
    const el = page.locator('#el');
    const count = el.locator('[part~="change-count"]');
    await expect(count).toHaveText('4 changes');
    const next = el.getByRole('button', { name: 'Next change' });
    const previous = el.getByRole('button', { name: 'Previous change' });
    await next.click();
    await expect(count).toHaveText('1 of 4');
    await expect(previous).toBeDisabled();
    await next.click();
    await expect(count).toHaveText('2 of 4');
    await expect(el.locator('.row.current-change')).toHaveCount(1);
    await expect(el.locator('.row.current-change [data-n="61"]').first()).toBeInViewport();
    await el.locator('.diff-body').focus();
    await page.keyboard.press('n');
    await page.keyboard.press('n');
    await expect(count).toHaveText('4 of 4');
    await expect(next).toBeDisabled();
    await page.keyboard.press('Alt+ArrowUp');
    await expect(count).toHaveText('3 of 4');
    expect((await events(page)).at(-1)).toEqual({
      type: 'vt-change-navigate',
      detail: { index: 2, total: 4, original: 111, modified: 111 },
    });
  });

  test('edit mode: the two editors scroll to matching lines', async ({ page }) => {
    const original = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`);
    // 20 lines added near the top: line N of the original is line N + 20 on the right.
    const modified = [...original.slice(0, 5), ...Array(20).fill('new'), ...original.slice(5)];
    await mountDiff(
      page,
      { mode: 'edit', variant: 'full' },
      original.join('\n'),
      modified.join('\n'),
    );
    const panes = page.locator('#el .diff-editor .editor-body');
    await panes.nth(0).evaluate((pane) => {
      const line = pane.querySelectorAll('.editor-layer .line')[149];
      pane.scrollTop += line.getBoundingClientRect().top - pane.getBoundingClientRect().top;
    });
    const firstVisible = () =>
      panes.evaluateAll((list) =>
        list.map((pane) => {
          const top = pane.getBoundingClientRect().top;
          const line = Array.from(pane.querySelectorAll('.editor-layer .line')).find(
            (row) => row.getBoundingClientRect().top >= top - 1,
          );
          return line?.textContent.trim();
        }),
      );
    await expect.poll(firstVisible).toEqual(['line 150', 'line 150']);
    // Turning sync off leaves the other editor where it is.
    await page.locator('#el').getByRole('button', { name: 'Sync scrolling' }).click();
    await panes.nth(0).evaluate((pane) => (pane.scrollTop = 0));
    await page.waitForTimeout(200);
    expect((await firstVisible())[1]).toBe('line 150');
  });
});

test.describe('Syntax themes', () => {
  test('load on demand, apply to the code area, and never request unknown names', async ({
    page,
  }) => {
    const requests = [];
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await page.goto(STRICT);
    await mount(page, 'vt-code', { 'syntax-theme': 'github-dark', language: 'js' }, 'const a = 1;');
    await expect
      .poll(() => page.locator('#el .body').evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgb(13, 17, 23)');
    expect(requests).toContain('/dist/syntax-themes/github-dark.css');
    for (const name of ['../../evil', 'https://evil.example/x', 'nope']) {
      await mount(page, 'vt-code', { 'syntax-theme': name }, 'x');
    }
    expect(requests.filter((p) => p.includes('evil') || p.endsWith('/nope.css'))).toEqual([]);
  });

  test('syntax-theme-dark is used with a dark interface theme', async ({ page }) => {
    await page.goto(STRICT);
    await mount(
      page,
      'vt-code',
      { theme: 'dark', 'syntax-theme': 'github', 'syntax-theme-dark': 'github-dark' },
      'x',
    );
    await expect
      .poll(() => page.locator('#el .body').evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgb(13, 17, 23)');
  });
});
