# `<vt-diff>`

`<vt-diff>` compares two texts, or displays a unified patch (for example the output of `git diff`), side by side or in one column. Changed words are marked inside modified lines, unchanged regions are folded, and the comparison can be copied or downloaded as a standard unified patch.

```html
<vt-diff language="js" variant="full" label="config.js">
  <template data-original>
    const retries = 3;
    const timeout = 1000;
  </template>
  <template data-modified>
    const retries = 5;
    const timeout = 1000;
  </template>
</vt-diff>
```

Lines are compared with the Myers algorithm (the one used by `git diff`). Text is inserted with DOM text APIs, and highlighted code goes through the same sanitized highlighter as `<vt-code>`.

## Variants

| Feature                         | `simple` (default) | `full`  |
| ------------------------------- | ------------------ | ------- |
| Initial view (`view`)           | `unified`          | `split` |
| `header`                        | off                | on      |
| `dot`                           | off                | on      |
| `copy`                          | off                | on      |
| `search`                        | off                | on      |
| `download`                      | off                | on      |
| `tabs` (Side by side / Unified) | off                | on      |
| `line-numbers`                  | on                 | on      |
| `fullscreen`                    | off                | on      |

Every feature can be turned on or off individually, whatever the variant.

## Two texts or a patch

`<vt-diff>` works in one of two modes.

### Comparing two texts

Give the original and the modified text in any of these ways. For each side, the first one available wins:

1. the `original` and `modified` properties;
2. the `original-src` and `modified-src` attributes (URLs);
3. a child `<template data-original>` and `<template data-modified>` (or data `<script>` elements with these attributes).

As soon as one side is given, the element compares two texts; a missing side is an empty text (everything added, or everything removed).

```js
const diff = document.querySelector('vt-diff');
diff.original = savedVersion;
diff.modified = editor.value;
```

```html
<vt-diff original-src="/api/doc/12/v1.md" modified-src="/api/doc/12/v2.md" language="markdown"></vt-diff>
```

`original-src` and `modified-src` follow the rules of `src`: same-origin unless `allow-remote`, `maxSize` and `fetchTimeout` limits (see [`src`](../common-attributes.md#src-and-allow-remote)). The loading placeholder is shown until both have arrived; a failure shows the error and dispatches `vt-error`. Changing either attribute loads both again. Each text is limited to `maxSize` characters.

Setting `original` or `modified` to `null` returns that side to its URL or inline template.

### Displaying a patch

When no side is given, the content of the element (the `content` property, `src`, a child template or data script without `data-original` / `data-modified`, or the element text) is read as a unified patch:

```html
<vt-diff variant="full" src="/api/pulls/42.diff"></vt-diff>
```

```js
document.querySelector('vt-diff').content = await (await fetch('/changes.patch')).text();
```

Patch reading rules:

- Lines before the first `@@ -a,b +c,d @@` hunk header are headers. `--- name` and `+++ name` give the file names used by copy and download. A `diff ` line starts a new file header; `index ` lines are skipped.
- Inside a hunk, lines starting with `+` are added, lines starting with `-` are removed, and other lines are context (one leading space removed). `\ No newline at end of file` markers are skipped.
- Line numbers start from the hunk header. When the line numbers jump between two hunks, a `⋯` row marks the lines that are not in the patch.

Each change is listed with its old and new line numbers, so the same patch can be shown side by side or in one column.

## Views

| View      | Layout                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `split`   | Side by side: original on the left, modified on the right. Within a change block, the first removed line is paired with the first added line, and so on. Long lines always wrap. |
| `unified` | One column: old and new line numbers, then the sign and the line. Long lines scroll horizontally unless `wrap` is set.                                                           |

`tabs` shows Side by side and Unified tabs, and dispatches `vt-tab-change` with `{ tab: "split" }` or `{ tab: "unified" }`. Changing the `view` attribute resets the user's choice.

```html
<vt-diff view="split" tabs language="python" src="/review/patch.diff"></vt-diff>
```

When the texts are identical (or the patch has no change), "No differences" is shown.

### Header badge

The badge shows the number of added and removed lines, for example `+12 −3`. Set `badge="false"` to hide it.

## Context folding

`context` sets how many unchanged lines are kept around each change (default `3`, from 0 to 1000). Longer unchanged regions are replaced by a "Show 24 unchanged lines" button that expands that region. A region is folded only when at least 2 lines would be hidden. At the start and the end of the text, no unchanged lines are kept on the outer side.

`context="all"` (or `-1`) shows every line.

```html
<vt-diff context="1" ...></vt-diff>
<vt-diff context="all" ...></vt-diff>
```

Expanded regions are folded again when the texts, the patch or `context` change.

## Word-level changes

Inside a change block (consecutive removed and added lines), removed and added lines are paired in order: the first removed line with the first added line, and so on. In each pair, the changed words are marked (part `word-change`) when the two lines are related:

- both lines are at most 1,000 characters long;
- lines are split into words, spaces and single punctuation characters, and compared with at most 200 edits;
- the unchanged part is at least 40% of the longer line.

Lines that have little in common are a replacement, not an edit, so they get no word marks. A line that changed entirely gets no word marks either. Unpaired lines (more additions than removals, for example) are only marked as added or removed.

## Large comparisons

The line comparison computes at most 2,000 edits exactly. Beyond that, the changed region (between the common first and last lines) is shown as one block of removed lines followed by one block of added lines, with the notice "Many changes: the comparison is simplified to removed and added blocks."

Syntax highlighting is skipped for a side longer than the `highlightLimit` setting.

## Copy and download

Both produce a unified patch, also available as the `patch` property:

```diff
--- original
+++ modified
@@ -1,2 +1,2 @@
-const retries = 3;
+const retries = 5;
 const timeout = 1000;
```

- File names come from `original-label` and `modified-label` (default `original` and `modified`). For a patch given as content, the names from its `---` and `+++` lines are used when present.
- Hunks always keep 3 lines of context, whatever the `context` attribute.
- The copy button is named "Copy patch". `download` saves the patch as `text/x-diff`; the file name is the value of the `download` attribute, else a `label` or `title` that ends with an extension, else `changes.diff`.
- When there is no change, the patch is empty.
- For a patch given as content, the copied patch is rebuilt from the lines it contains: hunk line numbers are counted from the first line of the patch, not taken from its `@@` headers.

```html
<vt-diff variant="full" label="settings.diff" original-label="a/settings.json" modified-label="b/settings.json" language="json"></vt-diff>
```

## Editing

With `mode="edit"`, editors appear above the comparison:

- when comparing two texts, one editor labeled "Original" and one labeled "Modified", side by side (stacked when the element is 640px wide or less);
- otherwise, one "Patch" editor.

The comparison, the badge and an open search are updated 200 ms after typing stops. Undo and redo apply to the editor that last had focus. Editing a side sets the `original` or `modified` property, so it takes priority over `original-src` and inline templates; editing a patch sets `content`.

`vt-input` and `vt-change` have this `detail`:

| Mode      | `detail`                                                            |
| --------- | ------------------------------------------------------------------- |
| Two texts | `{ value, original, modified }`, where `value` is the unified patch |
| Patch     | `{ value }`, the patch text                                         |

An empty `<vt-diff mode="edit">` shows an empty patch editor. See [Editing](../editing.md).

```html
<vt-diff mode="edit" variant="full" language="js" id="review"></vt-diff>
```

```js
const review = document.getElementById('review');
review.original = 'const a = 1;\n';
review.modified = 'const a = 2;\n';
review.addEventListener('vt-change', (event) => save(event.detail.modified));
```

## Attributes

This table lists the attributes specific to `<vt-diff>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute        | Type                        | Default                            | Description                                                    |
| ---------------- | --------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| `language`       | language name or alias      | none (plain text)                  | Syntax highlighting of both sides.                             |
| `view`           | `split` or `unified`        | `split` (full), `unified` (simple) | Initial view.                                                  |
| `tabs`           | boolean                     | preset                             | Side by side / Unified tabs.                                   |
| `context`        | integer 0 to 1000, or `all` | `3`                                | Unchanged lines kept around changes.                           |
| `line-numbers`   | boolean                     | on                                 | Line numbers.                                                  |
| `wrap`           | boolean                     | off                                | Wraps long lines in the unified view (always on side by side). |
| `original-src`   | URL                         | none                               | URL of the original text.                                      |
| `modified-src`   | URL                         | none                               | URL of the modified text.                                      |
| `original-label` | text                        | `original`                         | Name of the original in the patch.                             |
| `modified-label` | text                        | `modified`                         | Name of the modified text in the patch.                        |

`language` accepts the same names as `<vt-code>`; languages that are not bundled are loaded on demand. Unlike `<vt-code>`, `auto` is not supported.

## Properties

| Property   | Type     | Description                                                                  |
| ---------- | -------- | ---------------------------------------------------------------------------- |
| `original` | `string` | The original text. Reading it returns the text in use (empty in patch mode). |
| `modified` | `string` | The modified text. Reading it returns the text in use (empty in patch mode). |
| `patch`    | `string` | The comparison as a unified patch. Read-only.                                |
| `content`  | `string` | The patch given as content. Setting it overrides `src` and inline content.   |

`original`, `modified` and `content` can be set before the element is defined; they are applied when it upgrades.

## Events

| Event           | `detail`                            | When                                  |
| --------------- | ----------------------------------- | ------------------------------------- |
| `vt-ready`      | `{ type: "diff" }`                  | The comparison was rendered           |
| `vt-tab-change` | `{ tab }`: `"split"` or `"unified"` | The user changed the view             |
| `vt-copy`       | `{ text }`                          | The patch was copied                  |
| `vt-search`     | `{ query, matches }`                | A search ran                          |
| `vt-input`      | see [Editing](#editing)             | A text was edited                     |
| `vt-change`     | see [Editing](#editing)             | An editor lost focus after edits      |
| `vt-error`      | `{ message, cause }`                | Loading failed or a text is too large |

## Search

Search looks at the code of the displayed lines (folded regions excluded); line numbers and signs are not searched.

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part                         | Element                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `diff`                       | The diff grid (`role="table"`)                                                                                                                                                 |
| `row`                        | A line of the diff. It also has `row-context`, `row-insert` or `row-delete`; a side-by-side row that pairs a removed and an added line has both `row-delete` and `row-insert`. |
| `line-number`                | A line number cell                                                                                                                                                             |
| `word-change`                | A changed word inside a modified line                                                                                                                                          |
| `fold`                       | A "Show N unchanged lines" button                                                                                                                                              |
| `hunk`                       | The `⋯` row between two hunks of a patch                                                                                                                                       |
| `undo-button`, `redo-button` | Undo and redo (edit mode)                                                                                                                                                      |

```css
vt-diff::part(word-change) {
  border-radius: 2px;
  outline: 1px solid currentColor;
}

vt-diff::part(row-delete) {
  opacity: 0.85;
}
```

Colors come from the theme tokens `--vt-diff-added`, `--vt-diff-removed`, `--vt-success`, `--vt-danger` and `--vt-info` (see [Theming](../theming.md#color-tokens)).

## Accessibility

The diff is exposed as a table: each line is a row (`role="row"`) of cells. Line numbers are hidden from assistive technologies, and the sign of each changed line is read as "Added: " or "Removed: ". The table is named after the `label`, or "Changes". Status is never shown by color alone: added and removed lines also have a `+` or `-` sign.

## Limits

| Limit                          | Value                                     | Configurable     |
| ------------------------------ | ----------------------------------------- | ---------------- |
| Size of each text or the patch | 2,097,152 characters                      | `maxSize`        |
| Exact line comparison          | 2,000 edits, then simplified              | No               |
| Word-level comparison          | Lines up to 1,000 characters, 200 edits   | No               |
| `context`                      | 0 to 1,000 lines                          | No               |
| Syntax highlighting            | Skipped above 300,000 characters per side | `highlightLimit` |
| Search matches                 | 5,000                                     | No               |

## Examples

### Before and after, from JavaScript

```js
const diff = document.createElement('vt-diff');
diff.setAttribute('language', 'json');
diff.setAttribute('variant', 'full');
diff.original = JSON.stringify(previous, null, 2);
diff.modified = JSON.stringify(current, null, 2);
document.querySelector('#changes').replaceChildren(diff);
```

### `git diff` output, one column, full context

```html
<vt-diff view="unified" context="all" src="/ci/last-commit.diff"></vt-diff>
```

### Inline patch

```html
<vt-diff variant="full">
  <script type="text/plain">
    --- a/greet.py
    +++ b/greet.py
    @@ -1,2 +1,2 @@
     def greet(name):
    -    return "Hello " + name
    +    return f"Hello {name}"
  </script>
</vt-diff>
```
