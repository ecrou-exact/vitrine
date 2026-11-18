# `<vt-page-progress>`

`<vt-page-progress>` is the thin bar along the top of the page for navigations and long requests. `start()` shows it and lets it creep forward on its own ("trickle"), so the reader sees that something happens even when progress is unknown; `done()` fills it and fades it out.

```html
<vt-page-progress id="nav"></vt-page-progress>
<script>
  nav.start();
  const response = await fetch('/next-page');
  nav.done();
</script>
```

## API

| Method         | Does                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `start()`      | Shows the bar at `minimum` (8%) and starts the trickle.                                           |
| `set(ratio)`   | Moves to a ratio from 0 to 1 (starts the bar if needed).                                          |
| `inc(amount?)` | Moves forward by `amount`, or by a step that shrinks near the end; never reaches 100% on its own. |
| `done(force?)` | Fills the bar, fires `vt-complete`, then hides it.                                                |
| `stop()`       | Same as `done()`.                                                                                 |

It is off until started; `active` starts it from HTML.

## Placement

`position="bottom"` uses the bottom edge. `placement="absolute"` keeps the bar inside the nearest positioned container (a panel, a dialog) instead of the window. `thickness` sets the height (3px), `glow="false"` removes the glow, `spinner` adds a small spinner in the corner.

## Attributes

| Attribute       | Values              | Default | Description                             |
| --------------- | ------------------- | ------- | --------------------------------------- |
| `value`         | 0 to 1              | —       | Progress, when it is known.             |
| `trickle`       | boolean             | on      | Creep forward on its own while started. |
| `trickle-speed` | duration            | `300ms` | Time between two steps of the trickle.  |
| `minimum`       | 0 to 0.5            | `0.08`  | Where the bar starts.                   |
| `position`      | `top`, `bottom`     | `top`   | Edge.                                   |
| `placement`     | `fixed`, `absolute` | `fixed` | Window or container.                    |
| `thickness`     | CSS length          | `3px`   | Height of the bar.                      |
| `glow`          | boolean             | on      | A soft glow.                            |
| `spinner`       | boolean             | off     | A corner spinner.                       |

`active`, `delay`, `min-duration`, `size`, `tone`, `speed`, `motion`, `label`, `theme` and `lang-ui` are shared by every loading indicator: see [loading indicators](../loading.md#shared-attributes).

## Properties and methods

| Member         | Description                            |
| -------------- | -------------------------------------- |
| `start()`      | Starts the bar.                        |
| `set(ratio)`   | Moves it.                              |
| `inc(amount?)` | Moves it forward.                      |
| `done(force?)` | Fills and hides it.                    |
| `value`        | Progress from 0 to 1 (read and write). |
| `shown`        | On screen (read-only).                 |

## Events

| Event              | Detail                     | When                     |
| ------------------ | -------------------------- | ------------------------ |
| `vt-progress`      | `{ value, max: 1, ratio }` | The bar moved.           |
| `vt-complete`      | `{ status: "done" }`       | `done()` filled the bar. |
| `vt-loading-start` | `{ type }`                 | Shown, after `delay`.    |
| `vt-loading-end`   | `{ type, duration }`       | Hidden.                  |

## CSS parts

| Part        | Element                                   |
| ----------- | ----------------------------------------- |
| `indicator` | The bar's container (role="progressbar"). |
| `bar`       | The bar.                                  |
| `spinner`   | The corner spinner.                       |

## Custom properties

| Property               | Description       |
| ---------------------- | ----------------- |
| `--vt-indicator-color` | Color of the bar. |

## Accessibility

The container is a `role="progressbar"` named "Page loading" (or `label`), with its value in percent. It takes no room in the page and does not catch the pointer. With "reduce motion", it moves without transitions and hides at once.
