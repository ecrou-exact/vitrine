# `<vt-toml>`

`<vt-toml>` displays TOML as a collapsible tree or as highlighted text, with search, a path bar, copy as JSON and download. It shares its tree with [`<vt-json>`](json.md).

```html
<vt-toml variant="full" label="Cargo.toml">
  <template>
    [package]
    name = "vitrine"
    version = "0.4.0"
    released = 2026-10-13T20:00:00Z

    [[bin]]
    name = "cli"
    paths = ["src", "bin"]
  </template>
</vt-toml>
```

The TOML is read by a built-in [TOML 1.0](https://toml.io/en/v1.0.0) parser, with no dependency:

- **Everything in the specification**: tables, sub-tables, arrays of tables, inline tables, dotted keys, bare and quoted keys, basic, literal and multi-line strings with every escape, integers in decimal, hexadecimal, octal and binary with `_` separators, floats with `inf` and `nan`, booleans, arrays over several lines with comments.
- **Dates and times keep their type**: offset date-times (`datetime`), local date-times (`datetime-local`), local dates (`date-local`) and local times (`time-local`) are shown in their own color and with their own type badge. Impossible dates such as `2026-02-30` are errors.
- **Values are shown as written**: `0xff_ff` stays `0xff_ff` in the tree; the JSON copy writes `65535`.
- **The rules of the specification are enforced**: duplicate keys, a table defined twice, keys added to an inline table, a static array extended with `[[...]]`, leading zeros or a trailing comma in an inline table are errors that report a line and a column.
- **Comments stay** in the Raw view, which shows the document as written.
- **Nesting depth is limited** (`maxDepth`, 512 by default), like `<vt-json>`.

Everything is rendered with DOM text APIs. No HTML is ever parsed.

## Variants

| Feature                   | `simple` (default) | `full` |
| ------------------------- | ------------------ | ------ |
| Initial view (`view`)     | `raw`              | `tree` |
| `header`                  | off                | on     |
| `dot`                     | off                | on     |
| `copy`                    | off                | on     |
| `copy-json`               | off                | on     |
| `search`                  | off                | on     |
| `download`                | off                | on     |
| `fullscreen`              | off                | on     |
| `tabs`                    | off                | on     |
| `show-types`              | off                | on     |
| `expand-controls`         | off                | on     |
| `path`                    | off                | on     |
| `line-numbers` (Raw view) | off                | on     |

Every feature can be turned on or off with its attribute, whatever the variant.

## Attributes

| Attribute         | Values         | Default            | Description                                                                                                                                   |
| ----------------- | -------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `view`            | `tree`, `raw`  | depends on variant | View shown first.                                                                                                                             |
| `tabs`            | boolean        | variant            | Shows the Tree / Raw tabs.                                                                                                                    |
| `depth`           | 0–1000         | `2`                | Levels expanded at first in the tree (`0`: everything collapsed).                                                                             |
| `sort-keys`       | boolean        | off                | Sorts keys alphabetically in the tree.                                                                                                        |
| `show-types`      | boolean        | variant            | Type badge on each row: `string`, `integer`, `float`, `boolean`, `datetime`, `datetime-local`, `date-local`, `time-local`, `object`, `array`. |
| `expand-controls` | boolean        | variant            | "Expand all" and "Collapse all" buttons.                                                                                                      |
| `path`            | boolean        | variant            | Path bar of the selected node, with "Copy path" and "Copy value".                                                                             |
| `line-numbers`    | boolean        | variant            | Line numbers in the Raw view and the editor.                                                                                                  |
| `copy-json`       | boolean        | variant            | "Copy as JSON" button.                                                                                                                        |
| `on-invalid`      | `error`, `raw` | `error`            | Invalid TOML: an error with the text below it, or a notice above the text.                                                                    |

The shared attributes (`variant`, `theme`, `src`, `max-height`, `copy`, `search`, `download`, `label`, `lang-ui`…) are described in [common attributes](../common-attributes.md).

### Path format

The path bar writes TOML keys: `package.name`, `bin[0].paths[1]`, and quoted keys where a bare key is not possible, such as `site."key two"`. "Copy value" copies strings without quotes, dates and numbers as written, and tables and arrays as JSON.

### Copy as JSON

"Copy as JSON" writes the whole document as JSON, indented by 2:

- integers in decimal, exactly, even beyond 2^53 (`0xDEAD_BEEF` becomes `3735928559`);
- floats as numbers, and `inf`, `-inf` and `nan` as strings, since JSON has no such numbers;
- dates and times as strings, as written.

## Editing

With `mode="edit"` (or the button that `edit-toggle` adds), the Raw view becomes an editor: TOML highlighting, undo and redo, and a status line that says whether the text is valid TOML, or where the first error is. The line of the error is highlighted. The tree follows the edited text when you go back to the Tree tab. See [editing](../editing.md).

## Properties

| Property  | Type      | Description                                                                                                                  |
| --------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `content` | `string`  | The TOML text. Setting it renders the new document.                                                                          |
| `data`    | `unknown` | Read-only. The document as a plain object, or `undefined` when invalid. Integers beyond 2^53 are rounded, dates are strings. |

## Tree view

The tree is the one of `<vt-json>`: a WAI-ARIA tree with arrow keys, Home and End, `*` to open siblings, type-ahead, large tables and arrays shown 100 entries at a time, and long strings cut with a "show full string" button. See [the tree of `<vt-json>`](json.md#tree-view).

### Search

The search goes through keys and values. In the tree, it opens the tables that hold a match; in the Raw view, it searches the text, comments included. Focus stays in the search field while you type.

## Events

| Event           | Detail               | When                                                                                          |
| --------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| `vt-ready`      | `{ type: "toml" }`   | The document is rendered.                                                                     |
| `vt-tab-change` | `{ tab }`            | The Tree / Raw tab changed.                                                                   |
| `vt-copy`       | `{ text }`           | The TOML, the JSON, a value or a path was copied.                                             |
| `vt-search`     | `{ query, matches }` | The search changed.                                                                           |
| `vt-change`     | `{ value }`          | The text was edited.                                                                          |
| `vt-error`      | `{ message, cause }` | Invalid TOML, or the content could not be loaded. `cause` has `line`, `column` and `message`. |

## Copy and download

"Copy" and "Download" use the TOML text as written. The file is `data.toml` (or the `label`), with the `application/toml` type.

## CSS parts

| Part          | Element                                      |
| ------------- | -------------------------------------------- |
| `tree`        | The tree (`role="tree"`).                    |
| `tree-item`   | A tree item.                                 |
| `row`         | The visible row of an item.                  |
| `tree-toggle` | Expand / collapse chevron.                   |
| `key`         | A key.                                       |
| `index`       | An array index.                              |
| `value`       | A value.                                     |
| `count`       | Number of keys or items of a table or array. |
| `type-badge`  | Type badge.                                  |
| `more-item`   | "Show more" row.                             |
| `path`        | Path bar.                                    |

Dates and times use the `--vt-syntax-type` color.

## Limits

| Limit         | Value                                                | Effect                                                      |
| ------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| Content size  | `maxSize` (see [configuration](../configuration.md)) | Larger content shows an error.                              |
| Nesting depth | `maxDepth` (512)                                     | Deeper arrays, inline tables or table headers are an error. |
| Tree rows     | 100 per page, 5,000 for "expand all"                 | Same as `<vt-json>`.                                        |

## Examples

### `pyproject.toml`

```html
<vt-toml variant="full" label="pyproject.toml" depth="1">
  <template>
    [project]
    name = "shop"
    requires-python = ">=3.12"
    dependencies = ["httpx>=0.27", "pydantic>=2"]

    [tool.ruff]
    line-length = 100
  </template>
</vt-toml>
```

### Invalid TOML shown as text

```html
<vt-toml on-invalid="raw">
  <template>
    a = 1
    a = 2
  </template>
</vt-toml>
```

### From JavaScript

```js
Vitrine.render(document.querySelector('#config'), {
  type: 'toml',
  content: tomlText,
  variant: 'full',
});
```
