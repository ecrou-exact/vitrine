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

/**
 * A pcap whose HTTP request, Host header, DNS question and TLS server name carry the payload.
 *
 * @param {string} payload
 * @returns {string} Base64.
 */
function pcapWith(payload) {
  const text = [...Buffer.from(payload, 'utf8')];
  const be16 = (n) => [(n >> 8) & 255, n & 255];
  const le32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const ip = (proto, body) => [0x45, 0, ...be16(20 + body.length), 0, 0, 0, 0, 64, proto, 0, 0, 10, 0, 0, 1, 10, 0, 0, 2, ...body]; // prettier-ignore
  const eth = (body) => [2, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 1, 8, 0, ...body];
  const tcp = (dp, body) => [...be16(40000), ...be16(dp), 0, 0, 0, 1, 0, 0, 0, 0, 0x50, 0x18, 1, 0, 0, 0, 0, 0, ...body]; // prettier-ignore
  const http = [
    ...Buffer.from(`GET /${payload} HTTP/1.1\r\nHost: `, 'utf8'),
    ...text,
    13,
    10,
    13,
    10,
  ];
  const labels = [];
  for (let i = 0; i < text.length; i += 60)
    labels.push(Math.min(60, text.length - i), ...text.slice(i, i + 60));
  const dns = [0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, ...labels.slice(0, 250), 0, 0, 1, 0, 1];
  const udp = [...be16(40001), ...be16(53), ...be16(8 + dns.length), 0, 0, ...dns];
  const host = text.slice(0, 200);
  const sni = [
    0,
    0,
    ...be16(host.length + 5),
    ...be16(host.length + 3),
    0,
    ...be16(host.length),
    ...host,
  ];
  const hello = [
    3,
    3,
    ...new Array(32).fill(1),
    0,
    0,
    2,
    0x13,
    1,
    1,
    0,
    ...be16(sni.length),
    ...sni,
  ];
  const tls = [22, 3, 1, ...be16(hello.length + 4), 1, 0, ...be16(hello.length), ...hello];
  const frames = [eth(ip(6, tcp(80, http))), eth(ip(17, udp)), eth(ip(6, tcp(443, tls)))];
  const bytes = [
    ...le32(0xa1b2c3d4),
    2,
    0,
    4,
    0,
    ...le32(0),
    ...le32(0),
    ...le32(65535),
    ...le32(1),
  ];
  for (const f of frames)
    bytes.push(...le32(1), ...le32(0), ...le32(f.length), ...le32(f.length), ...f);
  return Buffer.from(bytes).toString('base64');
}

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
    attrs: { variant: 'full' },
    wrap: (p) =>
      JSON.stringify({
        serverIPAddress: p,
        _securityDetails: { protocol: p, subjectName: p, issuer: p, sanList: [p] },
        request: { method: 'GET', url: `https://x.dev/${p}`, headers: [] },
        response: {
          status: 200,
          httpVersion: p,
          headers: [],
          content: {
            mimeType: 'image/svg+xml',
            encoding: 'base64',
            text: Buffer.from(p).toString('base64'),
          },
        },
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
    tag: 'vt-icon-picker',
    attrs: { inline: '', sets: 'fa-regular', label: '<img src=x onerror=alert(1)>', hint: '<b>x</b>', value: '<svg onload=alert(1)>:x' }, // prettier-ignore
    wrap: () => null,
  },
  {
    tag: 'vt-workflow',
    attrs: { variant: 'full', job: 'j1' },
    wrap: (p) =>
      JSON.stringify({
        name: p,
        display_title: p,
        event: p,
        head_branch: p,
        head_sha: p,
        actor: { login: p },
        html_url: p,
        jobs: [
          { id: 'j1', name: p, stage: p, needs: [p], status: p, html_url: p, runner_name: p, steps: [{ name: p, status: 'failure', log: `${p}\n##[group]${p}\n\u001b[31m${p}\u001b[0m\n##[error]${p}` }] }, // prettier-ignore
          { id: p, name: 'x', needs: ['j1'], status: 'running', log: p },
        ],
      }),
  },
  {
    tag: 'vt-access-log',
    attrs: { variant: 'full', filter: '<img src=x onerror=alert(1)>' },
    wrap: (p) =>
      [
        `203.0.113.7 - ${p.replace(/\s/g, '_')} [15/Nov/2026:10:00:01 +0100] "GET /${p.replace(/["\s]/g, '_')} HTTP/1.1" 200 1 "${p.replace(/"/g, "'")}" "${p.replace(/"/g, "'")}" 0.1`, // prettier-ignore
        JSON.stringify({ request: { remote_ip: p, method: p, uri: p, host: p, headers: { 'User-Agent': [p], Referer: [p] } }, status: 404, size: 1, ts: 1763200000 }), // prettier-ignore
      ].join('\n'),
  },
  {
    tag: 'vt-password',
    attrs: { variant: 'full', confirm: '', label: '<img src=x onerror=alert(1)>', hint: '<b>x</b>', value: '<svg onload=alert(1)>pass', placeholder: '"><script>alert(1)</script>' }, // prettier-ignore
    data: true,
    wrap: (p) => JSON.stringify({ mode: 'new', require: [p, 'upper'], userInputs: [p], minScore: p, minLength: p }), // prettier-ignore
  },
  {
    tag: 'vt-secret',
    attrs: { variant: 'full', rotate: '', 'show-once': '', 'copy-as': 'env,shell,<b>x</b>', label: '<img src=x onerror=alert(1)>', value: 'sk_live_<img src=x onerror=alert(1)>aaaaaaaaaaaaaaaaaaaa', now: '2026-11-15' }, // prettier-ignore
    data: true,
    wrap: (p) => JSON.stringify({ created: p, expires: p, lastUsed: p, scopes: [p, `${p}:write`], envName: p, expect: p }), // prettier-ignore
  },
  {
    tag: 'vt-secret',
    attrs: { editable: '', generate: '', 'generate-prefix': '<img src=x onerror=alert(1)>', pattern: '(<script>', placeholder: '<b>x</b>', value: '<script>alert(1)</script>' }, // prettier-ignore
    wrap: () => null,
  },
  {
    tag: 'vt-version',
    attrs: { variant: 'full', prefix: '<svg onload=alert(1)>', preids: '<img src=x onerror=alert(1)>,beta', label: '<img src=x onerror=alert(1)>' }, // prettier-ignore
    data: true,
    wrap: (p) => JSON.stringify({ value: `1.2.3-${p}`, current: p, min: p, max: p, format: p, segmentMax: [p] }), // prettier-ignore
  },
  {
    tag: 'vt-version',
    attrs: { format: '#.#', placeholder: '<img src=x onerror=alert(1)>', hint: '<b>x</b>' },
    data: true,
    wrap: (p) => JSON.stringify({ value: p, current: '1.0' }),
  },
  {
    tag: 'vt-consent',
    attrs: { position: 'inline', policy: 'javascript:alert(1)', label: '<img src=x onerror=alert(1)>', 'storage-key': '"><img src=x onerror=alert(1)>' }, // prettier-ignore
    wrap: (p) =>
      JSON.stringify({
        title: p,
        text: p,
        policy: p,
        version: p,
        categories: [{ id: 'analytics', label: p, description: p, cookies: [{ name: p, provider: p, purpose: p, duration: p }] }, { id: p, label: p }, p], // prettier-ignore
      }),
  },
  {
    tag: 'vt-consent',
    attrs: { version: 'xss' },
    hover: false,
    wrap: (p) => JSON.stringify({ title: p, text: p, policy: `https://example.com/${p}` }),
  },
  {
    tag: 'vt-changelog',
    attrs: { variant: 'full', repo: 'https://github.com/o/r', since: '<b>0</b>' },
    wrap: (p) => `# ${p}\n\n## [${p}] - 2026-01-01\n${p}\n### ${p}\n- ${p}\n- **${p}:** [${p}](${p}) \`${p}\` #1 @x a1b2c3d\n\n## [1.0.0] - 2026-01-01\n### Added\n- ${p}\n\n[1.0.0]: ${p}\n`, // prettier-ignore
  },
  {
    tag: 'vt-changelog',
    attrs: { filters: '' },
    wrap: (p) => JSON.stringify([{ tag_name: `v1.0.0`, name: p, html_url: p, body: `## ${p}\n* ${p}\n\n**Full Changelog**: ${p}` }, { version: '0.9.0', compare: p, changes: { [p]: [p] } }]), // prettier-ignore
  },
  {
    tag: 'vt-repo',
    attrs: { variant: 'full' },
    wrap: (p) =>
      JSON.stringify({
        repo: { full_name: `${p}/${p}`, name: p, owner: { login: p, avatar_url: p }, html_url: p, clone_url: p, description: p, homepage: p, stargazers_count: 1, license: { spdx_id: p, name: p, url: p }, topics: [p], pushed_at: p, default_branch: p }, // prettier-ignore
        languages: { [p]: 10, '<svg onload=alert(1)>': 5 },
        release: { tag_name: p, html_url: p, published_at: p },
      }),
  },
  {
    tag: 'vt-repo',
    attrs: {},
    wrap: (p) => JSON.stringify({ path_with_namespace: p, name: p, web_url: `https://gitlab.com/${p}`, avatar_url: `data:text/html,${p}`, star_count: 1, tag_list: [p] }), // prettier-ignore
  },
  {
    tag: 'vt-access-log',
    attrs: { tabs: '', filters: '' },
    wrap: (p) => JSON.stringify({ RequestPath: p, ClientHost: p, DownstreamStatus: 500, 'request_User-Agent': `${p} bot` }), // prettier-ignore
  },
  {
    tag: 'vt-lifecycle',
    attrs: { variant: 'full', version: '<img src=x onerror=alert(1)>', now: '2026-01-01' },
    wrap: (p) =>
      JSON.stringify([
        { cycle: p, codename: p, label: p, releaseDate: '2025-01-01', eol: '2027-01-01', latest: p, link: p }, // prettier-ignore
        { cycle: '1', releaseDate: p, eol: p, support: p, latest: { name: p, link: `https://example.com/${p}` } }, // prettier-ignore
      ]),
  },
  {
    tag: 'vt-lifecycle',
    attrs: { view: 'schedule', version: '1.2' },
    wrap: (p) => JSON.stringify({ result: { label: p, releases: [{ name: '1', codename: p, releaseDate: '2025-01-01', eolFrom: '2028-01-01' }] } }), // prettier-ignore
  },
  {
    tag: 'vt-advisories',
    attrs: { variant: 'full', expanded: '' },
    wrap: (p) =>
      JSON.stringify([
        { id: p, summary: p, details: p, aliases: [p], severity: [{ type: 'CVSS_V3', score: p }], affected: [{ package: { name: p, ecosystem: p }, ranges: [{ type: 'SEMVER', events: [{ introduced: p }, { fixed: p }] }] }], references: [{ type: 'ADVISORY', url: p }], database_specific: { severity: p, cwe_ids: [p, 'CWE-79'] } }, // prettier-ignore
        { ghsa_id: 'GHSA-1', summary: p, description: p, severity: 'high', html_url: p, cvss: { score: 7, vector_string: p }, vulnerabilities: [{ package: { name: p }, vulnerable_version_range: p, first_patched_version: p }] }, // prettier-ignore
      ]),
  },
  {
    tag: 'vt-licenses',
    attrs: { variant: 'full', allow: '<b>MIT</b>' },
    wrap: (p) =>
      JSON.stringify({
        bomFormat: 'CycloneDX',
        components: [
          { name: p, group: p, version: p, licenses: [{ expression: p }], externalReferences: [{ type: 'website', url: p }] }, // prettier-ignore
          { name: 'x', licenses: [{ license: { name: p } }] },
        ],
      }),
  },
  {
    tag: 'vt-licenses',
    attrs: { view: 'packages' },
    wrap: (p) => JSON.stringify({ [`${p}@1.0.0`]: { licenses: `${p}*`, repository: p } }),
  },
  {
    tag: 'vt-install',
    attrs: { variant: 'full', prompt: '<b>$</b>' },
    wrap: (p) => JSON.stringify({ command: `npm i ${p}\n${p}`, tabs: { [p]: p, CDN: p } }),
  },
  {
    tag: 'vt-download',
    attrs: { variant: 'full', platform: 'windows' },
    wrap: (p) =>
      JSON.stringify({
        version: p,
        name: p,
        notes: p,
        files: [
          { name: `${p}.exe`, url: p, sha256: 'a'.repeat(64) },
          { name: `${p}.exe`, url: `https://example.com/${encodeURIComponent(p)}.exe`, sha256: 'a'.repeat(64) }, // prettier-ignore
          { name: p, url: 'https://example.com/x.sig' },
        ],
      }),
  },
  {
    tag: 'vt-contributors',
    attrs: { variant: 'full', layout: 'list' },
    wrap: (p) =>
      JSON.stringify({
        groups: [
          {
            name: p,
            people: [
              { name: p, login: p, url: p, avatar: p, contributions: ['code', p] },
              { name: 'x', login: 'x', url: 'https://example.com', avatar: `https://example.com/${p}`, tier: p, amount: 5 }, // prettier-ignore
            ],
          },
        ],
      }),
  },
  {
    tag: 'vt-treemap',
    attrs: { variant: 'full', tabs: '', unit: '<b>u</b>' },
    wrap: (p) =>
      JSON.stringify([
        { path: p + '/' + p, size: 5 },
        { path: p, size: 3 },
      ]),
  },
  {
    tag: 'vt-describe',
    attrs: { variant: 'full', expanded: '' },
    wrap: (p) =>
      JSON.stringify([
        { [p]: p, n: 1 },
        { [p]: 'x', n: 2 },
      ]),
  },
  {
    tag: 'vt-compare',
    attrs: { variant: 'full', filter: 'all' },
    wrap: (p) =>
      JSON.stringify({
        original: [
          { id: 1, [p]: p },
          { id: 3, [p]: p },
        ],
        modified: [
          { id: 1, [p]: p + 'x' },
          { id: 2, [p]: p },
        ],
      }),
  },
  {
    tag: 'vt-math',
    attrs: { delimiters: '', variant: 'full' },
    wrap: (p) =>
      `Text ${p} then $${p}$ and $$\\text{${p}}$$ and \\(\\href{javascript:alert(1)}{x}\\)`,
  },
  {
    tag: 'vt-ioc',
    attrs: { variant: 'full', defang: 'false', label: '<b>x</b>' },
    wrap: (p) =>
      `${p} http://a.example.com/${p} ${p}@evil.xyz 1.2.3.4 ${p}.example.com CVE-2024-0001`,
  },
  {
    tag: 'vt-ioc',
    attrs: {},
    wrap: (p) =>
      JSON.stringify({ Attribute: [{ value: p }, { value: `http://x.example.com/?q=${p}` }] }),
  },
  {
    tag: 'vt-cvss',
    attrs: { variant: 'full', editable: '', score: '<img src=x onerror=alert(1)>' },
    wrap: (p) => `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/${p}`,
  },
  {
    tag: 'vt-headers',
    attrs: { variant: 'full' },
    wrap: (p) =>
      `HTTP/2 200\nserver: ${p}\ncontent-security-policy: script-src ${p} 'unsafe-inline'\nset-cookie: ${p}=1\nx-powered-by: ${p}`,
  },
  {
    tag: 'vt-headers',
    attrs: {},
    wrap: (p) => JSON.stringify({ [p]: p, 'Set-Cookie': [p] }),
  },
  {
    tag: 'vt-email',
    attrs: { variant: 'full', defang: 'false', view: 'links' },
    wrap: (p) =>
      `From: "${p}" <${p}@evil.xyz>\nSubject: ${p}\nAuthentication-Results: x; spf=${p}\nReceived: from ${p} ([1.2.3.4]) by ${p}; ${p}\nContent-Type: text/html\n\n${p}<a href="javascript:alert(1)">${p}</a><a href="https://x.example/${p}">${p}</a>`,
  },
  {
    tag: 'vt-email',
    attrs: { view: 'attachments' },
    wrap: (p) =>
      `From: a@b.example\nContent-Type: multipart/mixed; boundary=b\n\n--b\nContent-Type: text/plain\n\n${p}\n--b\nContent-Disposition: attachment; filename="${p}.exe"\n\n${p}\n--b--`,
  },
  {
    tag: 'vt-dns',
    attrs: { variant: 'full' },
    wrap: (p) =>
      `;; ->>HEADER<<- opcode: QUERY, status: ${p}\n${p}. 300 IN TXT "v=spf1 include:${p} -all"\n_dmarc.x. 300 IN TXT "v=DMARC1; p=${p}"\nx. 300 IN CAA 0 issue "${p}"`,
  },
  {
    tag: 'vt-dns',
    attrs: {},
    wrap: (p) => JSON.stringify({ Answer: [{ name: p, type: 16, TTL: 1, data: p }] }),
  },
  {
    tag: 'vt-nmap',
    attrs: { variant: 'full', all: '' },
    wrap: (p) =>
      `Nmap scan report for ${p} (1.2.3.4)\nOS details: ${p}\nPORT STATE SERVICE VERSION\n22/tcp open ${p} ${p}\n| ${p}: ${p}\n|_  ${p}`,
  },
  {
    tag: 'vt-nmap',
    attrs: {},
    wrap: (p) =>
      `<nmaprun args="${p.replace(/[<&"]/g, '')}"><host><address addr="1.2.3.4" addrtype="ipv4"/><ports><port protocol="tcp" portid="80"><state state="open"/><service name="http" product="${p.replace(/[<&"]/g, '')}"/><script id="x" output="${p.replace(/[<&"]/g, '')}"/></port></ports></host></nmaprun>`,
  },
  {
    tag: 'vt-url',
    attrs: { variant: 'full', defang: 'false', chain: '' },
    wrap: (p) =>
      `javascript:${p}
data:text/html,${p}
https://${p}@x.example/${p}?q=${encodeURIComponent(p)}&next=https://y.example/${encodeURIComponent(p)}#${p}`,
  },
  {
    tag: 'vt-hash',
    attrs: { variant: 'full', expected: '' },
    wrap: (p) => p,
  },
  {
    tag: 'vt-waterfall',
    attrs: { variant: 'full', defang: 'false' },
    wrap: (p) =>
      JSON.stringify({
        log: {
          pages: [{ id: 'p', title: p }],
          entries: [
            { pageref: 'p', startedDateTime: p, time: 1, _resourceType: p, serverIPAddress: p, request: { method: p, url: `https://x.example/${p}`, headers: [{ name: p, value: p }] }, response: { status: 302, statusText: p, httpVersion: p, redirectURL: `javascript:${p}`, headers: [{ name: p, value: p }], content: { mimeType: p, size: 1 } } }, // prettier-ignore
            { pageref: 'p', request: { url: `javascript:${p}` }, response: { status: 200 } },
          ],
        },
      }),
  },
  {
    tag: 'vt-yara',
    attrs: { variant: 'full' },
    wrap: (p) =>
      `import "${p.replace(/"/g, '')}"
rule R_${p.replace(/\W/g, '')} : ${p.replace(/\W/g, '')} {
  meta:
    d = "${p.replace(/["\\\n]/g, '')}"
  strings:
    $a = "${p.replace(/["\\\n]/g, '')}" nocase
  condition:
    $a and ${p}
}
${p}`,
  },
  {
    tag: 'vt-sigma',
    attrs: { variant: 'full' },
    wrap: (p) =>
      JSON.stringify({ title: p, id: p, status: p, level: p, description: p, author: p, date: p, references: [p, `javascript:${p}`], tags: [p, 'attack.t1059'], logsource: { product: p, [p]: p }, detection: { [p]: { [`${p}|${p}`]: [p, null] }, s: [p], condition: `${p} and s` }, falsepositives: [p], fields: [p] }), // prettier-ignore
  },
  {
    tag: 'vt-pcap',
    attrs: { variant: 'full', defang: 'false' },
    wrap: (p) => pcapWith(p),
  },
  {
    tag: 'vt-semver',
    attrs: { variant: 'full', range: '^1.2.3' },
    wrap: (p) =>
      JSON.stringify({
        versions: { '1.2.3': {}, [p]: {} },
        'dist-tags': { [p]: '1.2.3', latest: p },
      }),
  },
  {
    tag: 'vt-semver',
    attrs: { variant: 'full' },
    wrap: (p) => `${p}\n1.2.3 ${p}`,
  },
  {
    tag: 'vt-contrast',
    attrs: { variant: 'full' },
    wrap: (p) => `${p.replace(/[:\n]/g, '')}: #333 on #fff\nrgb(${p}) on #fff\n${p}\n#fff`,
  },
  {
    tag: 'vt-contrast',
    attrs: { variant: 'full', fg: 'red', bg: 'white' },
    wrap: (p) => p,
  },
  {
    tag: 'vt-sbom',
    attrs: { variant: 'full', view: 'components' },
    wrap: (p) =>
      JSON.stringify({ bomFormat: 'CycloneDX', specVersion: p, metadata: { timestamp: p, tools: [{ name: p }], component: { 'bom-ref': 'r', name: p } }, components: [{ 'bom-ref': 'c', name: p, group: p, version: p, purl: `pkg:${p}`, scope: p, licenses: [{ expression: p }] }], dependencies: [{ ref: 'r', dependsOn: ['c'] }], vulnerabilities: [{ id: p, source: { url: `javascript:${p}` }, description: p, recommendation: p, ratings: [{ severity: p, vector: p, method: p }], analysis: { state: p }, affects: [{ ref: 'c' }] }] }), // prettier-ignore
  },
  {
    tag: 'vt-sbom',
    attrs: { variant: 'full', view: 'vulnerabilities' },
    wrap: (p) =>
      JSON.stringify({ spdxVersion: p, name: p, creationInfo: { creators: [`Tool: ${p}`] }, packages: [{ SPDXID: 'a', name: p, versionInfo: p, licenseConcluded: p, supplier: p }] }), // prettier-ignore
  },
  {
    tag: 'vt-dockerfile',
    attrs: { variant: 'full' },
    wrap: (p) =>
      `# ${p}\nFROM ${p} AS ${p}\nRUN ${p} <<EOF\n${p}\nEOF\nCOPY --from=${p} ${p} ${p}\nENV ${p}=${p}\nLABEL a="${p}"\n${p}`,
  },
  {
    tag: 'vt-dockerfile',
    attrs: { variant: 'full', view: 'source' },
    wrap: (p) => `FROM a:1\nRUN echo "${p}" $${p}\n# ${p}`,
  },
  {
    tag: 'vt-lighthouse',
    attrs: { variant: 'full' },
    wrap: (p) =>
      JSON.stringify({ lighthouseResult: { finalDisplayedUrl: p, lighthouseVersion: p, fetchTime: p, runWarnings: [p], configSettings: { formFactor: p }, categories: { [p]: { title: p, score: 0.5, auditRefs: [{ id: 'a' }, { id: 'b' }] } }, audits: { a: { title: p, description: `${p} [${p}](javascript:${p})`, score: 0, scoreDisplayMode: 'binary', displayValue: p, details: { overallSavingsMs: 5, headings: [{ key: 'u', valueType: 'url', label: p }, { key: 'n', valueType: 'node', label: p }], items: [{ u: p, n: { type: 'node', snippet: p } }] } }, b: { title: p, score: 1 } } }, loadingExperience: { overall_category: p, metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1, category: p, distributions: [{ proportion: 1 }] } } } }), // prettier-ignore
  },
  {
    tag: 'vt-a11y',
    attrs: { variant: 'full' },
    wrap: (p) =>
      JSON.stringify({ url: p, testEngine: { name: p, version: p }, violations: [{ id: p, impact: 'critical', tags: [p, 'wcag143'], help: p, description: p, helpUrl: `javascript:${p}`, nodes: [{ html: p, target: [p, [p, p]], failureSummary: `Fix any of the following:\n  ${p}` }] }], incomplete: [{ id: p, help: p, nodes: [{ html: p, target: [p] }] }], passes: [] }), // prettier-ignore
  },
  {
    tag: 'vt-cookies',
    attrs: { variant: 'full', 'mask-values': 'false', url: 'https://x.dev/' },
    wrap: (p) =>
      `Set-Cookie: ${p.replace(/[;=\n]/g, '')}=${p.replace(/[;\n]/g, '')}; Domain=${p.replace(/[;\n]/g, '')}; Path=${p.replace(/[;\n]/g, '')}`,
  },
  {
    tag: 'vt-cookies',
    attrs: { variant: 'full', 'mask-values': 'false' },
    wrap: (p) =>
      JSON.stringify({
        log: {
          entries: [
            {
              request: { url: `https://x.dev/${p}` },
              response: {
                headers: [],
                cookies: [{ name: p, value: p, domain: p, path: p, expires: p }],
              },
            },
          ],
        },
      }),
  },
  {
    tag: 'vt-redirects',
    attrs: { variant: 'full' },
    wrap: (p) =>
      JSON.stringify([
        { url: `https://x.dev/?${p}`, status: 302, ip: p },
        { url: `javascript:${p}`, type: 'js' },
        { url: p, status: 200, location: p },
      ]),
  },
  {
    tag: 'vt-redirects',
    attrs: { variant: 'full' },
    wrap: (p) =>
      `$ curl -sIL https://x.dev/\nHTTP/1.1 301 ${p}\nLocation: ${p.replace(/\s/g, '')}\n\nHTTP/1.1 200 OK`,
  },
  {
    tag: 'vt-map',
    slow: true,
    attrs: { variant: 'full' },
    wrap: (p) => `${p}: 48.85, 2.35\nFR 12\nParis -> ${p}`,
  },
  {
    tag: 'vt-map',
    slow: true,
    attrs: { variant: 'full', projection: 'globe' },
    wrap: (p) =>
      JSON.stringify({
        type: 'Feature',
        properties: { name: p, color: p },
        geometry: { type: 'Point', coordinates: [2, 48] },
      }),
  },
  {
    tag: 'vt-loading-steps',
    attrs: { text: 'Steps' },
    wrap: (p) => `done ${p} — ${p} (42s)\nrunning ${p}\n${p}`,
  },
  {
    tag: 'vt-loading-steps',
    attrs: {},
    wrap: (p) => JSON.stringify([{ label: p, status: p, detail: p, duration: p }]),
  },
  {
    tag: 'vt-loading-message',
    attrs: { elapsed: '', 'slow-after': '1ms' },
    wrap: (p) => `${p}\n${p}`,
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
      // A map draws every country of the world for each payload.
      if (mode.slow) test.slow();
      for (const payload of PAYLOADS) {
        const content = mode.wrap ? mode.wrap(payload) : payload;
        // `data` modes go through the json attribute, so the JSON layer is tested too.
        if (mode.data) await mount(page, mode.tag, { ...mode.attrs, json: content });
        else await mount(page, mode.tag, mode.attrs, content);
        // Exercise interactive paths too: hover, focus and the search bar. An element drawn
        // fixed to the window (a consent banner) has no box of its own to hover.
        if (mode.hover !== false) await page.locator('#el').hover();
        await page.waitForTimeout(30);
        const problems = await page.evaluate(audit);
        expect(problems, `payload: ${payload}`).toEqual([]);
      }
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => window.__xss), 'a payload executed').toBeUndefined();
    });
  }

  test('loading indicators render their text attributes as text', async ({ page }) => {
    const TEXT = {
      'vt-spinner': ['text', 'label'],
      'vt-progress': ['text', 'label', 'unit', 'value-text'],
      'vt-progress-ring': ['text', 'unit', 'value-text'],
      'vt-skeleton': ['label', 'width'],
      'vt-loading-overlay': ['text', 'cancel-text'],
      'vt-page-progress': ['label', 'thickness'],
      'vt-typing': ['name', 'text'],
      'vt-loading-button': ['loading-text', 'label'],
      'vt-loading-message': ['messages', 'slow-text'],
    };
    for (const payload of PAYLOADS.slice(0, 30)) {
      for (const [tag, names] of Object.entries(TEXT)) {
        const attrs = Object.fromEntries(names.map((name) => [name, payload]));
        await mount(page, tag, {
          ...attrs,
          value: '40',
          'show-value': 'value',
          'show-text': '',
          active: '',
          loading: '',
          cancelable: '',
          'slow-after': '1ms',
        });
        const problems = await page.evaluate(audit);
        expect(problems, `${tag}, payload: ${payload}`).toEqual([]);
      }
    }
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__xss), 'a payload executed').toBeUndefined();
  });

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
