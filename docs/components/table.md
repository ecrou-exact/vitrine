# `<vt-table>`

`<vt-table>` is a complete data table: typed sorting on several columns, filters per column, a global search, row selection with a bulk action bar, grouping, expandable rows, a column chooser, resizable, reorderable and pinned columns, footer aggregates, cell editing, pagination or virtual scrolling, a full keyboard grid and a card layout on narrow screens.

```html
<vt-table variant="full" row-key="id" label="Users" src="/api/users.json"></vt-table>
```

Cells are inserted as text, never parsed as HTML. Links are kept only for `http:` and `https:` URLs.

## Data

The text content (inline `<template>`, `src` or `content`) can be:

| Input               | Example                                          |
| ------------------- | ------------------------------------------------ |
| Array of objects    | `[{"id":1,"name":"Ada"},{"id":2,"name":"Alan"}]` |
| Array of arrays     | `[["id","name"],[1,"Ada"]]` (first row: header)  |
| `{ columns, rows }` | `{"columns":["id","name"],"rows":[…]}`           |
| CSV / TSV           | `id,name\n1,Ada` (`format="csv"` to force it)    |

In an application, set the `data` and `columns` properties instead. `data` keeps your objects: the bulk action, selection and edit events hand them back as they are.

```js
const table = document.querySelector('vt-table');
table.columns = [
  { key: 'id', label: 'ID', width: 70 },
  { key: 'name', editable: true },
  { key: 'salary', type: 'number', aggregate: 'avg', format: (v) => `${v.toLocaleString()} €` },
  { key: 'site', type: 'url', hidden: true },
];
table.data = await (await fetch('/api/users')).json();
```

### Column definition

| Property     | Description                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `key`        | Property of the row objects (required).                                                          |
| `label`      | Header text (default: the key, humanized: `created_at` → `Created at`).                          |
| `type`       | `text`, `number`, `date`, `boolean` or `url` (default: inferred from the values).                |
| `width`      | Width in pixels (default: estimated from the content).                                           |
| `align`      | `start`, `center` or `end` (numbers are aligned to the end).                                     |
| `hidden`     | Hidden at first; the column chooser shows it again.                                              |
| `sortable`   | `false` to forbid sorting.                                                                       |
| `filterable` | `false` to remove its filter field.                                                              |
| `editable`   | Editable when the `editable` attribute is set (when no column is marked, all are).               |
| `resizable`  | `false` to lock its width.                                                                       |
| `aggregate`  | Footer value: `count`, `sum`, `avg`, `min` or `max`.                                             |
| `format`     | `(value, row) => string`: display text (also searched and copied as shown).                      |
| `render`     | `(value, row) => Node \| string`: custom cell content. You build the node: sanitize it yourself. |

## Variants

| Feature                        | `simple` (default) | `full`     |
| ------------------------------ | ------------------ | ---------- |
| `header`, `dot`                | off                | on         |
| `search` (filters rows)        | off                | on         |
| `copy` (TSV), `download` (CSV) | off                | on         |
| `fullscreen`                   | off                | on         |
| `sortable`, `resizable`        | on                 | on         |
| `filters` (filter row)         | off                | on         |
| `selectable`                   | `none`             | `multiple` |
| `column-menu` (menus, chooser) | off                | on         |
| `reorderable`                  | off                | on         |
| `expandable` (row details)     | off                | on         |
| `row-numbers`                  | off                | on         |

## Features

**Sorting** — click a header: ascending, descending, then the original order. Shift+click adds the column to the sort (its rank is shown). Numbers, dates and booleans sort by value, text in natural order (`item 2` before `item 10`), empty cells always last.

**Filters** — the filter row takes, per column:

| Filter                           | Matches                      |
| -------------------------------- | ---------------------------- |
| `ada love`                       | cells containing every word  |
| `=ada`                           | exactly `ada` (case ignored) |
| `!test`                          | cells not containing `test`  |
| `>10`, `<=5`, `!=0`              | numbers and dates compared   |
| `1..5`, `2024-01-01..2024-03-31` | ranges, bounds included      |
| `empty`, `!empty`                | blank or filled cells        |

Boolean columns get a Yes / No select. Active filters, grouping and multi-column sorts are shown as chips above the table, each removable.

**Selection and bulk actions** — `selectable="multiple"` (or `single`) adds checkboxes. Shift+click selects a range, Ctrl/⌘+click toggles a row, the header box selects every row matching the filters, a group box its group. The selection bar copies the rows (TSV, ready to paste in a spreadsheet), downloads them as CSV or JSON, and shows your own actions:

```js
table.bulkActions = [
  { id: 'archive', label: 'Archive' },
  { id: 'delete', label: 'Delete', danger: true },
];
table.addEventListener('vt-bulk-action', async (event) => {
  const { action, keys, rows } = event.detail;
  if (action === 'delete' && (await api.delete(keys))) table.removeRows(keys);
});
```

**Grouping** — `group-by="team"` or a header menu. Groups show their count, open and close with a click, Enter or ← →; the toolbar expands or collapses them all.

**Details** — `expandable` adds a chevron per row that shows every field, hidden columns included.

**Columns** — the columns button lists them all: show, hide, and reorder with the arrows or Alt+↑ ↓. Drag a header to move it, its edge to resize it (double-click fits the content). The header menu sorts, filters, groups, moves, pins (keeps the columns up to it visible when scrolling sideways), fits, hides, and picks the footer aggregate.

**Footer** — `footer` sums the number columns (identifiers such as `id` are skipped); each column's menu picks `count`, `sum`, `avg`, `min` or `max`. Aggregates use the filtered rows.

**Editing** — with `editable`, double-click, Enter or F2 edits a cell; Enter saves, Escape cancels, Tab moves to the next editable cell. The value keeps its type (a number stays a number). `vt-cell-edit` is cancelable: call `preventDefault()` to refuse the change, for example after a failed save.

**Size** — the density button cycles compact, normal and comfortable rows. `page-size` sets the rows per page (the pager also lets the reader choose); `page-size="0"` shows every row in one scroll area with **virtual scrolling**: only the visible rows are in the page, so 100 000 rows scroll smoothly. Set `max-height` to choose its height.

**Narrow screens** — under `card-breakpoint` (560 px of element width), `layout="auto"` shows each row as a card with a sort select. `layout="table"` or `layout="cards"` forces a layout.

**Saved layout** — `persist="users"` saves the column order, visibility, widths, sort, grouping, density and page size in `localStorage`. The `state` property reads and restores the same object (plus filters), for example to keep it in the URL or on your server.

## Keyboard

The table is one tab stop (an ARIA grid); the arrows move between cells. The keyboard button shows this list.

| Keys                        | Action                                           |
| --------------------------- | ------------------------------------------------ |
| ↑ ↓ ← →                     | Move between cells (and into the headers)        |
| Home / End, Ctrl+Home / End | First or last cell of the row / of the table     |
| PageUp / PageDown           | One screen up or down                            |
| Space                       | Select the row (on a header: sort)               |
| Shift+↑ ↓, Shift+Space      | Extend the selection                             |
| Ctrl/⌘+A                    | Select every matching row                        |
| Escape                      | Clear the selection, close a menu                |
| Enter                       | Edit, open details or a group; on a header: sort |
| Shift+Enter (header)        | Add the column to the sort                       |
| F2                          | Edit the cell                                    |
| + / −                       | Open or close details and groups                 |
| Ctrl/⌘+C                    | Copy the selected rows, or the cell              |
| Alt+← → (header)            | Move the column                                  |
| Alt+Shift+← → (header)      | Resize the column                                |
| Alt+↓ (header)              | Open the column menu                             |
| /                           | Search                                           |
| ?                           | Show the shortcuts                               |

## Attributes

| Attribute         | Description                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `format`          | `auto`, `json` or `csv`.                                                                                      |
| `row-key`         | Property identifying a row (default: its position). Set it for selection and edits that survive data changes. |
| `sortable`        | Headers sort the table.                                                                                       |
| `filters`         | Filter row shown at first (the funnel button toggles it).                                                     |
| `selectable`      | `none`, `single` or `multiple`.                                                                               |
| `column-menu`     | Header menus and the column chooser.                                                                          |
| `resizable`       | Column widths can be dragged.                                                                                 |
| `reorderable`     | Columns can be moved.                                                                                         |
| `group-by`        | Column key to group by.                                                                                       |
| `expandable`      | Row details.                                                                                                  |
| `editable`        | Cell editing.                                                                                                 |
| `footer`          | Footer with aggregates.                                                                                       |
| `density`         | `compact`, `normal` or `comfortable`.                                                                         |
| `layout`          | `auto`, `table` or `cards`.                                                                                   |
| `card-breakpoint` | Width in pixels under which `auto` shows cards (default 560).                                                 |
| `page-size`       | Rows per page, 5–1000 (default 50); `0`: all rows, virtual scrolling.                                         |
| `pinned`          | Number of leading columns kept visible when scrolling sideways.                                               |
| `row-numbers`     | Row numbers.                                                                                                  |
| `wrap`            | Long text wraps instead of being cut (turns off virtual scrolling).                                           |
| `persist`         | `localStorage` key of the saved layout.                                                                       |

Common attributes (`variant`, `theme`, `src`, `max-height`, `label`, `search`, `copy`, `download`, `fullscreen`, `lang-ui`…) are described in [common-attributes.md](../common-attributes.md).

## Properties and methods

| Member                              | Description                                                       |
| ----------------------------------- | ----------------------------------------------------------------- |
| `data`                              | The rows. Takes precedence over the text; `null` goes back to it. |
| `columns`                           | Column definitions.                                               |
| `bulkActions`                       | `[{ id, label, icon?, danger? }]` shown in the selection bar.     |
| `state`                             | `{ columns, sort, filters, groupBy, density, pageSize, pinned }`. |
| `selection` / `selectedKeys`        | Selected rows / their keys.                                       |
| `select(keys, { add })`             | Selects rows by key.                                              |
| `selectAll()`, `clearSelection()`   | —                                                                 |
| `getRows({ filtered, selected })`   | Rows in display order.                                            |
| `exportData(format, { selected })`  | `csv`, `tsv` or `json` text of the visible columns.               |
| `updateRow(key, patch)`             | Changes fields of a row.                                          |
| `addRows(rows)`, `removeRows(keys)` | —                                                                 |
| `expandAll()`, `collapseAll()`      | Groups, or row details when not grouped.                          |
| `resetLayout()`                     | Back to the column definitions.                                   |

## Events

| Event              | Detail                                               |
| ------------------ | ---------------------------------------------------- |
| `vt-sort`          | `{ column, name, direction, sort }`                  |
| `vt-filter-change` | `{ filters, query, shown }`                          |
| `vt-select`        | `{ keys, rows, count }`                              |
| `vt-bulk-action`   | `{ action, keys, rows }`                             |
| `vt-cell-edit`     | `{ key, column, value, previous, row }` (cancelable) |
| `vt-column-change` | `{ columns }`                                        |
| `vt-row-activate`  | `{ key, row }` — Enter or double-click               |
| `vt-toggle`        | `{ group, expanded }` or `{ key, expanded }`         |

## CSS parts

`table`, `header-cell`, `cell`, `row`, `group-row`, `filter`, `bulk-bar`, `pager`, `card`, `menu`, plus the common parts.

## Limits

200 000 rows and 500 columns are kept. CSV exports prefix cells starting with `=`, `+`, `-` or `@` with `'` so spreadsheets do not run them as formulas.
