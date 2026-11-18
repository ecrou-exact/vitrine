# `<vt-spinner>`

`<vt-spinner>` shows that something is happening when the length of the wait is unknown. Seven shapes, any size, tone and speed, an optional visible text, and a delay so that short waits never flash.

```html
<vt-spinner></vt-spinner>
<vt-spinner type="dots" tone="neutral"></vt-spinner>
<vt-spinner type="arc" size="lg" text="Loading results…" delay="200ms"></vt-spinner>
```

## Shapes

| `type`           | Look                                       |
| ---------------- | ------------------------------------------ |
| `ring` (default) | A track with one colored quarter turning.  |
| `arc`            | A ring with a fading tail.                 |
| `dual-ring`      | Two arcs turning in opposite directions.   |
| `dots`           | Three dots fading in turn.                 |
| `bars`           | Four bars rising in turn, as an equalizer. |
| `pulse`          | Two waves growing from the center.         |
| `orbit`          | A dot circling a faint track.              |

All are drawn with CSS only: no image, no script animation, nothing blocked by a strict Content Security Policy.

## Text

`text` adds a visible text after the spinner, or under it with `text-position="below"`. It is also the accessible name, unless `label` is set. Inside a button or a colored banner, `tone="current"` takes the text color.

## Attributes

| Attribute       | Values                                                       | Default     | Description                             |
| --------------- | ------------------------------------------------------------ | ----------- | --------------------------------------- |
| `type`          | `ring`, `arc`, `dual-ring`, `dots`, `bars`, `pulse`, `orbit` | `ring`      | The shape.                              |
| `text`          | text                                                         | —           | Visible text, also the accessible name. |
| `text-position` | `end`, `below`                                               | `end`       | Text after the spinner or under it.     |
| `size`          | `xs`…`xl` or a CSS length                                    | `md` (24px) | Size of the shape.                      |

`active`, `delay`, `min-duration`, `size`, `tone`, `speed`, `motion`, `label`, `theme` and `lang-ui` are shared by every loading indicator: see [loading indicators](../loading.md#shared-attributes).

## Properties and methods

| Member    | Description                      |
| --------- | -------------------------------- |
| `start()` | Shows it (after `delay`).        |
| `stop()`  | Hides it (after `min-duration`). |
| `active`  | Shown or not (read and write).   |
| `shown`   | On screen right now (read-only). |

## Events

| Event              | Detail               | When                  |
| ------------------ | -------------------- | --------------------- |
| `vt-loading-start` | `{ type }`           | Shown, after `delay`. |
| `vt-loading-end`   | `{ type, duration }` | Hidden.               |

## CSS parts

| Part        | Element                      |
| ----------- | ---------------------------- |
| `indicator` | The wrapper (role="status"). |
| `spinner`   | The shape.                   |
| `text`      | The visible text.            |

## Custom properties

| Property                  | Description                               |
| ------------------------- | ----------------------------------------- |
| `--vt-indicator-color`    | Color of the shape.                       |
| `--vt-indicator-track`    | Color of the track (ring, orbit).         |
| `--vt-indicator-size`     | Size.                                     |
| `--vt-indicator-duration` | One cycle at normal speed (default `1s`). |

## Accessibility

The spinner is a `role="status"` element named by `label`, `text` or "Loading" in the reader's language; the shape itself is hidden from screen readers. With "reduce motion", it fades instead of turning.
