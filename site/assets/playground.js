/**
 * Playground: controls are generated from a schema of every attribute, the preview is
 * rebuilt on each change, and the matching HTML and JavaScript are printed.
 */

const SAMPLES = {
  code: 'def fibonacci(n: int) -> list[int]:\n    """Returns the first n Fibonacci numbers."""\n    seq = [0, 1]\n    while len(seq) < n:\n        seq.append(seq[-1] + seq[-2])\n    return seq[:n]\n\nprint(fibonacci(10))\n',
  markdown:
    '# Release 1.2\n\nThis release adds **search** to every component.\n\n## Changes\n\n- [x] Search in code, Markdown and JSON\n- [ ] Side-by-side diffs\n\n| Area | Status |\n|:--|:--|\n| Code | done |\n\n```js\nel.content = untrustedText;\n```\n\n<b>Raw HTML</b> is shown as text unless allow-html is set.\n',
  json: '{\n  "id": 12345678901234567890,\n  "name": "Ada",\n  "roles": ["admin", "editor"],\n  "address": { "city": "London", "zip": null },\n  "active": true\n}\n',
};

/** Boolean features shared by every component. */
const COMMON_FLAGS = ['header', 'dot', 'copy', 'search', 'download'];

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
    flags: ['toc', 'anchors', 'allow-html', 'line-numbers'],
    fields: [
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
  state.fields = type === 'code' ? { language: 'python' } : {};
  state.content = SAMPLES[type];
  state.attrs.label = { code: 'fibonacci.py', markdown: 'release.md', json: 'user.json' }[type];
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
