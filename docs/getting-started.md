# Getting started

Vitrine is a small library of standard web components that display and edit source code, Markdown, JSON, CSV, tags, diffs, terminal sessions, file trees and HTTP exchanges on any web page. It needs no framework and no build step: add one script, then use the `<vt-code>`, `<vt-markdown>`, `<vt-json>`, `<vt-csv>`, `<vt-tags>`, `<vt-diff>`, `<vt-terminal>`, `<vt-tree>` and `<vt-http>` elements in your HTML.

This page covers installation, a first example for each component, and the ways to give content to an element.

## Installation

The `dist/` folder contains:

| File                       | Format         | Behavior                                                                                                                                                                         |
| -------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dist/vitrine.min.js`      | Classic script | Every component in one file. Defines the nine elements automatically and exposes a global `Vitrine` object.                                                                      |
| `dist/vitrine.esm.js`      | ES module      | Every component in one file. Defines nothing by itself: import `defineAll()` and call it.                                                                                        |
| `dist/esm/vt-<name>.js`    | ES modules     | One module per component, which defines its element when imported. Code shared between components is in `dist/esm/chunks/`. See [Per-component modules](#per-component-modules). |
| `dist/esm/vitrine.js`      | ES module      | Every component, built from the same shared chunks as the per-component modules. Call `defineAll()`.                                                                             |
| `dist/languages/*.js`      | ES modules     | Syntax highlighting languages loaded on demand (see [Languages](#syntax-highlighting-languages)).                                                                                |
| `dist/syntax-themes/*.css` | CSS            | Syntax themes loaded on demand, and `index.json` listing them (see [Syntax themes](theming.md#syntax-themes)).                                                                   |

### CDN (classic script)

```html
<script src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/vitrine.min.js"></script>
```

The script defines the nine elements as soon as it runs, and exposes the API as `window.Vitrine` (for example `Vitrine.configure()` or `Vitrine.render()`).

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

The ES module does not create a global. Import what you need from it: `defineAll`, `configure`, `getConfig`, `render`, `registerTheme`, `registerLocale`, `listThemes`, `getTheme`, `BUILT_IN_THEMES`, `listSyntaxThemes`, `EVENTS`, `registry`, `version`, and the element classes `VtCode`, `VtMarkdown`, `VtJson`, `VtCsv`, `VtTags` and `VtDiff`. See [Configuration and API](configuration.md).

`defineAll()` is safe to call several times, and it skips elements that are already defined (for example by another copy of Vitrine on the same page).

### Per-component modules

To load only the elements a page uses, import their modules. Each one defines its element as soon as it is imported (unless an element with that name is already defined):

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-code.js"></script>
<script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-tags.js"></script>
```

The modules import shared chunks from `dist/esm/chunks/`, so code used by several components (the base element, the highlighter, the editor) is downloaded once. Each module also exports its element class and the shared API: `configure`, `getConfig`, `EVENTS`, `registerLocale`, `registerTheme`, `getTheme`, `listThemes`, `BUILT_IN_THEMES` and `listSyntaxThemes`. Configuration, themes and locales are shared by every element loaded this way.

```js
import { configure } from 'https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-markdown.js';

configure({ syntaxTheme: 'github', syntaxThemeDark: 'github-dark' });
```

`render`, `defineAll`, `registry` and `version` are only exported by the full modules. For every component as ES modules with the same shared chunks, import `dist/esm/vitrine.js` and call `defineAll()`. Do not mix the per-component modules with `dist/vitrine.esm.js` or `dist/vitrine.min.js` on the same page: they are separate builds that do not share code or configuration.

Download size (minified and gzipped), each module counted with every chunk it loads:

| File                                         | Size (gzip) |
| -------------------------------------------- | ----------- |
| `dist/vitrine.min.js`, `dist/vitrine.esm.js` | 125.4 KB    |
| `dist/esm/vt-code.js`                        | 56.5 KB     |
| `dist/esm/vt-markdown.js`                    | 74.9 KB     |
| `dist/esm/vt-json.js`                        | 60.7 KB     |
| `dist/esm/vt-csv.js`                         | 57.5 KB     |
| `dist/esm/vt-tags.js`                        | 28.1 KB     |
| `dist/esm/vt-diff.js`                        | 63.3 KB     |
| `dist/esm/vt-terminal.js`                    | 59.5 KB     |
| `dist/esm/vt-tree.js`                        | 59.0 KB     |
| `dist/esm/vt-http.js`                        | 64.1 KB     |

These are the sizes of the current build, measured by `npm run size`, which fails when a file goes over its budget (128 KB for the full bundles; 58, 76, 62, 60, 32, 64, 60, 60 and 66 KB for the modules above). Language files and syntax themes are loaded on demand and are not included. Loading two modules downloads their shared chunks only once, so the total is less than the sum.

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

Copy the `dist/` folder of a release (from the release tag) to your server. Keep its structure: the `languages/` and `syntax-themes/` folders next to the scripts, and `esm/` with its `chunks/` folder:

```text
your-site/
  assets/vitrine/
    vitrine.min.js
    vitrine.esm.js
    esm/
      vt-code.js
      vt-tags.js
      ...
      chunks/
    languages/
      rust.js
      go.js
      ...
    syntax-themes/
      github.css
      index.json
      ...
```

The `.map` files are optional source maps.

### Syntax highlighting languages

Ten languages are bundled in the main script and work immediately: `bash`, `diff`, `javascript`, `json`, `markdown`, `plaintext`, `python`, `shell`, `xml` (also used for HTML) and `yaml`.

Every other highlight.js language (183 more) is a separate file in `dist/languages/`, loaded the first time an element needs it. Vitrine finds that folder automatically:

- the classic script looks for `languages/` next to its own URL (`document.currentScript.src`);
- the ES module looks for `languages/` next to its own URL (`import.meta.url`);
- the modules in `dist/esm/` look for `languages/` in the parent `dist/` folder.

Syntax themes are found the same way, in `syntax-themes/` (setting: `syntaxThemesUrl`).

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

### CSV

```html
<vt-csv variant="full" label="scores.csv">
  <template>
    name,score
    Ada,98
    Alan,95
  </template>
</vt-csv>
```

### Tags

```html
<form>
  <vt-tags name="topics" mode="edit" prefix="#">
    <template>{ "value": ["design"], "options": ["design", "research", "a11y"] }</template>
  </vt-tags>
</form>
```

### Diff

```html
<vt-diff variant="full" language="js">
  <template data-original>const a = 1;</template>
  <template data-modified>const a = 2;</template>
</vt-diff>
```

### Terminal

```html
<vt-terminal variant="full" label="Install">
  <template>
    $ npm install vitrine
    added 1 package in 2s
  </template>
</vt-terminal>
```

### Tree

```html
<vt-tree variant="full" label="my-app">
  <template>
    src/
      app.ts
    package.json  # scripts and dependencies
  </template>
</vt-tree>
```

### HTTP

```html
<vt-http variant="full" label="Get a task">
  <template>
    GET https://api.example.com/v1/tasks/981
    Accept: application/json
  </template>
</vt-http>
```

### Editing

Any component can become an editor:

```html
<vt-markdown mode="edit" variant="full">
  <script type="text/markdown"># Draft</script>
</vt-markdown>
```

See [Editing](editing.md).

### Simple and full variants

Every element has two presets, selected with the `variant` attribute:

- `simple` (default): only the content, with no header bar.
- `full`: a header with a title, a badge and action buttons (copy, search, download, full screen…), plus component-specific extras such as tabs or a table of contents.

A variant is only a shortcut for a set of features. Any individual feature attribute overrides the preset, in either variant:

```html
<!-- Full variant, without the search button -->
<vt-code variant="full" search="false" language="js">console.log('hi');</vt-code>

<!-- Simple variant, plus a copy button -->
<vt-code copy language="js">console.log('hi');</vt-code>
```

The features of each preset are listed in [Presets are shortcuts](common-attributes.md#presets-are-shortcuts) and in each component reference.

## Content sources

An element reads its content from the first available source, in this order:

1. The `content` property (or the `data` property of `<vt-json>` and `<vt-tree>`, or the `exchange` property of `<vt-http>`), set from JavaScript. `<vt-diff>` also has `original` and `modified`, and `<vt-tags>` has `value` and `options`.
2. The `src` attribute: a URL fetched by Vitrine.
3. A child `<template>`, or a child `<script>` with a non-executable data type: `text/plain`, `text/markdown`, `text/x-markdown`, `application/json` or `text/json` (whichever comes first among the children).
4. The text of the element itself.

Setting the `content` property overrides `src` and inline content. Setting it back to `null` (or `undefined`) returns to `src` or inline content.

> **Warning: inline content is not safe for untrusted data.**
> Everything written inside the element (sources 3 and 4) is parsed by the browser as part of your page HTML _before_ Vitrine runs. Vitrine cannot sanitize what the browser has already parsed. Never write user-provided or third-party data inside the element. Pass untrusted data through the `content` property (or `data` for `<vt-json>` and `<vt-tree>`, `exchange` for `<vt-http>`), or load it with `src`.
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

While content loads from `src`, the element shows a loading placeholder. If content cannot be loaded or displayed, it shows an inline error message and dispatches a `vt-error` event. Empty content shows "Nothing to display" (`<vt-tags>` shows "No tags" in view mode). Content longer than the configured `maxSize` (2 MiB of characters by default) is refused with an error.

## Next steps

- [Common attributes and events](common-attributes.md)
- Component references: [`<vt-code>`](components/code.md), [`<vt-markdown>`](components/markdown.md), [`<vt-json>`](components/json.md), [`<vt-csv>`](components/csv.md), [`<vt-tags>`](components/tags.md), [`<vt-diff>`](components/diff.md), [`<vt-terminal>`](components/terminal.md), [`<vt-tree>`](components/tree.md), [`<vt-http>`](components/http.md)
- [Editing](editing.md)
- [Theming](theming.md) and [Configuration](configuration.md)
- [Security](security.md) before displaying untrusted content
