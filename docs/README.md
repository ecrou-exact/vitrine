# Vitrine documentation

Vitrine is a library of framework-free web components to display and edit source code, Markdown, JSON, CSV, tags and diffs on any web page: `<vt-code>`, `<vt-markdown>`, `<vt-json>`, `<vt-csv>`, `<vt-tags>` and `<vt-diff>`. Add one script, write the elements in your HTML, and they render with syntax highlighting, search, copy and themes. Every component can switch to an editor, and `<vt-tags>` works as a form field. Content is displayed safely, even when it comes from untrusted sources.

## Guides

| Page                                                 | Contents                                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [Getting started](getting-started.md)                | Installation (CDN, ES modules, per-component modules, git submodule, self-hosting), sizes, first examples, content sources |
| [Common attributes and events](common-attributes.md) | Attributes shared by all components, presets, full screen, events, shared CSS parts                                        |
| [Editing](editing.md)                                | Edit mode, keyboard, undo history, editing events, reading the edited value                                                |
| [Theming](theming.md)                                | Built-in themes, syntax themes, design tokens, custom themes, `::part()` styling                                           |
| [Configuration and API](configuration.md)            | `Vitrine.configure()`, locales, `Vitrine.render()`, `defineAll()` and the rest of the API                                  |
| [Security](security.md)                              | Sanitization, URL and image rules, `src` restrictions, Trusted Types, Content Security Policy                              |
| [Frameworks](frameworks.md)                          | Vue, React, Svelte, Angular, HTML forms, backend suggestions, PHP, Django, WordPress, server-side rendering                |
| [Accessibility](accessibility.md)                    | Keyboard support, focus, announcements, touch, reduced motion, contrast                                                    |

## Component reference

| Element         | Description                                                                                                      | Reference                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `<vt-code>`     | Source code with highlighting, line numbers, emphasized lines, diff, search, copy, download                      | [components/code.md](components/code.md)         |
| `<vt-markdown>` | Sanitized GitHub Flavored Markdown with preview, source and split views, scroll sync, table of contents, anchors | [components/markdown.md](components/markdown.md) |
| `<vt-json>`     | JSON as highlighted text or a collapsible tree, with exact numbers, search and JSONPath                          | [components/json.md](components/json.md)         |
| `<vt-csv>`      | CSV and TSV as a typed, sortable, paginated and searchable table                                                 | [components/csv.md](components/csv.md)           |
| `<vt-tags>`     | Tags as chips, and a tag field for forms with autocompletion, creation rules and backend suggestions             | [components/tags.md](components/tags.md)         |
| `<vt-diff>`     | Comparison of two texts or a unified patch, side by side or unified, with word-level changes                     | [components/diff.md](components/diff.md)         |

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
