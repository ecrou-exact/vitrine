# Vitrine documentation

Vitrine is a library of framework-free web components to display and edit source code, Markdown, JSON, CSV, tags, diffs, terminal sessions, file trees, HTTP exchanges, application logs, charts, OpenAPI descriptions, configuration files, hex dumps, timelines, jobs, Git histories, regular expressions, YAML, XML, TOML, JSON Web Tokens, cron schedules, X.509 certificates, service status pages, event calendars, pricing plans, FAQs, image galleries, key figures, task boards, form fields, site search, testimonials and countdowns on any web page: `<vt-code>`, `<vt-markdown>`, `<vt-json>`, `<vt-csv>`, `<vt-tags>`, `<vt-diff>`, `<vt-terminal>`, `<vt-tree>`, `<vt-http>`, `<vt-log>`, `<vt-chart>`, `<vt-openapi>`, `<vt-env>`, `<vt-hex>`, `<vt-timeline>`, `<vt-job>`, `<vt-git>`, `<vt-regex>`, `<vt-yaml>`, `<vt-xml>`, `<vt-toml>`, `<vt-jwt>`, `<vt-cron>`, `<vt-cert>` and `<vt-table>`. Add one script, write the elements in your HTML, and they render with syntax highlighting, search, copy and themes. Every component can switch to an editor, and `<vt-tags>` works as a form field. Content is displayed safely, even when it comes from untrusted sources.

## Guides

| Page                                                 | Contents                                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [Getting started](getting-started.md)                | Installation (CDN, ES modules, per-component modules, git submodule, self-hosting), sizes, first examples, content sources |
| [Common attributes and events](common-attributes.md) | Attributes shared by all components, presets, full screen, events, shared CSS parts                                        |
| [JSON as input](json.md)                             | Feeding any element with JSON: `data`, `json`, `json-src`, `json-path`, and what each element reads                        |
| [Editing](editing.md)                                | Edit mode, keyboard, undo history, editing events, reading the edited value                                                |
| [Theming](theming.md)                                | Built-in themes, syntax themes, design tokens, custom themes, `::part()` styling                                           |
| [Configuration and API](configuration.md)            | `Vitrine.configure()`, locales, `Vitrine.render()`, `defineAll()` and the rest of the API                                  |
| [Security](security.md)                              | Sanitization, URL and image rules, `src` restrictions, Trusted Types, Content Security Policy                              |
| [Frameworks](frameworks.md)                          | Vue, React, Svelte, Angular, HTML forms, backend suggestions, PHP, Django, WordPress, server-side rendering                |
| [Accessibility](accessibility.md)                    | Keyboard support, focus, announcements, touch, reduced motion, contrast                                                    |

## Component reference

| Element             | Description                                                                                                                    | Reference                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `<vt-code>`         | Source code with highlighting, line numbers, emphasized lines, diff, search, copy, download                                    | [components/code.md](components/code.md)                 |
| `<vt-markdown>`     | Sanitized GitHub Flavored Markdown with preview, source and split views, scroll sync, table of contents, anchors               | [components/markdown.md](components/markdown.md)         |
| `<vt-json>`         | JSON as highlighted text or a collapsible tree, with exact numbers, search and JSONPath                                        | [components/json.md](components/json.md)                 |
| `<vt-csv>`          | CSV and TSV as a typed, sortable, paginated and searchable table                                                               | [components/csv.md](components/csv.md)                   |
| `<vt-tags>`         | Tags as chips, and a tag field for forms with autocompletion, creation rules and backend suggestions                           | [components/tags.md](components/tags.md)                 |
| `<vt-diff>`         | Comparison of two texts or a unified patch, side by side or unified, with word-level changes                                   | [components/diff.md](components/diff.md)                 |
| `<vt-terminal>`     | Terminal session with prompts, ANSI colors, a copy button per command, collapsible output and typing replay                    | [components/terminal.md](components/terminal.md)         |
| `<vt-tree>`         | File tree from `tree` output, indented text, paths or JSON, with icons, notes, change markers and links                        | [components/tree.md](components/tree.md)                 |
| `<vt-http>`         | HTTP request and response from raw HTTP, curl, JSON or HAR, with code for curl, `fetch`, Python and HTTPie, and masked secrets | [components/http.md](components/http.md)                 |
| `<vt-log>`          | Application logs in plain text, JSON lines or logfmt, with levels, fields, stack traces, level filters and live streaming      | [components/log.md](components/log.md)                   |
| `<vt-chart>`        | Line, area, bar and donut charts from CSV or JSON, drawn with Apache ECharts in the theme colors, with a Table view            | [components/chart.md](components/chart.md)               |
| `<vt-openapi>`      | API reference from an OpenAPI 3.0 or 3.1 (or Swagger 2.0) description in JSON or YAML, with schema trees and examples          | [components/openapi.md](components/openapi.md)           |
| `<vt-table>`        | Data table: sorting, filters, selection and bulk actions, grouping, column chooser, resizing, editing, virtual scrolling       | [components/table.md](components/table.md)               |
| `<vt-env>`          | Dotenv, INI or `.properties` file as a table, with references linked and secrets masked                                        | [components/env.md](components/env.md)                   |
| `<vt-hex>`          | Hex dump of binary data with offsets, ASCII, colored bytes and the detected file type                                          | [components/hex.md](components/hex.md)                   |
| `<vt-timeline>`     | Timeline of events from JSON or a changelog, grouped by date with durations                                                    | [components/timeline.md](components/timeline.md)         |
| `<vt-job>`          | Job or CI run with a progress bar, steps and their logs                                                                        | [components/job.md](components/job.md)                   |
| `<vt-git>`          | Git history as a graph of branches, merges and tags                                                                            | [components/git.md](components/git.md)                   |
| `<vt-regex>`        | Regular expression explained and tested on a text                                                                              | [components/regex.md](components/regex.md)               |
| `<vt-yaml>`         | YAML as a tree, with several documents, anchors and merge keys                                                                 | [components/yaml.md](components/yaml.md)                 |
| `<vt-xml>`          | XML as a tree, read safely without entity expansion                                                                            | [components/xml.md](components/xml.md)                   |
| `<vt-toml>`         | TOML configuration as a typed tree                                                                                             | [components/toml.md](components/toml.md)                 |
| `<vt-jwt>`          | JSON Web Token decoded, with claims, status and warnings                                                                       | [components/jwt.md](components/jwt.md)                   |
| `<vt-cron>`         | Cron expression or crontab explained, with next runs                                                                           | [components/cron.md](components/cron.md)                 |
| `<vt-cert>`         | X.509 certificates and chains, read without verifying or fetching                                                              | [components/cert.md](components/cert.md)                 |
| `<vt-status>`       | Service status page: state, uptime bars, incidents and maintenance                                                             | [components/status.md](components/status.md)             |
| `<vt-calendar>`     | Events from iCalendar or JSON, with recurrence and time zones                                                                  | [components/calendar.md](components/calendar.md)         |
| `<vt-pricing>`      | Pricing plans, billing periods, currencies and a comparison table                                                              | [components/pricing.md](components/pricing.md)           |
| `<vt-faq>`          | Questions and answers, with search, categories and links                                                                       | [components/faq.md](components/faq.md)                   |
| `<vt-gallery>`      | Image grid with a keyboard viewer                                                                                              | [components/gallery.md](components/gallery.md)           |
| `<vt-stats>`        | Key figures with changes and a small history                                                                                   | [components/stats.md](components/stats.md)               |
| `<vt-board>`        | Task board with drag and drop, list and table views, and public roadmaps                                                       | [components/board.md](components/board.md)               |
| `<vt-field>`        | Form field with required mark, tip, hint, errors and lists                                                                     | [components/field.md](components/field.md)               |
| `<vt-search>`       | Site search with a shortcut, a JSON index or an API, and results by id                                                         | [components/search.md](components/search.md)             |
| `<vt-testimonials>` | Testimonials and reviews, with ratings                                                                                         | [components/testimonials.md](components/testimonials.md) |
| `<vt-countdown>`    | Countdown to a date in a time zone                                                                                             | [components/countdown.md](components/countdown.md)       |

## Quick example

```html
<script src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/vitrine.min.js"></script>

<vt-code variant="full" label="hello.py" language="python">
  def hello(name):
      return f"Hello {name}"
</vt-code>
```

Inline content like this is fine for content you write yourself. For anything that comes from users or other systems, set the `content` property from JavaScript instead; [Getting started](getting-started.md#content-sources) explains why.

## Other documents

- [Design system](DESIGN_SYSTEM.md): the visual rules behind the components and the website.
- [Security policy](../SECURITY.md): how to report a vulnerability.
- [Contributing](../CONTRIBUTING.md)
