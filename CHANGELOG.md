# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
