/**
 * Home page: the showcase window (content type + theme switches) and the install tabs.
 */
const SAMPLES = {
  code: {
    tag: 'vt-code',
    attrs: { variant: 'full', language: 'ts', label: 'retry.ts', 'highlight-lines': '6-8' },
    content: [
      '/** Retries an async task with exponential backoff. */',
      'export async function retry<T>(task: () => Promise<T>, attempts = 4): Promise<T> {',
      '  let delay = 200;',
      '  for (let i = 1; ; i++) {',
      '    try {',
      '      return await task();',
      '    } catch (error) {',
      '      if (i === attempts) throw error;',
      '    }',
      '    await new Promise((resolve) => setTimeout(resolve, delay));',
      '    delay *= 2;',
      '  }',
      '}',
    ].join('\n'),
  },
  markdown: {
    tag: 'vt-markdown',
    attrs: { variant: 'full', label: 'CHANGELOG.md', toc: 'false' },
    content: [
      '## 1.4.0',
      '',
      'Search now looks **inside collapsed JSON nodes** and opens the path to each match.',
      '',
      '| Change | Area |',
      '|:--|:--|',
      '| Exact big numbers | `vt-json` |',
      '| Split view on narrow screens | `vt-markdown` |',
      '',
      '```bash',
      'git submodule update --remote vendor/vitrine',
      '```',
      '',
      '> Raw HTML in this file would be shown as text, not executed.',
    ].join('\n'),
  },
  json: {
    tag: 'vt-json',
    attrs: { variant: 'full', label: 'order.json', depth: '2' },
    content: JSON.stringify(
      {
        id: 'ord_2041',
        status: 'shipped',
        total: { amount: 129.9, currency: 'EUR' },
        items: [
          { sku: 'VT-CODE', qty: 1 },
          { sku: 'VT-JSON', qty: 2 },
        ],
        customer: { name: 'Ada Lovelace', vip: true, notes: null },
      },
      null,
      2,
    ),
  },
};

const stage = document.querySelector('.showcase-stage');
const call = document.getElementById('showcase-call');
let type = 'code';
/** @type {string | null} */
let theme = null;

function renderShowcase() {
  if (!stage || !call) return;
  const sample = SAMPLES[type];
  const el = document.createElement(sample.tag);
  for (const [name, value] of Object.entries(sample.attrs)) el.setAttribute(name, value);
  el.setAttribute('max-height', '340px');
  if (theme) el.setAttribute('theme', theme);
  el.content = sample.content;
  stage.replaceChildren(el);
  // Brief entrance so the switch reads as one window changing content.
  el.classList.add('entering');
  el.addEventListener('animationend', () => el.classList.remove('entering'), { once: true });
  const attrs = Object.entries({ ...sample.attrs, ...(theme ? { theme } : {}) })
    .map(([name, value]) => ` ${name}="${value}"`)
    .join('');
  call.textContent = `<${sample.tag}${attrs}>`;
}

for (const button of document.querySelectorAll('.segmented [data-type]')) {
  button.addEventListener('click', () => {
    type = button.dataset.type;
    for (const other of document.querySelectorAll('.segmented [data-type]')) {
      other.setAttribute('aria-pressed', String(other === button));
    }
    renderShowcase();
  });
}

for (const swatch of document.querySelectorAll('.swatch')) {
  swatch.addEventListener('click', () => {
    const pressed = swatch.getAttribute('aria-pressed') === 'true';
    theme = pressed ? null : swatch.dataset.theme;
    for (const other of document.querySelectorAll('.swatch')) {
      other.setAttribute('aria-pressed', String(!pressed && other === swatch));
    }
    renderShowcase();
  });
}

// Install tabs (WAI-ARIA tabs with arrow keys).
const tabs = Array.from(document.querySelectorAll('.install-tabs [role="tab"]'));
function selectTab(tab) {
  for (const other of tabs) {
    const selected = other === tab;
    other.setAttribute('aria-selected', String(selected));
    other.tabIndex = selected ? 0 : -1;
    document.getElementById(other.getAttribute('aria-controls')).hidden = !selected;
  }
  tab.focus();
}
for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(tab);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[
      event.key
    ];
    if (next === undefined) return;
    event.preventDefault();
    selectTab(tabs[(next + tabs.length) % tabs.length]);
  });
}

renderShowcase();
