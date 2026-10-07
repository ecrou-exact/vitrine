# `<vt-log>`

`<vt-log>` displays application logs: each entry with its time, level, message and fields, stack traces kept with their entry, buttons that show or hide each level, a search that filters entries, and live streaming.

```html
<vt-log variant="full" label="api.log" max-height="420px" src="/logs/api.log"></vt-log>
```

Text is inserted as text, never parsed as HTML. ANSI colors are rendered by the same parser as [`<vt-terminal>`](terminal.md#colors-and-escape-sequences).

## Variants

| Feature                    | `simple` (default) | `full` |
| -------------------------- | ------------------ | ------ |
| `header`                   | off                | on     |
| `dot`                      | off                | on     |
| `copy`                     | off                | on     |
| `search` (filters entries) | off                | on     |
| `download`                 | off                | on     |
| `fullscreen`               | off                | on     |
| `level-filter`             | off                | on     |
| `line-numbers`             | off                | on     |
| `fields`                   | on                 | on     |
| `colors`                   | on                 | on     |
| `wrap`                     | on                 | on     |

Every feature can be turned on or off individually, whatever the variant.

## Formats

Each line is read on its own, so a log can mix formats.

| Format                                        | Example                                                     | Read as                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Plain text                                    | `2026-10-07 18:00:01,456 [WARN] slow query`                 | Time, level, message                                                                                       |
| JSON lines (pino, bunyan, winston, Logstash…) | `{"level":50,"time":1759860000000,"msg":"db down","pid":7}` | `level` by name or pino number, `time`/`timestamp`/`@timestamp`, `msg`/`message`; other keys become fields |
| logfmt                                        | `time=… level=warn msg="retrying" attempt=2`                | `level`, `msg`, `time`; other pairs become fields                                                          |

**Timestamps** at the start of a line: ISO 8601 (`2026-10-07T18:00:00.123Z`, `2026-10-07 18:00:00,123`), Apache and nginx (`07/Oct/2026:18:00:00 +0200`), syslog (`Oct  7 18:00:00`), or a time of day (`18:00:00.123`), optionally in brackets. Epoch numbers in JSON are shown as ISO dates.

**Levels**: `TRACE`, `DEBUG`, `INFO`, `NOTICE`, `WARN`/`WARNING`, `ERROR`/`ERR`, `FATAL`/`CRITICAL`/`PANIC` and their usual aliases, written in capitals (`ERROR`, `ERROR:`), in brackets in any case (`[error]`), after `level=`, or as Android and glog letters (`E/Tag:`, `E1007 …`). A level may follow a thread or logger name (`[main] ERROR com.app.Billing`). Lower-case words in a sentence ("the error rate") are not levels. Colored levels (`\e[32mINFO\e[0m`) are recognized.

**Continuations** belong to the entry above them: indented lines, `at …`, `Caused by:`, `Traceback`, the final exception line of a traceback, and, in logs whose lines start with a timestamp, lines without one and without a level of their own.

## Levels and filters

With `level-filter` (full variant), the header has one button per level present in the log, with its count. A button shows or hides the entries of that level; `OTHER` is entries without a level. Choose the levels shown at first with `levels`:

```html
<vt-log variant="full" levels="warn error fatal" src="/logs/api.log"></vt-log>
```

Warnings, errors and fatal entries are tinted, so they stand out while scrolling. Debug and trace messages are dimmed.

## Search

The search filters the log to the entries that contain the text (in the message, time, fields or stack trace) and marks it. Enter and Shift+Enter move between marks.

## Streaming live logs

`write(text)` adds text at the end. Each line appears once its line break has arrived; a stack trace that continues in a later call is added to its entry. With `follow`, the view keeps the newest line in sight; scrolling up pauses it and scrolling back to the bottom resumes it. The Follow button in the header does the same.

```js
const log = document.querySelector('vt-log');
const source = new EventSource('/logs/stream');
source.onmessage = (event) => log.write(`${event.data}\n`);
```

`clear()` removes everything. Beyond `max-entries` (default 50,000), the oldest entries are dropped, so a page left open for hours stays fast.

## Display

- `time="short"` shows only the time of day (the full timestamp is in the tooltip); `time="none"` hides timestamps.
- Fields of structured lines are shown as small `key=value` tags after the message; `fields="false"` hides them.
- Stack traces show their first 6 lines and a "Show N more lines" button; `collapse` changes the number (`0` shows everything).
- Long logs are built in blocks as they scroll into view, so 100,000 lines open at once.

## Editing

With `mode="edit"`, an editor holds the log text and the entries are updated under it. See [Editing](../editing.md).

## Attributes

This table lists the attributes specific to `<vt-log>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute      | Type                       | Default | Description                                                    |
| -------------- | -------------------------- | ------- | -------------------------------------------------------------- |
| `levels`       | levels separated by spaces | all     | Levels shown at first (`trace` … `fatal`, and `none`).         |
| `level-filter` | boolean                    | preset  | Level buttons with counts.                                     |
| `follow`       | boolean                    | off     | Keep the newest line in view when lines are written.           |
| `time`         | `full`, `short` or `none`  | `full`  | Timestamps as written, time of day only, or hidden.            |
| `fields`       | boolean                    | on      | Fields of JSON and logfmt lines.                               |
| `colors`       | boolean                    | on      | ANSI colors.                                                   |
| `line-numbers` | boolean                    | preset  | Line numbers of the log.                                       |
| `wrap`         | boolean                    | on      | Wrap long lines.                                               |
| `collapse`     | integer                    | `6`     | Stack trace lines shown before "Show N more lines" (`0`: all). |
| `max-entries`  | integer 100 to 1,000,000   | `50000` | Oldest entries are dropped beyond this number.                 |

## Properties and methods

| Member        | Description                                                                               |
| ------------- | ----------------------------------------------------------------------------------------- |
| `content`     | The log text.                                                                             |
| `entries`     | Parsed entries, read-only: `{ line, time, level, message, fields, more, format }`.        |
| `counts`      | Entries per level, read-only: `{ trace, debug, info, notice, warn, error, fatal, none }`. |
| `write(text)` | Adds text at the end of the log.                                                          |
| `clear()`     | Removes every entry.                                                                      |

## Events

| Event              | `detail`                   | When                                         |
| ------------------ | -------------------------- | -------------------------------------------- |
| `vt-ready`         | `{ type: "log" }`          | The log was rendered                         |
| `vt-filter-change` | `{ levels, query, shown }` | A level was shown or hidden, or a search ran |
| `vt-search`        | `{ query, matches }`       | A search ran                                 |
| `vt-copy`          | `{ text }`                 | The log was copied                           |
| `vt-error`         | `{ message, cause }`       | Loading failed or the text is too large      |

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part            | Element                                     |
| --------------- | ------------------------------------------- |
| `log`           | The list of entries                         |
| `entry`         | An entry; also `entry-error`, `entry-warn`… |
| `time`          | A timestamp                                 |
| `level`         | A level badge                               |
| `message`       | A message                                   |
| `field`         | A structured field                          |
| `stack`         | Continuation lines                          |
| `level-filter`  | A level button in the header                |
| `follow-button` | The Follow button                           |

## Accessibility

Entries form a list named after the `label`. Levels are written as words, never shown by color alone. Level buttons are toggle buttons (`aria-pressed`) with a description. Line numbers are hidden from assistive technologies.

## Limits

- Lines longer than 20,000 characters are cut; an entry keeps at most 1,000 continuation lines.
- JSON lines keep at most 50 fields, and field values longer than 300 characters are cut on screen.
- The size limit of the [configuration](../configuration.md) applies to `content` and `src` (2 MB by default); `write()` is limited by `max-entries` instead.
