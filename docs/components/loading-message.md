# `<vt-loading-message>`

`<vt-loading-message>` tells what happens during a long wait: messages that follow one another ("Connecting…", "Fetching your data…"), the time elapsed, and past a threshold a reassuring "This is taking longer than usual…".

```html
<vt-loading-message elapsed slow-after="10s">
  Connecting to the server…
  Fetching your invoices…
  Preparing the PDF…
</vt-loading-message>
```

## Messages

One message per line inside the element, or separated by `|` in `messages`, or set with the `messages` property. Each stays `interval` (2.5 s); the last one stays, unless `loop` starts again. Messages are best honest: say what is really happening, in order.

## Elapsed and slow

`elapsed` shows the time since the start (`0:07`). `slow-after` shows `slow-text` (by default "This is taking longer than usual…") once that time has passed.

## Attributes

| Attribute    | Values                    | Default                             | Description                              |
| ------------ | ------------------------- | ----------------------------------- | ---------------------------------------- |
| `messages`   | texts separated by `      | `                                   | the lines inside                         | The messages. |
| `interval`   | duration                  | `2.5s`                              | Time each message stays.                 |
| `loop`       | boolean                   | off                                 | Start again after the last one.          |
| `elapsed`    | boolean                   | off                                 | Show the time elapsed.                   |
| `slow-after` | duration                  | —                                   | When to show the slow message.           |
| `slow-text`  | text                      | "This is taking longer than usual…" | The slow message.                        |
| `spinner`    | a spinner shape or `none` | `ring`                              | The spinner.                             |
| `layout`     | `inline`, `stacked`       | `inline`                            | Spinner beside the message, or above it. |
| `size`       | `xs`…`xl` or a CSS length | `sm`                                | Size of the spinner.                     |

`active`, `delay`, `min-duration`, `size`, `tone`, `speed`, `motion`, `label`, `theme` and `lang-ui` are shared by every loading indicator: see [loading indicators](../loading.md#shared-attributes).

## Properties and methods

| Member     | Description                      |
| ---------- | -------------------------------- |
| `start()`  | Shows it (after `delay`).        |
| `stop()`   | Hides it (after `min-duration`). |
| `active`   | Shown or not (read and write).   |
| `shown`    | On screen right now (read-only). |
| `messages` | The messages (read and write).   |

## Events

| Event              | Detail               | When                  |
| ------------------ | -------------------- | --------------------- |
| `vt-loading-start` | `{ type }`           | Shown, after `delay`. |
| `vt-loading-end`   | `{ type, duration }` | Hidden.               |

## CSS parts

| Part        | Element                      |
| ----------- | ---------------------------- |
| `indicator` | The wrapper (role="status"). |
| `spinner`   | The spinner.                 |
| `message`   | The current message.         |
| `elapsed`   | The time elapsed.            |
| `slow`      | The slow message.            |

## Accessibility

A `role="status"`: each new message and the slow message are announced politely; the elapsed time is not (it changes every second). Nodes are kept between updates, so only what changed is read.
