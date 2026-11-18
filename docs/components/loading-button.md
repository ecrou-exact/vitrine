# `<vt-loading-button>`

`<vt-loading-button>` is a button that shows its own wait. While `loading`, or while the promise given to `track()` runs, it shows a spinner, says what it does ("Saving…"), ignores clicks and is marked busy; then it can say "Saved" or "Failed" for a moment. It submits its form like a native button.

```html
<vt-loading-button id="save" loading-text="Saving…" success-text="Saved" error-text="Not saved">Save</vt-loading-button>
<script>
  save.addEventListener('click', () => save.track(fetch('/save', { method: 'POST' })));
</script>
```

## Waiting

`loading` (or `el.loading = true`) shows the wait. `track(promise)` does it for you: loading until the promise settles, then `success-text` or `error-text` for `reset-after` (2 s) with a check or an alert icon. It returns the promise, so `await button.track(save())` works.

While loading, clicks are ignored and never reach your listeners, so the action cannot run twice.

## Spinner

`spinner` picks the [shape](spinner.md#shapes). `spinner-position="start"` (default) puts it before the text, `end` after it, `replace` instead of it: the button keeps its width, so the layout does not jump.

## Looks and forms

`variant` is `primary` (default), `secondary`, `ghost` or `danger`; `block` takes the full width. `type="submit"` submits the closest form (`requestSubmit()`, so validation runs), `reset` resets it.

## Attributes

| Attribute          | Values                                    | Default         | Description                    |
| ------------------ | ----------------------------------------- | --------------- | ------------------------------ |
| `loading`          | boolean                                   | off             | Waiting.                       |
| `loading-text`     | text                                      | the button text | Text while loading.            |
| `success-text`     | text                                      | —               | Text after `track()` resolves. |
| `error-text`       | text                                      | —               | Text after `track()` rejects.  |
| `reset-after`      | duration                                  | `2s`            | How long the outcome stays.    |
| `spinner`          | a spinner shape                           | `ring`          | The spinner.                   |
| `spinner-position` | `start`, `end`, `replace`                 | `start`         | Where the spinner goes.        |
| `variant`          | `primary`, `secondary`, `ghost`, `danger` | `primary`       | Look.                          |
| `type`             | `button`, `submit`, `reset`               | `button`        | Role in a form.                |
| `disabled`         | boolean                                   | off             | Disabled.                      |
| `block`            | boolean                                   | off             | Full width.                    |
| `size`             | `xs`…`xl` or a CSS length                 | `sm`            | Size of the spinner.           |

`active`, `delay`, `min-duration`, `size`, `tone`, `speed`, `motion`, `label`, `theme` and `lang-ui` are shared by every loading indicator: see [loading indicators](../loading.md#shared-attributes).

## Properties and methods

| Member           | Description                                                         |
| ---------------- | ------------------------------------------------------------------- |
| `loading`        | Waiting or not (read and write).                                    |
| `track(promise)` | Waits for the promise, then shows the outcome; returns the promise. |
| `focus()`        | Focuses the button.                                                 |

## Events

| Event              | Detail               | When                  |
| ------------------ | -------------------- | --------------------- |
| `vt-loading-start` | `{ type }`           | Shown, after `delay`. |
| `vt-loading-end`   | `{ type, duration }` | Hidden.               |

## CSS parts

| Part        | Element                                 |
| ----------- | --------------------------------------- |
| `indicator` | The wrapper.                            |
| `button`    | The native button.                      |
| `spinner`   | The spinner.                            |
| `text`      | The text while loading, or the outcome. |

## Accessibility

A native `<button>`: keyboard and screen readers work as usual. Its accessible name is the visible text (the button text, "Saving…", "Saved"), as WCAG 2.5.3 asks; `label` only names a button that shows no text (an icon, or the spinner alone with `spinner-position="replace"`). While loading it is `aria-busy` and `aria-disabled` (not `disabled`), so it keeps focus; "Saving…" and "Saved" are announced politely. With `spinner-position="replace"`, the accessible name becomes the loading text.
