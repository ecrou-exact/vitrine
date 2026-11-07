# `<vt-stats>`

`<vt-stats>` shows key figures as tiles: a value, how it changed, and its history as a small line.

```html
<vt-stats json-src="/api/kpis" json-path="data"></vt-stats>
```

## Format

A list of figures, or an object with `stats` (also `items`, `metrics`, `kpis`).

```json
[
  {
    "label": "Visitors",
    "value": 48210,
    "previous": 41200,
    "format": "compact",
    "against": "vs last month",
    "series": [31, 35, 33, 38, 41, 44, 48]
  },
  { "label": "Error rate", "value": 0.42, "previous": 0.61, "format": "percent", "good": "down" },
  { "label": "Uptime", "value": "99.98%", "description": "Last 90 days" }
]
```

| Key        | Meaning                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| `value`    | A number, or a text shown as it is                                                                            |
| `format`   | `number` (default), `compact` (48.2K), `currency`, `percent` (`12.5` is 12.5%), `bytes`, `duration` (seconds) |
| `currency` | ISO 4217 code for `currency`                                                                                  |
| `digits`   | Decimals shown                                                                                                |
| `unit`     | Written after the value                                                                                       |
| `previous` | The value before: the change is worked out in percent. There is none from zero                                |
| `change`   | The change in percent, when you have it already                                                               |
| `good`     | Which direction is good news: `up` (default), `down`, or `none`                                               |
| `against`  | What the change compares with                                                                                 |
| `series`   | The history: numbers, or `{ label, value }`                                                                   |
| `url`      | A link on the name                                                                                            |

Values are written for the language of the interface with `Intl.NumberFormat`.

## Changes and history

A change is written in words, "Up 17% vs last month", with an arrow, in green when it is good news and red otherwise; color is never the only sign.

The history is a single line with no axis or legend: the name of the tile names it. Moving over it, or focusing it and pressing the arrows, reads each point under the line.

## Attributes

| Attribute | Type    | Default | Description                                         |
| --------- | ------- | ------- | --------------------------------------------------- |
| `columns` | number  | auto    | Fixed number of columns; by default, as many as fit |
| `trend`   | boolean | on      | The small line of each figure                       |
| `changes` | boolean | on      | How each figure changed                             |

Shared attributes are in [Common attributes](../common-attributes.md).

## CSS parts

`stat`, `label`, `value`, `change` and `trend`, plus the [shared parts](../theming.md).
