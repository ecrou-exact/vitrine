/**
 * Stress lab: generates hostile content, renders it, and reports timing, outcome and
 * whether the page stayed responsive.
 */

const XSS = [
  '<script>window.__xss = 1</script>',
  '<img src=x onerror="window.__xss = 2">',
  '<svg onload="window.__xss = 3"><circle r="4"/></svg>',
  '<a href="javascript:window.__xss = 4">link</a>',
  '[md link](javascript:window.__xss=5)',
  '<iframe srcdoc="<script>parent.__xss = 6</script>"></iframe>',
  '<details open ontoggle="window.__xss = 7">x</details>',
  '<math><mtext><table><mglyph><style><img src=x onerror="window.__xss = 8">',
  '<noscript><p title="</noscript><img src=x onerror=window.__xss=9>">',
  '<form><button formaction="javascript:window.__xss=10">go</button></form>',
  '<a href="&#106;avascript:window.__xss=11">entity link</a>',
  '<div style="background:url(javascript:window.__xss=12)">styled</div>',
  '![x](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)',
  '<object data="javascript:window.__xss=13"></object>',
];

const TRIALS = [
  {
    title: '2 MB of code',
    detail:
      'Just under the default size limit. Highlighting switches off above 300 KB to keep the page responsive.',
    run: () =>
      mount(
        'vt-code',
        { variant: 'full', language: 'js', 'max-height': '420px' },
        'const answer = compute(42); // line\n'.repeat(55_000),
      ),
  },
  {
    title: 'Content above the limit',
    detail: '3 MB is refused with a clear message instead of freezing the page.',
    run: () => mount('vt-code', { variant: 'full' }, 'x'.repeat(3 * 1024 * 1024)),
  },
  {
    title: '1,000,000 characters on one line',
    detail: 'A single huge line, with line wrapping on.',
    run: () =>
      mount('vt-code', { variant: 'full', wrap: '', 'max-height': '300px' }, 'a'.repeat(1_000_000)),
  },
  {
    title: '100,000 nested arrays',
    detail: 'The JSON parser never recurses and stops at 512 levels.',
    run: () => mount('vt-json', { variant: 'full' }, '['.repeat(100_000) + ']'.repeat(100_000)),
  },
  {
    title: '50,000-item array',
    detail: 'Large containers show 100 children at a time.',
    run: () =>
      mount(
        'vt-json',
        { variant: 'full', 'max-height': '420px' },
        JSON.stringify(Array.from({ length: 50_000 }, (_, i) => ({ id: i, ok: i % 3 === 0 }))),
      ),
  },
  {
    title: 'Expand all on 20,000 objects',
    detail:
      'Click "Expand all": it stops after 5,000 visible rows and says so. Raw opens at once: its 220,000 lines are built as you scroll.',
    run: () =>
      mount(
        'vt-json',
        { variant: 'full', depth: '1', 'max-height': '420px' },
        JSON.stringify(
          Array.from({ length: 20_000 }, (_, i) => ({
            id: i,
            tags: ['a', 'b', 'c'],
            meta: { n: i },
          })),
        ),
      ),
  },
  {
    title: 'A 1 MB string value',
    detail: 'Long strings are truncated, with an explicit action to see everything.',
    run: () =>
      mount(
        'vt-json',
        { variant: 'full' },
        JSON.stringify({ blob: 'x'.repeat(1_000_000), next: true }),
      ),
  },
  {
    title: 'Hostile Markdown, raw HTML allowed',
    detail: 'Scripts, handlers, javascript: links and mutation XSS vectors, with allow-html on.',
    run: () =>
      mount(
        'vt-markdown',
        { variant: 'full', 'allow-html': '' },
        `# Hostile document\n\n${XSS.join('\n\n')}`,
      ),
  },
  {
    title: 'Pathological Markdown',
    detail: '20,000 nested quotes and 50,000 unclosed brackets.',
    run: () => mount('vt-markdown', {}, '>'.repeat(20_000) + ' deep\n\n' + '['.repeat(50_000)),
  },
  {
    title: '100,000 tag options',
    detail: 'Suggestions list 50 at a time; the browse panel pages through the rest.',
    run: () =>
      mount(
        'vt-tags',
        { variant: 'full', mode: 'edit', label: 'Tags' },
        JSON.stringify({
          value: [],
          options: Array.from({ length: 100_000 }, (_, i) => `tag-${i}`),
        }),
      ),
  },
  {
    title: 'Hostile tag data',
    detail: 'Colors with url(), javascript: links, control characters and HTML in labels.',
    run: () =>
      mount(
        'vt-tags',
        { counts: '', clickable: '' },
        JSON.stringify([
          {
            value: '<img src=x onerror="window.__xss=20">',
            color: 'red;background:url(https://evil.example/x)',
          },
          { value: 'link', href: 'javascript:window.__xss=21' },
          { value: 'ctrl\u0000chars\u0007', kind: '"><script>window.__xss=22</script>' },
          { value: 'x'.repeat(10_000), color: 'var(--evil)' },
        ]),
      ),
  },
  {
    title: '200,000-row CSV',
    detail: 'Parsed once, shown 100 rows at a time; sorting a column stays responsive.',
    run: () =>
      mount(
        'vt-csv',
        { variant: 'full', 'max-height': '420px' },
        'id,name,score\n' +
          Array.from({ length: 200_000 }, (_, i) => `${i},name ${i},${(i * 7919) % 1000}`).join(
            '\n',
          ),
      ),
  },
  {
    title: 'Diff of 20,000 different lines',
    detail: 'Past 2,000 changes the comparison is simplified to blocks instead of freezing.',
    run: () =>
      new Promise((resolve) => {
        const el = document.createElement('vt-diff');
        el.setAttribute('variant', 'full');
        el.setAttribute('max-height', '420px');
        el.addEventListener('vt-ready', () => resolve({ ok: true, message: 'Rendered' }), {
          once: true,
        });
        el.addEventListener(
          'vt-error',
          (event) => resolve({ ok: true, message: `Refused safely: ${event.detail.message}` }),
          { once: true },
        );
        el.original = Array.from({ length: 20_000 }, (_, i) => `a ${i}`).join('\n');
        el.modified = Array.from({ length: 20_000 }, (_, i) => `b ${i}`).join('\n');
        arena.replaceChildren(el);
      }),
  },
  {
    title: '100,000-line colored build log',
    detail: 'ANSI colors on every line; blocks of lines are built as you scroll.',
    run: () =>
      mount(
        'vt-terminal',
        { variant: 'full', prompt: 'none', 'max-height': '420px', label: 'build.log' },
        Array.from(
          { length: 100_000 },
          (_, i) =>
            `\u001b[2m${String(i).padStart(6, '0')}\u001b[22m \u001b[3${i % 7}mstep ${i}\u001b[39m ok`,
        ).join('\n'),
      ),
  },
  {
    title: 'Hostile terminal escapes',
    detail:
      'javascript: links, a window title change, cursor jumps, a 50,000-byte escape sequence and HTML in output.',
    run: () =>
      mount(
        'vt-terminal',
        { variant: 'full' },
        [
          '$ cat evil.txt',
          '\u001b]8;;javascript:window.__xss=30\u001b\\click me\u001b]8;;\u001b\\',
          '\u001b]0;pwned title\u0007\u001b[2J\u001b[999;999H<img src=x onerror="window.__xss=31">',
          `\u001b[${'1;'.repeat(25_000)}mafter a huge sequence`,
          '\u001b[38;2;999;-1;0mbad color\u001b[0m \u0000\u0007\u0008 control characters',
        ].join('\n'),
      ),
  },
  {
    title: '20,000-file tree',
    detail: 'One path per line; folders open on demand, and the search filters all 20,000.',
    run: () =>
      mount(
        'vt-tree',
        { variant: 'full', depth: '1', 'max-height': '420px', sort: 'name' },
        Array.from(
          { length: 20_000 },
          (_, i) => `src/module-${i % 100}/part-${i % 7}/file-${i}.ts`,
        ).join('\n'),
      ),
  },
  {
    title: 'Hostile tree and HTTP exchange',
    detail:
      'HTML in file names, a javascript: link template, and an HTTP message with HTML in every header and body.',
    run: async () => {
      const tree = await mount(
        'vt-tree',
        { 'href-template': 'javascript:window.__xss=32//{path}' },
        '<img src=x onerror="window.__xss=33">/\n  <script>window.__xss=34</script>.js',
      );
      if (!tree.ok) return tree;
      return mount(
        'vt-http',
        { variant: 'full', view: 'code' },
        JSON.stringify({
          request: {
            method: 'POST',
            url: "https://x.dev/'; window.__xss=35 //",
            headers: { 'X-Evil': '<img src=x onerror="window.__xss=36">' },
            body: '</script><script>window.__xss=37</script>',
          },
        }),
      );
    },
  },
  {
    title: 'Search 5,000+ matches',
    detail: 'Open the search and type "a": matches stop being marked after 5,000.',
    run: () =>
      mount(
        'vt-code',
        { variant: 'full', 'max-height': '300px' },
        'a a a a a a a a a a\n'.repeat(1_000),
      ),
  },
];

const trials = document.getElementById('trials');
const verdict = document.getElementById('verdict');
const arena = document.getElementById('arena');

/** Renders an element and resolves with the event it fired first. */
function mount(tag, attrs, content) {
  return new Promise((resolve) => {
    const el = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    el.addEventListener('vt-ready', () => resolve({ ok: true, message: 'Rendered' }), {
      once: true,
    });
    el.addEventListener(
      'vt-error',
      (event) => resolve({ ok: true, message: `Refused safely: ${event.detail.message}` }),
      { once: true },
    );
    el.content = content;
    arena.replaceChildren(el);
  });
}

/** Counts dangerous markup left in every shadow root (should always be 0). */
function audit() {
  let count = 0;
  const visit = (root) => {
    for (const el of root.querySelectorAll('*')) {
      for (const attr of el.attributes) {
        if (/^on/i.test(attr.name) || /^\s*(javascript|vbscript):/i.test(attr.value)) count += 1;
      }
      // Vitrine's own controls (heading anchors, copy buttons) are not content. Content can
      // never forge them: the sanitizer strips every class except language-*.
      const ownUi = el.closest('.anchor, .btn');
      if (
        !ownUi &&
        el.closest('.markdown') &&
        /^(script|iframe|object|embed|form|svg|math|style)$/.test(el.localName)
      )
        count += 1;
      if (el.shadowRoot) visit(el.shadowRoot);
    }
  };
  visit(document);
  return count;
}

/** Time until the next frame: how long the main thread stayed blocked. */
const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(performance.now())));

function report(items) {
  verdict.replaceChildren(
    ...items.map(([label, value, good]) => {
      const item = document.createElement('span');
      const b = document.createElement('b');
      b.textContent = value;
      if (good !== undefined) b.className = good ? 'ok' : 'bad';
      item.append(`${label} `, b);
      return item;
    }),
  );
}

for (const trial of TRIALS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'trial';
  button.setAttribute('aria-pressed', 'false');
  const title = document.createElement('strong');
  title.textContent = trial.title;
  const detail = document.createElement('span');
  detail.textContent = trial.detail;
  const run = document.createElement('span');
  run.className = 'trial-run';
  run.textContent = 'Run test';
  button.append(title, detail, run);
  button.addEventListener('click', async () => {
    for (const other of trials.children)
      other.setAttribute('aria-pressed', String(other === button));
    report([['Running', '…']]);
    await nextFrame();
    window.__xss = undefined;
    const start = performance.now();
    const result = await trial.run();
    const rendered = performance.now();
    const frame = await nextFrame();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const dangerous = audit();
    report([
      [
        'Outcome',
        result.message.length > 90 ? `${result.message.slice(0, 90)}…` : result.message,
        result.ok,
      ],
      ['Time to render', `${Math.round(rendered - start)} ms`],
      ['Next frame after', `${Math.round(frame - start)} ms`],
      ['Scripts executed', window.__xss === undefined ? '0' : 'yes', window.__xss === undefined],
      ['Dangerous markup', String(dangerous), dangerous === 0],
    ]);
  });
  trials.append(button);
}
