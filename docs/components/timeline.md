# `<vt-timeline>`

`<vt-timeline>` shows events on a vertical timeline: incident timelines, release history, changelogs. Events are grouped by date, with the time elapsed between them, a colored marker for their kind, buttons that show one kind, and a search that filters events.

```html
<vt-timeline variant="full" label="Incident 2026-10-01" src="/incidents/2026-10-01.json"></vt-timeline>
```

Titles, times and tags are inserted as text, never parsed as HTML. Descriptions are Markdown, rendered by [`<vt-markdown>`](markdown.md) and sanitized with DOMPurify; images in them are blocked.

## Variants

| Feature                   | `simple` (default) | `full` |
| ------------------------- | ------------------ | ------ |
| `header`                  | off                | on     |
| `dot`                     | off                | on     |
| `copy` (as JSON)          | off                | on     |
| `search` (filters events) | off                | on     |
| `download`                | off                | on     |
| `fullscreen`              | off                | on     |
| `kind-filter`             | off                | on     |
| `durations`               | on                 | on     |
| `markdown`                | on                 | on     |

Every feature can be turned on or off individually, whatever the variant.

## Formats

**JSON**: an array of events, or an object with an `events` array.

```json
[
  { "time": "2026-10-01T10:00:00Z", "title": "Alert fired", "kind": "danger", "tags": ["db"] },
  { "time": "2026-10-01T10:20:00Z", "title": "Mitigated", "kind": "warning" },
  {
    "time": "2026-10-01T11:05:00Z",
    "title": "Resolved",
    "kind": "success",
    "description": "Connection pool raised to **200**.",
    "link": "https://status.example.com/incidents/42"
  }
]
```

| Key           | Also read as                      | Description                                                       |
| ------------- | --------------------------------- | ----------------------------------------------------------------- |
| `time`        | `date`, `timestamp`, `at`         | ISO 8601 date, `YYYY-MM-DD HH:MM`, or epoch seconds/milliseconds. |
| `title`       | `name`, `summary`                 | Title of the event.                                               |
| `description` | `body`, `details`                 | Markdown.                                                         |
| `kind`        | `status`, `type`, `level`         | See [Kinds](#kinds).                                              |
| `tags`        | (array, or text separated by `,`) | Small labels under the title.                                     |
| `link`        | `url`, `href`                     | Makes the title a link. Only absolute `http:` and `https:` URLs.  |

**Keep a Changelog**: any other text is read as a [Keep a Changelog](https://keepachangelog.com) file. Each `## [version] - date` heading becomes a `release` event (`Unreleased` a neutral one), its content the description, and its `### Added`, `### Fixed`… sections its tags. Link references at the end of the file (`[1.1.0]: https://…`) become the links of their versions.

```html
<vt-timeline variant="full" src="/CHANGELOG.md"></vt-timeline>
```

## Kinds

| Kind      | Also written as                                        | Color          |
| --------- | ------------------------------------------------------ | -------------- |
| `info`    | (no kind)                                              | `--vt-info`    |
| `success` | `ok`, `done`, `resolved`, `fixed`, `added`             | `--vt-success` |
| `warning` | `warn`, `changed`, `deprecated`                        | `--vt-warning` |
| `danger`  | `error`, `critical`, `incident`, `removed`, `security` | `--vt-danger`  |
| `release` | `version`, `tag`                                       | `--vt-accent`  |
| `neutral` | any other word                                         | muted text     |

With `kind-filter` (full variant), the header has one button per kind present, with its count, and an All button. Choose the kinds shown at first with `kinds`:

```html
<vt-timeline variant="full" kinds="danger" src="/incidents.json"></vt-timeline>
```

## Order, dates and durations

- Events are sorted by date, newest first; `order="oldest"` reverses the order, and so does the order button in the header. When some events have no readable date, the written order is kept (changelogs are read as newest first).
- `group` puts a date heading above each day (default), `month` (default for changelogs), `year`, or none. Dates are written in the language of the page (`lang-ui`).
- With `durations` (on by default), the time elapsed between two events is written between them: `45 s`, `20 min`, `3 h 20 min`, `5 d`.

## Search

The search filters the timeline to the events that contain the text (in the title, description, time, kind or tags). Enter and Shift+Enter move between them; focus stays in the search field.

## Display

- Descriptions longer than 6 lines show a "Show more" button; `collapse` changes the number (`0` shows everything).
- `markdown="false"`, or a page without `<vt-markdown>`, shows descriptions as plain text.
- Copy writes the events shown, after filters and search, as JSON. Download saves the content as written.

## Editing

With `mode="edit"`, an editor holds the JSON or the changelog and the timeline is updated under it. See [Editing](../editing.md).

## Attributes

This table lists the attributes specific to `<vt-timeline>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute     | Type                             | Default         | Description                                            |
| ------------- | -------------------------------- | --------------- | ------------------------------------------------------ |
| `order`       | `newest` or `oldest`             | `newest`        | Order of events.                                       |
| `group`       | `day`, `month`, `year` or `none` | `day` / `month` | Date headings (`month` for changelogs).                |
| `kinds`       | kinds separated by spaces        | all             | Kinds shown at first.                                  |
| `kind-filter` | boolean                          | preset          | Kind buttons with counts.                              |
| `durations`   | boolean                          | on              | Time elapsed between events.                           |
| `markdown`    | boolean                          | on              | Descriptions as Markdown.                              |
| `collapse`    | integer                          | `6`             | Description lines shown before "Show more" (`0`: all). |

## Properties

| Member    | Description                                                                         |
| --------- | ----------------------------------------------------------------------------------- |
| `content` | The events, as JSON or a changelog.                                                 |
| `events`  | Events read, read-only: `{ id, time, date, title, description, kind, tags, link }`. |

## Events

| Event              | `detail`                  | When                                             |
| ------------------ | ------------------------- | ------------------------------------------------ |
| `vt-ready`         | `{ type: "timeline" }`    | The timeline was rendered                        |
| `vt-select`        | `{ event }`               | An event was clicked, or Enter was pressed on it |
| `vt-filter-change` | `{ kinds, query, shown }` | A kind was chosen, or a search ran               |
| `vt-search`        | `{ query, matches }`      | A search ran                                     |
| `vt-copy`          | `{ text }`                | The events were copied                           |
| `vt-error`         | `{ message, cause }`      | Loading failed or the text is too large          |

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part           | Element                                         |
| -------------- | ----------------------------------------------- |
| `timeline`     | The list of events                              |
| `group`        | A date heading                                  |
| `event`        | An event; also `event-danger`, `event-release`… |
| `dot`          | The marker of an event                          |
| `time`         | The time of an event                            |
| `title`        | The title of an event                           |
| `duration`     | The time elapsed since the previous event       |
| `kind-filter`  | A kind button                                   |
| `order-button` | The order button                                |

## Accessibility

Events form an ordered list; each event can be focused and chosen with Enter. Kinds are written as words, never shown by color alone. Times are `<time>` elements with a machine-readable `datetime`. Kind buttons are toggle buttons (`aria-pressed`). Durations between events are hidden from assistive technologies, since each event has its time.

## Limits

- At most 5,000 events are read; titles are cut at 500 characters and descriptions at 20,000.
- An event keeps at most 20 tags.
- The size limit of the [configuration](../configuration.md) applies to `content` and `src` (2 MB by default).
