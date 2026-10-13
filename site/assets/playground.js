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
  log: '2026-10-07T18:00:00.120Z INFO  server listening on :8080\n{"level":40,"time":"2026-10-07T18:00:03Z","msg":"slow query","ms":812}\n2026-10-07T18:00:04.330Z ERROR payment failed: card declined\n    at Billing.charge (billing.js:88)\ntime=2026-10-07T18:00:05Z level=warn msg="retrying" attempt=2\n',
  chart:
    'month,desktop,mobile\nJan,186,80\nFeb,305,200\nMar,237,120\nApr,73,190\nMay,209,130\nJun,214,140\n',
  openapi:
    "openapi: 3.1.0\ninfo: { title: Orders API, version: 1.0.0 }\npaths:\n  /orders:\n    get: { summary: List orders, tags: [orders], responses: { '200': { description: OK } } }\n    post: { summary: Create an order, tags: [orders], responses: { '201': { description: Created } } }\n  /orders/{id}:\n    delete: { summary: Cancel an order, tags: [orders], responses: { '204': { description: Cancelled } } }\n",
  env: '# Database\nDB_HOST=db.internal\nDB_PASSWORD="s3cr3t-value"\nDATABASE_URL=postgres://app:${DB_PASSWORD}@${DB_HOST}:5432/shop\nexport NODE_ENV=production\n',
  hex: '89 50 4e 47 0d 0a 1a 0a 00 00 00 0d 49 48 44 52\n00 00 00 20 00 00 00 20 08 06 00 00 00 73 7a 7a\n',
  timeline:
    '[\n  {"time": "2026-10-07T18:00:00Z", "title": "Error rate above 5%", "kind": "danger"},\n  {"time": "2026-10-07T18:12:00Z", "title": "Rollback started", "kind": "warning"},\n  {"time": "2026-10-07T18:31:00Z", "title": "Service restored", "kind": "success"}\n]\n',
  job: "# deploy\n## Checkout\nstatus: success\nduration: 2s\nCloning into 'shop'...\n## Test\nstatus: running\nprogress: 64\nPASS src/cart.test.js\nRUNS src/payment.test.js\n## Deploy\nstatus: queued\n",
  git: "* 9f3c2a1 (HEAD -> main, tag: v1.2.0) Merge branch 'feature/login'\n|\\\n| * 4b7e9d0 (feature/login) Add login form\n* | 7d6e5b4 Fix cart total rounding\n|/\n* 1e0f9a2 Add checkout page\n* 0c3b7d1 Initial commit\n",
  regex: 'Contact ada@example.com or alan.turing@test.org, not @nobody.\n',
  yaml: '# Deployment\nservice: shop\ndefaults: &defaults\n  memory: 512Mi\n  cpu: 250m\nweb:\n  <<: *defaults\n  ports: [80, 443]\n',
  xml: '<catalog xmlns:media="https://example.com/media">\n  <!-- Generated nightly -->\n  <item sku="A-100" stock="12">\n    <name>Desk lamp</name>\n    <media:thumb href="/img/lamp.png"/>\n  </item>\n</catalog>\n',
  toml: '[package]\nname = "shop"\nversion = "1.2.0"\nreleased = 2026-10-13\n\n[dependencies]\nserde = { version = "1.0", features = ["derive"] }\n',
  jwt: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjIwMjYtMTAifQ.eyJpc3MiOiJodHRwczovL2lkLmV4YW1wbGUuY29tIiwic3ViIjoiNDIiLCJhdWQiOiJzaG9wIiwiZW1haWwiOiJhZGFAZXhhbXBsZS5jb20iLCJzY29wZSI6Im9yZGVyczpyZWFkIG9yZGVyczp3cml0ZSIsImlhdCI6MTc5MTI3MzYwMCwibmJmIjoxNzkxMjczNjAwLCJleHAiOjE3OTEzNjAwMDB9.ZGVtby1zaWduYXR1cmUtbm90LXJlYWwtMDEyMzQ1Njc4OWFiY2RlZg\n',
  cron: 'SHELL=/bin/bash\nCRON_TZ=Europe/Luxembourg\n# Nightly backup\n0 2 * * * /usr/local/bin/backup --all\n# Reports on weekdays\n30 9 * * 1-5 curl -fsS https://example.com/report\n*/15 * * * * /opt/shop/bin/sync-stock\n@reboot /opt/shop/bin/warm-cache\n',
  cert: '-----BEGIN CERTIFICATE-----\nMIIB2zCCAYGgAwIBAgIBATAKBggqhkjOPQQDAjBDMQswCQYDVQQGEwJMVTEVMBMG\nA1UECgwMVml0cmluZSBUZXN0MR0wGwYDVQQDDBRWaXRyaW5lIFRlc3QgUm9vdCBD\nQTAeFw0yNjEwMTMyMTAxMzNaFw0zNjEwMTAyMTAxMzNaMEMxCzAJBgNVBAYTAkxV\nMRUwEwYDVQQKDAxWaXRyaW5lIFRlc3QxHTAbBgNVBAMMFFZpdHJpbmUgVGVzdCBS\nb290IENBMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE4YdSlv8ECRyl2eb6BbBg\nP+VrCt4ioK2xHAS6G4vVMaqXoCOx0yvBKlQ8QL6fruatUo1QDMi0HtwpAfq+YANE\nOKNmMGQwHQYDVR0OBBYEFAyqLSbgIuAbs8T2GzLmLPHmR9gFMB8GA1UdIwQYMBaA\nFAyqLSbgIuAbs8T2GzLmLPHmR9gFMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYDVR0P\nAQH/BAQDAgEGMAoGCCqGSM49BAMCA0gAMEUCIQDiRbgrI/yFZzq9IQ/2sbEcAn4/\n5wzI3kPSS255Ll+52AIgP8KKf2xF8fKiHq3YXWeXs1eLG+n2NMKpFwybkPhJPpE=\n-----END CERTIFICATE-----\n',
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
  log: {
    tag: 'vt-log',
    flags: ['level-filter', 'follow', 'fields', 'colors', 'line-numbers', 'wrap'],
    fields: [
      { name: 'levels', type: 'text', placeholder: 'info warn error' },
      { name: 'time', type: 'select', options: ['', 'full', 'short', 'none'] },
      { name: 'collapse', type: 'number', placeholder: '6' },
      { name: 'max-entries', type: 'number', placeholder: '50000' },
    ],
  },
  chart: {
    tag: 'vt-chart',
    flags: [
      'stacked',
      'smooth',
      'horizontal',
      'zoom',
      'legend',
      'grid',
      'points',
      'compact',
      'tabs',
    ],
    fields: [
      { name: 'type', type: 'select', options: ['line', 'area', 'bar', 'pie'] },
      { name: 'height', type: 'number', placeholder: '300' },
      { name: 'unit', type: 'text', placeholder: 'ms' },
      { name: 'view', type: 'select', options: ['', 'chart', 'table'] },
    ],
  },
  openapi: {
    tag: 'vt-openapi',
    flags: ['expand', 'examples', 'markdown'],
    fields: [
      { name: 'tags', type: 'text', placeholder: 'orders' },
      { name: 'server', type: 'number', placeholder: '0' },
    ],
  },
  env: {
    tag: 'vt-env',
    flags: ['mask-secrets', 'tabs', 'comments', 'line-numbers'],
    fields: [
      { name: 'format', type: 'select', options: ['', 'auto', 'dotenv', 'ini', 'properties'] },
      { name: 'secret-keys', type: 'text', placeholder: 'STRIPE_KEY' },
      { name: 'view', type: 'select', options: ['', 'table', 'raw'] },
    ],
  },
  hex: {
    tag: 'vt-hex',
    flags: ['ascii', 'uppercase'],
    fields: [
      { name: 'columns', type: 'number', placeholder: '16' },
      { name: 'group', type: 'number', placeholder: '8' },
      { name: 'format', type: 'select', options: ['', 'auto', 'hex', 'base64'] },
      { name: 'offset', type: 'number', placeholder: '0' },
    ],
  },
  timeline: {
    tag: 'vt-timeline',
    flags: ['kind-filter', 'durations', 'markdown'],
    fields: [
      { name: 'order', type: 'select', options: ['', 'newest', 'oldest'] },
      { name: 'group', type: 'select', options: ['', 'day', 'month', 'year', 'none'] },
      { name: 'kinds', type: 'text', placeholder: 'danger warning' },
      { name: 'collapse', type: 'number', placeholder: '6' },
    ],
  },
  job: {
    tag: 'vt-job',
    flags: ['progress', 'durations', 'open-failed', 'follow'],
    fields: [],
  },
  git: {
    tag: 'vt-git',
    flags: ['branch-filter', 'author', 'date'],
    fields: [
      { name: 'branch', type: 'text', placeholder: 'main' },
      { name: 'date-format', type: 'select', options: ['', 'relative', 'absolute'] },
      { name: 'hash-length', type: 'number', placeholder: '7' },
      { name: 'selected', type: 'text', placeholder: '4b7e9d0' },
    ],
  },
  regex: {
    tag: 'vt-regex',
    flags: ['flag-buttons', 'table', 'explain'],
    fields: [
      { name: 'pattern', type: 'text', placeholder: '(?<user>[\\w.]+)@(?<host>[\\w.-]+)' },
      { name: 'flags', type: 'text', placeholder: 'g' },
      { name: 'replace', type: 'text', placeholder: '$<user> at $<host>' },
    ],
  },
  yaml: {
    tag: 'vt-yaml',
    flags: ['tabs', 'show-types', 'expand-controls', 'path', 'sort-keys', 'line-numbers'],
    fields: [
      { name: 'view', type: 'select', options: ['', 'tree', 'raw'] },
      { name: 'depth', type: 'number', placeholder: '2' },
      { name: 'on-invalid', type: 'select', options: ['', 'error', 'raw'] },
    ],
  },
  xml: {
    tag: 'vt-xml',
    flags: ['tabs', 'pretty', 'expand-controls', 'path', 'line-numbers'],
    fields: [
      { name: 'view', type: 'select', options: ['', 'tree', 'raw'] },
      { name: 'depth', type: 'number', placeholder: '2' },
      { name: 'indent', type: 'number', placeholder: '2' },
      { name: 'on-invalid', type: 'select', options: ['', 'error', 'raw'] },
    ],
  },
  toml: {
    tag: 'vt-toml',
    flags: [
      'tabs',
      'show-types',
      'expand-controls',
      'path',
      'sort-keys',
      'line-numbers',
      'copy-json',
    ],
    fields: [
      { name: 'view', type: 'select', options: ['', 'tree', 'raw'] },
      { name: 'depth', type: 'number', placeholder: '2' },
      { name: 'on-invalid', type: 'select', options: ['', 'error', 'raw'] },
    ],
  },
  jwt: {
    tag: 'vt-jwt',
    flags: ['mask-signature', 'claims', 'warnings'],
    fields: [
      { name: 'now', type: 'text', placeholder: '2026-10-06T12:00:00Z' },
      { name: 'depth', type: 'number', placeholder: '2' },
    ],
  },
  cron: {
    tag: 'vt-cron',
    flags: ['system', 'grid', 'fields'],
    fields: [
      { name: 'expression', type: 'text', placeholder: '30 9 * * 1-5' },
      { name: 'count', type: 'number', placeholder: '5' },
      { name: 'timezone', type: 'text', placeholder: 'Europe/Paris' },
      { name: 'now', type: 'text', placeholder: 'now' },
    ],
  },
  cert: {
    tag: 'vt-cert',
    flags: ['tabs', 'fingerprints', 'extensions'],
    fields: [
      { name: 'view', type: 'select', options: ['', 'details', 'structure'] },
      { name: 'now', type: 'text', placeholder: 'now' },
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
      select(
        'type',
        Object.keys(SCHEMA),
        state.type,
        (value) => switchType(value),
        Object.fromEntries(Object.entries(SCHEMA).map(([key, { tag }]) => [key, `<${tag}>`])),
      ),
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
  state.fields =
    {
      code: { language: 'python' },
      diff: { language: 'python' },
      chart: { type: 'line' },
      regex: { pattern: '(?<user>[\\w.]+)@(?<host>[\\w.-]+)' },
    }[type] ?? {};
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
    log: 'api.log',
    chart: 'Visitors',
    openapi: '',
    env: '.env',
    hex: 'logo.png',
    timeline: 'Incident',
    job: 'deploy',
    git: 'shop',
    regex: '',
    yaml: 'deploy.yaml',
    xml: 'catalog.xml',
    toml: 'Cargo.toml',
    jwt: '',
    cron: 'crontab',
    cert: 'root.pem',
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
