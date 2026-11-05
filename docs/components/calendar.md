# `<vt-calendar>`

`<vt-calendar>` shows events from an iCalendar file or JSON, as a month grid or an agenda. Recurring events are expanded, times follow the time zone of the reader, and each event can be added to the calendar of the reader.

```html
<vt-calendar variant="full" src="/events.ics" timezone="Europe/Paris"></vt-calendar>
```

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `views`      | off                | on     |
| `copy`       | off                | on     |
| `download`   | off                | on     |
| `fullscreen` | off                | on     |

## Formats

### iCalendar

Text that starts with `BEGIN:VCALENDAR` is read as iCalendar (RFC 5545). The `VEVENT` components are used, with `UID`, `SUMMARY`, `DESCRIPTION`, `LOCATION`, `URL`, `CATEGORIES`, `STATUS`, `DTSTART`, `DTEND`, `DURATION`, `RRULE`, `EXDATE` and `RECURRENCE-ID`. Other components are ignored. `TZID` must be a time zone name the browser knows, such as `Europe/Paris`; with any other name the time is shown as written.

### JSON

A list of events, or an object with an `events` list and an optional `name`.

```json
[
  {
    "title": "Sprint planning",
    "start": "2026-11-02T09:00:00",
    "end": "2026-11-02T10:00:00",
    "timezone": "Europe/Paris",
    "rrule": "FREQ=WEEKLY;BYDAY=MO",
    "exclude": ["2026-11-09T09:00:00"],
    "location": "Room 3",
    "description": "Plain text, line breaks kept.",
    "url": "https://example.com/planning",
    "categories": ["Team"]
  },
  { "title": "Conference", "start": "2026-11-18", "end": "2026-11-21" }
]
```

| Written as             | Means                                                        |
| ---------------------- | ------------------------------------------------------------ |
| `2026-11-18`           | All day. The end is exclusive: `2026-11-21` ends on the 20th |
| `2026-11-05T09:00:00Z` | An instant, as is one with an offset such as `+02:00`        |
| `2026-11-05T09:00:00`  | In the event's `timezone`, else in the time zone shown       |

Events that cannot be read are skipped, and a notice says how many.

## Recurrence

`RRULE` (or `rrule`) supports `FREQ` (`DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`), `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` (with positions such as `-1FR`), `BYMONTHDAY`, `BYMONTH` and `WKST`.

A rule with other parts, such as `BYSETPOS` or `BYHOUR`, is not expanded: the event appears once, on its start date.

Recurrences are worked out in the wall-clock time of the event, so a 09:00 meeting stays at 09:00 on both sides of a daylight saving change. All-day events stay on their date in every time zone.

## Views

**Month** is a grid with up to `max-per-day` events written in each day. Selecting a day lists its events under the grid. On a narrow element, events become dots and the list carries the text.

**Agenda** lists the events from a date, by day, for a year ahead, with "Show more" after `limit` events.

Opening an event shows its dates, place, text, categories, link, and **Add to calendar**, which downloads that occurrence as an `.ics` file. The download button of the full variant saves the whole calendar as `.ics`.

## Attributes

These are specific to `<vt-calendar>`. Shared attributes are in [Common attributes](../common-attributes.md).

| Attribute         | Type    | Default       | Description                                    |
| ----------------- | ------- | ------------- | ---------------------------------------------- |
| `view`            | string  | `month`       | First view: `month` or `agenda`                |
| `date`            | string  | today         | First date shown, `YYYY-MM` or `YYYY-MM-DD`    |
| `timezone`        | string  | of the reader | Time zone of the times shown                   |
| `first-day`       | number  | from language | First day of the week, 0 (Sunday) to 6         |
| `max-per-day`     | number  | `3`           | Events written in a day of the grid            |
| `limit`           | number  | `20`          | Events listed by the agenda before "Show more" |
| `views`           | boolean | full: on      | Month / Agenda tabs                            |
| `add-to-calendar` | boolean | on            | "Add to calendar" on each event                |
| `now`             | string  | now           | Date used as today, for docs and tests         |

## JavaScript

| Member       | Description                                                     |
| ------------ | --------------------------------------------------------------- |
| `content`    | The iCalendar or JSON text                                      |
| `calendar`   | The parsed calendar (read-only), `null` when it is not readable |
| `view`       | The view shown (read-only)                                      |
| `goTo(date)` | Shows the period of `YYYY-MM` or `YYYY-MM-DD`                   |

## Events

| Event             | When                     | Detail                                    |
| ----------------- | ------------------------ | ----------------------------------------- |
| `vt-ready`        | Calendar rendered        | `{ type: "calendar" }`                    |
| `vt-copy`         | Source copied            | `{ text }`                                |
| `vt-tab-change`   | The view changed         | `{ tab }`                                 |
| `vt-date-change`  | The period shown changed | `{ date, view }`                          |
| `vt-event-select` | An event was opened      | `{ uid, title, start, end, allDay, url }` |
| `vt-error`        | Too large or not loaded  | `{ message, cause }`                      |

## CSS parts

`nav`, `period`, `grid`, `day`, `chip`, `agenda`, `event` and `event-details`, plus the [shared parts](../theming.md).

## Accessibility

The month is a grid with one stop for the keyboard.

| Key                | Action                                      |
| ------------------ | ------------------------------------------- |
| Arrows             | Previous or next day, previous or next week |
| Home, End          | First or last day of the week               |
| Page Up, Page Down | Same day of the previous or next month      |
| Enter, Space       | Select the day and list its events          |

Each day is read with its full date and number of events, and today is marked with `aria-current`.

## Security

Text from the source is rendered as text. Links keep `http:`, `https:`, `mailto:`, `tel:` and relative URLs only. In the files written for download, line breaks and separators are escaped, so a value cannot add a property. Nothing a calendar names is fetched. Events and repetitions are limited. See [Security](../security.md).
