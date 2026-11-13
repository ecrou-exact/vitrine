import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { NO_CSP, STRICT, collectErrors, mount, recordEvents } from './helpers.js';

/**
 * <vt-sql>, <vt-test-report>, <vt-trace>, <vt-notebook>, <vt-math> and <vt-diagram> on the
 * strict CSP page (enforced Trusted Types): every test also checks that nothing was refused
 * or reported in the console.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** @param {import('@playwright/test').Page} page */
const axe = async (page) =>
  (await new AxeBuilder({ page }).include('#el').withTags(AXE_TAGS).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );

/** @param {import('@playwright/test').Page} page */
const events = (page) => page.evaluate(() => /** @type {any} */ (window).__events);

const FLOWCHART =
  'flowchart LR\n  A[Order] --> B{Paid?}\n  B -- yes --> C[Ship]\n  B -- no --> D[Remind]';

test.describe('new technical elements', () => {
  /** @type {string[]} */
  let errors;

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.goto(STRICT);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('<vt-sql> reads a psql session and sorts a result', async ({ page }) => {
    await mount(
      page,
      'vt-sql',
      { variant: 'full', dialect: 'postgresql' },
      'app=# SELECT id, name FROM users;\n id | name\n----+------\n  2 | Alan\n  1 | Ada\n 10 |\n(3 rows)',
    );
    await recordEvents(page, ['vt-sort']);
    const el = page.locator('#el');
    await expect(el.locator('.sql-summary')).toContainText('3 rows');
    await el.getByRole('button', { name: 'id', exact: true }).click();
    await expect(el.locator('tbody tr td:first-child')).toHaveText(['1', '2', '10']);
    expect((await events(page))[0].detail).toMatchObject({ name: 'id', direction: 'ascending' });
    await el.getByRole('button', { name: 'Format the query' }).click();
    await expect(el.locator('.sql-query')).toContainText('SELECT\n  id,\n  name\nFROM users;');
  });

  test('<vt-test-report> filters by status and opens details', async ({ page }) => {
    await mount(
      page,
      'vt-test-report',
      { variant: 'full' },
      '<testsuite name="api"><testcase name="ok" time="0.1"/><testcase name="bad" time="0.2"><failure message="boom">\u001b[31mstack\u001b[0m</failure></testcase></testsuite>',
    );
    const el = page.locator('#el');
    await expect(el.locator('[part="summary"]')).toContainText('1 of 2 tests failed');
    await el.getByRole('button', { name: /^Failed/ }).click();
    await expect(el.locator('.tr-case')).toHaveCount(1);
    await el.getByRole('button', { name: 'Show details' }).click();
    await expect(el.locator('.tr-pre .fg-1')).toHaveText('stack');
  });

  test('<vt-trace> is a tree for the keyboard and shows the details of a span', async ({
    page,
  }) => {
    await mount(
      page,
      'vt-trace',
      { variant: 'full' },
      JSON.stringify([
        { id: 'a', name: 'GET /', service: 'web', start: 0, duration: 100 },
        { id: 'b', parent: 'a', name: 'query', service: 'db', start: 10, duration: 50, attributes: { 'db.system': 'postgresql' } }, // prettier-ignore
      ]),
    );
    await recordEvents(page, ['vt-select', 'vt-toggle']);
    const el = page.locator('#el');
    const rows = el.getByRole('treeitem');
    await expect(rows).toHaveCount(2);
    await rows.first().focus();
    await page.keyboard.press('ArrowLeft');
    await expect(rows).toHaveCount(1);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(el.locator('.tc-details-title')).toHaveText('query');
    await expect(el.locator('.tc-attrs')).toContainText('db.systempostgresql');
    const recorded = await events(page);
    expect(recorded.map((/** @type {any} */ e) => e.type)).toEqual(['vt-toggle', 'vt-toggle', 'vt-select']); // prettier-ignore
    expect(await axe(page)).toEqual([]);
  });

  test('<vt-notebook> shows outputs and hides the code like a report', async ({ page }) => {
    await mount(
      page,
      'vt-notebook',
      { variant: 'full' },
      JSON.stringify({
        cells: [
          { cell_type: 'markdown', source: '# Results' },
          { cell_type: 'code', execution_count: 1, source: 'df', outputs: [{ output_type: 'execute_result', execution_count: 1, data: { 'text/html': '<table><tr><th>a</th></tr><tr><td>1</td></tr></table>', 'text/plain': 'df' } }] }, // prettier-ignore
        ],
      }),
    );
    const el = page.locator('#el');
    await expect(el.locator('.nb-markdown h1')).toHaveText('Results');
    await expect(el.locator('.nb-html td')).toHaveText('1');
    await el.getByRole('button', { name: 'Hide code' }).click();
    await expect(el.locator('.nb-source')).toHaveCount(0);
  });

  test('<vt-math> draws MathML with Temml, numbers equations and explains errors', async ({
    page,
  }) => {
    await mount(
      page,
      'vt-math',
      { variant: 'full', numbered: '' },
      'e^{i\\pi} + 1 = 0\n\n\\frac{a',
    );
    const el = page.locator('#el');
    await expect(el.locator('math')).toHaveCount(1);
    await expect(el.locator('mi').first()).toHaveText('e');
    await expect(el.locator('.math-number')).toHaveText('(1)');
    await expect(el.locator('.math-error')).toContainText('could not be read');
    expect(await axe(page)).toEqual([]);
  });

  test('<vt-math inline> sits in a line of text', async ({ page }) => {
    await page.evaluate(() => {
      const p = document.createElement('p');
      p.append('Euler: ');
      const math = document.createElement('vt-math');
      math.id = 'el';
      math.setAttribute('inline', '');
      math.textContent = 'e^{i\\pi}+1=0';
      p.append(math, '.');
      document.getElementById('root')?.replaceChildren(p);
    });
    const el = page.locator('#el');
    await expect(el.locator('math')).toHaveCount(1);
    expect(await el.evaluate((m) => getComputedStyle(m).display)).toBe('inline');
  });

  for (const theme of ['light', 'dark']) {
    test(`<vt-diagram> draws a Mermaid flowchart in the ${theme} theme`, async ({ page }) => {
      await mount(page, 'vt-diagram', { variant: 'full', theme, label: 'Order flow' }, FLOWCHART);
      const el = page.locator('#el');
      await expect(el.locator('.dg-canvas > svg')).toHaveCount(1, { timeout: 15000 });
      await expect(el.locator('.dg-canvas > svg')).toContainText('Ship');
      // Mermaid's stylesheet is applied: labels are not in the default black.
      const fill = await el.locator('.dg-canvas > svg .node rect, .dg-canvas > svg .node polygon').first().evaluate((n) => getComputedStyle(n).fill); // prettier-ignore
      expect(fill).not.toBe('rgb(0, 0, 0)');
      expect(await axe(page)).toEqual([]);
    });
  }

  test('<vt-diagram> shows the source and the reason of an error', async ({ page }) => {
    await mount(page, 'vt-diagram', { variant: 'full' }, 'flowchart LR\n  A --> B -->');
    const el = page.locator('#el');
    await expect(el.locator('.dg-error')).toBeVisible({ timeout: 15000 });
    await expect(el.locator('.dg-source')).toContainText('A --> B');
    await el.getByRole('tab', { name: 'Source' }).click();
    await expect(el.locator('.dg-source')).toBeVisible();
  });
});

test.describe('new technical elements, hostile content', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const trap = () => {
        /** @type {any} */ (window).__xss = true;
      };
      window.alert = trap;
      window.confirm = trap;
      window.prompt = trap;
    });
    await page.goto(NO_CSP);
  });

  test('<vt-diagram> never runs what a diagram holds', async ({ page }) => {
    const sources = [
      'flowchart LR\n  A["<img src=x onerror=alert(1)>"] --> B["<script>alert(2)</script>"]\n  click A "javascript:alert(3)"\n  style A fill:url(https://tracker.example/x)',
      'flowchart LR\n  A[x] --> B[y]\n  classDef evil fill:red} body{display:none} .x{color:red\n  class A evil',
      'sequenceDiagram\n  Alice->>Bob: <img src=x onerror=alert(4)>\n  Note over Bob: <a href="javascript:alert(5)">x</a>',
      '%%{init: {"securityLevel": "loose", "startOnLoad": true}}%%\nflowchart LR\n  A["<b onmouseover=alert(6)>b</b>"] --> B',
    ];
    for (const source of sources) {
      await mount(page, 'vt-diagram', {}, source);
      await expect(page.locator('#el .dg-canvas:not(.pending)')).toHaveCount(1, { timeout: 15000 });
      const problems = await page.evaluate(() => {
        const root = /** @type {any} */ (document.getElementById('el')).shadowRoot;
        const found = [];
        for (const node of root.querySelectorAll('*')) {
          for (const attr of node.attributes) {
            if (/^on/i.test(attr.name)) found.push(`${node.localName}[${attr.name}]`);
            if (/href$/i.test(attr.name) && !attr.value.startsWith('#')) found.push(`${node.localName}[${attr.name}=${attr.value}]`); // prettier-ignore
          }
          if (['script', 'img', 'iframe', 'foreignobject', 'a'].includes(node.localName)) found.push(node.localName); // prettier-ignore
        }
        return found;
      });
      expect(problems, source).toEqual([]);
      await page.locator('#el').hover();
    }
    // The page itself was never restyled by a diagram.
    expect(await page.evaluate(() => getComputedStyle(document.body).display)).not.toBe('none');
    expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => /** @type {any} */ (window).__xss)).toBeUndefined();
  });

  test('<vt-notebook> shows SVG outputs only as images', async ({ page }) => {
    await mount(
      page,
      'vt-notebook',
      {},
      JSON.stringify({
        cells: [
          { cell_type: 'code', source: 'x', outputs: [{ output_type: 'display_data', data: { 'image/svg+xml': '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>' } }] }, // prettier-ignore
        ],
      }),
    );
    await expect(page.locator('#el img.nb-img')).toHaveCount(1);
    await expect(page.locator('#el svg[onload], #el script')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => /** @type {any} */ (window).__xss)).toBeUndefined();
  });
});
