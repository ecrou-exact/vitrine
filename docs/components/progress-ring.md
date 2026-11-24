# `<vt-progress-ring>`

`<vt-progress-ring>` is a circular gauge with the value in its center: storage used, a score, a download. Without a `value`, a short arc turns.

```html
<vt-progress-ring value="72"></vt-progress-ring>
<vt-progress-ring value="88" max="128" show-value="value" unit="GB" text="Storage" status="warning" size="xl"></vt-progress-ring>
<vt-progress-ring size="md"></vt-progress-ring>
```

## Value

Same as [`<vt-progress>`](progress.md#value): `value`, `min`, `max`, the `value` property, `vt-progress` and `vt-complete`. The center shows the percentage by default; `show-value` gives `value`, `fraction` or `none`, and `value-text` any text (`3/5`).

## Looks

`size` sets the radius (`lg`, 72px wide, by default). `thickness` is the width of the arc in percent of the size (4 to 30, default 10); `cap="butt"` gives square ends. `text` adds a caption under the ring. `status` colors the arc.

## Attributes

| Attribute    | Values                                  | Default   | Description                                       |
| ------------ | --------------------------------------- | --------- | ------------------------------------------------- |
| `value`      | number                                  | —         | The value; without it, the ring is indeterminate. |
| `min`        | number                                  | `0`       | Start of the range.                               |
| `max`        | number                                  | `100`     | End of the range.                                 |
| `show-value` | `percent`, `value`, `fraction`, `none`  | `percent` | The value in the center.                          |
| `unit`       | text                                    | —         | Unit after the value.                             |
| `decimals`   | 0 to 4                                  | `0`       | Decimals.                                         |
| `value-text` | text                                    | —         | Text in the center instead of the value.          |
| `text`       | text                                    | —         | Caption under the ring, also the accessible name. |
| `status`     | `normal`, `success`, `warning`, `error` | `normal`  | Color of the arc.                                 |
| `thickness`  | 4 to 30                                 | `10`      | Width of the arc, in percent of the size.         |
| `cap`        | `round`, `butt`                         | `round`   | Ends of the arc.                                  |
| `size`       | `xs`…`xl` or a CSS length               | `lg`      | Half the width of the ring.                       |

`active`, `delay`, `min-duration`, `size`, `tone`, `speed`, `motion`, `label`, `theme` and `lang-ui` are shared by every loading indicator: see [loading indicators](../loading.md#shared-attributes).

## Properties and methods

| Member    | Description                                            |
| --------- | ------------------------------------------------------ |
| `start()` | Shows it (after `delay`).                              |
| `stop()`  | Hides it (after `min-duration`).                       |
| `active`  | Shown or not (read and write).                         |
| `shown`   | On screen right now (read-only).                       |
| `value`   | The value, `null` when indeterminate (read and write). |
| `max`     | End of the range.                                      |
| `ratio`   | Share done, 0 to 1 (read-only).                        |

## Events

| Event              | Detail                  | When                     |
| ------------------ | ----------------------- | ------------------------ |
| `vt-progress`      | `{ value, max, ratio }` | The value changed.       |
| `vt-complete`      | `{ status }`            | The value reached `max`. |
| `vt-loading-start` | `{ type }`              | Shown, after `delay`.    |
| `vt-loading-end`   | `{ type, duration }`    | Hidden.                  |

## CSS parts

| Part        | Element                       |
| ----------- | ----------------------------- |
| `indicator` | The wrapper.                  |
| `ring`      | The SVG (role="progressbar"). |
| `track`     | The full circle.              |
| `arc`       | The value arc.                |
| `value`     | The value in the center.      |
| `text`      | The caption.                  |

## Custom properties

| Property               | Description         |
| ---------------------- | ------------------- |
| `--vt-indicator-color` | Color of the arc.   |
| `--vt-indicator-track` | Color of the track. |

## Accessibility

The SVG is a `role="progressbar"` with its value and `aria-valuetext`; the number in the center and the caption are hidden from screen readers so they are not read twice.
