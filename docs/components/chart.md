# `<vt-chart>`

`<vt-chart>` draws line, area, bar and donut charts from CSV or JSON, with [Apache ECharts](https://echarts.apache.org) in the colors of the current theme. Values can be read with the pointer or the keyboard, and a Table tab shows the same data as an accessible table.

```html
<vt-chart type="bar" variant="full" label="Visitors">
  <template>
    month,desktop,mobile
    Jan,186,80
    Feb,305,200
    Mar,237,120
  </template>
</vt-chart>
```

## Loading

ECharts is large (about 225 KB gzipped), so it is not part of the Vitrine bundles: the first chart on a page loads `dist/vendor/echarts.js`, next to the other Vitrine files, and the Vitrine loader is shown meanwhile. Pages without charts never download it. When self-hosting, keep `dist/vendor/` next to the scripts, or point `Vitrine.configure({ vendorUrl })` at the folder that holds `echarts.js`.

The ECharts build shipped with Vitrine works under a strict Content Security Policy with Trusted Types: tooltips are drawn on the canvas, never as HTML, so labels and values from the data cannot inject markup.

## Variants

| Feature                | `simple` (default) | `full` |
| ---------------------- | ------------------ | ------ |
| `header`               | off                | on     |
| `dot`                  | off                | on     |
| `copy` (data as CSV)   | off                | on     |
| `download` (CSV)       | off                | on     |
| `fullscreen`           | off                | on     |
| `tabs` (Chart / Table) | off                | on     |
| `grid`                 | on                 | on     |

## Data

The format is detected from the content.

| Format                       | Example                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| CSV or TSV with a header row | `month,desktop,mobile` then one row per label                                            |
| JSON array of objects        | `[{ "month": "Jan", "desktop": 186 }, …]`                                                |
| Chart.js style               | `{ "labels": ["Jan", "Feb"], "datasets": [{ "label": "Desktop", "data": [186, 305] }] }` |
| Labels and series            | `{ "labels": [...], "series": [{ "name": "Desktop", "data": [...] }] }`                  |
| Plain numbers                | `[4, 8, 15, 16, 23, 42]`                                                                 |

In tables (CSV and arrays of objects), the labels come from `x`, or the first column that is not plotted; the series are the columns named in `y`, or every numeric column. Numbers may be written `1,234.5`, `12%` or `3e2`; empty cells are gaps in lines. At most 12 series of 5,000 points are read.

```html
<vt-chart type="line" x="date" y="p95 p99" unit="ms" src="/metrics/latency.csv"></vt-chart>
```

From JavaScript, set `content`:

```js
chart.content = JSON.stringify(await (await fetch('/api/sales')).json());
```

## Types

| `type` | Draws                                                                               |
| ------ | ----------------------------------------------------------------------------------- |
| `line` | One line per series (default). The axis fits the values; it does not start at zero. |
| `area` | Lines with the area under them filled. With `stacked`, the series pile up.          |
| `bar`  | Grouped bars, or piled with `stacked`; `horizontal` lays them sideways.             |
| `pie`  | A donut of the first visible series (or the one named in `y`), one slice per label. |

`smooth` draws curves instead of straight segments (line and area); `points` shows a dot on every value (on by default up to 60 points); `zoom` adds zooming and panning along the labels (mouse wheel, drag, and a slider under the chart). `min` and `max` fix the value axis.

## Formatting

`unit` is added after every value (`ms`, `€`, `%`), and `compact` writes large numbers short (`1.2K`, `3.4M`). Numbers follow the interface language (`lang-ui`).

## Colors

Series colors come from the theme: accent, info, warning, keyword, danger, string, number and muted, in that order. Override them with public tokens:

```css
vt-chart {
  --vt-chart-1: #6366f1;
  --vt-chart-2: #f43f5e;
}
```

Tokens: `--vt-chart-1` to `--vt-chart-8`. Axis text, grid lines and tooltips use the interface colors, so the chart follows the light and dark themes.

## Reading values

- **Pointer**: a tooltip shows every series at the label under the pointer (a band highlights the label in bar charts); slices show their value.
- **Keyboard**: the chart is one tab stop. Arrow keys move between labels, Home and End jump to the first and last, Escape hides the tooltip. Each move announces the values to screen readers ("Apr: desktop 73, mobile 190").
- **Legend**: with two series or more, buttons above the chart show or hide each series; the chart animates to the new data. At least one series stays visible.
- **Table tab**: the same data as a table with row and column headers.

Clicking a value, or pressing Enter, fires `vt-select`.

## Editing

With `mode="edit"`, an editor holds the data above the chart, which animates to the new values as you type. See [Editing](../editing.md).

## Attributes

This table lists the attributes specific to `<vt-chart>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute    | Type                             | Default                  | Description                      |
| ------------ | -------------------------------- | ------------------------ | -------------------------------- |
| `type`       | `line`, `area`, `bar` or `pie`   | `line`                   | Chart type.                      |
| `stacked`    | boolean                          | off                      | Stack the series (area and bar). |
| `smooth`     | boolean                          | off                      | Smooth curves (line and area).   |
| `horizontal` | boolean                          | off                      | Horizontal bars.                 |
| `zoom`       | boolean                          | off                      | Zoom and pan along the labels.   |
| `x`          | column name                      | first non-plotted column | Labels.                          |
| `y`          | column names separated by spaces | every numeric column     | Series.                          |
| `height`     | integer 120 to 800               | `300`                    | Height of the plot, in pixels.   |
| `legend`     | boolean                          | on with 2 series or more | Legend buttons.                  |
| `grid`       | boolean                          | on                       | Grid lines.                      |
| `points`     | boolean                          | on up to 60 points       | Dots on values.                  |
| `unit`       | text                             | none                     | Suffix of values.                |
| `compact`    | boolean                          | off                      | Compact numbers.                 |
| `min`, `max` | number                           | automatic                | Range of the value axis.         |
| `tabs`       | boolean                          | preset                   | Chart / Table tabs.              |
| `view`       | `chart` or `table`               | `chart`                  | Initial view.                    |

## Properties

| Property  | Type     | Description                                                                            |
| --------- | -------- | -------------------------------------------------------------------------------------- |
| `content` | `string` | The data as CSV or JSON.                                                               |
| `data`    | `object` | The data read from it: `{ labels, series: [{ name, values }], truncated }`. Read-only. |

## Events

| Event           | `detail`                      | When                                     |
| --------------- | ----------------------------- | ---------------------------------------- |
| `vt-ready`      | `{ type: "chart" }`           | The chart was rendered                   |
| `vt-select`     | `{ index, label, values }`    | A value was clicked or chosen with Enter |
| `vt-tab-change` | `{ tab }`: `chart` or `table` | The view changed                         |
| `vt-copy`       | `{ text }`                    | The data was copied as CSV               |
| `vt-error`      | `{ message, cause }`          | Loading failed or the text is too large  |

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts): `plot` (the drawing area), `legend`, `legend-item`, `table`.

## Accessibility

The plot has a text description: the chart type, the number of series and points, and the range of each series ("desktop from 73 to 305"). Values are announced while moving with the keyboard, the legend buttons are toggle buttons, and the Table tab gives the exact numbers. With reduced motion requested, charts appear without animation.
