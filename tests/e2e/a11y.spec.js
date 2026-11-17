import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { STRICT, mount } from './helpers.js';

const SAMPLES = {
  'vt-code':
    'def hello(name):\n    return f"Hello {name}"  # greet\n\nprint(hello("world"), 42, None)',
  'vt-markdown':
    '# Title\n\nText with a [link](https://example.com) and `code`.\n\n## Part\n\n- [x] done\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst a = 1; // note\n```\n\n> quote',
  'vt-json':
    '{"name": "Ada", "age": 36, "admin": true, "tags": ["a", "b"], "manager": null, "nested": {"x": 1}}',
};
const THEMES = ['light', 'dark', 'dim', 'paper', 'high-contrast'];
const MORE = {
  'vt-faq': [
    JSON.stringify([
      { question: 'Q one?', answer: 'A *one*', category: 'X' },
      { question: 'Q two?', answer: 'A two', category: 'Y' },
    ]),
    { open: 'first' },
  ],
  'vt-gallery': [
    JSON.stringify([
      {
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        alt: 'One',
        caption: 'First',
      },
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    ]),
    {},
  ],
  'vt-stats': [
    JSON.stringify([
      { label: 'Visitors', value: 120, previous: 100, series: [1, 3, 2] },
      { label: 'Errors', value: 3, previous: 5, good: 'down' },
    ]),
    {},
  ],
  'vt-board': [
    '{"columns":[{"id":"todo"},{"id":"done","limit":1}],"tasks":[{"id":"a","title":"A","column":"todo","labels":["x"],"priority":"urgent","due":"2026-01-01","assignee":"Ada Lovelace","progress":40},{"id":"b","title":"B","column":"done","url":"/b"},{"id":"c","title":"C","column":"done"}]}',
    { views: '', now: '2026-11-07T12:00:00Z' },
  ],
  'vt-field': [
    '["France","Germany",{"value":"lu","label":"Luxembourg","description":"Grand Duchy"}]',
    { type: 'select', required: '', hint: 'Where you live.', tip: 'Sets the currency.' },
  ],
  'vt-search': [
    '[{"id":"a","title":"Getting started","section":"Guides","content":"Install it.","featured":true},{"id":"b","title":"Board","section":"Components","content":"Drag and drop.","featured":true}]',
    {},
  ],
  'vt-date-picker': [
    '',
    {
      mode: 'range',
      inline: '',
      required: '',
      hint: 'Your stay.',
      now: '2026-11-18',
      value: '2026-11-20/2026-11-24',
      'disabled-dates': '2026-11-26 sun',
      min: 'today',
    },
  ],
  'vt-menu': [
    '[{"label":"Rename","shortcut":"F2","icon":"pencil"},{"label":"Share","items":["Link"]},"---",{"type":"radio","label":"Sort","items":[{"label":"Name","checked":true},"Date"]},{"type":"checkbox","label":"Wrap"},{"label":"Archived","disabled":true},{"label":"Delete","danger":true}]',
    { trigger: 'inline' },
  ],
  'vt-upload': [
    '',
    {
      required: '',
      multiple: '',
      accept: 'image/*,.pdf',
      'max-size': '5MB',
      'max-files': '3',
      hint: 'Screenshots or a PDF.',
    },
  ],
  'vt-testimonials': [
    JSON.stringify([
      { quote: 'Great', author: 'Ada Lovelace', role: 'CTO', rating: 5, url: '/r' },
      { quote: 'Good', author: 'Alan', rating: 4 },
    ]),
    {},
  ],
  'vt-countdown': [
    JSON.stringify({ to: '2027-01-01T00:00:00Z', title: 'Launch', url: '/l', cta: 'More' }),
    { now: '2026-11-07T12:00:00Z' },
  ],
  'vt-status': [
    '{"components":[{"name":"API","status":"degraded","since":"2026-10-01","group":"Core","url":"/api","history":{"2026-10-20":"major","2026-10-21":"partial","2026-10-22":"maintenance"}}],"incidents":[{"title":"Slow","status":"identified","impact":"minor","updates":[{"status":"identified","text":"Found"}]},{"title":"Old","status":"resolved","url":"/old"}],"maintenances":[{"title":"Upgrade","start":"2099-01-01T00:00:00Z"}]}',
    { now: '2026-11-05T12:00:00Z' },
  ],
  'vt-calendar': [
    '[{"title":"Lunch","start":"2026-11-05T12:00:00Z","url":"/lunch"},{"title":"Holiday","start":"2026-11-11"},{"title":"Off","start":"2026-11-06T12:00:00Z","cancelled":true}]',
    { now: '2026-11-05T12:00:00Z', timezone: 'UTC' },
  ],
  'vt-pricing': [
    '{"currencies":["EUR","USD"],"plans":[{"id":"a","name":"A","price":{"monthly":{"EUR":1,"USD":2},"yearly":{"EUR":10,"USD":20}},"features":["One",{"text":"Two","included":false}]},{"id":"b","name":"B","badge":"Best","highlight":true,"price":"Ask","cta":{"label":"Go","url":"/go"}}],"compare":[{"group":"G","name":"Row","description":"Note","values":{"a":true,"b":"Yes"}}]}',
    {},
  ],
  'vt-sql': [
    'app=# SELECT id, name FROM users;\n id | name\n----+------\n  1 | Ada\n  2 |\n(2 rows)\n\napp=# SELECT * FROM nope;\nERROR:  relation "nope" does not exist',
    { dialect: 'postgresql' },
  ],
  'vt-test-report': [
    '<testsuites><testsuite name="api"><testcase name="ok" time="0.1"/><testcase name="bad" time="0.2"><failure message="boom">trace</failure></testcase><testcase name="later"><skipped/></testcase></testsuite></testsuites>',
    {},
  ],
  'vt-trace': [
    JSON.stringify([
      { id: 'a', name: 'GET /', service: 'web', start: 0, duration: 100 },
      {
        id: 'b',
        parent: 'a',
        name: 'query',
        service: 'db',
        start: 10,
        duration: 50,
        error: 'slow',
      },
    ]),
    { selected: 'b' },
  ],
  'vt-notebook': [
    JSON.stringify({
      cells: [
        { cell_type: 'markdown', source: '# Title\n\nSome *text*.' },
        {
          cell_type: 'code',
          execution_count: 1,
          source: 'print(1)\n1 + 1',
          outputs: [
            { output_type: 'stream', name: 'stdout', text: '1\n' },
            { output_type: 'execute_result', execution_count: 1, data: { 'text/plain': '2' } },
            { output_type: 'display_data', data: { 'text/html': '<table><tr><th>a</th></tr><tr><td>1</td></tr></table>' } }, // prettier-ignore
            {
              output_type: 'error',
              ename: 'E',
              evalue: 'v',
              traceback: ['\u001b[31mE\u001b[0m: v'],
            },
          ],
        },
      ],
    }),
    {},
  ],
  'vt-csv': ['name,score\nAda,98\nAlan,95', {}],
  'vt-tags': ['{"value":["design"],"options":["design","research","a11y"]}', { mode: 'edit' }],
  'vt-diff': ['--- a\n+++ b\n@@ -1,2 +1,2 @@\n same\n-old line\n+new line', {}],
  'vt-terminal': [
    '$ npm test\n\u001b[32m✓\u001b[0m 42 passed\n\u001b[31m×\u001b[0m 1 failed\n\u001b[41m FAIL \u001b[0m\n$ git status',
    { 'collapse-output': '2' },
  ],
  'vt-tree': ['src/\n  + app.js  # entry\n  ~ util.js\n  - old.js\n* README.md', {}],
  'vt-http': [
    'POST /api/users HTTP/1.1\nHost: api.example.com\nContent-Type: application/json\nAuthorization: Bearer abcdefghijklmnopqrst\n\n{"name":"Ada"}\n\nHTTP/1.1 404 Not Found\nContent-Type: application/json\n\n{"error":"missing"}',
    { layout: 'columns' },
  ],
  'vt-ioc': [
    'C2 at 45.33.32[.]156 and 10.0.0.5, payload hxxps://evil[.]example[.]xyz/a, d41d8cd98f00b204e9800998ecf8427e, CVE-2024-3400, T1566.001',
    { variant: 'full' },
  ],
  'vt-cvss': [
    'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N/E:P',
    { variant: 'full', editable: '' },
  ],
  'vt-headers': [
    "HTTP/2 200\nserver: nginx/1.18.0\nstrict-transport-security: max-age=86400\ncontent-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' https:\nset-cookie: a=1; SameSite=None",
    { variant: 'full' },
  ],
  'vt-email': [
    'Authentication-Results: mx; spf=pass; dkim=fail; dmarc=fail\nReceived: from a ([203.0.113.6]) by mx with SMTP; Tue, 17 Nov 2026 10:00:02 +0100\nFrom: "a@bank.example" <x@evil.xyz>\nReply-To: r@other.example\nSubject: Hi\nContent-Type: multipart/mixed; boundary=b\n\n--b\nContent-Type: text/html\n\n<a href="https://evil.xyz">https://bank.example</a>\n--b\nContent-Type: application/octet-stream; name="a.pdf.exe"\nContent-Transfer-Encoding: base64\n\nTVqQ\n--b--',
    { variant: 'full' },
  ],
  'vt-dns': [
    'example.com. 300 IN TXT "v=spf1 +all"\n_dmarc.example.com. 300 IN TXT "v=DMARC1; p=none"\nexample.com. 300 IN MX 10 mail.example.com.',
    { variant: 'full' },
  ],
  'vt-nmap': [
    'Nmap scan report for a.example (203.0.113.10)\nHost is up (0.01s latency).\nPORT STATE SERVICE VERSION\n22/tcp open ssh OpenSSH 9\n| ssh-hostkey:\n|_  256 aa (ED25519)\n3389/tcp open ms-wbt-server\n25/tcp filtered smtp',
    { variant: 'full', all: '' },
  ],
  'vt-url': [
    'https://www.paypal.com@evil.example/login?utm_source=mail&next=https://evil.example/x\nhttps://xn--80ak6aa92e.com/',
    { variant: 'full', chain: '' },
  ],
  'vt-hash': ['Hello, Vitrine', { variant: 'full', expected: 'd41d8cd98f00b204e9800998ecf8427e' }],
  'vt-waterfall': [
    JSON.stringify({
      log: {
        pages: [{ id: 'p', title: 'Shop', startedDateTime: '2026-11-17T10:00:00.000Z', pageTimings: { onContentLoad: 300, onLoad: 400 } }], // prettier-ignore
        entries: [
          { pageref: 'p', startedDateTime: '2026-11-17T10:00:00.000Z', time: 120, _resourceType: 'document', request: { method: 'GET', url: 'https://shop.example/' }, response: { status: 200, content: { size: 9000, mimeType: 'text/html' }, bodySize: 3000 }, timings: { dns: 10, connect: 30, ssl: 15, send: 1, wait: 60, receive: 19 } }, // prettier-ignore
          { pageref: 'p', startedDateTime: '2026-11-17T10:00:00.150Z', time: 80, request: { method: 'GET', url: 'https://cdn.other.example/a.js' }, response: { status: 404, content: { size: 0, mimeType: 'text/javascript' } }, timings: { wait: 70, receive: 10 } }, // prettier-ignore
        ],
      },
    }),
    { variant: 'full' },
  ],
  'vt-yara': [
    'rule Loader : banker {\n  meta:\n    description = "Loader"\n  strings:\n    $mz = { 4D 5A ?? [2-4] 00 }\n    $a = "cmd.exe" nocase wide\n    $b = "ab"\n  condition:\n    uint16(0) == 0x5A4D and filesize < 200KB and any of them and $c\n}',
    { variant: 'full' },
  ],
  'vt-sigma': [
    '{"title":"Whoami","id":"502b42de-4306-40b4-9596-6f590c81f073","status":"test","level":"high","tags":["attack.discovery","attack.t1033"],"logsource":{"category":"process_creation","product":"windows"},"detection":{"selection":{"Image|endswith":"\\\\whoami.exe"},"filter":{"User|contains":["AUTHORI","AUTORI"]},"unused":{"a":1},"condition":"selection and not filter"},"falsepositives":["Admins"]}',
    { variant: 'full' },
  ],
  'vt-pcap': [
    '1MOyoQIABAAAAAAAAAAAAP//AAABAAAAoCX8agAAAAAqAAAAKgAAAP///////wIAXhAAAQgGAAEIAAYEAAECAF4QAAHAqAEUAAAAAAAAwKgBAaAl/GrUMAAAKgAAACoAAAACAF4QAAECAF4QAP4IBgABCAAGBAACAgBeEAD+wKgBAQIAXhAAAcCoARSgJfxqqGEAAE4AAABOAAAAAgBeEAD+AgBeEAABCABFAABAHEZAAEARAADAqAEUwKgBAc+EADUALAAAKh8BAAABAAAAAAAABWxvZ2luBHNob3AHZXhhbXBsZQAAAQABoCX8anySAAB8AAAAfAAAAAIAXhAAAQIAXhAA/ggARQAAbhxGQABAEQAAwKgBAcCoARQANc+EAFoAACofgYAAAQACAAAAAAVsb2dpbgRzaG9wB2V4YW1wbGUAAAEAAcAMAAUAAQAAASwAEgNjZG4Ec2hvcAdleGFtcGxlAMAwAAEAAQAAADwABMYzZAegJfxqkF8BADYAAAA2AAAAAgBeEAD+AgBeEAABCABFAAAoHEZAAEAGAADAqAEUxjNkB8k6AbsAAAPoAAAAAFAC+vAAAAAAoCX8amSQAQA2AAAANgAAAAIAXhAAAQIAXhAA/ggARQAAKBxGQABABgAAxjNkB8CoARQBu8k6AAATiAAAA+lQEvrwAAAAAKAl/Go4wQEANgAAADYAAAACAF4QAP4CAF4QAAEIAEUAACgcRkAAQAYAAMCoARTGM2QHyToBuwAAA+kAABOJUBD68AAAAACgJfxqDPIBAKIAAACiAAAAAgBeEAD+AgBeEAABCABFAACUHEZAAEAGAADAqAEUxjNkB8k6AbsAAAPpAAATiVAY+vAAAAAAFgMBAGcBAABjAwMHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwAABBMBEwIBAAA2AAAAFwAVAAASbG9naW4uc2hvcC5leGFtcGxlABAADgAMAmgyCGh0dHAvMS4xACsABQQDBAMDoCX8auAiAgA2AAAANgAAAAIAXhAA/gIAXhAAAQgARQAAKBxGQABABgAAwKgBFMYzZAfJkABQAAAjKAAAAABQAvrwAAAAAKAl/Gq0UwIAnAAAAJwAAAACAF4QAP4CAF4QAAEIAEUAAI4cRkAAQAYAAMCoARTGM2QHyZAAUAAAIykAABtZUBj68AAAAABHRVQgL2xvZ2luP25leHQ9JTJGYWNjb3VudCBIVFRQLzEuMQ0KSG9zdDogbG9naW4uc2hvcC5leGFtcGxlDQpVc2VyLUFnZW50OiBjdXJsLzguNS4wDQpBY2NlcHQ6ICovKg0KDQqgJfxqiIQCADIAAAAyAAAAAgBeEAD+AgBeEAABCABFAAAkHEZAAEABAADAqAEUywBxCQgAAAASNAABYWJjZGVmZ2igJfxqXLUCAEYAAABGAAAAAgBeEAD+AgBeEAABht1gAAAAABA6QCABDbgAAAAAAAAAAAAAAAEgAQ24AAAAAAAAAAAAAAACgAAAAAAHAAFwaW5ncGluZw==',
    { variant: 'full' },
  ],
  'vt-semver': ['1.0.0 1.2.3 1.4.2 1.5.0-rc.1 2.0.0', { variant: 'full', range: '^1.2.3' }],
  'vt-contrast': [
    'Body: #333 on #fff\nMuted: #999 on #fff\nLink: #0b6bcb / #f5f5f5',
    { variant: 'full' },
  ],
  'vt-sbom': [
    '{"bomFormat":"CycloneDX","specVersion":"1.6","serialNumber":"urn:uuid:3e671687-395b-41f5-a30f-a58921a69b79","version":1,"metadata":{"timestamp":"2026-11-17T10:00:00Z","tools":{"components":[{"type":"application","vendor":"anchore","name":"syft","version":"1.16.0"}]},"component":{"type":"application","bom-ref":"app","name":"shop-web","version":"3.2.0","purl":"pkg:npm/shop-web@3.2.0"}},"components":[{"type":"framework","bom-ref":"pkg:npm/express@4.19.2","name":"express","version":"4.19.2","purl":"pkg:npm/express@4.19.2","licenses":[{"license":{"id":"MIT"}}],"hashes":[{"alg":"SHA-512","content":"aa11"}]},{"type":"library","bom-ref":"pkg:npm/body-parser@1.20.2","name":"body-parser","version":"1.20.2","purl":"pkg:npm/body-parser@1.20.2","licenses":[{"license":{"id":"MIT"}}]},{"type":"library","bom-ref":"pkg:npm/qs@6.11.0","name":"qs","version":"6.11.0","purl":"pkg:npm/qs@6.11.0","licenses":[{"license":{"id":"BSD-3-Clause"}}]},{"type":"library","bom-ref":"pkg:npm/%40img/sharp@0.33.0","group":"@img","name":"sharp","version":"0.33.0","purl":"pkg:npm/%40img/sharp@0.33.0","licenses":[{"expression":"Apache-2.0 AND LGPL-3.0-or-later"}]},{"type":"library","bom-ref":"pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1","group":"org.apache.logging.log4j","name":"log4j-core","version":"2.14.1","purl":"pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1","licenses":[{"license":{"id":"Apache-2.0"}}],"scope":"optional"},{"type":"library","bom-ref":"pkg:npm/left-pad@1.3.0","name":"left-pad","version":"1.3.0","purl":"pkg:npm/left-pad@1.3.0"}],"dependencies":[{"ref":"app","dependsOn":["pkg:npm/express@4.19.2","pkg:npm/%40img/sharp@0.33.0","pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1"]},{"ref":"pkg:npm/express@4.19.2","dependsOn":["pkg:npm/body-parser@1.20.2","pkg:npm/qs@6.11.0"]},{"ref":"pkg:npm/body-parser@1.20.2","dependsOn":["pkg:npm/qs@6.11.0"]},{"ref":"pkg:npm/qs@6.11.0","dependsOn":[]}],"vulnerabilities":[{"id":"CVE-2021-44228","source":{"name":"NVD","url":"https://nvd.nist.gov/vuln/detail/CVE-2021-44228"},"ratings":[{"source":{"name":"NVD"},"score":10.0,"severity":"critical","method":"CVSSv31","vector":"CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H"}],"cwes":[502,400,20],"description":"Apache Log4j2 JNDI features do not protect against attacker-controlled LDAP endpoints.","recommendation":"Upgrade to 2.17.1 or later.","analysis":{"state":"exploitable"},"affects":[{"ref":"pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1"}]},{"id":"GHSA-hrpp-h998-j3pp","source":{"name":"GitHub"},"ratings":[{"severity":"high","method":"CVSSv31","score":7.5}],"description":"qs vulnerable to prototype pollution.","affects":[{"ref":"pkg:npm/qs@6.11.0"}]},{"id":"CVE-2024-43796","source":{"name":"NVD"},"ratings":[{"severity":"low","score":2.3,"method":"CVSSv4"}],"analysis":{"state":"not_affected","justification":"code_not_reachable"},"affects":[{"ref":"pkg:npm/express@4.19.2"}]}]}',
    { variant: 'full' },
  ],
  'vt-dockerfile': [
    'FROM node:20-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n\nFROM nginx:latest\nCOPY --from=build /app/dist /usr/share/nginx/html\nRUN apt-get update && apt-get install -y curl\nEXPOSE 80\nCMD ["nginx", "-g", "daemon off;"]',
    { variant: 'full' },
  ],
  'vt-lighthouse': [
    '{"id":"https://shop.example/","loadingExperience":{"id":"https://shop.example/","overall_category":"AVERAGE","metrics":{"LARGEST_CONTENTFUL_PAINT_MS":{"percentile":2900,"category":"AVERAGE","distributions":[{"min":0,"max":2500,"proportion":0.68},{"min":2500,"max":4000,"proportion":0.2},{"min":4000,"proportion":0.12}]},"INTERACTION_TO_NEXT_PAINT":{"percentile":180,"category":"FAST","distributions":[{"proportion":0.8},{"proportion":0.15},{"proportion":0.05}]},"CUMULATIVE_LAYOUT_SHIFT_SCORE":{"percentile":31,"category":"SLOW","distributions":[{"proportion":0.55},{"proportion":0.2},{"proportion":0.25}]}}},"lighthouseResult":{"requestedUrl":"https://shop.example/","finalDisplayedUrl":"https://shop.example/","lighthouseVersion":"12.2.1","fetchTime":"2026-11-17T10:00:00.000Z","configSettings":{"formFactor":"mobile"},"runWarnings":["The page loaded too slowly to finish within the time limit."],"categories":{"performance":{"title":"Performance","score":0.62,"auditRefs":[{"id":"first-contentful-paint","weight":10,"group":"metrics"},{"id":"largest-contentful-paint","weight":25,"group":"metrics"},{"id":"total-blocking-time","weight":30,"group":"metrics"},{"id":"cumulative-layout-shift","weight":25,"group":"metrics"},{"id":"speed-index","weight":10,"group":"metrics"},{"id":"render-blocking-resources","weight":0,"group":"load-opportunities"},{"id":"uses-optimized-images","weight":0,"group":"load-opportunities"},{"id":"dom-size","weight":0,"group":"diagnostics"}]},"accessibility":{"title":"Accessibility","score":0.88,"auditRefs":[{"id":"color-contrast","weight":7,"group":"a11y-color-contrast"},{"id":"image-alt","weight":10,"group":"a11y-names-labels"}]},"best-practices":{"title":"Best Practices","score":0.96,"auditRefs":[{"id":"is-on-https","weight":5}]},"seo":{"title":"SEO","score":1,"auditRefs":[{"id":"document-title","weight":1}]}},"audits":{"first-contentful-paint":{"id":"first-contentful-paint","title":"First Contentful Paint","score":0.72,"scoreDisplayMode":"numeric","numericValue":2210,"displayValue":"2.2 s"},"largest-contentful-paint":{"id":"largest-contentful-paint","title":"Largest Contentful Paint","score":0.31,"scoreDisplayMode":"numeric","numericValue":4630,"displayValue":"4.6 s"},"total-blocking-time":{"id":"total-blocking-time","title":"Total Blocking Time","score":0.58,"scoreDisplayMode":"numeric","numericValue":420,"displayValue":"420 ms"},"cumulative-layout-shift":{"id":"cumulative-layout-shift","title":"Cumulative Layout Shift","score":0.9,"scoreDisplayMode":"numeric","numericValue":0.08,"displayValue":"0.08"},"speed-index":{"id":"speed-index","title":"Speed Index","score":0.66,"scoreDisplayMode":"numeric","numericValue":4900,"displayValue":"4.9 s"},"render-blocking-resources":{"id":"render-blocking-resources","title":"Eliminate render-blocking resources","description":"Resources are blocking the first paint of your page. [Learn how to eliminate render-blocking resources](https://developer.chrome.com/docs/lighthouse/performance/render-blocking-resources/).","score":0.3,"scoreDisplayMode":"metricSavings","displayValue":"Potential savings of 780 ms","details":{"type":"opportunity","overallSavingsMs":780,"headings":[{"key":"url","valueType":"url","label":"URL"},{"key":"totalBytes","valueType":"bytes","label":"Transfer Size"},{"key":"wastedMs","valueType":"timespanMs","label":"Potential Savings"}],"items":[{"url":"https://shop.example/css/app.css","totalBytes":48200,"wastedMs":540},{"url":"https://fonts.example/css2?family=Inter","totalBytes":1300,"wastedMs":240}]}},"uses-optimized-images":{"id":"uses-optimized-images","title":"Efficiently encode images","description":"Optimized images load faster.","score":0.5,"scoreDisplayMode":"metricSavings","displayValue":"Potential savings of 312 KiB","details":{"type":"opportunity","overallSavingsMs":300,"overallSavingsBytes":319488,"headings":[{"key":"url","valueType":"url","label":"URL"}],"items":[{"url":"https://shop.example/img/hero.jpg"}]}},"dom-size":{"id":"dom-size","title":"Avoid an excessive DOM size","score":0.6,"scoreDisplayMode":"numeric","displayValue":"1,840 elements"},"color-contrast":{"id":"color-contrast","title":"Background and foreground colors do not have a sufficient contrast ratio.","score":0,"scoreDisplayMode":"binary","details":{"type":"table","headings":[{"key":"node","valueType":"node","label":"Failing Elements"}],"items":[{"node":{"type":"node","snippet":"<a class=\\"muted\\">Terms</a>","selector":"footer a.muted"}}]}},"image-alt":{"id":"image-alt","title":"Image elements have [alt] attributes","score":1,"scoreDisplayMode":"binary"},"is-on-https":{"id":"is-on-https","title":"Uses HTTPS","score":1,"scoreDisplayMode":"binary"},"document-title":{"id":"document-title","title":"Document has a <title> element","score":1,"scoreDisplayMode":"binary"}}}}',
    { variant: 'full' },
  ],
  'vt-a11y': [
    '{"testEngine":{"name":"axe-core","version":"4.10.2"},"timestamp":"2026-11-17T10:00:00.000Z","url":"https://shop.example/checkout","violations":[{"id":"color-contrast","impact":"serious","tags":["cat.color","wcag2aa","wcag143","TTv5","EN-301-549"],"description":"Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds","help":"Elements must meet minimum color contrast ratio thresholds","helpUrl":"https://dequeuniversity.com/rules/axe/4.10/color-contrast?application=axeAPI","nodes":[{"impact":"serious","html":"<a class=\\"muted\\" href=\\"/terms\\">Terms</a>","target":["footer > a.muted"],"failureSummary":"Fix any of the following:\\n  Element has insufficient color contrast of 2.84 (foreground color: #999999, background color: #ffffff, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1"},{"impact":"serious","html":"<span class=\\"hint\\">Optional</span>","target":["#email-hint"],"failureSummary":"Fix any of the following:\\n  Element has insufficient color contrast of 3.1"}]},{"id":"label","impact":"critical","tags":["cat.forms","wcag2a","wcag412","wcag131"],"description":"Ensure every form element has a label","help":"Form elements must have labels","helpUrl":"https://dequeuniversity.com/rules/axe/4.10/label?application=axeAPI","nodes":[{"impact":"critical","html":"<input type=\\"text\\" name=\\"zip\\">","target":[["#payment-frame","input[name=\\"zip\\"]"]],"failureSummary":"Fix any of the following:\\n  Form element does not have an implicit (wrapped) <label>\\n  Form element does not have an explicit <label>\\n  Element has no title attribute"}]},{"id":"region","impact":"moderate","tags":["cat.keyboard","best-practice"],"description":"Ensure all page content is contained by landmarks","help":"All page content should be contained by landmarks","helpUrl":"javascript:alert(1)","nodes":[{"impact":"moderate","html":"<div class=\\"promo\\">Free shipping</div>","target":[".promo"],"failureSummary":"Fix all of the following:\\n  Some page content is not contained by landmarks"}]}],"incomplete":[{"id":"color-contrast","impact":"serious","tags":["wcag2aa","wcag143"],"help":"Elements must meet minimum color contrast ratio thresholds","nodes":[{"html":"<h1 class=\\"over-image\\">Sale</h1>","target":["h1.over-image"],"failureSummary":"Fix any of the following:\\n  Element\'s background color could not be determined due to a background image"}]}],"passes":[{"id":"document-title"},{"id":"html-has-lang"},{"id":"image-alt"}],"inapplicable":[{"id":"video-caption"}]}',
    { variant: 'full' },
  ],
};

test.describe('Accessibility (axe-core, WCAG 2.2 AA)', () => {
  for (const [tag, content] of Object.entries(SAMPLES)) {
    for (const theme of THEMES) {
      test(`${tag} full variant, ${theme} theme`, async ({ page }) => {
        await page.goto(STRICT);
        await mount(
          page,
          tag,
          { variant: 'full', theme, label: `${tag} sample`, 'highlight-lines': '2' },
          content,
        );
        const results = await new AxeBuilder({ page })
          .include('#el')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        const summary = results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        );
        expect(summary).toEqual([]);
      });
    }
  }

  for (const [tag, [content, extra]] of Object.entries(MORE)) {
    for (const theme of ['light', 'dark']) {
      test(`${tag} full variant, ${theme} theme`, async ({ page }) => {
        await page.goto(STRICT);
        await mount(
          page,
          tag,
          { variant: 'full', theme, label: `${tag} sample`, ...extra },
          content,
        );
        const results = await new AxeBuilder({ page })
          .include('#el')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          results.violations.map(
            (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
          ),
        ).toEqual([]);
      });
    }
  }

  for (const theme of ['light', 'dark']) {
    test(`vt-search dialog and vt-field list open, ${theme} theme`, async ({ page }) => {
      await page.goto(STRICT);
      await mount(
        page,
        'vt-field',
        { theme, type: 'multiselect', label: 'Topics', value: 'a' },
        '[{"group":"G","options":["a","b"]}]',
      );
      await page.locator('#el .field-trigger').click();
      const field = await new AxeBuilder({ page })
        .include('#el')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(field.violations.map((v) => v.id)).toEqual([]);
      await mount(
        page,
        'vt-search',
        { theme },
        '[{"id":"a","title":"Getting started","section":"Guides","content":"Install it.","featured":true},{"id":"b","title":"Board","section":"Components","content":"Drag and drop.","featured":true}]',
      );
      await page.locator('#el .search-trigger').click();
      await page.locator('#el input').fill('board');
      const search = await new AxeBuilder({ page })
        .include('#el')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        search.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([]);
    });
  }

  test('editors are accessible', async ({ page }) => {
    await page.goto(STRICT);
    await mount(page, 'vt-markdown', { variant: 'full', mode: 'edit' }, '# Notes\n\nText');
    const results = await new AxeBuilder({ page })
      .include('#el')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('search bar and tabs are accessible when open', async ({ page }) => {
    await page.goto(STRICT);
    await mount(
      page,
      'vt-markdown',
      { variant: 'full', 'default-tab': 'split' },
      SAMPLES['vt-markdown'],
    );
    await page.locator('#el').getByRole('button', { name: 'Search' }).click();
    await page.locator('#el').getByRole('searchbox').fill('a');
    const results = await new AxeBuilder({ page })
      .include('#el')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('every icon button has an accessible name', async ({ page }) => {
    await page.goto(STRICT);
    for (const tag of Object.keys(SAMPLES)) {
      await mount(page, tag, { variant: 'full' }, SAMPLES[tag]);
      const unnamed = await page
        .locator('#el button')
        .evaluateAll(
          (buttons) =>
            buttons.filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim())).length,
        );
      expect(unnamed, tag).toBe(0);
    }
  });

  test('respects prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(STRICT);
    await mount(page, 'vt-json', { variant: 'full' }, SAMPLES['vt-json']);
    const duration = await page
      .locator('#el .toggle .icon')
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration).toBe('0s');
  });
});
