/**
 * Playground: controls are generated from a schema of every attribute, the preview is
 * rebuilt on each change, and the matching HTML and JavaScript are printed.
 */

const SAMPLES = {
  csv: 'name,score,joined\nAda Lovelace,98.5,1842-10-01\nAlan Turing,95,1936-05-28\n"Hopper, Grace",91,1944-01-01\n',
  tags: '{\n  "value": ["design"],\n  "options": ["design", "research", "accessibility", "performance", "security"]\n}\n',
  diff: '--- a/app.py\n+++ b/app.py\n@@ -1,3 +1,3 @@\n import os\n-DEBUG = True\n+DEBUG = os.getenv("DEBUG") == "1"\n \n',
  code: 'def fibonacci(n: int) -> list[int]:\n    """Returns the first n Fibonacci numbers."""\n    seq = [0, 1]\n    while len(seq) < n:\n        seq.append(seq[-1] + seq[-2])\n    return seq[:n]\n\nprint(fibonacci(10))\n',
  markdown:
    '# Release 1.2\n\nThis release adds **search** to every component.\n\n## Changes\n\n- [x] Search in code, Markdown and JSON\n- [ ] Side-by-side diffs\n\n| Area | Status |\n|:--|:--|\n| Code | done |\n\n```js\nel.content = untrustedText;\n```\n\n<b>Raw HTML</b> is shown as text unless allow-html is set.\n',
  terminal:
    '$ npm test\n\u001b[1m RUN \u001b[22m \u001b[36mv3.2.4\u001b[39m\n \u001b[32m✓\u001b[39m tests/parser.test.js \u001b[2m(42 tests)\u001b[22m\n \u001b[31m×\u001b[39m tests/render.test.js\n\u001b[41m FAIL \u001b[49m 1 failed | 41 passed\n$ git commit -am "Fix escaping"\n[main 3f2a1c9] Fix escaping\n 1 file changed, 2 insertions(+)\n',
  tree: 'src/\n  components/\n    + Button.tsx  # new\n    ~ Header.tsx\n    - Legacy.tsx\n  app.ts\npublic/\n  logo.svg\n* package.json  # scripts\nREADME.md\n',
  http: 'POST /v1/tasks?api_key=demo_key_7f3a9c2e51b84d06 HTTP/1.1\nHost: api.example.com\nContent-Type: application/json\nAuthorization: Bearer eyJhbGciOiJIUzI1NiJ9.example\n\n{"title": "Write docs", "priority": 2}\n\nHTTP/1.1 201 Created\nContent-Type: application/json\n\n{"id": 981, "status": "open"}\n',
  json: '{\n  "id": 12345678901234567890,\n  "name": "Ada",\n  "roles": ["admin", "editor"],\n  "address": { "city": "London", "zip": null },\n  "active": true\n}\n',
};

/** Boolean features shared by every component. */
const COMMON_FLAGS = [
  'header',
  'dot',
  'copy',
  'search',
  'download',
  'fullscreen',
  'edit-toggle',
  'badge',
  'history',
];

/**
 * @typedef {{ name: string, type: 'flag' } | { name: string, type: 'text' | 'number', placeholder?: string }
 *   | { name: string, type: 'select', options: string[] }} Field
 */

/** @type {Record<string, { tag: string, flags: string[], fields: Field[] }>} */
const SCHEMA = {
  code: {
    tag: 'vt-code',
    flags: ['line-numbers', 'wrap', 'diff'],
    fields: [
      {
        name: 'language',
        type: 'select',
        options: [
          'python',
          'auto',
          'js',
          'ts',
          'html',
          'css',
          'bash',
          'json',
          'yaml',
          'rust',
          'go',
          'sql',
          'plaintext',
        ],
      },
      { name: 'start-line', type: 'number', placeholder: '1' },
      { name: 'highlight-lines', type: 'text', placeholder: '2,4-5' },
      { name: 'collapsible', type: 'number', placeholder: 'lines' },
      { name: 'tab-size', type: 'number', placeholder: '4' },
    ],
  },
  markdown: {
    tag: 'vt-markdown',
    flags: ['toc', 'anchors', 'allow-html', 'line-numbers', 'sync-scroll', 'split-controls'],
    fields: [
      { name: 'split-preview', type: 'select', options: ['', 'right', 'left', 'bottom', 'top'] },
      { name: 'tabs', type: 'text', placeholder: 'preview,source,split' },
      { name: 'default-tab', type: 'select', options: ['', 'preview', 'source', 'split'] },
      { name: 'images', type: 'select', options: ['', 'allow', 'block', 'same-origin'] },
      { name: 'external-links', type: 'select', options: ['', 'new-tab', 'same'] },
    ],
  },
  json: {
    tag: 'vt-json',
    flags: ['tabs', 'show-types', 'expand-controls', 'path', 'sort-keys', 'line-numbers'],
    fields: [
      { name: 'view', type: 'select', options: ['', 'tree', 'raw'] },
      { name: 'depth', type: 'number', placeholder: '2' },
      { name: 'indent', type: 'number', placeholder: '2' },
      { name: 'on-invalid', type: 'select', options: ['', 'error', 'raw'] },
    ],
  },
  csv: {
    tag: 'vt-csv',
    flags: ['header-row', 'sortable', 'line-numbers', 'tabs'],
    fields: [
      { name: 'delimiter', type: 'select', options: ['', ',', ';', 'tab', '|'] },
      { name: 'page-size', type: 'number', placeholder: '100' },
      { name: 'view', type: 'select', options: ['', 'table', 'raw'] },
    ],
  },
  tags: {
    tag: 'vt-tags',
    flags: ['allow-create', 'browse', 'counts', 'clickable', 'clear', 'case-sensitive'],
    fields: [
      { name: 'prefix', type: 'text', placeholder: '#' },
      { name: 'max-tags', type: 'number', placeholder: 'no limit' },
      { name: 'maxlength', type: 'number', placeholder: '50' },
      { name: 'pattern', type: 'text', placeholder: '[a-z0-9-]+' },
      { name: 'appearance', type: 'select', options: ['', 'chip', 'outline', 'text'] },
      { name: 'value-format', type: 'select', options: ['', 'json', 'csv', 'lines'] },
    ],
  },
  diff: {
    tag: 'vt-diff',
    flags: ['line-numbers', 'tabs', 'wrap'],
    fields: [
      { name: 'language', type: 'select', options: ['python', 'js', 'json', 'plaintext'] },
      { name: 'view', type: 'select', options: ['', 'split', 'unified'] },
      { name: 'context', type: 'text', placeholder: '3 or all' },
    ],
  },
  terminal: {
    tag: 'vt-terminal',
    flags: ['colors', 'command-copy', 'wrap', 'typing', 'escapes'],
    fields: [
      { name: 'prompt', type: 'text', placeholder: '$ ❯' },
      { name: 'collapse-output', type: 'number', placeholder: 'never' },
      { name: 'typing-speed', type: 'number', placeholder: '35' },
    ],
  },
  tree: {
    tag: 'vt-tree',
    flags: ['icons', 'guides', 'expand-controls', 'path'],
    fields: [
      { name: 'depth', type: 'number', placeholder: 'all' },
      { name: 'sort', type: 'select', options: ['', 'none', 'name'] },
      {
        name: 'href-template',
        type: 'text',
        placeholder: 'https://github.com/you/repo/blob/main/{path}',
      },
    ],
  },
  http: {
    tag: 'vt-http',
    flags: ['tabs', 'mask-secrets'],
    fields: [
      { name: 'view', type: 'select', options: ['', 'exchange', 'code'] },
      { name: 'layout', type: 'select', options: ['', 'stacked', 'columns'] },
      { name: 'snippets', type: 'text', placeholder: 'curl fetch python httpie' },
    ],
  },
};

const form = document.getElementById('controls');
const preview = document.getElementById('preview');
const htmlOut = document.getElementById('html-out');
const jsOut = document.getElementById('js-out');

const state = {
  type: 'code',
  /** @type {Record<string, string>} */
  attrs: { variant: 'full', theme: '', 'lang-ui': '', label: 'fibonacci.py', 'max-height': '' },
  /** @type {Record<string, string>} '' = preset, 'on', 'off' */
  flags: {},
  /** @type {Record<string, string>} */
  fields: { language: 'python' },
  content: SAMPLES.code,
};

/** Creates an element with attributes and children (text only). */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

function select(name, options, value, onChange, labels = {}) {
  const input = el('select', { name });
  for (const option of options)
    input.append(el('option', { value: option }, labels[option] ?? (option || 'Default')));
  input.value = value;
  input.addEventListener('change', () => onChange(input.value));
  return input;
}

function field(label, control) {
  return el('label', { class: 'field' }, el('span', {}, label), control);
}

function buildControls() {
  const schema = SCHEMA[state.type];
  const general = el('fieldset', {}, el('legend', {}, 'Component'));
  general.append(
    field(
      'Element',
      select('type', Object.keys(SCHEMA), state.type, (value) => switchType(value), {
        code: '<vt-code>',
        markdown: '<vt-markdown>',
        json: '<vt-json>',
        csv: '<vt-csv>',
        tags: '<vt-tags>',
        diff: '<vt-diff>',
        terminal: '<vt-terminal>',
        tree: '<vt-tree>',
        http: '<vt-http>',
      }),
    ),
    field(
      'variant',
      select('variant', ['simple', 'full'], state.attrs.variant, (value) =>
        update(() => (state.attrs.variant = value)),
      ),
    ),
    field(
      'theme',
      select('theme', ['', ...window.Vitrine.listThemes(), 'auto'], state.attrs.theme, (value) =>
        update(() => (state.attrs.theme = value)),
      ),
    ),
    field(
      'lang-ui',
      select('lang-ui', ['', 'en', 'fr'], state.attrs['lang-ui'], (value) =>
        update(() => (state.attrs['lang-ui'] = value)),
      ),
    ),
    field(
      'mode',
      select('mode', ['', 'view', 'edit'], state.attrs.mode ?? '', (value) =>
        update(() => (state.attrs.mode = value)),
      ),
    ),
    field(
      'syntax-theme',
      select(
        'syntax-theme',
        ['', ...window.Vitrine.listSyntaxThemes()],
        state.attrs['syntax-theme'] ?? '',
        (value) => update(() => (state.attrs['syntax-theme'] = value)),
      ),
    ),
  );
  for (const name of ['label', 'max-height']) {
    const input = el('input', {
      type: 'text',
      name,
      placeholder: name === 'max-height' ? '320px' : '',
    });
    input.value = state.attrs[name];
    input.addEventListener('input', () => update(() => (state.attrs[name] = input.value)));
    general.append(field(name, input));
  }

  const flags = el(
    'fieldset',
    {},
    el('legend', {}, 'Features'),
    el('p', { class: 'hint' }, 'Default follows the variant; on and off override it.'),
  );
  const grid = el('div', { class: 'flag-grid' });
  for (const name of [...COMMON_FLAGS, ...schema.flags]) {
    grid.append(
      field(
        name,
        select(
          name,
          ['', 'on', 'off'],
          state.flags[name] ?? '',
          (value) => update(() => (state.flags[name] = value)),
          { '': 'Default', on: 'On', off: 'Off' },
        ),
      ),
    );
  }
  flags.append(grid);

  const specific = el('fieldset', {}, el('legend', {}, `<${schema.tag}> options`));
  for (const spec of schema.fields) {
    let control;
    if (spec.type === 'select') {
      control = select(spec.name, spec.options, state.fields[spec.name] ?? '', (value) =>
        update(() => (state.fields[spec.name] = value)),
      );
    } else {
      control = el('input', {
        type: spec.type === 'number' ? 'number' : 'text',
        name: spec.name,
        placeholder: spec.placeholder ?? '',
      });
      control.value = state.fields[spec.name] ?? '';
      control.addEventListener('input', () =>
        update(() => (state.fields[spec.name] = control.value)),
      );
    }
    specific.append(field(spec.name, control));
  }

  const content = el('textarea', { name: 'content', spellcheck: 'false', rows: '10' });
  content.value = state.content;
  content.addEventListener('input', () => update(() => (state.content = content.value)));
  const contentSet = el(
    'fieldset',
    {},
    el('legend', {}, 'Content'),
    field('Set through the content property', content),
  );

  form.replaceChildren(general, flags, specific, contentSet);
}

function switchType(type) {
  state.type = type;
  state.flags = {};
  state.fields = type === 'code' || type === 'diff' ? { language: 'python' } : {};
  state.content = SAMPLES[type];
  state.attrs.label = {
    code: 'fibonacci.py',
    markdown: 'release.md',
    json: 'user.json',
    csv: 'scores.csv',
    tags: 'Topics',
    diff: 'app.py',
    terminal: 'Test run',
    tree: 'my-app',
    http: 'Create a task',
  }[type];
  buildControls();
  render();
}

/** Attributes as they would be written in HTML, in a stable order. */
function attributes() {
  const result = [];
  for (const [name, value] of Object.entries(state.attrs)) {
    if (value && !(name === 'variant' && value === 'simple')) result.push([name, value]);
  }
  for (const [name, value] of Object.entries(state.fields)) if (value) result.push([name, value]);
  for (const [name, value] of Object.entries(state.flags)) {
    if (value === 'on') result.push([name, '']);
    if (value === 'off') result.push([name, 'false']);
  }
  return result;
}

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (text) => escapeHtml(text).replace(/"/g, '&quot;');

function render() {
  const { tag } = SCHEMA[state.type];
  const attrs = attributes();
  const element = document.createElement(tag);
  for (const [name, value] of attrs) element.setAttribute(name, value);
  element.content = state.content;
  preview.replaceChildren(element);

  const htmlAttrs = attrs
    .map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`))
    .join('');
  const body = escapeHtml(state.content.replace(/\n$/, ''))
    .split('\n')
    .map((line) => `    ${line}`.trimEnd())
    .join('\n');
  htmlOut.content = `<${tag}${htmlAttrs}>\n  <template>\n${body}\n  </template>\n</${tag}>`;

  const toKey = (name) => (/^[a-z]+$/.test(name) ? name : `'${name}'`);
  const options = attrs
    .filter(([name]) => name !== 'variant')
    .map(([name, value]) => `    ${toKey(name)}: ${value === '' ? 'true' : JSON.stringify(value)},`)
    .join('\n');
  const variant = state.attrs.variant === 'full' ? `\n  variant: 'full',` : '';
  jsOut.content = `Vitrine.render(document.querySelector('#target'), {\n  type: '${state.type}',${variant}\n  content: untrustedText,\n  options: {\n${options}\n  },\n});`;
}

let frame = 0;
function update(change) {
  change();
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
}

buildControls();
render();
