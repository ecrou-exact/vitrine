# `<vt-progress>`

`<vt-progress>` is a linear progress bar. With a `value` it shows how much is done; without, it slides to say "working". It can show a buffer ahead of the value, split into steps, carry stripes, take a status color, and show a text with the value as a percentage, a number or a fraction.

```html
<vt-progress value="42" text="Uploading report.pdf" show-value="percent"></vt-progress>
<vt-progress value="30" buffer="65" text="Streaming" show-value="fraction" unit="MB"></vt-progress>
<vt-progress value="3" max="5" segments="5" status="success" thickness="md"></vt-progress>
<vt-progress text="Preparing…"></vt-progress>
```

## Value

`value` between `min` (0) and `max` (100); it is kept inside the range. Without `value`, the bar is indeterminate. Set it from script with `el.value = 42`; `el.value = null` goes back to indeterminate. `vt-progress` fires on each change and `vt-complete` once the value reaches `max`.

## Showing the value

| `show-value`     | Shows                           |
| ---------------- | ------------------------------- |
| `none` (default) | Nothing.                        |
| `percent`        | `42%`                           |
| `value`          | `42`, with `unit` after it.     |
| `fraction`       | `3 of 5`, with `unit` after it. |

`decimals` sets the decimals; `value-text` replaces the computed text (`3 min left`) for sighted readers and screen readers alike.

## Looks

`buffer` draws a lighter bar ahead of the value (video buffering, prefetched pages). `segments` (2 to 50) cuts the bar into steps. `striped` adds diagonal stripes and `animated` moves them. `status` colors the bar (`success`, `warning`, `error`) unless `tone` is set. `thickness` is `xs` 2px, `sm` 4px (default), `md` 8px, `lg` 12px, `xl` 16px or a CSS length; `square` removes the rounded ends.

## Attributes

| Attribute    | Values                                  | Default  | Description                                      |
| ------------ | --------------------------------------- | -------- | ------------------------------------------------ |
| `value`      | number                                  | —        | The value; without it, the bar is indeterminate. |
| `min`        | number                                  | `0`      | Start of the range.                              |
| `max`        | number                                  | `100`    | End of the range.                                |
| `buffer`     | number                                  | —        | A lighter bar up to this value.                  |
| `text`       | text                                    | —        | Text above the bar, also the accessible name.    |
| `show-value` | `percent`, `value`, `fraction`, `none`  | `none`   | The value next to the text.                      |
| `unit`       | text                                    | —        | Unit after the value or fraction.                |
| `decimals`   | 0 to 4                                  | `0`      | Decimals of the value shown.                     |
| `value-text` | text                                    | —        | The value as text, instead of the computed one.  |
| `status`     | `normal`, `success`, `warning`, `error` | `normal` | Color of the bar, unless `tone` is set.          |
| `segments`   | 2 to 50                                 | —        | Splits the bar into steps.                       |
| `striped`    | boolean                                 | off      | Diagonal stripes.                                |
| `animated`   | boolean                                 | off      | Moving stripes (with `striped`).                 |
| `thickness`  | `xs`…`xl` or a CSS length               | `sm`     | Height of the bar.                               |
| `square`     | boolean                                 | off      | Square ends.                                     |

`active`, `delay`, `min-duration`, `size`, `tone`, `speed`, `motion`, `label`, `theme` and `lang-ui` are shared by every loading indicator: see [loading indicators](../loading.md#shared-attributes).

## Properties and methods

| Member    | Description                                            |
| --------- | ------------------------------------------------------ |
| `start()` | Shows it (after `delay`).                              |
| `stop()`  | Hides it (after `min-duration`).                       |
| `active`  | Shown or not (read and write).                         |
| `shown`   | On screen right now (read-only).                       |
| `value`   | The value, `null` when indeterminate (read and write). |
| `max`     | End of the range (read and write).                     |
| `ratio`   | Share done, 0 to 1 (read-only).                        |

## Events

| Event              | Detail                  | When                     |
| ------------------ | ----------------------- | ------------------------ |
| `vt-progress`      | `{ value, max, ratio }` | The value changed.       |
| `vt-complete`      | `{ status }`            | The value reached `max`. |
| `vt-loading-start` | `{ type }`              | Shown, after `delay`.    |
| `vt-loading-end`   | `{ type, duration }`    | Hidden.                  |

## CSS parts

| Part        | Element                               |
| ----------- | ------------------------------------- |
| `indicator` | The wrapper.                          |
| `head`      | The line with the text and the value. |
| `text`      | The text.                             |
| `value`     | The value shown.                      |
| `track`     | The track (role="progressbar").       |
| `bar`       | The value bar.                        |
| `buffer`    | The buffer bar.                       |

## Custom properties

| Property                  | Description                              |
| ------------------------- | ---------------------------------------- |
| `--vt-indicator-color`    | Color of the bar.                        |
| `--vt-indicator-track`    | Color of the track.                      |
| `--vt-indicator-duration` | One indeterminate cycle at normal speed. |

## Accessibility

The track is a `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and `aria-valuetext` (the value as shown, or the percentage). Its name is `label`, else `text`, else "Loading". An indeterminate bar has no value and is `aria-busy`. With "reduce motion", the indeterminate bar fades instead of sliding, and values change without transition.
