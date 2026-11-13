import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { STRICT, mount } from './helpers.js';

const SAMPLES = {
  'vt-code':
    'def hello(name):\n    return f"Hello {name}"  # greet\n\nprint(hello("world"), 42, None)',
  'vt-markdown':
    '# Title\n\nText with a [link](https://example.com) and `code`.\n\n## Part\n\n- [x] done\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst a = 1; // note\n```\n\n> quote',
  'vt-json':
    '{"name": "Ada", "age": 36, "admin": true, "tags": ["a", "b"], "manager": null, "nested": {"x": 1}}',
};
const THEMES = ['light', 'dark', 'dim', 'paper', 'high-contrast'];
const MORE = {
  'vt-faq': [
    JSON.stringify([
      { question: 'Q one?', answer: 'A *one*', category: 'X' },
      { question: 'Q two?', answer: 'A two', category: 'Y' },
    ]),
    { open: 'first' },
  ],
  'vt-gallery': [
    JSON.stringify([
      {
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        alt: 'One',
        caption: 'First',
      },
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    ]),
    {},
  ],
  'vt-stats': [
    JSON.stringify([
      { label: 'Visitors', value: 120, previous: 100, series: [1, 3, 2] },
      { label: 'Errors', value: 3, previous: 5, good: 'down' },
    ]),
    {},
  ],
  'vt-board': [
    '{"columns":[{"id":"todo"},{"id":"done","limit":1}],"tasks":[{"id":"a","title":"A","column":"todo","labels":["x"],"priority":"urgent","due":"2026-01-01","assignee":"Ada Lovelace","progress":40},{"id":"b","title":"B","column":"done","url":"/b"},{"id":"c","title":"C","column":"done"}]}',
    { views: '', now: '2026-11-07T12:00:00Z' },
  ],
  'vt-field': [
    '["France","Germany",{"value":"lu","label":"Luxembourg","description":"Grand Duchy"}]',
    { type: 'select', required: '', hint: 'Where you live.', tip: 'Sets the currency.' },
  ],
  'vt-search': [
    '[{"id":"a","title":"Getting started","section":"Guides","content":"Install it.","featured":true},{"id":"b","title":"Board","section":"Components","content":"Drag and drop.","featured":true}]',
    {},
  ],
  'vt-date-picker': [
    '',
    {
      mode: 'range',
      inline: '',
      required: '',
      hint: 'Your stay.',
      now: '2026-11-18',
      value: '2026-11-20/2026-11-24',
      'disabled-dates': '2026-11-26 sun',
      min: 'today',
    },
  ],
  'vt-menu': [
    '[{"label":"Rename","shortcut":"F2","icon":"pencil"},{"label":"Share","items":["Link"]},"---",{"type":"radio","label":"Sort","items":[{"label":"Name","checked":true},"Date"]},{"type":"checkbox","label":"Wrap"},{"label":"Archived","disabled":true},{"label":"Delete","danger":true}]',
    { trigger: 'inline' },
  ],
  'vt-upload': [
    '',
    {
      required: '',
      multiple: '',
      accept: 'image/*,.pdf',
      'max-size': '5MB',
      'max-files': '3',
      hint: 'Screenshots or a PDF.',
    },
  ],
  'vt-testimonials': [
    JSON.stringify([
      { quote: 'Great', author: 'Ada Lovelace', role: 'CTO', rating: 5, url: '/r' },
      { quote: 'Good', author: 'Alan', rating: 4 },
    ]),
    {},
  ],
  'vt-countdown': [
    JSON.stringify({ to: '2027-01-01T00:00:00Z', title: 'Launch', url: '/l', cta: 'More' }),
    { now: '2026-11-07T12:00:00Z' },
  ],
  'vt-status': [
    '{"components":[{"name":"API","status":"degraded","since":"2026-10-01","group":"Core","url":"/api","history":{"2026-10-20":"major","2026-10-21":"partial","2026-10-22":"maintenance"}}],"incidents":[{"title":"Slow","status":"identified","impact":"minor","updates":[{"status":"identified","text":"Found"}]},{"title":"Old","status":"resolved","url":"/old"}],"maintenances":[{"title":"Upgrade","start":"2099-01-01T00:00:00Z"}]}',
    { now: '2026-11-05T12:00:00Z' },
  ],
  'vt-calendar': [
    '[{"title":"Lunch","start":"2026-11-05T12:00:00Z","url":"/lunch"},{"title":"Holiday","start":"2026-11-11"},{"title":"Off","start":"2026-11-06T12:00:00Z","cancelled":true}]',
    { now: '2026-11-05T12:00:00Z', timezone: 'UTC' },
  ],
  'vt-pricing': [
    '{"currencies":["EUR","USD"],"plans":[{"id":"a","name":"A","price":{"monthly":{"EUR":1,"USD":2},"yearly":{"EUR":10,"USD":20}},"features":["One",{"text":"Two","included":false}]},{"id":"b","name":"B","badge":"Best","highlight":true,"price":"Ask","cta":{"label":"Go","url":"/go"}}],"compare":[{"group":"G","name":"Row","description":"Note","values":{"a":true,"b":"Yes"}}]}',
    {},
  ],
  'vt-sql': [
    'app=# SELECT id, name FROM users;\n id | name\n----+------\n  1 | Ada\n  2 |\n(2 rows)\n\napp=# SELECT * FROM nope;\nERROR:  relation "nope" does not exist',
    { dialect: 'postgresql' },
  ],
  'vt-test-report': [
    '<testsuites><testsuite name="api"><testcase name="ok" time="0.1"/><testcase name="bad" time="0.2"><failure message="boom">trace</failure></testcase><testcase name="later"><skipped/></testcase></testsuite></testsuites>',
    {},
  ],
  'vt-trace': [
    JSON.stringify([
      { id: 'a', name: 'GET /', service: 'web', start: 0, duration: 100 },
      {
        id: 'b',
        parent: 'a',
        name: 'query',
        service: 'db',
        start: 10,
        duration: 50,
        error: 'slow',
      },
    ]),
    { selected: 'b' },
  ],
  'vt-notebook': [
    JSON.stringify({
      cells: [
        { cell_type: 'markdown', source: '# Title\n\nSome *text*.' },
        {
          cell_type: 'code',
          execution_count: 1,
          source: 'print(1)\n1 + 1',
          outputs: [
            { output_type: 'stream', name: 'stdout', text: '1\n' },
            { output_type: 'execute_result', execution_count: 1, data: { 'text/plain': '2' } },
            { output_type: 'display_data', data: { 'text/html': '<table><tr><th>a</th></tr><tr><td>1</td></tr></table>' } }, // prettier-ignore
            {
              output_type: 'error',
              ename: 'E',
              evalue: 'v',
              traceback: ['\u001b[31mE\u001b[0m: v'],
            },
          ],
        },
      ],
    }),
    {},
  ],
  'vt-csv': ['name,score\nAda,98\nAlan,95', {}],
  'vt-tags': ['{"value":["design"],"options":["design","research","a11y"]}', { mode: 'edit' }],
  'vt-diff': ['--- a\n+++ b\n@@ -1,2 +1,2 @@\n same\n-old line\n+new line', {}],
  'vt-terminal': [
    '$ npm test\n\u001b[32m✓\u001b[0m 42 passed\n\u001b[31m×\u001b[0m 1 failed\n\u001b[41m FAIL \u001b[0m\n$ git status',
    { 'collapse-output': '2' },
  ],
  'vt-tree': ['src/\n  + app.js  # entry\n  ~ util.js\n  - old.js\n* README.md', {}],
  'vt-http': [
    'POST /api/users HTTP/1.1\nHost: api.example.com\nContent-Type: application/json\nAuthorization: Bearer abcdefghijklmnopqrst\n\n{"name":"Ada"}\n\nHTTP/1.1 404 Not Found\nContent-Type: application/json\n\n{"error":"missing"}',
    { layout: 'columns' },
  ],
};

test.describe('Accessibility (axe-core, WCAG 2.2 AA)', () => {
  for (const [tag, content] of Object.entries(SAMPLES)) {
    for (const theme of THEMES) {
      test(`${tag} full variant, ${theme} theme`, async ({ page }) => {
        await page.goto(STRICT);
        await mount(
          page,
          tag,
          { variant: 'full', theme, label: `${tag} sample`, 'highlight-lines': '2' },
          content,
        );
        const results = await new AxeBuilder({ page })
          .include('#el')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        const summary = results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        );
        expect(summary).toEqual([]);
      });
    }
  }

  for (const [tag, [content, extra]] of Object.entries(MORE)) {
    for (const theme of ['light', 'dark']) {
      test(`${tag} full variant, ${theme} theme`, async ({ page }) => {
        await page.goto(STRICT);
        await mount(
          page,
          tag,
          { variant: 'full', theme, label: `${tag} sample`, ...extra },
          content,
        );
        const results = await new AxeBuilder({ page })
          .include('#el')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          results.violations.map(
            (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
          ),
        ).toEqual([]);
      });
    }
  }

  for (const theme of ['light', 'dark']) {
    test(`vt-search dialog and vt-field list open, ${theme} theme`, async ({ page }) => {
      await page.goto(STRICT);
      await mount(
        page,
        'vt-field',
        { theme, type: 'multiselect', label: 'Topics', value: 'a' },
        '[{"group":"G","options":["a","b"]}]',
      );
      await page.locator('#el .field-trigger').click();
      const field = await new AxeBuilder({ page })
        .include('#el')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(field.violations.map((v) => v.id)).toEqual([]);
      await mount(
        page,
        'vt-search',
        { theme },
        '[{"id":"a","title":"Getting started","section":"Guides","content":"Install it.","featured":true},{"id":"b","title":"Board","section":"Components","content":"Drag and drop.","featured":true}]',
      );
      await page.locator('#el .search-trigger').click();
      await page.locator('#el input').fill('board');
      const search = await new AxeBuilder({ page })
        .include('#el')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        search.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([]);
    });
  }

  test('editors are accessible', async ({ page }) => {
    await page.goto(STRICT);
    await mount(page, 'vt-markdown', { variant: 'full', mode: 'edit' }, '# Notes\n\nText');
    const results = await new AxeBuilder({ page })
      .include('#el')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('search bar and tabs are accessible when open', async ({ page }) => {
    await page.goto(STRICT);
    await mount(
      page,
      'vt-markdown',
      { variant: 'full', 'default-tab': 'split' },
      SAMPLES['vt-markdown'],
    );
    await page.locator('#el').getByRole('button', { name: 'Search' }).click();
    await page.locator('#el').getByRole('searchbox').fill('a');
    const results = await new AxeBuilder({ page })
      .include('#el')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('every icon button has an accessible name', async ({ page }) => {
    await page.goto(STRICT);
    for (const tag of Object.keys(SAMPLES)) {
      await mount(page, tag, { variant: 'full' }, SAMPLES[tag]);
      const unnamed = await page
        .locator('#el button')
        .evaluateAll(
          (buttons) =>
            buttons.filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim())).length,
        );
      expect(unnamed, tag).toBe(0);
    }
  });

  test('respects prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(STRICT);
    await mount(page, 'vt-json', { variant: 'full' }, SAMPLES['vt-json']);
    const duration = await page
      .locator('#el .toggle .icon')
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration).toBe('0s');
  });
});
