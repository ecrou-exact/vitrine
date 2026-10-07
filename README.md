# Vitrine

> Drop-in web components to display code, Markdown and JSON beautifully — on any website, with zero framework.

[![CI](https://github.com/ecrou-exact/vitrine/actions/workflows/ci.yml/badge.svg)](https://github.com/ecrou-exact/vitrine/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Website:** https://ecrou-exact.github.io/vitrine/

> **Status:** early development. The components below are being built; APIs may change before v1.0.

## Features

- `<vt-code>` — syntax highlighting, line numbers, line highlighting, search, copy, download, diff.
- `<vt-markdown>` — sanitized GFM rendering, Preview / Source / Split tabs, table of contents, anchors.
- `<vt-json>` — pretty-printed or collapsible tree view, search, copy value and JSON path.
- **Simple** and **full** variants, with every feature individually toggleable.
- **Secure by default**: sanitized output, no `eval`, CSP-friendly, Trusted Types support.
- **Themable** with CSS custom properties and `::part()`, light and dark themes built in.
- Works with plain HTML, PHP, WordPress, Django, Vue, React, Svelte, Angular — **no Node.js required** for consumers.

## Quick start

### CDN (classic script)

```html
<script
  src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/vitrine.min.js"
  integrity="sha384-..."
  crossorigin="anonymous"
></script>

<vt-code language="python" line-numbers> def hello(name): return f"Hello {name}" </vt-code>
```

### ES module

```html
<script type="module">
  import { defineAll } from 'https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/vitrine.esm.js';
  defineAll();
</script>
```

### Git submodule

```bash
git submodule add https://github.com/ecrou-exact/vitrine.git vendor/vitrine
```

```html
<script src="/vendor/vitrine/dist/vitrine.min.js"></script>
```

SRI hashes are published in each release's notes.

## Components

| Element         | Description        | Docs                                                       |
| --------------- | ------------------ | ---------------------------------------------------------- |
| `<vt-code>`     | Source code viewer | [docs/components/code.md](docs/components/code.md)         |
| `<vt-markdown>` | Markdown renderer  | [docs/components/markdown.md](docs/components/markdown.md) |
| `<vt-json>`     | JSON viewer        | [docs/components/json.md](docs/components/json.md)         |

## Theming

Components render inside Shadow DOM and are customized with CSS custom properties
(`--vt-bg`, `--vt-fg`, `--vt-accent`, `--vt-font-mono`, `--vt-radius`, …) and `::part()` selectors.
See [docs/theming.md](docs/theming.md).

## Security

Untrusted content can be displayed safely: Markdown output is sanitized with DOMPurify, dangerous URL
schemes are blocked, styles use constructable stylesheets (no inline styles needed), and a `vitrine`
Trusted Types policy is created when supported. See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Browser support

Last 2 versions of Chrome, Edge, Firefox and Safari. Internet Explorer is not supported.

## Using with frameworks

Vitrine elements are standard Custom Elements. In Vue, tell the compiler to skip them:

```js
// vite.config.js
vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('vt-') } } });
```

React, Svelte and Angular work with the elements directly (Angular needs `CUSTOM_ELEMENTS_SCHEMA`).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## Credits & third-party licenses

Vitrine will bundle the following libraries. Full license texts are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

| Library                                                     | Use                    | License               |
| ----------------------------------------------------------- | ---------------------- | --------------------- |
| [highlight.js](https://github.com/highlightjs/highlight.js) | Syntax highlighting    | BSD-3-Clause          |
| [marked](https://github.com/markedjs/marked)                | Markdown parsing (GFM) | MIT                   |
| [DOMPurify](https://github.com/cure53/DOMPurify)            | HTML sanitization      | Apache-2.0 OR MPL-2.0 |

## License

[MIT](LICENSE)
