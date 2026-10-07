# Getting started

Vitrine is a small library of standard web components that display source code, Markdown and JSON on any web page. It needs no framework and no build step: add one script, then use the `<vt-code>`, `<vt-markdown>` and `<vt-json>` elements in your HTML.

This page covers installation, a first example for each component, and the ways to give content to an element.

## Installation

Vitrine ships two builds in the `dist/` folder:

| File                  | Format         | Behavior                                                                                          |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------- |
| `dist/vitrine.min.js` | Classic script | Defines the three elements automatically and exposes a global `Vitrine` object.                   |
| `dist/vitrine.esm.js` | ES module      | Defines nothing by itself: import `defineAll()` and call it.                                      |
| `dist/languages/*.js` | ES modules     | Syntax highlighting languages loaded on demand (see [Languages](#syntax-highlighting-languages)). |

### CDN (classic script)

```html
<script src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/vitrine.min.js"></script>
```

The script defines `<vt-code>`, `<vt-markdown>` and `<vt-json>` as soon as it runs, and exposes the API as `window.Vitrine` (for example `Vitrine.configure()` or `Vitrine.render()`).

Each GitHub release lists SRI hashes for the release files. If you add an `integrity` attribute, pin an exact version (`@1.2.3`) instead of `@1`, because the hash changes with every release:

```html
<script
  src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1.2.3/dist/vitrine.min.js"
  integrity="sha384-HASH-FROM-THE-RELEASE-NOTES"
  crossorigin="anonymous"
></script>
```

### CDN (ES module)

```html
<script type="module">
  import { defineAll } from 'https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/vitrine.esm.js';

  defineAll();
</script>
```

The ES module does not create a global. Import what you need from it: `defineAll`, `configure`, `getConfig`, `render`, `registerTheme`, `registerLocale`, `listThemes`, `getTheme`, `BUILT_IN_THEMES`, `EVENTS`, `registry`, `version`, and the element classes `VtCode`, `VtMarkdown` and `VtJson`. See [Configuration and API](configuration.md).

`defineAll()` is safe to call several times, and it skips elements that are already defined (for example by another copy of Vitrine on the same page).

### Git submodule

The `main` branch does not contain build output. The `dist/` folder exists only in the release commits that the `vX.Y.Z` tags point to, so check out a release tag after adding the submodule:

```bash
git submodule add https://github.com/ecrou-exact/vitrine.git vendor/vitrine
git -C vendor/vitrine checkout vX.Y.Z
```

Then load the script from your own server:

```html
<script src="/vendor/vitrine/dist/vitrine.min.js"></script>
```

### Self-hosting

Copy the `dist/` folder of a release (from the release tag) to your server. Keep the `languages/` folder next to the scripts:

```text
your-site/
  assets/vitrine/
    vitrine.min.js
    vitrine.esm.js
    languages/
      rust.js
      go.js
      ...
```

The `.map` files are optional source maps.

### Syntax highlighting languages

Ten languages are bundled in the main script and work immediately: `bash`, `diff`, `javascript`, `json`, `markdown`, `plaintext`, `python`, `shell`, `xml` (also used for HTML) and `yaml`.

Every other highlight.js language (183 more) is a separate file in `dist/languages/`, loaded the first time an element needs it. Vitrine finds that folder automatically:

- the classic script looks for `languages/` next to its own URL (`document.currentScript.src`);
- the ES module looks for `languages/` next to its own URL (`import.meta.url`).

If the language files live somewhere else (for example when you bundle Vitrine with your own build tool), set the base URL explicitly:

```js
Vitrine.configure({ languagesUrl: 'https://static.example.com/vitrine/languages/' });
```

If a language file cannot be loaded, the code is shown without highlighting and a warning is logged in the console. Only names that exist in the built-in language index are ever turned into a URL; an unknown `language` value never causes a request.

## First examples

### Code

```html
<vt-code language="python" line-numbers>
  def hello(name):
      return f"Hello {name}"
</vt-code>
```

### Markdown

```html
<vt-markdown>
  <script type="text/markdown">
    # Release notes

    - Faster search
    - **New** dim theme
  </script>
</vt-markdown>
```

### JSON

```html
<vt-json variant="full" label="user.json">
  <script type="application/json">
    { "name": "Ada", "languages": ["en", "fr"], "admin": true }
  </script>
</vt-json>
```

### Simple and full variants

Every element has two presets, selected with the `variant` attribute:

- `simple` (default): only the content, with no header bar.
- `full`: a header with a title, a badge and action buttons (copy, search, download…), plus component-specific extras such as tabs or a table of contents.

Any individual feature attribute overrides the preset:

```html
<!-- Full variant, without the search button -->
<vt-code variant="full" search="false" language="js">console.log('hi');</vt-code>

<!-- Simple variant, plus a copy button -->
<vt-code copy language="js">console.log('hi');</vt-code>
```

The exact presets are listed in each component reference: [code](components/code.md), [markdown](components/markdown.md), [json](components/json.md).

## Content sources

An element reads its content from the first available source, in this order:

1. The `content` property (or the `data` property of `<vt-json>`), set from JavaScript.
2. The `src` attribute: a URL fetched by Vitrine.
3. A child `<template>`, or a child `<script>` with a non-executable data type: `text/plain`, `text/markdown`, `text/x-markdown`, `application/json` or `text/json` (whichever comes first among the children).
4. The text of the element itself.

Setting the `content` property overrides `src` and inline content. Setting it back to `null` (or `undefined`) returns to `src` or inline content.

> **Warning: inline content is not safe for untrusted data.**
> Everything written inside the element (sources 3 and 4) is parsed by the browser as part of your page HTML _before_ Vitrine runs. Vitrine cannot sanitize what the browser has already parsed. Never write user-provided or third-party data inside the element. Pass untrusted data through the `content` property (or `data` for `<vt-json>`), or load it with `src`.
>
> For the same reason, a `</script>` sequence inside a `<script type="text/plain">` block closes the block early, and whatever follows is parsed as page HTML.

### The `content` property (recommended for dynamic data)

```html
<vt-code id="snippet" language="js"></vt-code>
```

```js
const element = document.getElementById('snippet');
element.content = userProvidedCode; // displayed as text, never parsed as HTML
```

For `<vt-json>`, you can also pass a JavaScript value:

```js
document.querySelector('vt-json').data = { id: 1, tags: ['a', 'b'] };
```

Reading `content` returns the text currently displayed (an empty string while loading or after an error).

### The `src` attribute

```html
<vt-markdown src="/docs/intro.md"></vt-markdown>
<vt-code src="/examples/server.py" language="python"></vt-code>
```

By default, only same-origin `http:` and `https:` URLs are allowed. Add `allow-remote` to load from another origin (the server must allow it with CORS). Requests are limited in size and time. See [Common attributes](common-attributes.md#src-and-allow-remote) and [Security](security.md#loading-content-with-src).

Changing `src` starts a new request and cancels the previous one; only the latest response is displayed.

### A child `<script>` block

Use a data `<script>` for code that contains `<`, `&` or HTML tags. The browser does not parse markup inside it, and Vitrine reads its text as is:

```html
<vt-code language="html">
  <script type="text/plain">
    <ul>
      <li>a < b && c</li>
    </ul>
  </script>
</vt-code>
```

The `type` must be one of the data types listed above. A `<script>` without a type (or with an executable type) is run by the browser like any other script before Vitrine sees it.

### A child `<template>`

A template is read in one of two ways:

- If it contains markup (at least one element), its HTML source is used: `<template><b>x</b></template>` displays `<b>x</b>`. The browser has already parsed this markup, so the text you get is the browser's serialization of it (attribute quoting and entities may be normalized).
- If it contains only text, the text is used: `<template>if (a &lt; b)</template>` displays `if (a < b)`.

```html
<vt-code language="html">
  <template>
    <button class="primary" type="button">Save</button>
  </template>
</vt-code>
```

### Element text

Plain text written directly inside the element is used last. HTML entities are decoded, and any child elements contribute only their text:

```html
<vt-json>{"compact": [1, 2, 3], "ok": true}</vt-json>
```

### Indentation and line endings

Inline content (template, data script, element text) is dedented: the common leading indentation is removed, and blank lines at the start and end are trimmed. This lets you indent content naturally in your HTML.

Content from every source has its line endings normalized (`\r\n` and `\r` become `\n`).

When no `content` property and no `src` are set, Vitrine watches the element's children: editing the inline content re-renders the element.

## States

While content loads from `src`, the element shows a loading placeholder. If content cannot be loaded or displayed, it shows an inline error message and dispatches a `vt-error` event. Empty content shows "Nothing to display". Content longer than the configured `maxSize` (2 MiB of characters by default) is refused with an error.

## Next steps

- [Common attributes and events](common-attributes.md)
- Component references: [`<vt-code>`](components/code.md), [`<vt-markdown>`](components/markdown.md), [`<vt-json>`](components/json.md)
- [Theming](theming.md) and [Configuration](configuration.md)
- [Security](security.md) before displaying untrusted content
