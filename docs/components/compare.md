# `<vt-compare>`

`<vt-compare>` compares two datasets: rows are paired by a key column, then shown as added, removed or changed, with the old and the new value of each changed cell. Columns added or removed are named. It answers "what changed between these two exports?", where `<vt-diff>` compares lines of text.

```html
<vt-compare variant="full" key="id">
  <template data-original>
    id,name,price
    1,Pen,1.50
    2,Book,12
  </template>
  <template data-modified>
    id,name,price
    1,Pen,1.80
    3,Lamp,30
  </template>
</vt-compare>
```

## The two datasets

Each side is CSV with a header row or JSON, as in `<vt-table>` and `<vt-pivot>`. Give them as:

- `<template data-original>` and `<template data-modified>`;
- the `original-src` and `modified-src` URLs;
- the `original` and `modified` properties (text, or a list of objects);
- JSON data `{ original, modified, key }` (`before` and `after` are read too), with `data` or `json-src`.

## Pairing the rows

With `key`, rows are paired by the values of those columns. Without it, the key is the first column named like an identifier (`id`, `key`, `uuid`, `code`, `sku`, `slug`, `email`, `name`), then the first column, whose values are present and all different in both datasets; when no column qualifies, rows are paired by position. A note under the filters says which.

When a key repeats, its rows are paired in order (the second with the second) and a note counts them.

Values are compared as numbers when both are (`1.50` and `1.5` are the same), as trimmed text otherwise; empty and missing values are the same.

## Filters

In the full variant, buttons show the changes (the default), only the added, removed or changed rows, or all of them, each with its count. `filter` sets the first. The mark of each row (`+`, `−`, `~`) and its status are written beside the colors.

## Attributes

| Attribute      | Type    | Default   | Description                                       |
| -------------- | ------- | --------- | ------------------------------------------------- |
| `key`          | string  | found     | Columns that identify a row, separated by commas  |
| `filter`       | string  | `changes` | `changes`, `all`, `added`, `removed` or `changed` |
| `original-src` | string  | none      | URL of the first dataset                          |
| `modified-src` | string  | none      | URL of the second dataset                         |
| `filters`      | boolean | preset    | Buttons that choose the rows shown                |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header, the filters, search, copy and download (the rows shown as CSV, with a `status` column, a changed value written `old → new`, and formulas neutralized for spreadsheets) and full screen. At most 2,000 rows and 60 columns are drawn.

## Properties

`comparison` is the comparison: `{ key, fields, addedFields, removedFields, rows, counts, duplicates }`, each row `{ status, key, before, after, changed }`.

## Events

| Event              | When                   | Detail       |
| ------------------ | ---------------------- | ------------ |
| `vt-filter-change` | The rows shown changed | `{ filter }` |

## CSS parts

`filters`, `table`, `row-added` (also `row-removed`, `row-changed`, `row-same`) and `cell-changed`.
