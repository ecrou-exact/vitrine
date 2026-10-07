# Vitrine documentation

Vitrine is a library of framework-free web components to display source code, Markdown and JSON on any web page: `<vt-code>`, `<vt-markdown>` and `<vt-json>`. Add one script, write the elements in your HTML, and they render with syntax highlighting, search, copy and themes. Content is displayed safely, even when it comes from untrusted sources.

## Guides

| Page                                                 | Contents                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [Getting started](getting-started.md)                | Installation (CDN, ES module, git submodule, self-hosting), first examples, content sources   |
| [Common attributes and events](common-attributes.md) | Attributes shared by all components, events, shared CSS parts                                 |
| [Theming](theming.md)                                | Built-in themes, design tokens, custom themes, `::part()` styling                             |
| [Configuration and API](configuration.md)            | `Vitrine.configure()`, locales, `Vitrine.render()`, `defineAll()` and the rest of the API     |
| [Security](security.md)                              | Sanitization, URL and image rules, `src` restrictions, Trusted Types, Content Security Policy |
| [Frameworks](frameworks.md)                          | Vue, React, Svelte, Angular, PHP, Django, WordPress, server-side rendering                    |
| [Accessibility](accessibility.md)                    | Keyboard support, focus, announcements, touch, reduced motion, contrast                       |

## Component reference

| Element         | Description                                                                                         | Reference                                        |
| --------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `<vt-code>`     | Source code with highlighting, line numbers, emphasized lines, diff, search, copy, download         | [components/code.md](components/code.md)         |
| `<vt-markdown>` | Sanitized GitHub Flavored Markdown with preview, source and split views, table of contents, anchors | [components/markdown.md](components/markdown.md) |
| `<vt-json>`     | JSON as highlighted text or a collapsible tree, with exact numbers, search and JSONPath             | [components/json.md](components/json.md)         |

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
