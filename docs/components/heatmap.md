# `<vt-heatmap>`

`<vt-heatmap>` shows values as shaded squares: values by day as a calendar of weeks, like the contributions of a profile, or values by two categories as a matrix (load by hour and weekday, errors by service and day). The value of each square is written for screen readers and shown on hover and focus.

```html
<vt-heatmap variant="full" unit="commits" year="2026" src="/stats/commits.json"></vt-heatmap>
```

## What it reads

| Data                       | JSON                                                                        | CSV          |
| -------------------------- | --------------------------------------------------------------------------- | ------------ |
| Values by day (a calendar) | `{ "2026-01-05": 3 }`, `[{ "date": …, "value": … }]`, `[["2026-01-05", 3]]` | `date,value` |
| Two categories (a matrix)  | `[{ "x": "Mon", "y": "9h", "value": 3 }]`                                   | `x,y,value`  |

Dates are ISO 8601 (`2026-01-05`, or a date and time) or timestamps in seconds or milliseconds; values of the same day or cell are added. A record without a value counts 1, so a list of events gives the number of events by day. In CSV, a column named `date`, `day`, `time` or `timestamp` is read as dates when it holds dates; otherwise the first two columns are the categories of a matrix and the third its value.

## The calendar

By default, the calendar shows the year that ends on the last day with a value; `year`, or `from` and `to`, choose another period (up to three years). Weeks start on the day of the reader's language, or `first-day`. Months are named above the weeks, and every other day of the week on the side.

## Shades

Values are shaded from the sunken surface to the accent of the theme, in `levels` steps (5 by default, the first for no value). The darkest is the largest value, or `max`. The scale "Less … More" is under the map, with the total and the largest value.

## Keyboard

The squares follow the grid pattern of WAI-ARIA: one is in the tab order, arrows move between them, Home and End go to the first and last of a row, and Enter or Space sends `vt-select`.

## Attributes

| Attribute   | Type   | Default                   | Description                                 |
| ----------- | ------ | ------------------------- | ------------------------------------------- |
| `from`      | string | a year before `to`        | First day shown (`YYYY-MM-DD`)              |
| `to`        | string | the last day with a value | Last day shown                              |
| `year`      | number | none                      | A calendar year, instead of `from` and `to` |
| `first-day` | number | from the language         | First day of the week, 0 (Sunday) to 6      |
| `levels`    | number | 5                         | Shades, from 3 to 9                         |
| `max`       | number | the largest value         | Value of the darkest shade                  |
| `unit`      | string | none                      | Word after a value, such as `commits`       |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header, copy and download (the data as CSV) and full screen. `--vt-heatmap-cell` sets the size of a square (`13px`).

## Events

| Event       | When                | Detail                                              |
| ----------- | ------------------- | --------------------------------------------------- |
| `vt-select` | A square was chosen | `{ date, value }`, or `{ x, y, value }` in a matrix |

## CSS parts

`grid`, `cell` (also `cell-0` to `cell-8` by shade), `legend` and `summary`.
