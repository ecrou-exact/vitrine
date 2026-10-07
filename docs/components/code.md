# `<vt-code>`

`<vt-code>` displays a block of source code with syntax highlighting, optional line numbers, emphasized lines, soft wrapping, diff rendering, search, copy and download.

```html
<vt-code language="python" line-numbers>
  def hello(name):
      return f"Hello {name}"
</vt-code>
```

The code is always inserted as text. It is never parsed as HTML, whatever the language.

## Variants

| Feature            | `simple` (default) | `full` |
| ------------------ | ------------------ | ------ |
| `header`           | off                | on     |
| `dot`              | off                | on     |
| `copy`             | off                | on     |
| `search`           | off                | on     |
| `download`         | off                | on     |
| `line-numbers`     | off                | on     |
| Wrap toggle button | off                | on     |

Every feature can be turned on or off individually, whatever the variant:

```html
<vt-code variant="full" download="false" line-numbers="false" language="js">
  export const answer = 42;
</vt-code>
```

## Attributes

This table lists the attributes specific to `<vt-code>`. The shared attributes (`variant`, `theme`, `src`, `allow-remote`, `max-height`, `copy`, `search`, `download`, `header`, `dot`, `label`, `title`, `lang-ui`) are described in [Common attributes](../common-attributes.md).

| Attribute         | Type                           | Default             | Description                                                                 |
| ----------------- | ------------------------------ | ------------------- | --------------------------------------------------------------------------- |
| `language`        | language name, alias or `auto` | none (plain text)   | Highlighting language.                                                      |
| `line-numbers`    | boolean                        | preset              | Shows line numbers in a gutter.                                             |
| `start-line`      | integer                        | `1`                 | Number of the first line.                                                   |
| `highlight-lines` | line list                      | none                | Lines to emphasize, for example `2,5-8`.                                    |
| `wrap`            | boolean                        | off                 | Soft-wraps long lines.                                                      |
| `wrap-toggle`     | boolean                        | preset              | Shows the "Toggle line wrap" button.                                        |
| `collapsible`     | integer                        | none                | Collapses the code after this many lines, with a "Show all" button.         |
| `diff`            | boolean                        | off                 | Renders a unified diff with added and removed lines.                        |
| `tab-size`        | integer, 1 to 16               | `--vt-tab-size` (4) | Width of a tab character, in spaces.                                        |
| `download`        | boolean or file name           | preset              | Download button; a value other than `true`, `on` or `yes` is the file name. |

### `language`

A language name or alias, case-insensitive: `python`, `py`, `js`, `javascript`, `html`, `ts`, `rust`, `go`… All highlight.js languages are supported (193 names, plus their aliases). `text` and `plain` are aliases of `plaintext`.

- **Bundled languages** highlight immediately: `bash`, `diff`, `javascript`, `json`, `markdown`, `plaintext`, `python`, `shell`, `xml` (HTML) and `yaml`.
- **Other languages** are loaded on demand from the `languages/` folder (see [Getting started](../getting-started.md#syntax-highlighting-languages)). The code is shown as plain text until the file arrives, then highlighted.
- **Unknown names** show the code as plain text, with the requested name in the badge (cut to 24 characters). They never trigger a network request.
- **No `language`** shows plain text with no badge.

The header badge shows the language's display name (for example `JavaScript`, `Python`, `HTML`).

#### Automatic detection

`language="auto"` detects the language among the languages currently available (the bundled ones and any language already loaded on the page). Detection looks at the first 4,000 characters and falls back to plain text when the result is not confident. Content longer than the `highlightLimit` setting is not analyzed.

```html
<vt-code language="auto" variant="full">
  import os

  def main():
      print(os.getcwd())
</vt-code>
```

### `line-numbers` and `start-line`

Line numbers are drawn in a gutter that stays visible when scrolling horizontally. They are not part of the copied or selected text, and are hidden from screen readers.

`start-line` accepts any integer between -1,000,000,000 and 1,000,000,000. Invalid values use `1`.

```html
<vt-code language="js" line-numbers start-line="120">
  function retry(task, attempts = 3) {
    return task().catch((error) => (attempts > 1 ? retry(task, attempts - 1) : Promise.reject(error)));
  }
</vt-code>
```

### `highlight-lines`

A comma-separated list of line numbers and ranges. Numbers refer to the displayed line numbers, so they take `start-line` into account.

- `3` emphasizes line 3; `5-8` emphasizes lines 5 to 8; `2,5-8,12` combines them.
- Reversed ranges are accepted (`8-5` is `5-8`). Overlapping ranges are merged.
- Invalid parts are ignored. Each number has at most 9 digits, at most 500 ranges are kept, and values longer than 10,000 characters are ignored.

```html
<vt-code language="python" line-numbers start-line="10" highlight-lines="11,13-14">
  def total(items):
      result = 0
      for item in items:
          result += item.price
      return result
</vt-code>
```

Highlighted lines get the `line-highlighted` part and the `--vt-line-highlight` background.

### `wrap` and the wrap toggle

`wrap` soft-wraps long lines instead of scrolling horizontally. In the full variant, a "Toggle line wrap" button (with `aria-pressed`) lets the reader switch wrapping on and off. The button's state is reset when the `wrap` attribute changes.

The button follows the `wrap-toggle` feature: on in the full variant, off in the simple one. Set `wrap-toggle="false"` to hide it in the full variant, or `wrap-toggle` to show it in the simple variant. Unlike the other attributes, `wrap-toggle` is not observed: a change is applied at the next render (for example when the content or another attribute changes).

### `collapsible`

`collapsible="N"` shows the first N lines with a fade and a "Show all X lines" button. N must be between 1 and 100,000. Code is only collapsed when it has more than N + 1 lines, so the button never reveals a single hidden line.

Searching expands collapsed code automatically, so matches are never hidden. Once expanded, the code stays expanded until the content or the `collapsible` attribute changes.

```html
<vt-code language="yaml" collapsible="8" src="/config/app.yml"></vt-code>
```

### `diff`

`diff` renders a unified diff. Each line is classified by its first character:

| Line                                                                           | Display                                                                                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Starts with `@@`                                                               | Hunk header                                                                                             |
| Starts with `diff `, `index `, `+++ ` or `--- ` (or is exactly `+++` or `---`) | Meta line                                                                                               |
| Starts with `+`                                                                | Added line: the `+` is removed from the code and shown as a sign, with the `--vt-diff-added` background |
| Starts with `-`                                                                | Removed line: the `-` is removed and shown as a sign, with the `--vt-diff-removed` background           |
| Anything else                                                                  | Context line; a single leading space is removed                                                         |

Without a `language`, the badge shows `diff` and the code is not highlighted. With a `language`, the code (without the signs) is highlighted in that language:

```html
<vt-code diff language="js" line-numbers label="greet.js">
  <script type="text/plain">
    @@ -1,3 +1,3 @@
     const a = 1;
    -const b = 2;
    +const b = 3;
  </script>
</vt-code>
```

This is different from `language="diff"`, which highlights a diff as text with the highlight.js diff grammar, without the added and removed line backgrounds.

Copying or downloading copies the original text, signs included.

### `tab-size`

An integer from 1 to 16. When absent or invalid, the `--vt-tab-size` custom property is used (default 4).

## Properties

| Property  | Type     | Description                                                                                                           |
| --------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `content` | `string` | The code. Setting it overrides `src` and inline content; `null` restores them. Reading it returns the displayed text. |

```js
const viewer = document.querySelector('vt-code');
viewer.setAttribute('language', 'json');
viewer.content = JSON.stringify(payload, null, 2);
```

## Events

| Event       | `detail`             | When                                       |
| ----------- | -------------------- | ------------------------------------------ |
| `vt-ready`  | `{ type: "code" }`   | The code was rendered                      |
| `vt-copy`   | `{ text }`           | The code was copied                        |
| `vt-search` | `{ query, matches }` | A search ran                               |
| `vt-error`  | `{ message, cause }` | Loading failed or the content is too large |

See [Events](../common-attributes.md#events).

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part                    | Element                                                 |
| ----------------------- | ------------------------------------------------------- |
| `code`                  | The `<pre>` element                                     |
| `line`                  | One line of code                                        |
| `line-highlighted`      | A line listed in `highlight-lines` (it also has `line`) |
| `gutter`, `line-number` | The line number cell (two names for the same element)   |
| `wrap-button`           | The wrap toggle button                                  |
| `show-more`             | The "Show all X lines" button                           |

```css
vt-code::part(line-highlighted) {
  box-shadow: inset 3px 0 0 #f2a93b;
}

vt-code::part(gutter) {
  opacity: 0.6;
}
```

## Keyboard

| Element      | Keys                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| Code area    | Focusable with Tab; arrow keys scroll it                                  |
| Buttons      | Tab to reach, Enter or Space to activate                                  |
| Search field | Enter, Shift+Enter, Escape (see [search](../common-attributes.md#search)) |

## Limits

| Limit                      | Value                                                                                                  | Configurable                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Maximum content size       | 2,097,152 characters (2 MiB)                                                                           | `maxSize` (up to 50 MiB)       |
| Syntax highlighting        | Skipped above 300,000 characters, with the notice "Content is large: syntax highlighting is disabled." | `highlightLimit` (up to 5 MiB) |
| Language detection sample  | First 4,000 characters                                                                                 | No                             |
| Search query               | 200 characters                                                                                         | No                             |
| Highlighted search matches | 5,000                                                                                                  | No                             |
| `highlight-lines`          | 500 ranges, values up to 10,000 characters                                                             | No                             |
| `collapsible`              | 1 to 100,000 lines                                                                                     | No                             |
| `tab-size`                 | 1 to 16                                                                                                | No                             |

See [Configuration](../configuration.md).

## Examples

### A file with a header

```html
<vt-code variant="full" label="docker-compose.yml" language="yaml" highlight-lines="4">
  services:
    web:
      image: nginx:1.27
      ports:
        - "8080:80"
</vt-code>
```

### HTML source

Use a data `<script>` (or a `<template>`) so the browser does not render the markup:

```html
<vt-code language="html" variant="full">
  <script type="text/plain">
    <form method="post" action="/login">
      <input name="user" autocomplete="username">
      <button>Sign in</button>
    </form>
  </script>
</vt-code>
```

### Code from a file, with a height limit

```html
<vt-code src="/examples/server.go" language="go" line-numbers max-height="24rem"></vt-code>
```

### User-provided code

```js
const viewer = document.createElement('vt-code');
viewer.setAttribute('language', 'auto');
viewer.setAttribute('copy', '');
viewer.content = textarea.value;
document.querySelector('#preview').replaceChildren(viewer);
```

### Created with `Vitrine.render()`

```js
Vitrine.render(document.querySelector('#target'), {
  type: 'code',
  content: source,
  variant: 'full',
  options: { language: 'python', highlightLines: '2-3', label: 'example.py' },
});
```
