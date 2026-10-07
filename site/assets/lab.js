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
    detail: 'Click "Expand all": it stops after 5,000 visible rows and says so.',
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
  button.append(title, detail);
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
