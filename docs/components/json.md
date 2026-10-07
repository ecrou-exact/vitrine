# `<vt-json>`

`<vt-json>` displays JSON as pretty-printed, highlighted text or as a collapsible tree, with search, copy, download and a JSONPath bar.

```html
<vt-json variant="full" label="users.json">
  {"users": [{"id": 1, "name": "Ada"}, {"id": 2, "name": "Alan"}]}
</vt-json>
```

The JSON is read by a built-in parser rather than `JSON.parse`, so the viewer shows exactly what the document contains:

- **Numbers are kept as written.** `12345678901234567890` is displayed, copied and downloaded unchanged, without rounding, and `9.75e2` stays `9.75e2`.
- **Duplicate keys are kept**, in order.
- **`__proto__` and `constructor` are plain keys.** They are displayed like any other key and never touch JavaScript objects.
- **Errors report a line and a column**, the same way in every browser.
- **Nesting depth is limited** (512 levels by default) and parsing never recurses, so deeply nested input cannot overflow the stack.
- A leading byte order mark is ignored.

Everything is rendered with DOM text APIs. No HTML is ever parsed, so strings such as `"<img src=x onerror=...>"` are displayed as text.

## Variants

| Feature                   | `simple` (default) | `full` |
| ------------------------- | ------------------ | ------ |
| Initial view (`view`)     | `raw`              | `tree` |
| `header`                  | off                | on     |
| `dot`                     | off                | on     |
| `copy`                    | off                | on     |
| `search`                  | off                | on     |
| `download`                | off                | on     |
| `tabs` (Tree / Raw)       | off                | on     |
| `show-types`              | off                | on     |
| `expand-controls`         | off                | on     |
| `path`                    | off                | on     |
| `line-numbers` (raw view) | off                | on     |

## Attributes

This table lists the attributes specific to `<vt-json>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute         | Type               | Default                       | Description                                                            |
| ----------------- | ------------------ | ----------------------------- | ---------------------------------------------------------------------- |
| `view`            | `tree` or `raw`    | `tree` (full), `raw` (simple) | Initial view.                                                          |
| `tabs`            | boolean            | preset                        | Shows the Tree / Raw tabs.                                             |
| `depth`           | integer, 0 to 1000 | `2`                           | Levels expanded initially in the tree.                                 |
| `indent`          | integer, 0 to 8    | `2`                           | Indentation of the raw view, copy and download, in spaces.             |
| `sort-keys`       | boolean            | off                           | Sorts object keys.                                                     |
| `show-types`      | boolean            | preset                        | Shows a type badge on each tree row.                                   |
| `expand-controls` | boolean            | preset                        | Shows the "Expand all" and "Collapse all" buttons (tree view).         |
| `path`            | boolean            | preset                        | Shows the path bar with the JSONPath of the selected node (tree view). |
| `line-numbers`    | boolean            | preset                        | Line numbers in the raw view.                                          |
| `on-invalid`      | `error` or `raw`   | `error`                       | What to show when the JSON is invalid.                                 |

### `view` and `tabs`

The **raw** view shows the JSON pretty-printed with `indent` spaces and highlighted. The **tree** view shows a collapsible tree.

`tabs` adds Tree and Raw tabs (WAI-ARIA tabs pattern: Left and Right arrows, Home, End). Switching dispatches `vt-tab-change` with `{ tab: "tree" }` or `{ tab: "raw" }`. Changing the `view` attribute resets the user's choice.

```html
<vt-json view="tree" depth="1" src="/api/status.json"></vt-json>
```

### `depth`

The root is level 1. A container is expanded initially when its level is less than or equal to `depth`:

| `depth`       | Initially expanded                        |
| ------------- | ----------------------------------------- |
| `0`           | Nothing: only the collapsed root is shown |
| `1`           | The root                                  |
| `2` (default) | The root and its direct children          |

### `indent` and `sort-keys`

`indent` applies to the raw view, the copy button, the download button and "Copy value". `indent="0"` produces compact JSON on a single line.

`sort-keys` sorts object keys by UTF-16 code unit order (stable, so duplicate keys keep their relative order). It applies to the tree, the raw view, copy and download.

```html
<vt-json indent="4" sort-keys>{"b": 1, "a": [2]}</vt-json>
```

displays:

```json
{
    "a": [
        2
    ],
    "b": 1
}
```

### `show-types`

Adds a badge with the node type on each row: `object`, `array`, `string`, `number`, `boolean` or `null`.

### `expand-controls`

"Expand all" expands containers breadth first, until 5,000 visible rows have been added. If the document is larger, expansion stops there and "Partially expanded: too many nodes." is announced. "Collapse all" collapses everything except the root and resets pagination.

### `path`

The path bar under the tree shows the JSONPath of the selected node, with two buttons:

- **Copy path** copies the JSONPath.
- **Copy value** copies the selected value. Strings are copied raw, without quotes or escapes (`Ada`, not `"Ada"`). Numbers, booleans, `null`, objects and arrays are copied as JSON, formatted with the current `indent` and `sort-keys`.

Both dispatch `vt-copy`.

#### JSONPath format

| Node                                                          | Path                                       |
| ------------------------------------------------------------- | ------------------------------------------ |
| The root                                                      | `$`                                        |
| A key that is a valid identifier (`[A-Za-z_$][A-Za-z0-9_$]*`) | `$.users`                                  |
| An array item                                                 | `$.users[0]`                               |
| Any other key                                                 | `$.meta["weird key"]`, `$["a.b"]`, `$[""]` |

Keys in brackets are written as JSON strings, so quotes and backslashes are escaped.

### `on-invalid`

When the text is not valid JSON:

- `error` (default): an error message such as "Invalid JSON at line 3, column 13: Trailing comma." is shown above the text.
- `raw`: a notice "Invalid JSON at line 3, column 13 — showing raw text." is shown instead.

In both cases the text is displayed with line numbers, the line of the error is emphasized and scrolled into view, and a `vt-error` event is dispatched once per content. The copy button, when enabled, copies the original text.

The description after the position comes from the parser and is in English: for example `Trailing comma`, `Unexpected end of input`, `Expected a property name in double quotes`, `Expected ":" after the property name`, `Expected "," or "}"`, `Unterminated string`, `Invalid escape sequence`, `Control character in string (escape it)`, `Unexpected character "x"` or `Unexpected content after the JSON value`.

Input nested deeper than the `maxDepth` setting shows "Nesting is too deep (limit 512)."

```html
<vt-json on-invalid="raw" src="/logs/last-response.txt"></vt-json>
```

## Properties

| Property  | Type     | Description                                                                         |
| --------- | -------- | ----------------------------------------------------------------------------------- |
| `content` | `string` | The JSON text. Setting it overrides `src` and inline content; `null` restores them. |
| `data`    | any      | A JavaScript value to display, serialized with `JSON.stringify(value, null, 2)`.    |

```js
const viewer = document.querySelector('vt-json');

// From a JSON string (numbers are kept exactly):
viewer.content = await response.text();

// From a JavaScript value:
viewer.data = { id: 1, tags: ['a', 'b'] };
```

About `data`:

- Values that `JSON.stringify` cannot serialize, such as circular structures and `BigInt`, show the error "This value cannot be converted to JSON (circular reference or BigInt)." and dispatch `vt-error`.
- Values that serialize to nothing (`undefined`, a function) display the empty state.
- Numbers in a JavaScript value are already JavaScript numbers, so a large integer may have lost precision before it reaches Vitrine. To display large numbers exactly, pass the JSON text through `content` instead.
- Reading `data` returns `JSON.parse()` of the current text (or `undefined` when the text is not valid JSON). It is a regular JavaScript value: large numbers are rounded and only the last of duplicate keys is kept.

## Tree view

Each row shows the key (or array index), then the value:

- Strings are shown in quotes, as in JSON. Strings longer than 500 characters are cut, with a "Show full string (N characters)" button.
- Keys longer than 120 characters are cut with `…`. Empty keys and keys containing control characters are shown as JSON strings (for example `""`).
- Collapsed containers show `{…}` or `[…]` and a count: "3 keys", "1 key", "12 items", "1 item".
- Containers with more than 100 children show the first 100, then a "Show 100 more" row (or fewer, for the last page).

Clicking a row selects it (and updates the path bar). Clicking the chevron expands or collapses a container.

### Keyboard

The tree follows the WAI-ARIA tree view pattern. It is a single Tab stop; the arrow keys move within it.

| Key            | Action                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Down arrow     | Next visible row                                                                                                |
| Up arrow       | Previous visible row                                                                                            |
| Right arrow    | Expand a collapsed container; on an expanded container, move to its first child                                 |
| Left arrow     | Collapse an expanded container; otherwise move to the parent                                                    |
| Home / End     | First / last visible row                                                                                        |
| Enter or Space | Expand or collapse a container; on a "Show more" row, load the next page; on a cut string, show the full string |

Moving to a row selects it.

### Search in the tree

In the tree view, search looks at keys and primitive values (strings without their quotes, numbers as written, `true`, `false`, `null`), including inside collapsed containers and pages that are not shown yet. Going to a match expands its ancestors, loads the needed page and selects the node. In the raw view, search looks at the displayed text.

## Events

| Event           | `detail`                       | When                                               |
| --------------- | ------------------------------ | -------------------------------------------------- |
| `vt-ready`      | `{ type: "json" }`             | The JSON was rendered                              |
| `vt-tab-change` | `{ tab }`: `"tree"` or `"raw"` | The user changed the view                          |
| `vt-copy`       | `{ text }`                     | The JSON, a value or a path was copied             |
| `vt-search`     | `{ query, matches }`           | A search ran                                       |
| `vt-error`      | `{ message, cause }`           | Invalid JSON, loading failure or content too large |

For invalid JSON, `cause` is an object with `message`, `offset`, `line`, `column` and `tooDeep`.

## Copy and download

- The header copy button ("Copy") copies the pretty-printed JSON, using `indent` and `sort-keys`. It is not the original text: whitespace is normalized, but numbers and duplicate keys are preserved.
- `download` saves the same text as `application/json`, named after `label` (or `title`), or `data.json`. The value of the `download` attribute is not used as the file name.

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part                                    | Element                                  |
| --------------------------------------- | ---------------------------------------- |
| `tree`                                  | The tree (`role="tree"`)                 |
| `tree-item`                             | A tree item                              |
| `row`                                   | The visible row of a tree item           |
| `tree-toggle`                           | The expand and collapse chevron          |
| `key`                                   | An object key                            |
| `index`                                 | An array index                           |
| `value`                                 | A primitive value                        |
| `count`                                 | The item or key count of a container     |
| `type-badge`                            | The type badge                           |
| `more-item`                             | The "Show more" row                      |
| `path`                                  | The path bar                             |
| `code`, `line`, `gutter`, `line-number` | The raw view (same parts as `<vt-code>`) |

```css
vt-json::part(key) {
  font-weight: 600;
}

vt-json::part(type-badge) {
  text-transform: uppercase;
}
```

## Limits

| Limit                        | Value                            | Configurable              |
| ---------------------------- | -------------------------------- | ------------------------- |
| Maximum content size         | 2,097,152 characters             | `maxSize`                 |
| Maximum nesting depth        | 512 levels                       | `maxDepth` (up to 10,000) |
| Children per page            | 100                              | No                        |
| "Expand all" budget          | 5,000 rows                       | No                        |
| Rows created by one render   | 20,000                           | No                        |
| String preview               | 500 characters                   | No                        |
| Key preview                  | 120 characters                   | No                        |
| Search matches               | 5,000                            | No                        |
| Search query                 | 200 characters                   | No                        |
| Highlighting of the raw view | Skipped above 300,000 characters | `highlightLimit`          |

## Examples

### API response with exact numbers

```js
const response = await fetch('/api/orders/42');
document.querySelector('#order').content = await response.text();
```

### Compact inline data

```html
<vt-json>{"compact": [1, 2, 3], "ok": true}</vt-json>
```

### Tree with types and a path bar, fully collapsed

```html
<vt-json view="tree" depth="0" show-types path src="/data/catalog.json"></vt-json>
```

### Configuration file, sorted and indented by 4

```html
<vt-json variant="full" label="settings.json" indent="4" sort-keys src="/settings.json"></vt-json>
```

### Created with `Vitrine.render()`

```js
Vitrine.render(document.querySelector('#target'), {
  type: 'json',
  content: jsonText,
  variant: 'full',
  options: { depth: 3, sortKeys: true, label: 'payload.json' },
});
```
