# `<vt-describe>`

`<vt-describe>` profiles a dataset, as `describe()` in pandas: for each column, its type, its missing and distinct values, a summary and its distribution as small bars. Opening a column shows its quartiles, its histogram and its most frequent values. It is the first look at an export before reading it row by row.

```html
<vt-describe variant="full" src="/exports/customers.csv"></vt-describe>
```

## What it reads

The same data as `<vt-pivot>`: CSV (or TSV, `;` and `|`, detected) with a header row, or JSON, a list of objects or an object holding one under `data`, `records`, `items` or `rows`.

## Types

| Type     | When every value present is                                      | Summary                        |
| -------- | ---------------------------------------------------------------- | ------------------------------ |
| Number   | a number: `1234.5`, `-3`, `1,234,567`, `15%`                     | range, mean, median; histogram |
| Date     | an ISO 8601 date (`2026-01-05`, or a date and time)              | range; histogram of days       |
| Yes / no | `true`, `false`, `yes`, `no` (also `oui`, `non`, `vrai`, `faux`) | shares of the two values       |
| Text     | anything else                                                    | most frequent values, lengths  |

Empty values and `NA`, `N/A`, `NaN`, `null`, `None`, `-` and `?` are missing: they are counted, never part of the statistics.

## Statistics

Quartiles and the median are interpolated between the nearest two values, as pandas and NumPy do by default; the standard deviation is that of a sample. Histograms have `bins` bars of equal width from the smallest to the largest value; whole numbers that span fewer values than bars get one bar per value. Each distribution is an image with a text alternative that says where most values are, and each bar tells its range and count on hover.

Distinct values are counted up to 50,000 per column; beyond, the count is written with a `+`.

## Attributes

| Attribute  | Type    | Default | Description                           |
| ---------- | ------- | ------- | ------------------------------------- |
| `columns`  | string  | all     | Columns profiled, separated by commas |
| `bins`     | number  | 12      | Bars of a histogram, 4 to 50          |
| `top`      | number  | 5       | Most frequent values listed, 1 to 20  |
| `expanded` | boolean | off     | Opens the details of every column     |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header, search, copy and download (the profile as CSV, a row per column, with formulas neutralized for spreadsheets) and full screen.

## Properties

`profile` is the profile: `{ rows, columns }`, each column `{ name, type, count, missing, distinct, numbers, histogram, length, top }`; `numbers` holds `min`, `q1`, `median`, `mean`, `q3`, `max`, `std` and `sum` (days since 1970 for dates).

## Events

| Event       | When                                     | Detail             |
| ----------- | ---------------------------------------- | ------------------ |
| `vt-toggle` | The details of a column opened or closed | `{ column, open }` |

## CSS parts

`table`, `bars` and `details`.
