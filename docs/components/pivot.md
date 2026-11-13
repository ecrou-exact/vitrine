# `<vt-pivot>`

`<vt-pivot>` is a pivot table: records from CSV or JSON grouped by the values of some fields in rows and others in columns, with a value summed, counted, averaged or other in each cell, and the totals. Cells can be shaded by their value, and choosing one sends its records, to show them in a `<vt-table>` for example.

```html
<vt-pivot variant="full" rows="region" columns="quarter" values="revenue" heat>
  <template>
    region,quarter,revenue
    North,Q1,120
    North,Q2,150
    South,Q1,60
    South,Q2,80
  </template>
</vt-pivot>
```

In the full variant, lists choose the field in rows, the field in columns, the value and the calculation, as in a spreadsheet; `vt-change` reports each change.

## What it reads

- CSV (or TSV, `;` and `|`, detected) with a header row.
- JSON: a list of objects, or an object holding one under `data`, `records`, `items` or `rows`.

Numbers are read as people write them: `1234.5`, `-3`, `1,234,567`, `12 345`, `15%`. A field is numeric when all its values are. Without attributes, the rows are the first text field, the value the first numeric field that is not in rows or columns, and the calculation a sum (a count when no field is numeric).

## Calculations

| `aggregate` | Each cell holds                |
| ----------- | ------------------------------ |
| `sum`       | The sum of the values          |
| `count`     | The number of records          |
| `avg`       | The average of the values      |
| `min`       | The smallest value             |
| `max`       | The largest value              |
| `distinct`  | The number of different values |

Totals are computed from the records, not from the cells: the total of an average is the average of all the records of the row or column.

## Drilling down

Each value is a button: choosing it (click, Enter or Space) sends `vt-select` with the keys of its row and column and its records.

```js
pivot.addEventListener('vt-select', (event) => {
  table.data = event.detail.records; // the records behind the cell
});
```

## JSON

```js
document.querySelector('vt-pivot').data = {
  rows: ['region'],
  columns: ['quarter'],
  values: 'revenue',
  aggregate: 'avg',
  data: [{ region: 'North', quarter: 'Q1', revenue: 120 } /* … */],
};
```

## Attributes

| Attribute   | Type    | Default                 | Description                                      |
| ----------- | ------- | ----------------------- | ------------------------------------------------ |
| `rows`      | string  | the first text field    | Fields in rows, separated by commas              |
| `columns`   | string  | none                    | Fields in columns, separated by commas           |
| `values`    | string  | the first numeric field | Field aggregated                                 |
| `aggregate` | string  | `sum`                   | `sum`, `count`, `avg`, `min`, `max`, `distinct`  |
| `totals`    | boolean | on                      | Totals of rows and columns                       |
| `heat`      | boolean | off                     | Shades cells by their value (written too)        |
| `decimals`  | number  | up to 2                 | Decimals shown                                   |
| `controls`  | boolean | preset                  | Lists that choose the fields and the calculation |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header, the lists, search, copy and download (the table as CSV, with formulas neutralized for spreadsheets) and full screen. At most 2,000 different values of a field and 1,000 rows are shown.

## Properties

`settings` is `{ rows, columns, values, aggregate }`, the fields and calculation shown; setting it changes them.

## Events

| Event       | When                                        | Detail                                 |
| ----------- | ------------------------------------------- | -------------------------------------- |
| `vt-change` | The lists changed the fields or calculation | `{ rows, columns, values, aggregate }` |
| `vt-select` | A cell or a total was chosen                | `{ row, column, value, records }`      |

## CSS parts

`controls`, `table`, `header-cell`, `cell` and `total`.
