/**
 * Themes page: gallery of built-in themes and a custom theme builder with contrast checks.
 */
const sample = (theme) =>
  JSON.stringify({ theme, accessible: true, tags: ['code', 'json'], owner: null }, null, 2);
const CODE =
  '// Every built-in theme passes WCAG AA\nconst ratio = contrast(fg, background);\nif (ratio < 4.5) throw new Error(`Too low: ${ratio}`);';

/** Colors exposed in the builder, with the surface each text color is read on. */
const EDITABLE = [
  ['surface', 'Surface'],
  ['surface-sunken', 'Code background'],
  ['border', 'Border'],
  ['fg', 'Text', 'surface-sunken'],
  ['fg-muted', 'Muted text', 'surface-sunken'],
  ['accent', 'Accent'],
  ['accent-fg', 'Accent text', 'surface'],
  ['syntax-keyword', 'Keywords', 'surface-sunken'],
  ['syntax-string', 'Strings', 'surface-sunken'],
  ['syntax-number', 'Numbers', 'surface-sunken'],
  ['syntax-function', 'Functions', 'surface-sunken'],
  ['syntax-comment', 'Comments', 'surface-sunken'],
  ['syntax-attr', 'Keys and attributes', 'surface-sunken'],
];

const gallery = document.getElementById('gallery');
for (const name of window.Vitrine.BUILT_IN_THEMES) {
  const card = document.createElement('article');
  card.className = 'theme-card';
  const title = document.createElement('h3');
  title.textContent = `theme="${name}"`;
  const code = document.createElement('vt-code');
  code.setAttribute('theme', name);
  code.setAttribute('language', 'js');
  code.setAttribute('variant', 'full');
  code.setAttribute('label', 'contrast.js');
  code.setAttribute('highlight-lines', '2');
  code.content = CODE;
  const json = document.createElement('vt-json');
  json.setAttribute('theme', name);
  json.content = sample(name);
  card.append(title, code, json);
  gallery.append(card);
}

// ---------------------------------------------------------------- builder

const form = document.getElementById('builder');
const preview = document.getElementById('builder-preview');
const report = document.getElementById('contrast');
const output = document.getElementById('builder-code');
let base = 'dark';
/** @type {Record<string, string>} */
let colors = {};

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function loadBase(name) {
  base = name;
  const tokens = window.Vitrine.getTheme?.(name)?.tokens ?? {};
  colors = {};
  for (const [token] of EDITABLE)
    colors[token] = /^#[0-9a-f]{6}$/i.test(tokens[token] ?? '') ? tokens[token] : '#808080';
  buildForm();
  apply();
}

function buildForm() {
  const baseLabel = document.createElement('label');
  baseLabel.className = 'field';
  const span = document.createElement('span');
  span.textContent = 'Start from';
  const select = document.createElement('select');
  for (const name of window.Vitrine.BUILT_IN_THEMES) select.append(new Option(name, name));
  select.value = base;
  select.addEventListener('change', () => loadBase(select.value));
  baseLabel.append(span, select);

  const grid = document.createElement('div');
  grid.className = 'color-grid';
  for (const [token, label] of EDITABLE) {
    const wrapper = document.createElement('label');
    wrapper.className = 'color-field';
    const input = document.createElement('input');
    input.type = 'color';
    input.value = colors[token];
    input.addEventListener('input', () => {
      colors[token] = input.value;
      apply();
    });
    const text = document.createElement('span');
    text.textContent = label;
    wrapper.append(input, text);
    grid.append(wrapper);
  }
  form.replaceChildren(baseLabel, grid);
}

let frame = 0;
function apply() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    window.Vitrine.registerTheme('custom', { extends: base, tokens: colors });
    if (!preview.firstChild) {
      const code = document.createElement('vt-code');
      code.setAttribute('theme', 'custom');
      code.setAttribute('language', 'js');
      code.setAttribute('variant', 'full');
      code.setAttribute('label', 'preview.js');
      code.setAttribute('highlight-lines', '2');
      code.content = CODE;
      const json = document.createElement('vt-json');
      json.setAttribute('theme', 'custom');
      json.setAttribute('variant', 'full');
      json.content = sample('my-theme');
      preview.append(code, json);
    }
    renderReport();
    const lines = Object.entries(colors).map(
      ([token, value]) => `    ${/^[a-z]+$/.test(token) ? token : `'${token}'`}: '${value}',`,
    );
    output.content = `Vitrine.registerTheme('my-theme', {\n  extends: '${base}',\n  tokens: {\n${lines.join('\n')}\n  },\n});\n\nVitrine.configure({ theme: 'my-theme' });`;
  });
}

function renderReport() {
  const items = [];
  let failures = 0;
  for (const [token, label, on] of EDITABLE) {
    if (!on) continue;
    const ratio = contrast(colors[token], colors[on]);
    const item = document.createElement('span');
    const value = document.createElement('b');
    value.textContent = `${ratio.toFixed(1)}:1`;
    value.className = ratio >= 4.5 ? 'ok' : 'bad';
    if (ratio < 4.5) failures += 1;
    item.append(`${label} `, value);
    items.push(item);
  }
  const summary = document.createElement('strong');
  summary.textContent = failures
    ? `${failures} color${failures > 1 ? 's' : ''} below 4.5:1 —`
    : 'All text colors pass WCAG AA —';
  report.replaceChildren(summary, ...items);
}

loadBase('dark');
