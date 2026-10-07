# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
