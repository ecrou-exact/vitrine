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
  table: JSON.stringify(
    ['Ada', 'Alan', 'Grace', 'Linus', 'Margaret', 'Ken', 'Barbara', 'Dennis'].map((name, i) => ({
      id: i + 1,
      name,
      team: ['Core', 'Infra', 'Data'][i % 3],
      score: [98, 95, 91, 88, 97, 84, 90, 86][i],
      joined: `20${18 + (i % 6)}-0${1 + (i % 9)}-1${i % 9}`,
      active: i % 3 !== 2,
    })),
  ),
  status:
    '{\n  "components": [\n    {\n      "name": "API",\n      "status": "degraded",\n      "since": "2026-06-01",\n      "history": {\n        "2026-11-02": "major",\n        "2026-10-16": "degraded",\n        "2026-09-19": "partial"\n      }\n    },\n    {\n      "name": "Dashboard",\n      "status": "operational",\n      "since": "2026-06-01"\n    }\n  ]\n}',
  calendar:
    '[\n  {\n    "title": "Sprint planning",\n    "start": "2026-11-02T09:00:00",\n    "end": "2026-11-02T10:00:00",\n    "timezone": "Europe/Paris",\n    "rrule": "FREQ=WEEKLY;BYDAY=MO",\n    "location": "Room 3"\n  },\n  {\n    "title": "Product launch",\n    "start": "2026-11-12T14:00:00Z",\n    "end": "2026-11-12T15:30:00Z",\n    "description": "Live stream, then questions.",\n    "url": "https://example.com/launch",\n    "categories": [\n      "Launch",\n      "Public"\n    ]\n  },\n  {\n    "title": "Conference",\n    "start": "2026-11-18",\n    "end": "2026-11-21",\n    "location": "Lisbon"\n  },\n  {\n    "title": "Armistice Day",\n    "start": "2026-11-11"\n  },\n  {\n    "title": "Old meetup",\n    "start": "2026-11-05T18:00:00Z",\n    "cancelled": true\n  }\n]',
  pricing:
    '{\n  "currencies": [\n    "EUR",\n    "USD"\n  ],\n  "periods": [\n    {\n      "id": "monthly"\n    },\n    {\n      "id": "yearly",\n      "note": "2 months free"\n    }\n  ],\n  "plans": [\n    {\n      "id": "free",\n      "name": "Starter",\n      "description": "For side projects.",\n      "price": 0,\n      "cta": {\n        "label": "Start free",\n        "url": "#signup"\n      },\n      "features": [\n        "3 projects",\n        "Community support",\n        {\n          "text": "Custom domain",\n          "included": false\n        }\n      ]\n    },\n    {\n      "id": "pro",\n      "name": "Pro",\n      "badge": "Most popular",\n      "highlight": true,\n      "description": "For growing teams.",\n      "unit": "per seat",\n      "price": {\n        "monthly": {\n          "EUR": 12,\n          "USD": 14\n        },\n        "yearly": {\n          "EUR": 120,\n          "USD": 140\n        }\n      },\n      "cta": {\n        "label": "Try Pro",\n        "url": "#signup"\n      },\n      "features": [\n        "Unlimited projects",\n        "Email support",\n        "Custom domain"\n      ]\n    },\n    {\n      "id": "corp",\n      "name": "Enterprise",\n      "description": "For large companies.",\n      "price": "Contact us",\n      "cta": {\n        "label": "Talk to us",\n        "url": "mailto:sales@example.com"\n      },\n      "features": [\n        "SSO and audit logs",\n        "Dedicated support",\n        "Custom contract"\n      ]\n    }\n  ],\n  "compare": [\n    {\n      "group": "Usage",\n      "name": "Projects",\n      "values": {\n        "free": "3",\n        "pro": "Unlimited",\n        "corp": "Unlimited"\n      }\n    },\n    {\n      "name": "Custom domain",\n      "description": "Your own address",\n      "values": {\n        "pro": true,\n        "corp": true\n      }\n    },\n    {\n      "group": "Security",\n      "name": "SSO",\n      "values": {\n        "corp": true\n      }\n    }\n  ],\n  "note": "Prices exclude VAT."\n}',
  faq: '[\n  {\n    "question": "Is there a free plan?",\n    "answer": "Yes. The **Starter** plan is free forever, with 3 projects.",\n    "category": "Billing"\n  },\n  {\n    "question": "Can I change plans later?",\n    "answer": "At any time, from your settings.",\n    "category": "Billing"\n  },\n  {\n    "question": "Where is my data stored?",\n    "answer": "In the European Union, encrypted at rest.",\n    "category": "Security",\n    "id": "data"\n  },\n  {\n    "question": "Do you have an API?",\n    "answer": "Yes, with JSON everywhere.",\n    "category": "Developers"\n  },\n  {\n    "question": "How do I export my data?",\n    "answer": "Settings → Export: a ZIP with JSON and CSV files.",\n    "category": "Security"\n  },\n  {\n    "question": "Do you offer discounts for schools?",\n    "answer": "Yes, 50% off.",\n    "category": "Billing"\n  }\n]',
  gallery:
    '[\n  {\n    "src": "brand/social-preview.png",\n    "alt": "Vitrine brand asset 1",\n    "caption": "social-preview.png"\n  },\n  {\n    "src": "brand/icon-512.png",\n    "alt": "Vitrine brand asset 2",\n    "caption": "icon-512.png"\n  },\n  {\n    "src": "brand/logo-stacked.svg",\n    "alt": "Vitrine brand asset 3",\n    "caption": "logo-stacked.svg"\n  },\n  {\n    "src": "brand/icon-accent.svg",\n    "alt": "Vitrine brand asset 4",\n    "caption": "icon-accent.svg"\n  },\n  {\n    "src": "brand/logo-horizontal.svg",\n    "alt": "Vitrine brand asset 5",\n    "caption": "logo-horizontal.svg"\n  },\n  {\n    "src": "brand/icon-paper.svg",\n    "alt": "Vitrine brand asset 6",\n    "caption": "icon-paper.svg"\n  }\n]',
  stats:
    '[\n  {\n    "label": "Visitors",\n    "value": 48210,\n    "previous": 41200,\n    "format": "compact",\n    "against": "vs last month",\n    "series": [\n      31,\n      35,\n      33,\n      38,\n      41,\n      39,\n      44,\n      48\n    ]\n  },\n  {\n    "label": "Revenue",\n    "value": 12840.5,\n    "previous": 13420,\n    "format": "currency",\n    "currency": "EUR",\n    "series": [\n      10,\n      12,\n      11,\n      13.4,\n      12.8\n    ]\n  },\n  {\n    "label": "Error rate",\n    "value": 0.42,\n    "previous": 0.61,\n    "format": "percent",\n    "good": "down",\n    "series": [\n      0.9,\n      0.8,\n      0.61,\n      0.5,\n      0.42\n    ]\n  },\n  {\n    "label": "Uptime",\n    "value": "99.98%",\n    "description": "Last 90 days"\n  }\n]',
  board:
    '{\n  "columns": [\n    {\n      "id": "todo",\n      "title": "To do"\n    },\n    {\n      "id": "in-progress",\n      "title": "In progress",\n      "limit": 3\n    },\n    {\n      "id": "review",\n      "title": "Review"\n    },\n    {\n      "id": "done",\n      "title": "Done"\n    }\n  ],\n  "tasks": [\n    {\n      "id": "T-12",\n      "title": "Offline sync",\n      "column": "in-progress",\n      "priority": "high",\n      "labels": [\n        "mobile"\n      ],\n      "assignee": "Ada Lovelace",\n      "progress": 60,\n      "due": "2026-11-20",\n      "description": "Edit without a connection."\n    },\n    {\n      "id": "T-14",\n      "title": "Public API v2",\n      "column": "in-progress",\n      "priority": "medium",\n      "labels": [\n        "api"\n      ],\n      "assignee": "Alan Turing",\n      "progress": 25\n    },\n    {\n      "id": "T-15",\n      "title": "SSO with SAML",\n      "column": "todo",\n      "priority": "urgent",\n      "labels": [\n        "security"\n      ],\n      "due": "2026-11-12"\n    },\n    {\n      "id": "T-16",\n      "title": "Export to CSV",\n      "column": "todo",\n      "priority": "low",\n      "labels": [\n        "data"\n      ]\n    },\n    {\n      "id": "T-10",\n      "title": "Audit log page",\n      "column": "review",\n      "priority": "medium",\n      "labels": [\n        "security"\n      ],\n      "assignee": "Grace Hopper"\n    },\n    {\n      "id": "T-08",\n      "title": "Dark mode for the editor",\n      "column": "done",\n      "labels": [\n        "editor"\n      ],\n      "assignee": "Ada Lovelace"\n    }\n  ]\n}',
  field:
    '[\n  {\n    "group": "Front end",\n    "options": [\n      "HTML",\n      "CSS",\n      {\n        "value": "js",\n        "label": "JavaScript",\n        "description": "Browsers and Node.js"\n      }\n    ]\n  },\n  {\n    "group": "Back end",\n    "options": [\n      "Go",\n      "Python",\n      "Rust",\n      {\n        "value": "cobol",\n        "label": "COBOL",\n        "disabled": true\n      }\n    ]\n  }\n]',
  search:
    '[\n  {\n    "id": "getting-started",\n    "title": "Getting started",\n    "section": "Guides",\n    "content": "Install Vitrine from a CDN or npm and add your first element.",\n    "url": "docs.html?page=getting-started",\n    "featured": true\n  },\n  {\n    "id": "theming",\n    "title": "Theming",\n    "section": "Guides",\n    "content": "Colours, fonts and spacing with CSS custom properties, in light and dark.",\n    "url": "docs.html?page=theming",\n    "featured": true\n  },\n  {\n    "id": "security",\n    "title": "Security",\n    "section": "Guides",\n    "content": "Sanitized Markdown, safe links and Trusted Types.",\n    "url": "docs.html?page=security"\n  },\n  {\n    "id": "board",\n    "title": "<vt-board>",\n    "section": "Components",\n    "content": "A task board with drag and drop, a list and a table.",\n    "keywords": [\n      "kanban",\n      "tasks"\n    ],\n    "url": "docs.html?page=components/board"\n  },\n  {\n    "id": "field",\n    "title": "<vt-field>",\n    "section": "Components",\n    "content": "A form field with its label, hint, tip and lists.",\n    "keywords": [\n      "form",\n      "input",\n      "select"\n    ],\n    "url": "docs.html?page=components/field"\n  },\n  {\n    "id": "search",\n    "title": "<vt-search>",\n    "section": "Components",\n    "content": "Site search with a keyboard shortcut and results by id.",\n    "keywords": [\n      "find"\n    ],\n    "url": "docs.html?page=components/search"\n  }\n]',
  // The date picker and the upload are set by their attributes: they have no content.
  'date-picker': '',
  menu: '[\n  {\n    "label": "Rename",\n    "icon": "pencil",\n    "shortcut": "F2"\n  },\n  {\n    "label": "Duplicate",\n    "icon": "copy",\n    "shortcut": "Ctrl+D"\n  },\n  {\n    "label": "Share",\n    "items": [\n      "Copy link",\n      {\n        "label": "Email",\n        "description": "Send to a teammate"\n      }\n    ]\n  },\n  "---",\n  {\n    "type": "radio",\n    "label": "Sort by",\n    "group": "sort",\n    "items": [\n      {\n        "label": "Name",\n        "checked": true\n      },\n      "Date",\n      "Size"\n    ]\n  },\n  {\n    "type": "checkbox",\n    "label": "Show hidden files"\n  },\n  "---",\n  {\n    "label": "Delete",\n    "icon": "trash",\n    "danger": true,\n    "shortcut": "Del"\n  }\n]',
  upload: '',
  // The icon picker is set by its attributes too.
  'icon-picker': '',
  password: '',
  secret: '',
  version: '',
  consent: '',
  changelog:
    '# Changelog\n\n## [Unreleased]\n### Added\n- A `theme` option for the dashboard (#212)\n\n## [2.0.0] - 2026-11-10\nThe release that drops the old configuration format.\n### Breaking changes\n- **config:** `rocket.json` replaces `.rocketrc` ([migration guide](https://example.com/migrate))\n- Node 18 is no longer supported\n### Added\n- Launch several targets at once with `rocket run --all` by @ada (#198)\n- Dark mode for the dashboard\n### Fixed\n- The watcher no longer misses renamed files (3f9c2ab)\n### Security\n- Paths given to `--out` are checked against the project folder\n\n## [1.4.1] - 2026-10-21\n### Fixed\n- Crash on an empty `targets` list (#187)\n\n## [1.4.0] - 2026-10-02\n### Added\n- `rocket doctor` checks the setup\n### Deprecated\n- `.rocketrc`: use `rocket.json`\n\n## [1.3.0] - 2026-09-01 [YANKED]\n### Changed\n- Faster cold starts\n\n[unreleased]: https://github.com/acme/rocket/compare/v2.0.0...HEAD\n[2.0.0]: https://github.com/acme/rocket/compare/v1.4.1...v2.0.0\n[1.4.1]: https://github.com/acme/rocket/compare/v1.4.0...v1.4.1\n',
  repo: '{"repo":{"full_name":"acme/rocket","name":"rocket","owner":{"login":"acme"},"html_url":"https://github.com/acme/rocket","clone_url":"https://github.com/acme/rocket.git","description":"A fast, friendly task launcher for monorepos.","homepage":"https://rocket.example.com","stargazers_count":12480,"forks_count":684,"open_issues_count":42,"subscribers_count":96,"license":{"spdx_id":"MIT","name":"MIT License"},"topics":["cli","monorepo","task-runner","typescript"],"pushed_at":"2026-11-13T12:00:00Z","default_branch":"main"},"languages":{"TypeScript":812000,"JavaScript":64000,"CSS":21000,"Shell":9000,"Dockerfile":2000},"release":{"tag_name":"v2.0.0","published_at":"2026-11-10T09:00:00Z","html_url":"https://github.com/acme/rocket/releases/tag/v2.0.0"}}',
  testimonials:
    '[\n  {\n    "quote": "We replaced three tools with this one. Setup took an afternoon.",\n    "author": "Ada Lovelace",\n    "role": "CTO",\n    "company": "Analytical Engines",\n    "rating": 5\n  },\n  {\n    "quote": "Support answered within the hour, every single time.",\n    "author": "Alan Turing",\n    "role": "Engineer",\n    "rating": 4.5\n  },\n  {\n    "quote": "Clean, fast, and it just works on every page we tried.",\n    "author": "Grace Hopper",\n    "company": "Compilers Inc.",\n    "rating": 4\n  }\n]',
  sql: 'app=# SELECT id, name, email FROM users ORDER BY id LIMIT 3;\n id | name  |      email\n----+-------+------------------\n  1 | Ada   | ada@example.com\n  2 | Alan  | alan@example.com\n  3 | Grace |\n(3 rows)\n\nTime: 0.512 ms',
  'test-report':
    '<testsuite name="api" time="1.3">\n  <testcase classname="users" name="creates a user" time="0.4"/>\n  <testcase classname="users" name="deletes a user" time="0.7">\n    <failure message="Expected 200, received 404">at deleteUser (users.test.js:31)</failure>\n  </testcase>\n  <testcase classname="users" name="exports"><skipped message="needs S3"/></testcase>\n</testsuite>',
  trace:
    '[\n  {\n    "id": "a",\n    "name": "GET /cart",\n    "service": "web",\n    "start": 0,\n    "duration": 120\n  },\n  {\n    "id": "b",\n    "parent": "a",\n    "name": "SELECT items",\n    "service": "postgres",\n    "start": 20,\n    "duration": 70\n  },\n  {\n    "id": "c",\n    "parent": "a",\n    "name": "render",\n    "service": "web",\n    "start": 95,\n    "duration": 20,\n    "error": "template missing"\n  }\n]',
  notebook:
    '{\n  "cells": [\n    {\n      "cell_type": "markdown",\n      "source": "# Scores\\nThe mean of the class."\n    },\n    {\n      "cell_type": "code",\n      "execution_count": 1,\n      "source": "scores = [91, 82, 87]\\nsum(scores) / len(scores)",\n      "outputs": [\n        {\n          "output_type": "execute_result",\n          "execution_count": 1,\n          "data": {\n            "text/plain": "86.666"\n          }\n        }\n      ]\n    }\n  ]\n}',
  math: '\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}\n\n\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}',
  diagram: 'flowchart LR\n  A[Order] --> B{Paid?}\n  B -- yes --> C[Ship]\n  B -- no --> D[Remind]',
  pivot:
    'region,quarter,revenue\nNorth,Q1,12400\nNorth,Q2,15800\nSouth,Q1,6200\nSouth,Q2,8400\nWest,Q1,2900\nWest,Q2,7800',
  heatmap:
    '{\n  "2026-10-01": 3,\n  "2026-10-02": 5,\n  "2026-10-06": 8,\n  "2026-10-07": 2,\n  "2026-10-13": 9,\n  "2026-10-20": 4,\n  "2026-10-27": 7,\n  "2026-11-03": 6,\n  "2026-11-10": 11\n}',
  flame:
    'main;server;handle;db.query;pg.send 300\nmain;server;handle;db.query;pg.parse 80\nmain;server;handle;render;template 160\nmain;server;auth;jwt.verify 90\nmain;gc 60',
  treemap:
    'path,size\nsrc/components/chart.js,24100\nsrc/components/table.js,16300\nsrc/api/client.js,8800\nnode_modules/lodash/lodash.js,71000\nnode_modules/date-fns/format.js,18200\nnode_modules/date-fns/parse.js,21500',
  describe:
    'plan,seats,mrr,signup\nPro,12,480,2025-03-14\nTeam,4,96,2025-05-02\nFree,1,0,2025-06-21\nPro,25,1000,2025-07-09\nTeam,6,144,\nFree,1,0,2025-09-12',
  compare:
    '{\n  "key": "sku",\n  "original": [\n    {\n      "sku": "A-100",\n      "price": 39,\n      "stock": 12\n    },\n    {\n      "sku": "A-101",\n      "price": 4.5,\n      "stock": 140\n    },\n    {\n      "sku": "A-103",\n      "price": 19.9,\n      "stock": 0\n    }\n  ],\n  "modified": [\n    {\n      "sku": "A-100",\n      "price": 42,\n      "stock": 12\n    },\n    {\n      "sku": "A-101",\n      "price": 4.5,\n      "stock": 128\n    },\n    {\n      "sku": "A-105",\n      "price": 9.9,\n      "stock": 60\n    }\n  ]\n}',
  install: '# Add Vitrine and build\nnpm install vitrine\nnpm install -D vitest\nnpm run build',
  download:
    '{\n  "tag_name": "v2.1.0",\n  "name": "Atlas 2.1",\n  "html_url": "https://example.com/app/releases/tag/v2.1.0",\n  "published_at": "2026-11-03T09:30:00Z",\n  "assets": [\n    {\n      "name": "Atlas-2.1.0-universal.dmg",\n      "size": 98304000,\n      "browser_download_url": "https://example.com/app/releases/download/v2.1.0/Atlas-2.1.0-universal.dmg",\n      "digest": "sha256:ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12"\n    },\n    {\n      "name": "Atlas-Setup-2.1.0.exe",\n      "size": 84410000,\n      "browser_download_url": "https://example.com/app/releases/download/v2.1.0/Atlas-Setup-2.1.0.exe",\n      "digest": "sha256:cd34cd34cd34cd34cd34cd34cd34cd34cd34cd34cd34cd34cd34cd34cd34cd34"\n    },\n    {\n      "name": "Atlas-2.1.0-arm64.exe",\n      "size": 83900000,\n      "browser_download_url": "https://example.com/app/releases/download/v2.1.0/Atlas-2.1.0-arm64.exe"\n    },\n    {\n      "name": "Atlas-2.1.0.AppImage",\n      "size": 102760000,\n      "browser_download_url": "https://example.com/app/releases/download/v2.1.0/Atlas-2.1.0.AppImage",\n      "digest": "sha256:ef56ef56ef56ef56ef56ef56ef56ef56ef56ef56ef56ef56ef56ef56ef56ef56"\n    },\n    {\n      "name": "atlas_2.1.0_amd64.deb",\n      "size": 71200000,\n      "browser_download_url": "https://example.com/app/releases/download/v2.1.0/atlas_2.1.0_amd64.deb"\n    },\n    {\n      "name": "atlas-2.1.0.x86_64.rpm",\n      "size": 71900000,\n      "browser_download_url": "https://example.com/app/releases/download/v2.1.0/atlas-2.1.0.x86_64.rpm"\n    },\n    {\n      "name": "SHA256SUMS",\n      "size": 512,\n      "browser_download_url": "https://example.com/app/releases/download/v2.1.0/SHA256SUMS"\n    },\n    {\n      "name": "SHA256SUMS.asc",\n      "size": 833,\n      "browser_download_url": "https://example.com/app/releases/download/v2.1.0/SHA256SUMS.asc"\n    }\n  ]\n}',
  contributors:
    '{\n  "projectName": "atlas",\n  "contributors": [\n    {\n      "login": "ada",\n      "name": "Ada Lovelace",\n      "profile": "https://example.com/ada",\n      "contributions": [\n        "code",\n        "doc",\n        "maintenance"\n      ]\n    },\n    {\n      "login": "alan",\n      "name": "Alan Turing",\n      "profile": "https://example.com/alan",\n      "contributions": [\n        "code",\n        "test"\n      ]\n    },\n    {\n      "login": "grace",\n      "name": "Grace Hopper",\n      "profile": "https://example.com/grace",\n      "contributions": [\n        "review",\n        "ideas"\n      ]\n    },\n    {\n      "login": "katherine",\n      "name": "Katherine Johnson",\n      "profile": "https://example.com/kj",\n      "contributions": [\n        "bug",\n        "test"\n      ]\n    },\n    {\n      "login": "linus",\n      "name": "Linus Torvalds",\n      "profile": "https://example.com/linus",\n      "contributions": [\n        "infra"\n      ]\n    },\n    {\n      "login": "margaret",\n      "name": "Margaret Hamilton",\n      "profile": "https://example.com/mh",\n      "contributions": [\n        "design",\n        "a11y"\n      ]\n    },\n    {\n      "login": "tim",\n      "name": "Tim Berners-Lee",\n      "profile": "https://example.com/tim",\n      "contributions": [\n        "translation",\n        "doc"\n      ]\n    }\n  ]\n}',
  lifecycle:
    '[\n  {\n    "cycle": "26",\n    "releaseDate": "2026-04-21",\n    "eol": "2029-04-30",\n    "support": "2027-10-20",\n    "lts": false,\n    "latest": "26.2.0"\n  },\n  {\n    "cycle": "24",\n    "codename": "Krypton",\n    "releaseDate": "2025-05-06",\n    "eol": "2028-04-30",\n    "support": "2026-10-20",\n    "lts": "2025-10-28",\n    "latest": "24.11.0"\n  },\n  {\n    "cycle": "23",\n    "releaseDate": "2024-10-16",\n    "eol": "2025-06-01",\n    "support": "2025-04-01",\n    "lts": false,\n    "latest": "23.11.1"\n  },\n  {\n    "cycle": "22",\n    "codename": "Jod",\n    "releaseDate": "2024-04-24",\n    "eol": "2027-04-30",\n    "support": "2025-10-21",\n    "lts": "2024-10-29",\n    "latest": "22.21.0"\n  },\n  {\n    "cycle": "21",\n    "releaseDate": "2023-10-17",\n    "eol": "2024-06-01",\n    "support": "2024-04-01",\n    "lts": false,\n    "latest": "21.7.3"\n  },\n  {\n    "cycle": "20",\n    "codename": "Iron",\n    "releaseDate": "2023-04-18",\n    "eol": "2026-04-30",\n    "support": "2024-10-22",\n    "lts": "2023-10-24",\n    "latest": "20.19.5"\n  },\n  {\n    "cycle": "18",\n    "codename": "Hydrogen",\n    "releaseDate": "2022-04-19",\n    "eol": "2025-04-30",\n    "support": "2023-10-18",\n    "lts": "2022-10-25",\n    "latest": "18.20.8"\n  }\n]',
  advisories:
    '{\n  "vulns": [\n    {\n      "id": "GHSA-35jh-r3h4-6jhm",\n      "summary": "Command Injection in lodash",\n      "details": "lodash versions prior to 4.17.21 are vulnerable to Command Injection via the template function.",\n      "aliases": [\n        "CVE-2021-23337"\n      ],\n      "published": "2021-05-06T16:05:51Z",\n      "severity": [\n        {\n          "type": "CVSS_V3",\n          "score": "CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H"\n        }\n      ],\n      "affected": [\n        {\n          "package": {\n            "ecosystem": "npm",\n            "name": "lodash"\n          },\n          "ranges": [\n            {\n              "type": "SEMVER",\n              "events": [\n                {\n                  "introduced": "0"\n                },\n                {\n                  "fixed": "4.17.21"\n                }\n              ]\n            }\n          ]\n        }\n      ],\n      "references": [\n        {\n          "type": "ADVISORY",\n          "url": "https://nvd.nist.gov/vuln/detail/CVE-2021-23337"\n        }\n      ],\n      "database_specific": {\n        "severity": "HIGH",\n        "cwe_ids": [\n          "CWE-77",\n          "CWE-94"\n        ]\n      }\n    },\n    {\n      "id": "GHSA-xvch-5gv4-984h",\n      "summary": "Prototype Pollution in minimist",\n      "details": "Minimist 1.2.5 and earlier are vulnerable to Prototype Pollution via file index.js, function setKey().",\n      "aliases": [\n        "CVE-2021-44906"\n      ],\n      "published": "2022-03-18T00:01:09Z",\n      "severity": [\n        {\n          "type": "CVSS_V3",\n          "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"\n        }\n      ],\n      "affected": [\n        {\n          "package": {\n            "ecosystem": "npm",\n            "name": "minimist"\n          },\n          "ranges": [\n            {\n              "type": "SEMVER",\n              "events": [\n                {\n                  "introduced": "0"\n                },\n                {\n                  "fixed": "1.2.6"\n                }\n              ]\n            }\n          ]\n        }\n      ],\n      "database_specific": {\n        "severity": "CRITICAL",\n        "cwe_ids": [\n          "CWE-1321"\n        ]\n      }\n    },\n    {\n      "id": "GHSA-7fh5-64p2-3v2j",\n      "summary": "PostCSS line return parsing error",\n      "details": "An issue was discovered in PostCSS before 8.4.31: it may find content in comments when parsing linters output.",\n      "aliases": [\n        "CVE-2023-44270"\n      ],\n      "published": "2023-09-30T00:30:21Z",\n      "severity": [\n        {\n          "type": "CVSS_V3",\n          "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N"\n        }\n      ],\n      "affected": [\n        {\n          "package": {\n            "ecosystem": "npm",\n            "name": "postcss"\n          },\n          "ranges": [\n            {\n              "type": "SEMVER",\n              "events": [\n                {\n                  "introduced": "0"\n                },\n                {\n                  "fixed": "8.4.31"\n                }\n              ]\n            }\n          ]\n        }\n      ],\n      "database_specific": {\n        "severity": "MODERATE",\n        "cwe_ids": [\n          "CWE-74"\n        ]\n      }\n    },\n    {\n      "id": "GHSA-9wv6-86v2-598j",\n      "summary": "path-to-regexp outputs backtracking regular expressions",\n      "aliases": [\n        "CVE-2024-45296"\n      ],\n      "published": "2024-09-09T00:00:00Z",\n      "severity": [\n        {\n          "type": "CVSS_V3",\n          "score": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H"\n        }\n      ],\n      "affected": [\n        {\n          "package": {\n            "ecosystem": "npm",\n            "name": "path-to-regexp"\n          },\n          "ranges": [\n            {\n              "type": "SEMVER",\n              "events": [\n                {\n                  "introduced": "0"\n                },\n                {\n                  "fixed": "0.1.10"\n                }\n              ]\n            }\n          ]\n        }\n      ],\n      "database_specific": {\n        "severity": "HIGH",\n        "cwe_ids": [\n          "CWE-1333"\n        ]\n      }\n    }\n  ]\n}',
  licenses:
    '{\n  "bomFormat": "CycloneDX",\n  "specVersion": "1.6",\n  "components": [\n    {\n      "name": "react",\n      "version": "19.0.0",\n      "licenses": [\n        {\n          "license": {\n            "id": "MIT"\n          }\n        }\n      ]\n    },\n    {\n      "name": "react-dom",\n      "version": "19.0.0",\n      "licenses": [\n        {\n          "license": {\n            "id": "MIT"\n          }\n        }\n      ]\n    },\n    {\n      "name": "lodash",\n      "version": "4.17.21",\n      "licenses": [\n        {\n          "license": {\n            "id": "MIT"\n          }\n        }\n      ]\n    },\n    {\n      "name": "express",\n      "version": "5.1.0",\n      "licenses": [\n        {\n          "license": {\n            "id": "MIT"\n          }\n        }\n      ]\n    },\n    {\n      "name": "typescript",\n      "version": "5.9.3",\n      "licenses": [\n        {\n          "license": {\n            "id": "Apache-2.0"\n          }\n        }\n      ]\n    },\n    {\n      "name": "rxjs",\n      "version": "7.8.2",\n      "licenses": [\n        {\n          "license": {\n            "id": "Apache-2.0"\n          }\n        }\n      ]\n    },\n    {\n      "name": "chalk",\n      "version": "5.4.1",\n      "licenses": [\n        {\n          "license": {\n            "id": "MIT"\n          }\n        }\n      ]\n    },\n    {\n      "name": "semver",\n      "version": "7.7.2",\n      "licenses": [\n        {\n          "license": {\n            "id": "ISC"\n          }\n        }\n      ]\n    },\n    {\n      "name": "glob",\n      "version": "11.0.3",\n      "licenses": [\n        {\n          "license": {\n            "id": "ISC"\n          }\n        }\n      ]\n    },\n    {\n      "name": "qs",\n      "version": "6.14.0",\n      "licenses": [\n        {\n          "license": {\n            "id": "BSD-3-Clause"\n          }\n        }\n      ]\n    },\n    {\n      "name": "esprima",\n      "version": "4.0.1",\n      "licenses": [\n        {\n          "license": {\n            "id": "BSD-2-Clause"\n          }\n        }\n      ]\n    },\n    {\n      "name": "argparse",\n      "version": "2.0.1",\n      "licenses": [\n        {\n          "license": {\n            "id": "Python-2.0"\n          }\n        }\n      ]\n    },\n    {\n      "name": "jszip",\n      "version": "3.10.1",\n      "licenses": [\n        {\n          "expression": "(MIT OR GPL-3.0-or-later)"\n        }\n      ]\n    },\n    {\n      "name": "axe-core",\n      "version": "4.10.3",\n      "licenses": [\n        {\n          "license": {\n            "id": "MPL-2.0"\n          }\n        }\n      ]\n    },\n    {\n      "name": "@img/sharp-libvips",\n      "version": "1.2.0",\n      "licenses": [\n        {\n          "license": {\n            "id": "LGPL-3.0-or-later"\n          }\n        }\n      ]\n    },\n    {\n      "name": "readline-sync",\n      "version": "1.4.10",\n      "licenses": [\n        {\n          "license": {\n            "id": "GPL-3.0-only"\n          }\n        }\n      ]\n    },\n    {\n      "name": "caniuse-lite",\n      "version": "1.0.30001720",\n      "licenses": [\n        {\n          "license": {\n            "id": "CC-BY-4.0"\n          }\n        }\n      ]\n    },\n    {\n      "name": "internal-utils",\n      "version": "0.3.0",\n      "licenses": [\n        {\n          "license": {\n            "id": "UNLICENSED"\n          }\n        }\n      ]\n    }\n  ]\n}',
  workflow:
    '{\n  "name": "CI",\n  "display_title": "Add the checkout page",\n  "status": "completed",\n  "conclusion": "failure",\n  "event": "pull_request",\n  "head_branch": "feat/checkout",\n  "head_sha": "9f1c2ab4e6d8c0b1a2f3e4d5c6b7a8091a2b3c4d",\n  "actor": {\n    "login": "ada"\n  },\n  "run_started_at": "2026-11-15T10:00:00Z",\n  "updated_at": "2026-11-15T10:07:12Z",\n  "jobs": [\n    {\n      "id": "lint",\n      "name": "Lint",\n      "status": "completed",\n      "conclusion": "success",\n      "started_at": "2026-11-15T10:00:04Z",\n      "completed_at": "2026-11-15T10:00:41Z",\n      "steps": [\n        {\n          "name": "Set up job",\n          "status": "completed",\n          "conclusion": "success",\n          "duration": 2,\n          "log": "Current runner version: 2.329.0\\nOperating System: Ubuntu 24.04"\n        },\n        {\n          "name": "Run npm run lint",\n          "status": "completed",\n          "conclusion": "success",\n          "duration": 21,\n          "log": "##[group]Run npm run lint\\nnpm run lint\\n##[endgroup]\\n> eslint .\\n\\u001b[32m✔\\u001b[0m No problems found"\n        }\n      ]\n    },\n    {\n      "id": "types",\n      "name": "Type check",\n      "status": "completed",\n      "conclusion": "success",\n      "duration": 33,\n      "steps": [\n        {\n          "name": "Run tsc",\n          "status": "completed",\n          "conclusion": "success",\n          "duration": 30,\n          "log": "> tsc --noEmit\\nDone in 29.4s"\n        }\n      ]\n    },\n    {\n      "id": "test-20",\n      "name": "Test (Node 20)",\n      "needs": [\n        "lint",\n        "types"\n      ],\n      "status": "completed",\n      "conclusion": "success",\n      "duration": 96,\n      "steps": [\n        {\n          "name": "Run tests",\n          "status": "completed",\n          "conclusion": "success",\n          "duration": 88,\n          "log": " \\u001b[32m✓\\u001b[0m tests/cart.test.js (24 tests) 310ms\\n \\u001b[32m✓\\u001b[0m tests/checkout.test.js (18 tests) 512ms\\n\\n Test Files  2 passed (2)\\n      Tests  42 passed (42)"\n        }\n      ]\n    },\n    {\n      "id": "test-22",\n      "name": "Test (Node 22)",\n      "needs": [\n        "lint",\n        "types"\n      ],\n      "status": "completed",\n      "conclusion": "failure",\n      "started_at": "2026-11-15T10:01:02Z",\n      "completed_at": "2026-11-15T10:02:51Z",\n      "html_url": "https://example.com/ci/runs/4821/jobs/2",\n      "runner_name": "ubuntu-24.04",\n      "steps": [\n        {\n          "name": "Set up job",\n          "status": "completed",\n          "conclusion": "success",\n          "duration": 2,\n          "log": "Current runner version: 2.329.0"\n        },\n        {\n          "name": "Install dependencies",\n          "status": "completed",\n          "conclusion": "success",\n          "duration": 19,\n          "log": "added 412 packages in 18s"\n        },\n        {\n          "name": "Run tests",\n          "status": "completed",\n          "conclusion": "failure",\n          "duration": 84,\n          "log": "2026-11-15T10:01:25.4410000Z ##[group]Run npm test\\n2026-11-15T10:01:25.4420000Z npm test\\n2026-11-15T10:01:25.4430000Z ##[endgroup]\\n2026-11-15T10:02:40.1000000Z  \\u001b[32m✓\\u001b[0m tests/cart.test.js (24 tests) 298ms\\n2026-11-15T10:02:47.2000000Z  \\u001b[31m✗\\u001b[0m tests/checkout.test.js > applies the discount code\\n2026-11-15T10:02:47.2010000Z    \\u001b[31mAssertionError: expected 90 to be 81\\u001b[0m\\n2026-11-15T10:02:47.2020000Z     at tests/checkout.test.js:42:21\\n2026-11-15T10:02:48.0000000Z  Tests  1 failed | 41 passed (42)\\n2026-11-15T10:02:48.1000000Z ##[error]Process completed with exit code 1."\n        }\n      ]\n    },\n    {\n      "id": "build",\n      "name": "Build",\n      "needs": [\n        "lint",\n        "types"\n      ],\n      "status": "completed",\n      "conclusion": "success",\n      "duration": 71,\n      "steps": [\n        {\n          "name": "Run npm run build",\n          "status": "completed",\n          "conclusion": "success",\n          "duration": 64,\n          "log": "vite v7.2.0 building for production...\\n✓ 214 modules transformed.\\ndist/index.html   0.46 kB\\ndist/assets/index.js  148.20 kB │ gzip: 47.91 kB\\n✓ built in 3.81s"\n        }\n      ]\n    },\n    {\n      "id": "e2e",\n      "name": "End-to-end",\n      "needs": [\n        "build"\n      ],\n      "status": "completed",\n      "conclusion": "success",\n      "duration": 202,\n      "steps": [\n        {\n          "name": "Run Playwright",\n          "status": "completed",\n          "conclusion": "success",\n          "duration": 190,\n          "log": "Running 36 tests using 4 workers\\n  36 passed (3.1m)"\n        }\n      ]\n    },\n    {\n      "id": "deploy",\n      "name": "Deploy preview",\n      "needs": [\n        "test-20",\n        "test-22",\n        "e2e"\n      ],\n      "status": "completed",\n      "conclusion": "skipped"\n    }\n  ]\n}',
  'access-log':
    '203.0.113.6 - - [15/Nov/2026:08:00:20 +0100] "GET /docs/getting-started HTTP/2.0" 200 35919 "https://news.ycombinator.com/" "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)" 0.010\n203.0.113.17 - - [15/Nov/2026:08:01:01 +0100] "GET /docs/getting-started HTTP/2.0" 200 6744 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.050\n192.0.2.39 - - [15/Nov/2026:08:02:12 +0100] "GET / HTTP/2.0" 200 4854 "https://www.google.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.053\n203.0.113.20 - - [15/Nov/2026:08:02:27 +0100] "GET / HTTP/2.0" 200 28268 "-" "curl/8.10.1" 0.015\n203.0.113.8 - - [15/Nov/2026:08:03:48 +0100] "GET /assets/style.css HTTP/2.0" 200 38915 "https://news.ycombinator.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.004\n198.51.100.36 - - [15/Nov/2026:08:04:04 +0100] "GET /assets/app.js HTTP/2.0" 200 28822 "https://www.google.com/" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.005\n192.0.2.17 - - [15/Nov/2026:08:05:11 +0100] "GET /assets/style.css HTTP/2.0" 304 0 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.004\n203.0.113.34 - - [15/Nov/2026:08:06:04 +0100] "GET /favicon.ico HTTP/2.0" 200 28202 "https://www.google.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.002\n192.0.2.38 - - [15/Nov/2026:08:06:50 +0100] "GET /assets/app.js HTTP/2.0" 200 21361 "https://news.ycombinator.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.005\n198.51.100.32 - - [15/Nov/2026:08:07:41 +0100] "GET / HTTP/2.0" 200 5059 "https://github.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.007\n198.51.100.20 - - [15/Nov/2026:08:08:19 +0100] "GET /favicon.ico HTTP/2.0" 200 26083 "https://www.google.com/" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.001\n203.0.113.15 - - [15/Nov/2026:08:09:10 +0100] "GET / HTTP/2.0" 200 19637 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.013\n203.0.113.12 - - [15/Nov/2026:08:10:01 +0100] "POST /api/cart HTTP/2.0" 200 30237 "https://www.google.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.037\n198.51.100.26 - - [15/Nov/2026:08:10:59 +0100] "GET /docs/getting-started HTTP/2.0" 200 15922 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.015\n198.51.100.39 - - [15/Nov/2026:08:11:21 +0100] "GET / HTTP/2.0" 200 12750 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.025\n192.0.2.22 - - [15/Nov/2026:08:12:09 +0100] "GET /docs/getting-started HTTP/2.0" 200 9024 "https://news.ycombinator.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.063\n198.51.100.37 - - [15/Nov/2026:08:13:27 +0100] "GET /assets/style.css HTTP/2.0" 200 26514 "https://github.com/" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.002\n203.0.113.30 - - [15/Nov/2026:08:14:01 +0100] "GET / HTTP/2.0" 200 11436 "https://news.ycombinator.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.012\n192.0.2.8 - alice [15/Nov/2026:08:14:27 +0100] "POST /login HTTP/2.0" 302 0 "https://www.google.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.056\n192.0.2.25 - - [15/Nov/2026:08:15:21 +0100] "GET /favicon.ico HTTP/2.0" 200 31873 "https://www.google.com/" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.008\n203.0.113.23 - - [15/Nov/2026:08:16:30 +0100] "GET / HTTP/2.0" 200 18151 "https://github.com/" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.044\n192.0.2.25 - - [15/Nov/2026:08:16:58 +0100] "GET / HTTP/2.0" 200 10407 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.063\n203.0.113.18 - - [15/Nov/2026:08:18:09 +0100] "GET /assets/app.js HTTP/2.0" 200 34773 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.003\n192.0.2.16 - - [15/Nov/2026:08:18:58 +0100] "GET /blog/release-2-0 HTTP/2.0" 200 13589 "https://www.google.com/" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.073\n192.0.2.3 - - [15/Nov/2026:08:19:26 +0100] "GET /blog/release-2-0 HTTP/2.0" 200 2630 "https://www.google.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.072\n198.51.100.30 - - [15/Nov/2026:08:20:16 +0100] "GET /assets/app.js HTTP/2.0" 200 23706 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.002\n198.51.100.2 - - [15/Nov/2026:08:21:02 +0100] "GET /pricing HTTP/2.0" 200 32222 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.082\n198.51.100.14 - - [15/Nov/2026:08:21:41 +0100] "GET / HTTP/2.0" 200 32128 "https://github.com/" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" 0.080\n192.0.2.27 - - [15/Nov/2026:08:22:45 +0100] "GET /api/cart HTTP/2.0" 200 31153 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.037\n198.51.100.11 - - [15/Nov/2026:08:23:20 +0100] "GET /assets/app.js HTTP/2.0" 304 0 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.008\n192.0.2.8 - - [15/Nov/2026:08:24:35 +0100] "GET / HTTP/2.0" 200 35310 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.068\n203.0.113.3 - - [15/Nov/2026:08:25:15 +0100] "GET / HTTP/2.0" 200 17304 "https://news.ycombinator.com/" "curl/8.10.1" 0.021\n192.0.2.28 - - [15/Nov/2026:08:25:51 +0100] "GET /pricing HTTP/2.0" 200 9390 "https://github.com/" "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0" 0.007\n192.0.2.28 - - [15/Nov/2026:08:26:46 +0100] "GET /wp-login.php HTTP/2.0" 404 153 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)" 0.005\n203.0.113.11 - - [15/Nov/2026:08:27:50 +0100] "GET /assets/style.css HTTP/2.0" 200 31830 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.005\n203.0.113.37 - - [15/Nov/2026:08:28:33 +0100] "GET /blog/release-2-0 HTTP/2.0" 200 4523 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.024\n192.0.2.3 - - [15/Nov/2026:08:28:50 +0100] "GET /blog/release-2-0 HTTP/2.0" 200 4952 "https://news.ycombinator.com/" "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0" 0.041\n198.51.100.30 - - [15/Nov/2026:08:30:08 +0100] "GET / HTTP/2.0" 200 34102 "https://www.google.com/" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.049\n198.51.100.37 - - [15/Nov/2026:08:30:56 +0100] "GET /assets/app.js HTTP/2.0" 200 14076 "-" "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)" 0.004\n203.0.113.21 - - [15/Nov/2026:08:31:16 +0100] "GET /docs/getting-started HTTP/2.0" 200 8818 "-" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.081\n198.51.100.16 - alice [15/Nov/2026:08:32:23 +0100] "POST /api/cart HTTP/2.0" 200 6968 "https://github.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.037\n192.0.2.27 - - [15/Nov/2026:08:33:02 +0100] "GET /docs/getting-started HTTP/2.0" 200 23024 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.039\n198.51.100.37 - - [15/Nov/2026:08:33:56 +0100] "GET /docs/getting-started HTTP/2.0" 200 30859 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.041\n192.0.2.6 - - [15/Nov/2026:08:34:48 +0100] "GET /assets/app.js HTTP/2.0" 200 8195 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.008\n203.0.113.19 - - [15/Nov/2026:08:35:17 +0100] "GET / HTTP/2.0" 200 9290 "https://github.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.074\n192.0.2.38 - alice [15/Nov/2026:08:36:16 +0100] "POST /login HTTP/2.0" 302 0 "https://github.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.064\n203.0.113.7 - - [15/Nov/2026:08:36:59 +0100] "GET / HTTP/2.0" 200 17875 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.009\n203.0.113.23 - - [15/Nov/2026:08:37:40 +0100] "GET / HTTP/2.0" 200 37045 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.039\n203.0.113.9 - - [15/Nov/2026:08:39:03 +0100] "POST /login HTTP/2.0" 302 0 "https://github.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.025\n198.51.100.34 - - [15/Nov/2026:08:39:31 +0100] "GET / HTTP/2.0" 200 12458 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.026\n192.0.2.37 - - [15/Nov/2026:08:40:16 +0100] "GET / HTTP/2.0" 200 13216 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.047\n198.51.100.33 - - [15/Nov/2026:08:41:16 +0100] "GET /assets/style.css HTTP/2.0" 200 36576 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.008\n192.0.2.10 - - [15/Nov/2026:08:41:49 +0100] "GET /docs/getting-started HTTP/2.0" 200 27322 "-" "curl/8.10.1" 0.089\n198.51.100.29 - - [15/Nov/2026:08:42:32 +0100] "GET /assets/app.js HTTP/2.0" 304 0 "https://news.ycombinator.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.007\n203.0.113.31 - - [15/Nov/2026:08:43:30 +0100] "GET /assets/app.js HTTP/2.0" 200 12947 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.001\n203.0.113.4 - alice [15/Nov/2026:08:44:21 +0100] "POST /login HTTP/2.0" 302 0 "-" "curl/8.10.1" 0.021\n203.0.113.34 - - [15/Nov/2026:08:45:18 +0100] "GET /assets/app.js HTTP/2.0" 200 1124 "https://news.ycombinator.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.002\n192.0.2.16 - - [15/Nov/2026:08:45:38 +0100] "GET /pricing HTTP/2.0" 200 6336 "https://news.ycombinator.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.054\n192.0.2.26 - - [15/Nov/2026:08:46:33 +0100] "GET /assets/app.js HTTP/2.0" 200 22173 "https://github.com/" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.002\n192.0.2.34 - - [15/Nov/2026:08:47:51 +0100] "GET / HTTP/2.0" 200 28930 "https://news.ycombinator.com/" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.067\n192.0.2.3 - - [15/Nov/2026:08:48:08 +0100] "GET /assets/style.css HTTP/2.0" 304 0 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)" 0.006\n198.51.100.8 - - [15/Nov/2026:08:48:53 +0100] "GET / HTTP/2.0" 200 25482 "https://news.ycombinator.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.076\n192.0.2.17 - - [15/Nov/2026:08:49:39 +0100] "GET /assets/app.js HTTP/2.0" 200 32866 "https://github.com/" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.007\n192.0.2.6 - - [15/Nov/2026:08:50:56 +0100] "GET /wp-login.php HTTP/2.0" 404 153 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)" 0.024\n198.51.100.33 - - [15/Nov/2026:08:51:25 +0100] "GET /assets/app.js HTTP/2.0" 304 0 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.003\n192.0.2.11 - - [15/Nov/2026:08:52:39 +0100] "GET / HTTP/2.0" 200 22543 "https://github.com/" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.024\n198.51.100.5 - - [15/Nov/2026:08:53:07 +0100] "GET / HTTP/2.0" 200 32637 "https://github.com/" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.026\n198.51.100.35 - - [15/Nov/2026:08:53:42 +0100] "GET /assets/app.js HTTP/2.0" 200 19513 "https://news.ycombinator.com/" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.006\n198.51.100.3 - - [15/Nov/2026:08:54:36 +0100] "GET / HTTP/2.0" 200 19778 "https://news.ycombinator.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.042\n203.0.113.6 - - [15/Nov/2026:08:55:40 +0100] "GET /docs/getting-started HTTP/2.0" 200 38907 "https://github.com/" "curl/8.10.1" 0.010\n192.0.2.34 - - [15/Nov/2026:08:56:33 +0100] "GET /docs/getting-started HTTP/2.0" 200 19121 "https://github.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.080\n198.51.100.27 - - [15/Nov/2026:08:57:11 +0100] "POST /api/cart HTTP/2.0" 200 2427 "https://www.google.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.016\n198.51.100.22 - - [15/Nov/2026:08:57:55 +0100] "GET /docs/getting-started HTTP/2.0" 200 8723 "-" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.076\n203.0.113.14 - - [15/Nov/2026:08:58:44 +0100] "GET /assets/style.css HTTP/2.0" 200 1568 "-" "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0" 0.003\n203.0.113.25 - alice [15/Nov/2026:08:59:37 +0100] "GET /api/cart HTTP/2.0" 200 28852 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.068\n198.51.100.29 - - [15/Nov/2026:09:00:18 +0100] "GET / HTTP/2.0" 200 34286 "-" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.030\n192.0.2.27 - - [15/Nov/2026:09:01:15 +0100] "GET /assets/style.css HTTP/2.0" 304 0 "https://www.google.com/" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" 0.002\n198.51.100.33 - - [15/Nov/2026:09:02:04 +0100] "GET / HTTP/2.0" 200 4009 "https://news.ycombinator.com/" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.082\n198.51.100.21 - - [15/Nov/2026:09:02:32 +0100] "GET /docs/getting-started HTTP/2.0" 200 17560 "https://github.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.067\n198.51.100.37 - - [15/Nov/2026:09:03:28 +0100] "GET /pricing HTTP/2.0" 200 26645 "https://github.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.013\n198.51.100.37 - - [15/Nov/2026:09:04:10 +0100] "GET /blog/release-2-0 HTTP/2.0" 200 15219 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.042\n203.0.113.7 - alice [15/Nov/2026:09:05:16 +0100] "POST /login HTTP/2.0" 302 0 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.032\n198.51.100.26 - - [15/Nov/2026:09:06:12 +0100] "GET / HTTP/2.0" 200 27924 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.068\n198.51.100.19 - - [15/Nov/2026:09:06:48 +0100] "GET /assets/style.css HTTP/2.0" 200 38436 "https://news.ycombinator.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.006\n203.0.113.19 - - [15/Nov/2026:09:07:52 +0100] "GET /assets/style.css HTTP/2.0" 304 0 "-" "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0" 0.004\n198.51.100.39 - - [15/Nov/2026:09:08:01 +0100] "GET /docs/getting-started HTTP/2.0" 200 32901 "https://www.google.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.002\n203.0.113.8 - - [15/Nov/2026:09:09:21 +0100] "GET /blog/2019/hello HTTP/2.0" 404 153 "https://github.com/" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" 0.008\n203.0.113.10 - - [15/Nov/2026:09:10:05 +0100] "GET /assets/style.css HTTP/2.0" 200 16042 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.006\n198.51.100.9 - - [15/Nov/2026:09:10:32 +0100] "GET /login HTTP/2.0" 200 7317 "https://www.google.com/" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.008\n203.0.113.36 - - [15/Nov/2026:09:11:28 +0100] "GET /assets/app.js HTTP/2.0" 200 20560 "https://github.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.008\n45.155.205.17 - - [15/Nov/2026:09:12:00 +0100] "POST /login HTTP/1.1" 401 64 "-" "python-requests/2.32.3" 0.041\n45.155.205.17 - - [15/Nov/2026:09:12:03 +0100] "POST /login HTTP/1.1" 401 64 "-" "python-requests/2.32.3" 0.041\n45.155.205.17 - - [15/Nov/2026:09:12:06 +0100] "POST /login HTTP/1.1" 401 64 "-" "python-requests/2.32.3" 0.041\n45.155.205.17 - - [15/Nov/2026:09:12:09 +0100] "POST /login HTTP/1.1" 401 64 "-" "python-requests/2.32.3" 0.041\n45.155.205.17 - - [15/Nov/2026:09:12:12 +0100] "POST /login HTTP/1.1" 401 64 "-" "python-requests/2.32.3" 0.041\n45.155.205.17 - - [15/Nov/2026:09:12:15 +0100] "POST /login HTTP/1.1" 401 64 "-" "python-requests/2.32.3" 0.041\n203.0.113.3 - - [15/Nov/2026:09:12:15 +0100] "GET / HTTP/2.0" 200 27788 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.064\n45.155.205.17 - - [15/Nov/2026:09:12:18 +0100] "POST /login HTTP/1.1" 401 64 "-" "python-requests/2.32.3" 0.041\n45.155.205.17 - - [15/Nov/2026:09:12:21 +0100] "POST /login HTTP/1.1" 401 64 "-" "python-requests/2.32.3" 0.041\n45.155.205.17 - - [15/Nov/2026:09:12:24 +0100] "POST /login HTTP/1.1" 401 64 "-" "python-requests/2.32.3" 0.041\n45.155.205.17 - - [15/Nov/2026:09:12:27 +0100] "POST /login HTTP/1.1" 401 64 "-" "python-requests/2.32.3" 0.041\n45.155.205.17 - - [15/Nov/2026:09:12:30 +0100] "POST /login HTTP/1.1" 401 64 "-" "python-requests/2.32.3" 0.041\n45.155.205.17 - - [15/Nov/2026:09:12:33 +0100] "POST /login HTTP/1.1" 401 64 "-" "python-requests/2.32.3" 0.041\n192.0.2.28 - - [15/Nov/2026:09:12:51 +0100] "GET /blog/release-2-0 HTTP/2.0" 200 6114 "https://github.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.025\n203.0.113.23 - - [15/Nov/2026:09:14:03 +0100] "GET / HTTP/2.0" 200 28361 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)" 0.034\n203.0.113.33 - - [15/Nov/2026:09:14:42 +0100] "GET /blog/release-2-0 HTTP/2.0" 200 13934 "-" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.029\n198.51.100.8 - - [15/Nov/2026:09:15:26 +0100] "GET /pricing HTTP/2.0" 200 33290 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.056\n192.0.2.11 - - [15/Nov/2026:09:16:31 +0100] "GET /assets/app.js HTTP/2.0" 200 26585 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.008\n198.51.100.30 - - [15/Nov/2026:09:17:14 +0100] "GET / HTTP/2.0" 200 21391 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.066\n192.0.2.31 - - [15/Nov/2026:09:17:46 +0100] "GET / HTTP/2.0" 200 2890 "https://github.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.029\n198.51.100.12 - - [15/Nov/2026:09:18:48 +0100] "GET /favicon.ico HTTP/2.0" 200 7940 "-" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" 0.002\n198.51.100.21 - - [15/Nov/2026:09:19:47 +0100] "GET / HTTP/2.0" 200 29140 "-" "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)" 0.010\n198.51.100.25 - - [15/Nov/2026:09:20:23 +0100] "GET /docs/getting-started HTTP/2.0" 200 31899 "https://www.google.com/" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.005\n203.0.113.26 - - [15/Nov/2026:09:21:03 +0100] "GET /assets/style.css HTTP/2.0" 200 3084 "https://github.com/" "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0" 0.003\n198.51.100.23 - - [15/Nov/2026:09:21:40 +0100] "GET /pricing HTTP/2.0" 200 3656 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)" 0.025\n192.0.2.6 - - [15/Nov/2026:09:22:41 +0100] "GET /assets/app.js HTTP/2.0" 200 2389 "https://www.google.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.004\n198.51.100.10 - - [15/Nov/2026:09:23:36 +0100] "POST /api/cart HTTP/2.0" 200 33341 "-" "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0" 0.018\n198.51.100.25 - - [15/Nov/2026:09:24:38 +0100] "GET /assets/style.css HTTP/2.0" 200 39840 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.004\n198.51.100.37 - - [15/Nov/2026:09:25:03 +0100] "GET /assets/app.js HTTP/2.0" 200 36491 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.007\n198.51.100.33 - - [15/Nov/2026:09:25:52 +0100] "GET / HTTP/2.0" 200 30092 "-" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.017\n203.0.113.36 - alice [15/Nov/2026:09:26:50 +0100] "POST /api/cart HTTP/2.0" 200 8740 "https://news.ycombinator.com/" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.071\n203.0.113.30 - - [15/Nov/2026:09:27:29 +0100] "GET /assets/style.css HTTP/2.0" 200 17015 "https://news.ycombinator.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.002\n203.0.113.34 - - [15/Nov/2026:09:28:12 +0100] "GET /docs/getting-started HTTP/2.0" 200 35292 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.022\n198.51.100.16 - - [15/Nov/2026:09:29:17 +0100] "GET / HTTP/2.0" 200 30179 "-" "curl/8.10.1" 0.082\n192.0.2.39 - - [15/Nov/2026:09:29:54 +0100] "GET / HTTP/2.0" 200 13524 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.084\n198.51.100.2 - - [15/Nov/2026:09:30:56 +0100] "GET /blog/release-2-0 HTTP/2.0" 200 7732 "-" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" 0.058\n203.0.113.15 - - [15/Nov/2026:09:31:25 +0100] "GET /pricing HTTP/2.0" 200 17506 "https://github.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.005\n198.51.100.25 - - [15/Nov/2026:09:32:13 +0100] "GET /assets/style.css HTTP/2.0" 200 12933 "https://www.google.com/" "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0" 0.002\n198.51.100.37 - - [15/Nov/2026:09:33:23 +0100] "GET /docs/getting-started HTTP/2.0" 200 10928 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.058\n198.51.100.21 - - [15/Nov/2026:09:33:46 +0100] "GET /pricing HTTP/2.0" 200 28183 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.086\n203.0.113.25 - - [15/Nov/2026:09:35:00 +0100] "GET /docs/getting-started HTTP/2.0" 200 13723 "-" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" 0.036\n203.0.113.27 - - [15/Nov/2026:09:35:39 +0100] "GET /docs/getting-started HTTP/2.0" 200 38666 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)" 0.080\n192.0.2.27 - - [15/Nov/2026:09:36:08 +0100] "GET /login HTTP/2.0" 200 6634 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.052\n203.0.113.6 - - [15/Nov/2026:09:36:57 +0100] "GET / HTTP/2.0" 200 7929 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.036\n198.51.100.22 - alice [15/Nov/2026:09:37:55 +0100] "POST /api/cart HTTP/2.0" 200 4297 "https://github.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.055\n192.0.2.16 - - [15/Nov/2026:09:39:03 +0100] "GET /api/cart HTTP/2.0" 200 27308 "-" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.056\n192.0.2.12 - - [15/Nov/2026:09:39:48 +0100] "GET /docs/getting-started HTTP/2.0" 200 25938 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.034\n203.0.113.4 - - [15/Nov/2026:09:40:15 +0100] "GET /assets/style.css HTTP/2.0" 304 0 "-" "curl/8.10.1" 0.001\n192.0.2.21 - - [15/Nov/2026:09:40:55 +0100] "GET /blog/release-2-0 HTTP/2.0" 200 28329 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.029\n192.0.2.30 - - [15/Nov/2026:09:42:03 +0100] "GET /docs/getting-started HTTP/2.0" 200 12515 "https://news.ycombinator.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.004\n192.0.2.31 - - [15/Nov/2026:09:42:55 +0100] "GET /docs/getting-started HTTP/2.0" 200 12568 "https://www.google.com/" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.073\n198.51.100.7 - - [15/Nov/2026:09:43:18 +0100] "GET /docs/getting-started HTTP/2.0" 200 29764 "https://github.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.046\n192.0.2.22 - - [15/Nov/2026:09:44:02 +0100] "GET / HTTP/2.0" 200 34320 "https://news.ycombinator.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.009\n203.0.113.6 - - [15/Nov/2026:09:45:12 +0100] "GET /assets/style.css HTTP/2.0" 200 7981 "-" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.003\n198.51.100.12 - - [15/Nov/2026:09:45:50 +0100] "GET /docs/getting-started HTTP/2.0" 200 22023 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.081\n198.51.100.15 - - [15/Nov/2026:09:46:53 +0100] "GET /blog/release-2-0 HTTP/2.0" 200 39589 "https://news.ycombinator.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.025\n203.0.113.27 - - [15/Nov/2026:09:47:27 +0100] "GET / HTTP/2.0" 200 11366 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.058\n198.51.100.9 - - [15/Nov/2026:09:48:20 +0100] "GET / HTTP/2.0" 200 35581 "https://www.google.com/" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)" 0.006\n203.0.113.18 - - [15/Nov/2026:09:49:23 +0100] "GET /assets/app.js HTTP/2.0" 200 35907 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.006\n203.0.113.25 - - [15/Nov/2026:09:49:52 +0100] "GET /docs/getting-started HTTP/2.0" 200 22481 "https://www.google.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.069\n203.0.113.20 - - [15/Nov/2026:09:50:38 +0100] "GET /assets/style.css HTTP/2.0" 304 0 "https://news.ycombinator.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.008\n203.0.113.11 - - [15/Nov/2026:09:51:32 +0100] "GET /assets/style.css HTTP/2.0" 200 19869 "-" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.004\n192.0.2.4 - - [15/Nov/2026:09:52:03 +0100] "GET / HTTP/2.0" 200 2260 "https://news.ycombinator.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.007\n192.0.2.16 - - [15/Nov/2026:09:53:10 +0100] "GET /blog/release-2-0 HTTP/2.0" 200 27881 "https://news.ycombinator.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.053\n198.51.100.12 - - [15/Nov/2026:09:53:44 +0100] "GET /assets/app.js HTTP/2.0" 200 9630 "https://www.google.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.006\n192.0.2.19 - - [15/Nov/2026:09:54:30 +0100] "GET / HTTP/2.0" 200 27142 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.073\n198.51.100.40 - - [15/Nov/2026:09:55:15 +0100] "GET /login HTTP/2.0" 200 38710 "-" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.041\n192.0.2.3 - - [15/Nov/2026:09:56:10 +0100] "GET /old-page HTTP/2.0" 404 153 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)" 0.018\n203.0.113.28 - - [15/Nov/2026:09:57:27 +0100] "POST /api/cart HTTP/2.0" 200 13875 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" 0.048\n203.0.113.32 - - [15/Nov/2026:09:58:08 +0100] "GET /pricing HTTP/2.0" 200 36084 "https://www.google.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" 0.003\n203.0.113.16 - - [15/Nov/2026:09:58:53 +0100] "GET /assets/app.js HTTP/2.0" 304 0 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" 0.001\n192.0.2.29 - - [15/Nov/2026:09:59:28 +0100] "GET /pricing HTTP/2.0" 200 35091 "-" "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" 0.088',
  countdown:
    '{\n  "to": "2027-01-01T00:00:00",\n  "timezone": "Europe/Paris",\n  "title": "Happy new year",\n  "description": "Midnight in Paris."\n}',
  cert: '-----BEGIN CERTIFICATE-----\nMIIB2zCCAYGgAwIBAgIBATAKBggqhkjOPQQDAjBDMQswCQYDVQQGEwJMVTEVMBMG\nA1UECgwMVml0cmluZSBUZXN0MR0wGwYDVQQDDBRWaXRyaW5lIFRlc3QgUm9vdCBD\nQTAeFw0yNjEwMTMyMTAxMzNaFw0zNjEwMTAyMTAxMzNaMEMxCzAJBgNVBAYTAkxV\nMRUwEwYDVQQKDAxWaXRyaW5lIFRlc3QxHTAbBgNVBAMMFFZpdHJpbmUgVGVzdCBS\nb290IENBMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE4YdSlv8ECRyl2eb6BbBg\nP+VrCt4ioK2xHAS6G4vVMaqXoCOx0yvBKlQ8QL6fruatUo1QDMi0HtwpAfq+YANE\nOKNmMGQwHQYDVR0OBBYEFAyqLSbgIuAbs8T2GzLmLPHmR9gFMB8GA1UdIwQYMBaA\nFAyqLSbgIuAbs8T2GzLmLPHmR9gFMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYDVR0P\nAQH/BAQDAgEGMAoGCCqGSM49BAMCA0gAMEUCIQDiRbgrI/yFZzq9IQ/2sbEcAn4/\n5wzI3kPSS255Ll+52AIgP8KKf2xF8fKiHq3YXWeXs1eLG+n2NMKpFwybkPhJPpE=\n-----END CERTIFICATE-----\n',
  ioc: 'Phishing e-mails from billing[@]invoice-update[.]com lead to hxxps://login-secure[.]example-portal[.]xyz/auth.\nThe dropper (SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855) calls back to 45.33.32[.]156,\nthen moves to 10.0.4.17. Initial access: T1566.001, exploiting CVE-2024-3400.\n',
  cvss: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N',
  headers:
    "HTTP/2 200\nserver: nginx/1.18.0\nstrict-transport-security: max-age=86400\ncontent-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' https:\nx-frame-options: SAMEORIGIN\nset-cookie: PHPSESSID=8f2a; path=/; HttpOnly\n",
  email:
    'Authentication-Results: mx.example.org; spf=softfail smtp.mailfrom=bulk-sender.xyz; dkim=none; dmarc=fail\nReceived: from unknown ([203.0.113.66]) by mx.example.org with SMTP; Tue, 17 Nov 2026 10:00:02 +0100\nFrom: "service@paypal.com" <security@paypa1-support.xyz>\nReply-To: help@other-domain.example\nTo: alice@example.org\nSubject: Action required on your account\nDate: Tue, 17 Nov 2026 09:59:58 +0100\nContent-Type: text/html; charset=utf-8\n\n<p>Please confirm your account:</p>\n<a href="https://paypa1-support.xyz/login">https://www.paypal.com/signin</a>\n',
  dns: 'example.com.\t300\tIN\tTXT\t"v=spf1 ip4:192.0.2.0/24 include:_spf.google.com ~all"\n_dmarc.example.com.\t300\tIN\tTXT\t"v=DMARC1; p=none"\nexample.com.\t86400\tIN\tCAA\t0 issue "letsencrypt.org"\nexample.com.\t3600\tIN\tMX\t10 mail.example.com.\n',
  nmap: 'Nmap scan report for shop.example.com (203.0.113.10)\nHost is up (0.012s latency).\nPORT     STATE    SERVICE VERSION\n22/tcp   open     ssh     OpenSSH 8.9p1\n| ssh-hostkey:\n|_  256 aa:bb (ED25519)\n443/tcp  open     ssl/http nginx 1.18.0\n3306/tcp open     mysql   MySQL 8.0.35\n6379/tcp filtered redis\n',
  url: 'https://www.paypal.com@evil.example/login?next=https://evil.example/x&utm_source=mail\nhttps://xn--80ak6aa92e.com/\n',
  hash: 'Hello, Vitrine',
  waterfall: JSON.stringify(
    {
      log: {
        pages: [
          {
            id: 'p',
            title: 'shop.example',
            startedDateTime: '2026-11-17T10:00:00.000Z',
            pageTimings: { onContentLoad: 300, onLoad: 420 },
          },
        ],
        entries: [
          {
            pageref: 'p',
            startedDateTime: '2026-11-17T10:00:00.000Z',
            time: 180,
            _resourceType: 'document',
            request: { method: 'GET', url: 'https://shop.example/' },
            response: {
              status: 200,
              content: { size: 18000, mimeType: 'text/html' },
              bodySize: 6000,
            },
            timings: { dns: 15, connect: 40, ssl: 25, send: 1, wait: 80, receive: 19 },
          },
          {
            pageref: 'p',
            startedDateTime: '2026-11-17T10:00:00.200Z',
            time: 120,
            _resourceType: 'script',
            request: { method: 'GET', url: 'https://cdn.tracker.example/t.js' },
            response: {
              status: 200,
              content: { size: 9000, mimeType: 'text/javascript' },
              bodySize: 3000,
            },
            timings: { dns: 20, connect: 30, ssl: 20, wait: 40, receive: 10 },
          },
          {
            pageref: 'p',
            startedDateTime: '2026-11-17T10:00:00.250Z',
            time: 60,
            _resourceType: 'image',
            request: { method: 'GET', url: 'http://img.other.example/a.png' },
            response: { status: 404, content: { size: 0, mimeType: 'image/png' } },
            timings: { wait: 50, receive: 10 },
          },
        ],
      },
    },
    null,
    2,
  ),
  yara: 'import "pe"\n\nrule Loader_PE_Dropper : loader dropper {\n  meta:\n    author = "CIRCL"\n    description = "PE dropper with an encoded PowerShell stage"\n    date = "2026-11-17"\n    score = 80\n  strings:\n    $mz = { 4D 5A 90 00 }\n    $stub = { E8 ?? ?? ?? ?? 5B [2-6] 8B 45 ( 08 | 0C ) }\n    $cmd = "cmd.exe /c" nocase wide ascii\n    $ps = "powershell -enc" base64\n    $key = "Sup3rS3cret" xor(1-255)\n    $c2 = /https?:\\/\\/[a-z0-9]{8,}\\.(top|xyz)\\// nocase\n  condition:\n    uint16(0) == 0x5A4D and filesize < 2MB and\n    $mz at 0 and $stub and 2 of ($cmd, $ps, $key) and #c2 > 1 and\n    pe.number_of_sections > 3\n}',
  sigma:
    "title: Whoami Execution by a Web Server\nid: 502b42de-4306-40b4-9596-6f590c81f073\nstatus: test\ndescription: A web server process runs whoami, a common first step after a web shell is planted.\nauthor: Vitrine examples\ndate: 2026-11-17\nreferences:\n  - https://attack.mitre.org/techniques/T1033/\ntags:\n  - attack.discovery\n  - attack.t1033\n  - attack.persistence\n  - attack.t1505.003\nlogsource:\n  category: process_creation\n  product: windows\ndetection:\n  selection_parent:\n    ParentImage|endswith:\n      - '\\w3wp.exe'\n      - '\\httpd.exe'\n      - '\\nginx.exe'\n  selection_child:\n    - Image|endswith: '\\whoami.exe'\n    - OriginalFileName: 'whoami.exe'\n  filter_health:\n    CommandLine|contains|all:\n      - '/healthcheck'\n      - '--quiet'\n  condition: all of selection_* and not filter_health\nfalsepositives:\n  - Monitoring scripts run by the web server account\nlevel: high\n",
  pcap: '1MOyoQIABAAAAAAAAAAAAP//AAABAAAAoCX8agAAAAAqAAAAKgAAAP///////wIAXhAAAQgGAAEIAAYEAAECAF4QAAHAqAEUAAAAAAAAwKgBAaAl/GrUMAAAKgAAACoAAAACAF4QAAECAF4QAP4IBgABCAAGBAACAgBeEAD+wKgBAQIAXhAAAcCoARSgJfxqqGEAAE4AAABOAAAAAgBeEAD+AgBeEAABCABFAABAHEZAAEARAADAqAEUwKgBAc+EADUALAAAKh8BAAABAAAAAAAABWxvZ2luBHNob3AHZXhhbXBsZQAAAQABoCX8anySAAB8AAAAfAAAAAIAXhAAAQIAXhAA/ggARQAAbhxGQABAEQAAwKgBAcCoARQANc+EAFoAACofgYAAAQACAAAAAAVsb2dpbgRzaG9wB2V4YW1wbGUAAAEAAcAMAAUAAQAAASwAEgNjZG4Ec2hvcAdleGFtcGxlAMAwAAEAAQAAADwABMYzZAegJfxqkF8BADYAAAA2AAAAAgBeEAD+AgBeEAABCABFAAAoHEZAAEAGAADAqAEUxjNkB8k6AbsAAAPoAAAAAFAC+vAAAAAAoCX8amSQAQA2AAAANgAAAAIAXhAAAQIAXhAA/ggARQAAKBxGQABABgAAxjNkB8CoARQBu8k6AAATiAAAA+lQEvrwAAAAAKAl/Go4wQEANgAAADYAAAACAF4QAP4CAF4QAAEIAEUAACgcRkAAQAYAAMCoARTGM2QHyToBuwAAA+kAABOJUBD68AAAAACgJfxqDPIBAKIAAACiAAAAAgBeEAD+AgBeEAABCABFAACUHEZAAEAGAADAqAEUxjNkB8k6AbsAAAPpAAATiVAY+vAAAAAAFgMBAGcBAABjAwMHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwAABBMBEwIBAAA2AAAAFwAVAAASbG9naW4uc2hvcC5leGFtcGxlABAADgAMAmgyCGh0dHAvMS4xACsABQQDBAMDoCX8auAiAgA2AAAANgAAAAIAXhAA/gIAXhAAAQgARQAAKBxGQABABgAAwKgBFMYzZAfJkABQAAAjKAAAAABQAvrwAAAAAKAl/Gq0UwIAnAAAAJwAAAACAF4QAP4CAF4QAAEIAEUAAI4cRkAAQAYAAMCoARTGM2QHyZAAUAAAIykAABtZUBj68AAAAABHRVQgL2xvZ2luP25leHQ9JTJGYWNjb3VudCBIVFRQLzEuMQ0KSG9zdDogbG9naW4uc2hvcC5leGFtcGxlDQpVc2VyLUFnZW50OiBjdXJsLzguNS4wDQpBY2NlcHQ6ICovKg0KDQqgJfxqiIQCADIAAAAyAAAAAgBeEAD+AgBeEAABCABFAAAkHEZAAEABAADAqAEUywBxCQgAAAASNAABYWJjZGVmZ2igJfxqXLUCAEYAAABGAAAAAgBeEAD+AgBeEAABht1gAAAAABA6QCABDbgAAAAAAAAAAAAAAAEgAQ24AAAAAAAAAAAAAAACgAAAAAAHAAFwaW5ncGluZw==',
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
  status: {
    tag: 'vt-status',
    flags: ['bars', 'incidents'],
    fields: [
      { name: 'days', type: 'number', placeholder: '90' },
      { name: 'max-incidents', type: 'number', placeholder: '5' },
      { name: 'now', type: 'text', placeholder: '2026-11-05T12:00:00Z' },
    ],
  },
  calendar: {
    tag: 'vt-calendar',
    flags: ['views', 'add-to-calendar'],
    fields: [
      { name: 'view', type: 'select', options: ['', 'month', 'agenda'] },
      { name: 'date', type: 'text', placeholder: '2026-11' },
      { name: 'timezone', type: 'text', placeholder: 'Europe/Paris' },
      { name: 'first-day', type: 'number', placeholder: '1' },
      { name: 'max-per-day', type: 'number', placeholder: '3' },
      { name: 'limit', type: 'number', placeholder: '20' },
      { name: 'now', type: 'text', placeholder: '2026-11-05T12:00:00Z' },
    ],
  },
  pricing: {
    tag: 'vt-pricing',
    flags: ['compare'],
    fields: [
      { name: 'period', type: 'text', placeholder: 'yearly' },
      { name: 'currency', type: 'text', placeholder: 'EUR' },
      { name: 'display', type: 'select', options: ['', 'monthly', 'total'] },
      { name: 'link-target', type: 'select', options: ['', '_self', '_blank'] },
    ],
  },
  faq: {
    tag: 'vt-faq',
    flags: ['filter', 'categories', 'single', 'markdown', 'links'],
    fields: [{ name: 'open', type: 'text', placeholder: 'first' }],
  },
  gallery: {
    tag: 'vt-gallery',
    flags: ['viewer', 'captions'],
    fields: [
      { name: 'columns', type: 'number', placeholder: 'auto' },
      { name: 'aspect', type: 'select', options: ['', 'square', 'photo', 'wide', 'natural'] },
      { name: 'images', type: 'select', options: ['', 'allow', 'same-origin'] },
    ],
  },
  stats: {
    tag: 'vt-stats',
    flags: ['trend', 'changes'],
    fields: [{ name: 'columns', type: 'number', placeholder: 'auto' }],
  },
  board: {
    tag: 'vt-board',
    flags: ['filters'],
    fields: [
      { name: 'view', type: 'select', options: ['', 'board', 'list', 'table'] },
      { name: 'views', type: 'text', placeholder: 'board list table' },
      { name: 'readonly', type: 'select', options: ['', 'readonly'] },
      { name: 'persist', type: 'text', placeholder: 'my-board' },
    ],
  },
  field: {
    tag: 'vt-field',
    flags: [],
    fields: [
      {
        name: 'type',
        type: 'select',
        options: [
          'select',
          'multiselect',
          'radio',
          'checkboxes',
          'text',
          'email',
          'password',
          'number',
          'range',
          'date',
          'textarea',
          'checkbox',
          'switch',
        ],
      },
      { name: 'required', type: 'select', options: ['', 'required'] },
      { name: 'hint', type: 'text', placeholder: 'Shown under the field' },
      { name: 'tip', type: 'text', placeholder: 'Behind the ? button' },
      { name: 'searchable', type: 'select', options: ['', 'searchable'] },
      { name: 'max-selected', type: 'number', placeholder: '3' },
      { name: 'placeholder', type: 'text', placeholder: 'Choose…' },
    ],
  },
  search: {
    tag: 'vt-search',
    flags: ['recent', 'group'],
    fields: [
      { name: 'layout', type: 'select', options: ['', 'dialog', 'inline'] },
      { name: 'shortcut', type: 'text', placeholder: 'mod+k /' },
      { name: 'url-template', type: 'text', placeholder: 'docs.html?page={id}' },
      { name: 'limit', type: 'number', placeholder: '20' },
    ],
  },
  'date-picker': {
    tag: 'vt-date-picker',
    flags: ['inline', 'clearable'],
    fields: [
      { name: 'mode', type: 'select', options: ['', 'single', 'range'] },
      { name: 'min', type: 'text', placeholder: 'today' },
      { name: 'max', type: 'text', placeholder: '2027-12-31' },
      { name: 'disabled-dates', type: 'text', placeholder: 'sat sun 2026-12-25' },
      { name: 'months', type: 'number', placeholder: '2' },
      { name: 'required', type: 'select', options: ['', 'required'] },
    ],
  },
  menu: {
    tag: 'vt-menu',
    flags: [],
    fields: [
      { name: 'trigger', type: 'select', options: ['', 'button', 'icon', 'inline'] },
      { name: 'align', type: 'select', options: ['', 'start', 'end'] },
    ],
  },
  upload: {
    tag: 'vt-upload',
    flags: ['multiple'],
    fields: [
      { name: 'accept', type: 'text', placeholder: 'image/*,.pdf' },
      { name: 'max-size', type: 'text', placeholder: '5MB' },
      { name: 'max-files', type: 'number', placeholder: '3' },
      { name: 'required', type: 'select', options: ['', 'required'] },
    ],
  },
  testimonials: {
    tag: 'vt-testimonials',
    flags: ['summary'],
    fields: [
      { name: 'layout', type: 'select', options: ['', 'grid', 'list', 'carousel'] },
      { name: 'interval', type: 'number', placeholder: '6' },
    ],
  },
  sql: {
    tag: 'vt-sql',
    flags: ['format', 'line-numbers', 'sortable'],
    fields: [
      {
        name: 'dialect',
        type: 'select',
        options: ['', 'sql', 'postgresql', 'mysql', 'sqlite', 'mssql', 'oracle'],
      },
      { name: 'max-rows', type: 'number', placeholder: '200' },
    ],
  },
  'test-report': {
    tag: 'vt-test-report',
    flags: ['status-filter', 'output'],
    fields: [
      { name: 'status', type: 'select', options: ['', 'all', 'failed', 'passed', 'skipped'] },
      { name: 'open', type: 'select', options: ['', 'failed', 'all', 'none'] },
      { name: 'sort', type: 'select', options: ['', 'order', 'duration', 'name'] },
    ],
  },
  trace: {
    tag: 'vt-trace',
    flags: ['details', 'legend'],
    fields: [
      { name: 'depth', type: 'number', placeholder: '3' },
      { name: 'selected', type: 'text', placeholder: 'b' },
    ],
  },
  notebook: {
    tag: 'vt-notebook',
    flags: ['code', 'outputs', 'prompts', 'line-numbers'],
    fields: [{ name: 'images', type: 'select', options: ['', 'allow', 'block', 'same-origin'] }],
  },
  math: {
    tag: 'vt-math',
    flags: ['numbered', 'delimiters', 'inline'],
    fields: [{ name: 'macros', type: 'text', placeholder: '{"\\\\R": "\\\\mathbb{R}"}' }],
  },
  diagram: {
    tag: 'vt-diagram',
    flags: ['tabs', 'line-numbers'],
    fields: [{ name: 'look', type: 'select', options: ['', 'classic', 'handDrawn'] }],
  },
  pivot: {
    tag: 'vt-pivot',
    flags: ['totals', 'heat', 'controls'],
    fields: [
      { name: 'rows', type: 'text', placeholder: 'region' },
      { name: 'columns', type: 'text', placeholder: 'quarter' },
      { name: 'values', type: 'text', placeholder: 'revenue' },
      {
        name: 'aggregate',
        type: 'select',
        options: ['', 'sum', 'count', 'avg', 'min', 'max', 'distinct'],
      },
    ],
  },
  heatmap: {
    tag: 'vt-heatmap',
    flags: [],
    fields: [
      { name: 'unit', type: 'text', placeholder: 'commits' },
      { name: 'from', type: 'text', placeholder: '2026-09-01' },
      { name: 'levels', type: 'number', placeholder: '5' },
      { name: 'first-day', type: 'number', placeholder: '1' },
    ],
  },
  flame: {
    tag: 'vt-flame',
    flags: ['tabs'],
    fields: [
      { name: 'direction', type: 'select', options: ['', 'down', 'up'] },
      { name: 'unit', type: 'text', placeholder: 'samples' },
    ],
  },
  treemap: {
    tag: 'vt-treemap',
    flags: ['tabs'],
    fields: [
      { name: 'unit', type: 'text', placeholder: 'bytes' },
      { name: 'depth', type: 'number', placeholder: '2' },
    ],
  },
  describe: {
    tag: 'vt-describe',
    flags: ['expanded'],
    fields: [
      { name: 'columns', type: 'text', placeholder: 'plan,mrr' },
      { name: 'bins', type: 'number', placeholder: '12' },
      { name: 'top', type: 'number', placeholder: '5' },
    ],
  },
  compare: {
    tag: 'vt-compare',
    flags: ['filters'],
    fields: [
      { name: 'key', type: 'text', placeholder: 'sku' },
      {
        name: 'filter',
        type: 'select',
        options: ['', 'changes', 'all', 'added', 'removed', 'changed'],
      },
    ],
  },
  install: {
    tag: 'vt-install',
    flags: ['dev'],
    fields: [
      { name: 'managers', type: 'text', placeholder: 'npm,pnpm,yarn,bun,deno' },
      { name: 'manager', type: 'text', placeholder: 'pnpm' },
      { name: 'package', type: 'text', placeholder: 'vitrine' },
      { name: 'prompt', type: 'text', placeholder: '$' },
    ],
  },
  download: {
    tag: 'vt-download',
    flags: ['prerelease'],
    fields: [
      {
        name: 'platform',
        type: 'select',
        options: [
          '',
          'windows-x64',
          'windows-arm64',
          'macos',
          'macos-arm64',
          'linux-x64',
          'linux-arm64',
          'android',
          'none',
        ],
      },
      { name: 'prefer', type: 'text', placeholder: 'deb,rpm' },
    ],
  },
  contributors: {
    tag: 'vt-contributors',
    flags: ['bots', 'filters'],
    fields: [
      { name: 'layout', type: 'select', options: ['', 'grid', 'avatars', 'list'] },
      { name: 'sort', type: 'select', options: ['', 'contributions', 'name', 'amount'] },
      { name: 'max', type: 'number', placeholder: '24' },
      { name: 'size', type: 'select', options: ['', 'small', 'medium', 'large'] },
    ],
  },
  lifecycle: {
    tag: 'vt-lifecycle',
    flags: ['tabs'],
    fields: [
      { name: 'version', type: 'text', placeholder: '20.11.1' },
      { name: 'view', type: 'select', options: ['', 'table', 'schedule'] },
      { name: 'ended', type: 'number', placeholder: '3' },
      { name: 'now', type: 'text', placeholder: '2026-11-15' },
    ],
  },
  advisories: {
    tag: 'vt-advisories',
    flags: ['expanded', 'filters'],
    fields: [
      { name: 'severity', type: 'select', options: ['', 'critical', 'high', 'moderate', 'low'] },
    ],
  },
  licenses: {
    tag: 'vt-licenses',
    flags: ['filters', 'tabs'],
    fields: [
      { name: 'allow', type: 'text', placeholder: 'permissive,MPL-2.0' },
      { name: 'view', type: 'select', options: ['', 'licenses', 'packages'] },
    ],
  },
  'icon-picker': {
    tag: 'vt-icon-picker',
    flags: ['inline', 'required'],
    fields: [
      { name: 'label', type: 'text', placeholder: 'Menu icon' },
      { name: 'value', type: 'text', placeholder: 'fa-solid:house' },
      { name: 'sets', type: 'text', placeholder: 'fa-solid,lucide,flags' },
    ],
  },
  workflow: {
    tag: 'vt-workflow',
    flags: [],
    fields: [{ name: 'job', type: 'text', placeholder: 'test-22' }],
  },
  password: {
    tag: 'vt-password',
    flags: ['confirm', 'breach-check', 'required'],
    fields: [
      { name: 'mode', type: 'select', options: ['', 'new', 'current'] },
      { name: 'require', type: 'text', placeholder: 'lower,upper,digit,symbol' },
      { name: 'min-score', type: 'select', options: ['', '0', '1', '2', '3', '4'] },
      { name: 'user-inputs', type: 'text', placeholder: 'Alice alice@example.com' },
    ],
  },
  secret: {
    tag: 'vt-secret',
    flags: ['editable', 'rotate', 'show-once'],
    fields: [
      { name: 'value', type: 'text', placeholder: 'sk_live_51DemoKeyNotReal0000' },
      { name: 'copy-as', type: 'text', placeholder: 'env,shell,header' },
      { name: 'expires', type: 'text', placeholder: '2026-12-01' },
      { name: 'scopes', type: 'text', placeholder: 'repo,read:org' },
      { name: 'mask', type: 'select', options: ['', 'blur', 'dots'] },
    ],
  },
  version: {
    tag: 'vt-version',
    flags: ['newer', 'strict'],
    fields: [
      { name: 'value', type: 'text', placeholder: '1.4.2' },
      { name: 'format', type: 'text', placeholder: 'semver, x.y, calver, decimal, YY.0M' },
      { name: 'current', type: 'text', placeholder: '1.4.2' },
      { name: 'segment-max', type: 'text', placeholder: '*,9,9' },
    ],
  },
  consent: {
    tag: 'vt-consent',
    flags: ['consent-mode'],
    fields: [
      { name: 'position', type: 'select', options: ['inline', 'bottom', 'top'] },
      { name: 'categories', type: 'text', placeholder: 'analytics,marketing' },
      { name: 'policy', type: 'text', placeholder: '/privacy' },
      { name: 'version', type: 'text', placeholder: '2026-11' },
    ],
  },
  changelog: {
    tag: 'vt-changelog',
    flags: ['filters'],
    fields: [
      { name: 'repo', type: 'text', placeholder: 'https://github.com/acme/rocket' },
      { name: 'since', type: 'text', placeholder: '1.4.0' },
      { name: 'limit', type: 'text', placeholder: '3' },
    ],
  },
  repo: {
    tag: 'vt-repo',
    flags: ['clone'],
    fields: [{ name: 'now', type: 'text', placeholder: '2026-11-15T12:00:00Z' }],
  },
  'access-log': {
    tag: 'vt-access-log',
    flags: ['anonymize', 'filters', 'tabs'],
    fields: [
      { name: 'filter', type: 'text', placeholder: 'status:4xx' },
      { name: 'order', type: 'select', options: ['', 'newest', 'oldest'] },
    ],
  },
  countdown: {
    tag: 'vt-countdown',
    flags: [],
    fields: [
      { name: 'timezone', type: 'text', placeholder: 'Europe/Paris' },
      { name: 'units', type: 'text', placeholder: 'days hours minutes seconds' },
      { name: 'now', type: 'text', placeholder: '2026-11-07T12:00:00Z' },
    ],
  },
  table: {
    tag: 'vt-table',
    flags: [
      'sortable',
      'filters',
      'column-menu',
      'resizable',
      'reorderable',
      'expandable',
      'editable',
      'footer',
      'row-numbers',
      'wrap',
    ],
    fields: [
      { name: 'selectable', type: 'select', options: ['', 'none', 'single', 'multiple'] },
      { name: 'group-by', type: 'text', placeholder: 'team' },
      { name: 'density', type: 'select', options: ['', 'compact', 'normal', 'comfortable'] },
      { name: 'layout', type: 'select', options: ['', 'auto', 'table', 'cards'] },
      { name: 'page-size', type: 'number', placeholder: '50' },
      { name: 'pinned', type: 'number', placeholder: '0' },
      { name: 'row-key', type: 'text', placeholder: 'id' },
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
  ioc: {
    tag: 'vt-ioc',
    flags: ['defang', 'private', 'filters'],
    fields: [{ name: 'types', type: 'text', placeholder: 'url, domain, ipv4' }],
  },
  cvss: {
    tag: 'vt-cvss',
    flags: ['editable', 'metrics', 'all'],
    fields: [{ name: 'score', type: 'number', placeholder: '9.3' }],
  },
  headers: {
    tag: 'vt-headers',
    flags: ['https', 'passed', 'policy', 'headers'],
    fields: [],
  },
  email: {
    tag: 'vt-email',
    flags: ['defang', 'hashes', 'tabs'],
    fields: [
      {
        name: 'view',
        type: 'select',
        options: ['', 'summary', 'path', 'body', 'links', 'attachments', 'headers'],
      },
    ],
  },
  dns: {
    tag: 'vt-dns',
    flags: ['explain', 'checks', 'filters'],
    fields: [],
  },
  nmap: {
    tag: 'vt-nmap',
    flags: ['all', 'down', 'scripts', 'risky'],
    fields: [],
  },
  url: {
    tag: 'vt-url',
    flags: ['defang', 'parts', 'chain'],
    fields: [],
  },
  hash: {
    tag: 'vt-hash',
    flags: ['file', 'compare'],
    fields: [
      { name: 'algorithms', type: 'text', placeholder: 'sha256 sha512' },
      { name: 'format', type: 'select', options: ['', 'hex', 'upper', 'base64', 'sri'] },
      { name: 'expected', type: 'text', placeholder: 'sha256:…' },
    ],
  },
  waterfall: {
    tag: 'vt-waterfall',
    flags: ['filters', 'defang', 'tabs'],
    fields: [{ name: 'view', type: 'select', options: ['', 'requests', 'domains'] }],
  },
  yara: {
    tag: 'vt-yara',
    flags: ['lint', 'explain', 'tabs'],
    fields: [{ name: 'view', type: 'select', options: ['', 'rules', 'source'] }],
  },
  sigma: {
    tag: 'vt-sigma',
    flags: ['lint', 'links', 'tabs'],
    fields: [{ name: 'view', type: 'select', options: ['', 'rules', 'source'] }],
  },
  pcap: {
    tag: 'vt-pcap',
    flags: ['filters', 'file', 'defang', 'tabs'],
    fields: [{ name: 'view', type: 'select', options: ['', 'packets', 'conversations', 'names'] }],
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
        Object.keys(SCHEMA).sort(),
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
      field: { type: 'multiselect', hint: 'Pick up to three.', tip: 'Used to suggest articles.' },
      search: { layout: 'inline' },
      'date-picker': { mode: 'range', min: 'today', 'disabled-dates': 'sun' },
      upload: { accept: 'image/*,.pdf', 'max-size': '5MB', 'max-files': '3' },
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
    table: 'Team',
    status: 'status.json',
    calendar: 'events.json',
    pricing: 'pricing.json',
    faq: 'faq.json',
    gallery: 'gallery.json',
    stats: 'stats.json',
    board: 'Sprint 42',
    field: 'Topics',
    search: 'Search the docs',
    'date-picker': 'Your stay',
    menu: 'File',
    upload: 'Attachments',
    testimonials: 'testimonials.json',
    sql: 'users.sql',
    'test-report': 'junit.xml',
    trace: 'trace.json',
    notebook: 'scores.ipynb',
    math: 'Formulas',
    diagram: 'Orders',
    pivot: 'sales.csv',
    heatmap: 'Commits',
    flame: 'checkout.folded',
    treemap: 'app.js',
    describe: 'customers.csv',
    compare: 'catalog.json',
    install: 'Install',
    download: 'Atlas',
    contributors: '.all-contributorsrc',
    lifecycle: 'Node.js',
    advisories: 'osv.json',
    licenses: 'sbom.cdx.json',
    'icon-picker': 'Icon',
    workflow: 'CI',
    'access-log': 'access.log',
    password: 'Password',
    secret: 'API key',
    version: 'Version',
    consent: 'Cookies',
    changelog: 'CHANGELOG.md',
    repo: 'acme/rocket',
    countdown: 'countdown.json',
    ioc: 'Phishing report',
    cvss: 'CVE-2026-0001',
    headers: 'shop.example.com',
    email: 'suspicious.eml',
    dns: 'dig example.com',
    nmap: 'nmap -sV',
    url: 'Suspicious links',
    hash: 'Checksum',
    waterfall: 'capture.har',
    yara: 'loader.yar',
    sigma: 'web_server_whoami.yml',
    pcap: 'login.pcap',
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
