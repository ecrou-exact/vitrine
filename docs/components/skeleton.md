# `<vt-skeleton>`

`<vt-skeleton>` draws placeholders in the shape of the content to come, so the page keeps its layout and feels faster than with a spinner. Put the real content inside: it is hidden while the skeleton is active, and shown when it stops.

```html
<vt-skeleton shape="card" media avatar id="card">
  <article class="card">…the real card…</article>
</vt-skeleton>
<script>
  await fillCard();
  card.stop(); // the placeholder goes, the card shows
</script>
```

## Shapes

| `shape`               | Draws                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| `paragraph` (default) | A heading and `lines` lines.                                              |
| `text`                | `lines` lines, the last one shorter.                                      |
| `heading`             | One title line.                                                           |
| `avatar`              | A circle (`width` sets its size).                                         |
| `button`              | A button.                                                                 |
| `media`               | A picture (`height`).                                                     |
| `block`               | A rectangle (`width`, `height`).                                          |
| `card`                | A card: a picture with `media`, a name with `avatar`, then `lines` lines. |
| `list`                | `rows` items, with an avatar each with `avatar`.                          |
| `table`               | A header and `rows` rows of `columns` cells.                              |
| `form`                | `rows` labelled fields and a button.                                      |
| `article`             | A title, an author with `avatar`, a picture and two paragraphs.           |

Line widths vary, but stay the same from one render to the next, so nothing moves.

## Animation

`animation="shimmer"` (default) sweeps a light band across the shapes, `pulse` fades them, `none` keeps them still. With "reduce motion", the shimmer becomes a slow fade. `--vt-skeleton-color` and `--vt-skeleton-highlight` set the colors.

## Attributes

| Attribute   | Values                     | Default             | Description                                  |
| ----------- | -------------------------- | ------------------- | -------------------------------------------- |
| `shape`     | see above                  | `paragraph`         | What the placeholder looks like.             |
| `lines`     | 1 to 20                    | `3`                 | Text lines.                                  |
| `rows`      | 1 to 50                    | `3`                 | Rows of lists, tables and forms.             |
| `columns`   | 1 to 12                    | `4`                 | Columns of tables.                           |
| `avatar`    | boolean                    | off                 | An avatar in lists, cards and articles.      |
| `media`     | boolean                    | off                 | A picture on top of cards.                   |
| `animation` | `shimmer`, `pulse`, `none` | `shimmer`           | The animation.                               |
| `width`     | CSS length                 | the available width | Width of the placeholder (avatar: its size). |
| `height`    | CSS length                 | depends             | Height of `block` and `media`.               |
| `radius`    | CSS length                 | depends             | Corner radius.                               |

`active`, `delay`, `min-duration`, `size`, `tone`, `speed`, `motion`, `label`, `theme` and `lang-ui` are shared by every loading indicator: see [loading indicators](../loading.md#shared-attributes).

## Properties and methods

| Member    | Description                      |
| --------- | -------------------------------- |
| `start()` | Shows it (after `delay`).        |
| `stop()`  | Hides it (after `min-duration`). |
| `active`  | Shown or not (read and write).   |
| `shown`   | On screen right now (read-only). |

## Events

| Event              | Detail               | When                       |
| ------------------ | -------------------- | -------------------------- |
| `vt-loading-start` | `{ type }`           | Shown, after `delay`.      |
| `vt-loading-end`   | `{ type, duration }` | The real content is shown. |

## CSS parts

| Part        | Element                                    |
| ----------- | ------------------------------------------ |
| `indicator` | The wrapper (role="status" while loading). |
| `skeleton`  | The placeholder.                           |
| `bone`      | Each shape.                                |
| `content`   | The wrapper of the real content.           |

## Custom properties

| Property                  | Description           |
| ------------------------- | --------------------- |
| `--vt-skeleton-color`     | Color of the shapes.  |
| `--vt-skeleton-highlight` | Color of the shimmer. |

## Accessibility

While loading, the placeholder is a `role="status"` named "Loading" (or `label`) and its shapes are hidden from screen readers; the element is `aria-busy`. The real content is hidden (`hidden`), so it is neither seen nor read until it is ready.
