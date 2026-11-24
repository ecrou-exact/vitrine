# Loading indicators

Ten elements show that something is happening, each for one kind of wait:

| Element                                                 | For                                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`<vt-spinner>`](components/spinner.md)                 | A short wait of unknown length: seven shapes (ring, arc, dual ring, dots, bars, pulse, orbit). |
| [`<vt-progress>`](components/progress.md)               | A known amount of work: a linear bar with buffer, segments, stripes and the value.             |
| [`<vt-progress-ring>`](components/progress-ring.md)     | The same as a circular gauge, with the value in the center.                                    |
| [`<vt-skeleton>`](components/skeleton.md)               | Content being fetched: placeholders in its shape (text, card, list, table, form…).             |
| [`<vt-loading-overlay>`](components/loading-overlay.md) | A part of the page that cannot be used while it saves or reloads.                              |
| [`<vt-page-progress>`](components/page-progress.md)     | Navigations and long requests: the thin bar along the top of the page.                         |
| [`<vt-loading-steps>`](components/loading-steps.md)     | A long task in several steps: install, deploy, import, checkout.                               |
| [`<vt-typing>`](components/typing.md)                   | Chats and assistants: "Ada is typing…".                                                        |
| [`<vt-loading-button>`](components/loading-button.md)   | The button that started the wait: spinner, "Saving…", then "Saved".                            |
| [`<vt-loading-message>`](components/loading-message.md) | A wait that tells what happens, the time elapsed, and when it is slow.                         |

They are much lighter than the other elements (15 to 22 KB gzip each, with the shared code) because they load no editor, highlighter or parser.

## Shared attributes

| Attribute      | Values                                                                 | Default            | Description                                                                                   |
| -------------- | ---------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| `active`       | boolean                                                                | on (see each page) | Shown or not. `<vt-page-progress>` and `<vt-loading-button>` are off until started.           |
| `delay`        | `300`, `300ms`, `1.5s`                                                 | `0`                | Wait before appearing. A fast load then shows nothing at all, instead of a flash.             |
| `min-duration` | duration                                                               | `0`                | Once shown, stay at least this long, so the indicator never flickers.                         |
| `size`         | `xs`, `sm`, `md`, `lg`, `xl` or a CSS length                           | depends            | Size of the spinner, dots or ring (12, 16, 24, 36, 56 px).                                    |
| `tone`         | `accent`, `neutral`, `success`, `warning`, `danger`, `info`, `current` | `accent`           | Color from the theme; `current` follows the text color (inside a button or a colored banner). |
| `speed`        | `slow`, `normal`, `fast` or a duration                                 | `normal`           | Speed of the animation; a duration sets the length of one cycle.                              |
| `motion`       | `auto`, `full`, `reduce`                                               | `auto`             | `auto` follows the reader's "reduce motion" setting: turning and sliding become a slow fade.  |
| `label`        | text                                                                   | "Loading"          | The accessible name, in the reader's language when not set.                                   |
| `theme`        | a theme name                                                           | the page theme     | As on every element ([theming](theming.md)).                                                  |
| `lang-ui`      | a language code                                                        | the configured one | Language of the built-in texts ("Loading", "Cancel", "Step 2 of 5"…).                         |

`delay` and `min-duration` together give the usual pattern: nothing for fast loads, and when the indicator does show, it stays long enough to be seen.

```html
<vt-spinner delay="200ms" min-duration="500ms" id="busy" active="false"></vt-spinner>
<script>
  busy.start();
  await loadResults();
  busy.stop(); // hides now, or once 500 ms have passed since it appeared
</script>
```

## Shared API

| Member    | Description                                                                               |
| --------- | ----------------------------------------------------------------------------------------- |
| `start()` | Shows the indicator (after `delay`).                                                      |
| `stop()`  | Hides it (once `min-duration` has passed). `<vt-page-progress>` fills its bar first.      |
| `active`  | Read and write: `el.active = false` is `stop()`.                                          |
| `shown`   | Read-only: on screen right now (after the delay, before the end of the minimum duration). |

| Event              | Detail                  | When                                                              |
| ------------------ | ----------------------- | ----------------------------------------------------------------- |
| `vt-loading-start` | `{ type }`              | The indicator appeared (after its delay).                         |
| `vt-loading-end`   | `{ type, duration }`    | It disappeared; `duration` is how long it was on screen, in ms.   |
| `vt-progress`      | `{ value, max, ratio }` | A progress value changed (bars, ring, page bar, steps).           |
| `vt-complete`      | `{ status }`            | The work is finished (value at `max`, every step done, `done()`). |
| `vt-cancel`        | `{}`                    | The reader pressed Cancel (overlay, steps).                       |

## Colors

The indicators have no background of their own: their text takes the color of the surrounding text, so it stays readable on any page, light or dark, and secondary text is dimmed. The theme and `tone` color the shapes (spinners, bars, arcs, dots). Elements that paint a surface (the overlay card, the button, the step marks) use the theme colors.

## Custom properties

Set them on the element or on any ancestor, for example once on `:root`:

| Property                  | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `--vt-indicator-color`    | Color of the spinner, bar or arc (overrides `tone`). |
| `--vt-indicator-track`    | Color of the track behind it.                        |
| `--vt-indicator-size`     | Size (overrides `size`).                             |
| `--vt-indicator-duration` | Length of one cycle at normal speed (default `1s`).  |

```css
vt-spinner,
vt-progress {
  --vt-indicator-color: #7c3aed;
}
```

## Choosing one

- Under a second: nothing. Use `delay` so fast loads show no indicator.
- A few seconds, unknown length: `<vt-spinner>`, or `<vt-skeleton>` when the shape of the content is known (it feels faster and the page does not jump).
- Known amount: `<vt-progress>` or `<vt-progress-ring>` with a `value`.
- Several stages: `<vt-loading-steps>`.
- A form or a panel that must not be used meanwhile: `<vt-loading-overlay>`.
- Started by a click: `<vt-loading-button>` with `track()`.
- Long (over 10 s): `<vt-loading-message>` with `elapsed` and `slow-after`.

## Accessibility

- Spinners, messages and skeletons are `role="status"` with a name; bars and rings are `role="progressbar"` with `aria-valuenow` and a `aria-valuetext` ("42%", "3 of 5 MB"); indeterminate ones have no value.
- Wrapped content (`<vt-skeleton>`, `<vt-loading-overlay>`) is marked `aria-busy`; the overlay also makes it `inert`, so it cannot be reached with the keyboard while covered.
- `<vt-loading-button>` keeps focus while it waits (`aria-disabled`, not `disabled`) and announces "Saving…" and "Saved".
- With "reduce motion", nothing turns or slides: animations become a slow fade. `motion="full"` or `motion="reduce"` forces a choice.
- In Windows high contrast mode, system colors are used.
