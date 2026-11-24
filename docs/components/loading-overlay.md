# `<vt-loading-overlay>`

`<vt-loading-overlay>` covers a part of the page while it saves or reloads. The content stays in place, dimmed or blurred, and cannot be reached: it is made `inert` and marked busy. A spinner, a message, an optional progress bar and an optional Cancel button sit in the middle. `fullscreen` covers the whole window.

```html
<vt-loading-overlay id="saving" active="false" text="Saving your changes…" delay="300ms">
  <form>…</form>
</vt-loading-overlay>
<script>
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    saving.start();
    await save(new FormData(form));
    saving.stop();
  });
</script>
```

## Covering

`scrim="light"` (default) whitens the content, `dark` darkens it and puts the message in a card, `blur` blurs it, `none` leaves it visible. While shown, each child of the element gets `inert` (children that already had it keep it), so neither the keyboard nor the mouse can reach them; focus inside the content moves to the overlay. The overlay keeps at least 140px of height (`--vt-overlay-min-height`) so its panel always fits.

## Progress and cancel

`value` (with `max`) adds a progress bar under the message; update it as the work moves. `cancelable` adds a Cancel button (`cancel-text` to rename it) that fires `vt-cancel`: stop the work, then call `stop()`.

## Full screen

`fullscreen` covers the whole window, above everything, in a card. Use it for page-wide work, such as an import; the page behind is not made inert, so prefer a local overlay when you can.

## Attributes

| Attribute     | Values                                         | Default  | Description                                          |
| ------------- | ---------------------------------------------- | -------- | ---------------------------------------------------- |
| `text`        | text                                           | —        | Message under the spinner, also the accessible name. |
| `spinner`     | a [spinner shape](spinner.md#shapes) or `none` | `ring`   | The spinner.                                         |
| `value`       | number                                         | —        | Adds a progress bar.                                 |
| `max`         | number                                         | `100`    | End of the progress range.                           |
| `scrim`       | `light`, `dark`, `blur`, `none`                | `light`  | How the content is covered.                          |
| `cancelable`  | boolean                                        | off      | A Cancel button.                                     |
| `cancel-text` | text                                           | "Cancel" | Its text.                                            |
| `fullscreen`  | boolean                                        | off      | Cover the whole window.                              |
| `size`        | `xs`…`xl` or a CSS length                      | `lg`     | Size of the spinner.                                 |

`active`, `delay`, `min-duration`, `size`, `tone`, `speed`, `motion`, `label`, `theme` and `lang-ui` are shared by every loading indicator: see [loading indicators](../loading.md#shared-attributes).

## Properties and methods

| Member    | Description                      |
| --------- | -------------------------------- |
| `start()` | Shows it (after `delay`).        |
| `stop()`  | Hides it (after `min-duration`). |
| `active`  | Shown or not (read and write).   |
| `shown`   | On screen right now (read-only). |

## Events

| Event              | Detail               | When                           |
| ------------------ | -------------------- | ------------------------------ |
| `vt-cancel`        | `{}`                 | The Cancel button was pressed. |
| `vt-loading-start` | `{ type }`           | Shown, after `delay`.          |
| `vt-loading-end`   | `{ type, duration }` | Hidden.                        |

## CSS parts

| Part        | Element                                                   |
| ----------- | --------------------------------------------------------- |
| `indicator` | The wrapper of the content and the overlay.               |
| `content`   | The wrapper of the content.                               |
| `overlay`   | The overlay.                                              |
| `panel`     | The box with the spinner and the message (role="status"). |
| `spinner`   | The spinner.                                              |
| `text`      | The message.                                              |
| `progress`  | The progress bar.                                         |
| `cancel`    | The Cancel button.                                        |

## Custom properties

| Property                  | Description                                    |
| ------------------------- | ---------------------------------------------- |
| `--vt-overlay-scrim`      | Color of the scrim.                            |
| `--vt-overlay-min-height` | Smallest height while shown (default `140px`). |

## Accessibility

The panel is a `role="status"` named by `label` or `text`; the covered content is `inert` and the element `aria-busy`, so assistive technologies neither reach nor read the stale content. The progress bar is a `role="progressbar"`.
