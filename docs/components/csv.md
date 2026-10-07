# `<vt-csv>`

`<vt-csv>` displays CSV or TSV data as an accessible table, with typed columns, sorting, pagination, search that filters rows, a raw text view, and an editor.

```html
<vt-csv variant="full" label="scores.csv">
  <template>
    name,score,joined
    Ada,98,2024-03-01
    Alan,95,2023-11-20
  </template>
</vt-csv>
```

Cells are inserted as text, never parsed as HTML.

## Variants

| Feature              | `simple` (default) | `full` |
| -------------------- | ------------------ | ------ |
| `header`             | off                | on     |
| `dot`                | off                | on     |
| `copy`               | off                | on     |
| `search`             | off                | on     |
| `download`           | off                | on     |
| `tabs` (Table / Raw) | off                | on     |
| `sortable`           | off                | on     |
| `line-numbers`       | off                | on     |
| `header-row`         | on                 | on     |
| `fullscreen`         | off                | on     |

Every feature can be turned on or off individually, whatever the variant:

```html
<vt-csv sortable search src="/data/cities.csv"></vt-csv>
```

## Giving data

Use any content source (see [Getting started](../getting-started.md#content-sources)). For inline data, use a `<template>` or a `<script type="text/plain">`; `text/csv` is not one of the accepted data script types.

```html
<vt-csv src="/exports/orders.csv" variant="full"></vt-csv>
```

```js
document.querySelector('vt-csv').content = await (await fetch('/api/report.csv')).text();
```

## Parser rules

The parser follows RFC 4180:

- Fields are separated by the delimiter and rows by line breaks (`\n`, `\r\n` or `\r`).
- A field that starts with `"` is quoted: it can contain the delimiter and line breaks, and `""` inside it stands for one `"`. Text after the closing quote is added to the field.
- A `"` that is not at the start of a field is an ordinary character.
- A leading byte order mark is ignored.
- A final line break does not create an empty row; a blank line in the middle creates a row with one empty cell.
- Rows may have different lengths. The table has as many columns as the widest row; missing cells are empty.
- Only the first 1,000 cells of a row are kept. When a row has more, the notice "Only the first 1,000 columns are shown." is displayed.
- A quote that is never closed takes the rest of the text into its field. The rows are still shown, with the notice "Unclosed quote starting at line N."

### Delimiter

With `delimiter` absent or `auto`, the delimiter is detected among `,`, `;`, tab and `|`. Detection reads the first 20 non-empty lines of the first 20,000 characters, and ignores a candidate that does not appear on the first line. Each remaining candidate gets a score: 10 times the share of lines that contain it as many times as the first line, plus the number of times it appears on the first line (counting up to 10). The highest score wins; on a tie, the earlier candidate in the list above wins. Delimiters inside quotes are not counted. When no candidate appears on the first line, `,` is used.

Set `delimiter` to force one. Accepted values (case-insensitive): `,` or `comma`, `;` or `semicolon`, `tab` or `\t`, `|` or `pipe`. Any other value means detection.

```html
<vt-csv delimiter="tab" src="/data/export.tsv"></vt-csv>
<vt-csv delimiter="semicolon" src="/data/fr-export.csv"></vt-csv>
```

### `header-row`

On by default: the first row holds the column names and is not part of the data. Header names are trimmed; an empty name becomes "Column N". With `header-row="false"`, every row is data and the columns are named "Column 1", "Column 2"…

```html
<vt-csv header-row="false">
  <template>
    1,2,3
    4,5,6
  </template>
</vt-csv>
```

## Column types

Each column gets a type from its first 500 non-empty data cells. A column has a type only when all of those cells match it:

| Type      | Cells that match                                                                                                                | Examples                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `number`  | Optional sign, digits (optionally grouped by 3 with a space or a comma), optional `.` decimals, optional exponent, optional `%` | `42`, `-3.5`, `1,234,567`, `1 200`, `2e3`, `12%` |
| `date`    | `YYYY-MM-DD`, optionally followed by a time (`T` or space, `HH:MM`, optional seconds and fraction, optional `Z` or offset)      | `2024-03-01`, `2024-03-01T09:30:00Z`             |
| `boolean` | `true`, `false`, `yes`, `no` (case-insensitive)                                                                                 | `Yes`, `false`                                   |
| `text`    | Anything else, or a column with no non-empty cell                                                                               |                                                  |

Number columns are aligned to the end. Each header cell and data cell has a `col-<type>` class.

## Sorting

With `sortable` on, each column header is a button ("Sort by name"). Clicking it cycles through ascending, descending, and the original order. Sorting goes back to the first page.

- `number` columns compare the numbers, after removing spaces, commas and `%`.
- `date` columns compare `Date.parse()` of the cells.
- `boolean` and `text` columns compare the lowercased text, character by character (not locale-aware).
- Empty cells, and cells that cannot be read as a number or a date, always come last, in both directions.
- Sorting is stable: equal cells keep their original order.

The sorted header has `aria-sort="ascending"` or `"descending"`; the others have `aria-sort="none"`. Each sort dispatches `vt-sort`.

Row numbers (`line-numbers`) are the position of the row in the data (the header row excluded), so they stay attached to their row when sorting or filtering.

## Pagination

Rows are shown `page-size` at a time (10 to 1,000, default 100). The pager under the table shows "Rows 1–100 of 2,345" and, when there is more than one page, First page, Previous page, Next page and Last page buttons. Changing `page-size`, `header-row`, the content or the sort goes back to the first page.

```html
<vt-csv page-size="25" sortable src="/data/large.csv"></vt-csv>
```

## Search

In the table view, search keeps only the rows where at least one cell contains the query (case-insensitive, literal), and highlights the matches in the visible cells. The pager shows "12 matching rows · Rows 1–12 of 12". The match counter counts matching cells (at most 5,000), and going to a match opens its page. Header names are not searched.

In the raw view, search looks at the text, as in [`<vt-code>`](code.md).

## Views

| View              | Content                                                        |
| ----------------- | -------------------------------------------------------------- |
| `table` (default) | The table, with notices, pagination and sorting                |
| `raw`             | The original text, with line numbers when `line-numbers` is on |

`tabs` shows Table and Raw tabs and dispatches `vt-tab-change` with `{ tab: "table" }` or `{ tab: "raw" }`. `view` chooses the initial view; changing it resets the user's choice. In edit mode, the default view is `raw`.

## Editing

With `mode="edit"`, the raw view is an editor (plain text, with line numbers when `line-numbers` is on), and a status bar under it shows "3 rows × 4 columns" (data rows, the header excluded) or "Unclosed quote starting at line N.", updated 150 ms after typing stops. Set `status="false"` to hide it. The Table tab shows the edited data, read-only.

```html
<vt-csv mode="edit" tabs label="prices.csv">
  <template>
    item,price
    Tea,3.50
  </template>
</vt-csv>
```

See [Editing](../editing.md) for the keyboard, undo and events.

## Attributes

This table lists the attributes specific to `<vt-csv>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute      | Type                                   | Default                      | Description                                |
| -------------- | -------------------------------------- | ---------------------------- | ------------------------------------------ |
| `delimiter`    | `auto`, `,`, `;`, `tab`, `\|` or names | detected                     | Field delimiter.                           |
| `header-row`   | boolean                                | on                           | The first row holds the column names.      |
| `page-size`    | integer, 10 to 1,000                   | `100`                        | Rows per page.                             |
| `sortable`     | boolean                                | preset                       | Column headers sort the table.             |
| `line-numbers` | boolean                                | preset                       | Row numbers in the table and the raw view. |
| `tabs`         | boolean                                | preset                       | Table / Raw tabs.                          |
| `view`         | `table` or `raw`                       | `table` (`raw` in edit mode) | Initial view.                              |

## Properties

| Property  | Type         | Description                                                                                         |
| --------- | ------------ | --------------------------------------------------------------------------------------------------- |
| `content` | `string`     | The CSV text. Setting it overrides `src` and inline content; `null` restores them. Edits update it. |
| `rows`    | `string[][]` | The parsed rows, header row included, as a copy. Read-only.                                         |

```js
const table = document.querySelector('vt-csv');
const [header, ...data] = table.rows;
```

## Events

| Event           | `detail`                        | When                                                                                                                                   |
| --------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `vt-ready`      | `{ type: "csv" }`               | The data was rendered                                                                                                                  |
| `vt-sort`       | `{ column, name, direction }`   | A header was clicked. `column` is the 0-based index, `name` the header name, `direction` is `"ascending"`, `"descending"` or `"none"`. |
| `vt-tab-change` | `{ tab }`: `"table"` or `"raw"` | The user changed the view                                                                                                              |
| `vt-copy`       | `{ text }`                      | The text was copied                                                                                                                    |
| `vt-search`     | `{ query, matches }`            | A search ran                                                                                                                           |
| `vt-error`      | `{ message, cause }`            | Loading failed or the content is too large                                                                                             |

The editing events (`vt-input`, `vt-change`, `vt-mode-change`) are described in [Editing](../editing.md#events).

```js
document.querySelector('vt-csv').addEventListener('vt-sort', (event) => {
  const { name, direction } = event.detail;
  history.replaceState(null, '', `?sort=${encodeURIComponent(name)}&dir=${direction}`);
});
```

## Copy and download

- The copy button ("Copy") copies the CSV text as given (or as edited), not the sorted or filtered table.
- `download` saves the same text as `text/csv`. The file name is the value of the `download` attribute, else a `label` or `title` that ends with an extension, else `data.csv`.

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part                                    | Element                                  |
| --------------------------------------- | ---------------------------------------- |
| `table`                                 | The `<table>` element                    |
| `header-cell`                           | A column header                          |
| `cell`                                  | A data cell                              |
| `row-number`                            | A row number cell                        |
| `pager`                                 | The pagination bar                       |
| `status`                                | The status bar under the editor          |
| `code`, `line`, `gutter`, `line-number` | The raw view (same parts as `<vt-code>`) |

```css
vt-csv::part(header-cell) {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

vt-csv::part(cell) {
  max-width: 24ch;
}
```

The header row stays visible when scrolling vertically, and row numbers stay visible when scrolling horizontally.

## Keyboard

| Element       | Keys                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| Table area    | Focusable with Tab; arrow keys scroll it                                  |
| Sort buttons  | Tab to reach, Enter or Space to sort; focus stays on the button           |
| Pager buttons | Tab to reach, Enter or Space to change page                               |
| Search field  | Enter, Shift+Enter, Escape (see [search](../common-attributes.md#search)) |

The table has a caption (hidden visually) with the `label`, or "CSV". Column headers have `scope="col"` and row numbers `scope="row"`. The pager text is a polite live region.

## Limits

| Limit                     | Value                                       | Configurable |
| ------------------------- | ------------------------------------------- | ------------ |
| Maximum content size      | 2,097,152 characters                        | `maxSize`    |
| Columns per row           | 1,000                                       | No           |
| Characters shown per cell | 1,000, then `…` (copy keeps everything)     | No           |
| Rows per page             | 10 to 1,000 (default 100)                   | `page-size`  |
| Cells sampled for types   | 500 non-empty cells per column              | No           |
| Delimiter detection       | First 20 non-empty lines, 20,000 characters | No           |
| Search matches            | 5,000                                       | No           |
| Search query              | 200 characters                              | No           |

## Examples

### Semicolon-separated export without a header

```html
<vt-csv delimiter=";" header-row="false" src="/exports/legacy.csv"></vt-csv>
```

### Large file, sortable, 50 rows per page, with a height limit

```html
<vt-csv variant="full" label="events.csv" page-size="50" max-height="30rem" src="/data/events.csv"></vt-csv>
```

### Created with `Vitrine.render()`

```js
Vitrine.render(document.querySelector('#target'), {
  type: 'csv',
  content: csvText,
  variant: 'full',
  options: { pageSize: 25, label: 'export.csv' },
});
```
