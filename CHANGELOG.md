# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `<vt-openapi>`: the search no longer moves focus to the first match after each key, and the
  page scrolls again over the reference.

### Added

- `<vt-csv>`: RFC 4180 parser with delimiter detection, typed columns, sorting, pagination,
  search that filters rows, Table / Raw views and an editor.
- `<vt-tags>`: tags as chips from JSON, and a form-associated tag field with suggestions,
  prefixes, a browse panel, creation rules, backend suggestions and JSON, CSV or line output.
- `<vt-diff>`: comparison of two texts or a unified patch, side by side or unified, with word
  changes, folded context, patch copy and download, and editors for both sides.
- Edit mode for every component, with undo and redo, full screen, 258 syntax themes, a loader
  shown while content loads, and one ES module per component.
- `<vt-terminal>`: shell sessions split into commands (configurable prompts, context such as
  `user@host:~$`, continued lines) and output; ANSI parser for 16, 256 and 24-bit colors, text
  styles, carriage returns and line erasing, OSC 8 links limited to http(s), every other sequence
  removed; colors mapped to theme tokens (`--vt-ansi-*`); copy button per command and copy of all
  commands; collapsible output; typing replay; `escapes` for transcripts written by hand.
- `<vt-tree>`: file trees from `tree` output, indented text, paths, JSON (paths, entry objects or
  nested objects); notes and added, removed, modified and highlighted markers; icons by file kind;
  WAI-ARIA tree keyboard support with type-ahead; folders built when opened; search that filters
  the tree; `href-template` links; `vt-select` and `vt-toggle` events; `data` property.
- `<vt-http>`: HTTP exchanges from raw HTTP, curl commands, JSON and HAR; bodies formatted by
  content type; status colored by class; credentials masked everywhere until revealed; Code tab
  writing the request for curl, `fetch`, Python `requests` and HTTPie with values quoted for each
  language; `exchange` property.
- `<vt-log>`: application logs in plain text, JSON lines (pino, bunyan, winston, Logstash) and
  logfmt, read line by line; timestamps in the usual formats, levels by name, alias, pino number
  or logcat letter, structured fields, and stack traces kept with their entry; ANSI colors shared
  with `<vt-terminal>`; level buttons with counts; search that filters entries; `write()` for live
  streaming with `follow` and a `max-entries` cap; `vt-filter-change` event.
- `<vt-chart>`: line, area, bar and donut charts from CSV, TSV or JSON, drawn with Apache ECharts
  6.1, loaded on demand from `dist/vendor/echarts.js`; series colors from the theme
  (`--vt-chart-1` … `--vt-chart-8`); keyboard reading of values with announcements; legend
  buttons; Chart / Table tabs; copy and download as CSV; `vt-select` event; `vendorUrl` option.
- `<vt-openapi>`: API references from OpenAPI 3.0 and 3.1 and Swagger 2.0 descriptions, in JSON or
  YAML (js-yaml loaded on demand from `dist/vendor/yaml.js`); endpoints grouped by tag,
  parameters, request bodies, responses, schema trees and generated examples; example requests
  with `<vt-http>`; sanitized Markdown descriptions; endpoint search; only local `$ref` followed.
- `<vt-env>`: dotenv, INI and Java `.properties` files read line by line (quotes, `export`,
  comments, sections, multiline values, `\uXXXX` escapes); `${VAR}` references linked to their
  row; secret values masked by key name in the table, raw view, search, copy and download until
  revealed (`mask-secrets`, `secret-keys`); Table / Raw tabs; search that filters entries.
- `<vt-hex>`: hex dumps from `src` (fetched as bytes), hex text (`xxd`, `hexdump -C`) or base64,
  and the `bytes` property; offset, hex and ASCII columns with `columns` and `group`; bytes colored
  by kind; file type from magic bytes; byte and text search; keyboard grid navigation; rows built
  as they scroll; copy as hex or base64 and download of the binary.
- `<vt-timeline>`: events from JSON or a Keep a Changelog file, grouped by day, month or year,
  with durations between events, kinds colored with theme tokens, kind buttons with counts,
  search that filters events, order toggle, folding descriptions in sanitized Markdown, `events`
  property, `vt-select` and `vt-filter-change` events.
- `<vt-job>`: jobs and CI runs from JSON (GitHub fields read too) or a text format; job progress
  bar, determinate or sliding, still under reduced motion; steps with status, duration, a small
  bar while running and their log with ANSI colors; failed steps open; search across logs;
  `update()`, `setStep()` and `appendLog()`; `vt-job-change` and `vt-step-toggle` events.
- `<vt-git>`: commit graphs from `git log --graph`, a pretty format with parents, `--oneline` or
  JSON; lanes computed from parents; branch, remote and tag labels; branch buttons; commit details
  with parents to jump to; search; listbox keyboard navigation; rows built as they scroll.
- `<vt-regex>`: patterns colored by part with matching parentheses, explained in words; matches and
  groups highlighted in the text; match table; `replace`; flag buttons; live editing; limits on
  text length, matches and time, and risky patterns run only on request; `vt-match` event.
- Component modules register their own interface strings with `defineStrings()`, so a module does
  not carry the strings of the others.
- `<vt-yaml>`: YAML shown with the `<vt-json>` tree, several documents (`---`), anchors, aliases
  and merge keys, highlighted raw view, errors with line and column, copy as JSON; js-yaml shared
  with `<vt-openapi>` and loaded on demand.
- `<vt-xml>`: XML read by its own parser, never into the page: elements, attributes, text,
  CDATA, comments, processing instructions, DOCTYPE and namespaces as a tree; declared entities
  never expanded and nothing fetched; XPath and node copy; indented raw view; inline XML in
  `<script type="application/xml">`.
- `<vt-toml>`: TOML 1.0 parser (tables, arrays of tables, inline tables, dotted keys, every
  string, number and date kind) with errors at line and column; typed tree; copy as JSON with
  exact integers.
- Website: the examples page lists its sections in a drop-down list.
- Website: search with Ctrl+K (Cmd+K on macOS), back to top button, typing animation on the home page, Legal page,
  redesigned typography and demo windows.
- `<vt-diff>`: previous / next change arrows with a counter, `n` / `p` keys, `nextChange()`,
  `previousChange()`, `goToChange()` and `vt-change-navigate`; the two editors of edit mode
  scroll to matching lines.
- Long code views (raw JSON, CSV, Markdown source, terminal output) build their lines in blocks
  as they scroll into view.
- `<vt-code>`: syntax highlighting (12 bundled languages, 181 more loaded on demand from a
  validated list), language detection, line numbers, start line, highlighted lines, diff mode,
  wrap toggle, collapsible code, tab size, search, copy and download.
- `<vt-markdown>`: GitHub Flavored Markdown sanitized with DOMPurify, raw HTML shown as text
  unless `allow-html` is set, Preview / Source / Split tabs, table of contents, heading anchors,
  image policy (`allow`, `block`, `same-origin`), external link policy, relative URLs resolved
  against `src`, highlighted and copyable code blocks.
- `<vt-json>`: iterative parser keeping exact numbers and duplicate keys, with a depth limit and
  precise error positions; raw view (indent, sorted keys) and collapsible tree (WAI-ARIA tree
  pattern, pagination of large containers, bounded "expand all", JSONPath bar, copy path and
  value, search inside collapsed nodes); `data` property.
- Shared features: simple and full variants with per-feature attributes, content from the
  `content` property, `src`, `<template>`, data `<script>` or text; `src` same-origin by default,
  streamed with a size limit, timeout and cancellation; loading, empty and error states; search
  bar; floating toolbar without header; `vt-*` events.
- Themes: `light`, `dark`, `dim`, `paper`, `high-contrast` and `auto`, all tested for WCAG AA
  contrast; `--vt-*` custom properties on any ancestor; `::part()`; `Vitrine.registerTheme()`
  with value validation; `design-tokens.json`.
- API: `defineAll()`, `render()`, `configure()`, `registerLocale()` (English and French shipped),
  `registerTheme()`, `getTheme()`, `listThemes()`.
- Security: strict CSP and Trusted Types support (`vitrine` policy), sanitizer self-test with a
  plain text fallback, safe download file names, validated attributes.
- Website with documentation, examples, playground, theme builder and stress lab, deployed to
  GitHub Pages; brand assets; design system and logo specification.
- Tests: unit tests, end-to-end tests in Chromium, Firefox and WebKit under a strict CSP, XSS
  payload suite, axe-core accessibility audits, website checks.
- Tooling: bundle size budget, Custom Elements Manifest, generated third-party notices, release
  workflow publishing `dist/` on release tags with SRI hashes.
