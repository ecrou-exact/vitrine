# `<vt-cron>`

`<vt-cron>` displays cron schedules. For one expression it shows the fields with their names, a description in plain words ("At 09:30, Monday through Friday"), the next runs in a time zone and the hours of the week when it runs. For a crontab it shows a table of entries with their description, next run and command, and the details of the selected entry under it.

```html
<vt-cron variant="full" expression="30 9 * * 1-5" timezone="Europe/Paris"></vt-cron>
```

```html
<vt-cron variant="full" label="crontab" src="/deploy/crontab"></vt-cron>
```

Expressions, commands and comments are inserted as text, never parsed as HTML, and nothing is ever run.

## Variants

| Feature                    | `simple` (default) | `full` |
| -------------------------- | ------------------ | ------ |
| `header`                   | off                | on     |
| `dot`                      | off                | on     |
| `copy`                     | off                | on     |
| `search` (filters entries) | off                | on     |
| `download`                 | off                | on     |
| `fullscreen`               | off                | on     |
| `fields`                   | on                 | on     |
| `grid`                     | on                 | on     |

Every feature can be turned on or off individually, whatever the variant.

## Expressions

The expression comes from the content, or from the `expression` attribute when there is no content.

| Fields | Order                                                  |
| ------ | ------------------------------------------------------ |
| 5      | minute, hour, day of month, month, day of week         |
| 6      | second, minute, hour, day of month, month, day of week |

Each field takes `*`, a value, a range (`1-5`), a list (`1,15`), a step (`*/15`, `0-30/10`, `5/15`) and names: `JAN` to `DEC` for months, `SUN` to `SAT` for days of the week (`0` and `7` are both Sunday). These extensions are read where they make sense:

| Written        | Field        | Means                                           |
| -------------- | ------------ | ----------------------------------------------- |
| `?`            | day fields   | Any value, like `*`                             |
| `L`            | day of month | The last day of the month                       |
| `L-3`          | day of month | Three days before the last day                  |
| `15W`          | day of month | The weekday (Monday to Friday) nearest the 15th |
| `LW`           | day of month | The last weekday of the month                   |
| `5L`, `FRIL`   | day of week  | The last Friday of the month                    |
| `5#3`, `FRI#3` | day of week  | The third Friday of the month                   |

Macros: `@yearly` (`@annually`), `@monthly`, `@weekly`, `@daily` (`@midnight`), `@hourly`, and `@reboot`, which has no times.

When both the day of the month and the day of the week are restricted, the schedule runs on days matching either one, as cron does: `0 0 13 * 5` runs on every 13th and every Friday. When one of them starts with `*` or `?`, both must match.

An expression that cannot be read shows the field in error, and a message with its number, name and column: "Field 3 (Day of month), column 5: 32 is outside 1–31."

## Next runs and time zones

The next runs (`count`, 5 by default) are counted in the `timezone` attribute, an IANA name such as `Europe/Paris` (the browser's time zone by default), from now or from the `now` attribute, which keeps a page or a test the same whatever the day. Each run shows its date and how far it is ("in 3 hours"). Without `now`, the list is updated every minute.

On a day when clocks go forward, times that do not exist are skipped; when clocks go back, a time that happens twice runs once, the first time. A schedule that never runs (`0 0 30 2 *`) says so after searching 8 years ahead.

The grid shows the hours of each day of the week when the schedule runs, darker with more runs in the hour. Restrictions on the day of the month and the month are not drawn; a note says so when there are some.

## Crontabs

Several lines, comments, `NAME=value` lines or a command after the schedule make the content a crontab. Each entry is a schedule (five fields or a macro) and a command; with `system` (as in `/etc/crontab`), a user column comes between them. `CRON_TZ=` (or `TZ=`) sets the time zone of the entries that follow it. Comment lines right above an entry are its tooltip.

```html
<vt-cron variant="full" system>
  <template>
    SHELL=/bin/sh
    # Rotate logs
    25 6 * * * root test -x /usr/sbin/anacron || run-parts --report /etc/cron.daily
    @reboot    root /opt/app/start.sh
  </template>
</vt-cron>
```

Commands are highlighted as shell. Selecting a schedule shows its fields, description, next runs and grid under the table. Lines that cannot be read are counted in a notice with the first error.

## Search

In a crontab, the search filters entries by schedule, description, user, command and comment, and marks what matches. Focus stays in the search field.

## Editing

In edit mode, an editor holds the expression or the crontab, with a status line under it ("Valid expression", or the first error with its position), and the view under it is updated as you type.

## Attributes

| Attribute    | Value                         | Default       | Description                                |
| ------------ | ----------------------------- | ------------- | ------------------------------------------ |
| `expression` | cron expression               |               | The expression, when there is no content.  |
| `count`      | integer 0 to 50               | `5`           | Next runs listed (`0`: none).              |
| `timezone`   | IANA time zone                | the browser's | Time zone of the runs.                     |
| `now`        | ISO 8601 date or milliseconds | now           | Date the next runs are counted from.       |
| `system`     | boolean                       | off           | Crontab with a user column.                |
| `fields`     | boolean                       | on            | Fields of the expression with their names. |
| `grid`       | boolean                       | on            | Hours of the week grid.                    |

The shared attributes are described in [common attributes](../common-attributes.md).

## Properties

| Property   | Type                   | Description                                                  |
| ---------- | ---------------------- | ------------------------------------------------------------ |
| `content`  | `string`               | The expression or the crontab.                               |
| `schedule` | `CronSchedule \| null` | The expression read, with its fields (`null` for a crontab). |
| `entries`  | `CrontabEntry[]`       | Entries of a crontab: `line`, `schedule`, `user`, `command`… |

## Events

| Event       | `detail`                      | When                                    |
| ----------- | ----------------------------- | --------------------------------------- |
| `vt-ready`  | `{ type: "cron" }`            | The schedule was rendered               |
| `vt-select` | `{ line, schedule, command }` | A crontab entry was selected            |
| `vt-search` | `{ query, matches }`          | A search ran                            |
| `vt-copy`   | `{ text }`                    | The text was copied                     |
| `vt-error`  | `{ message, cause }`          | Loading failed or the text is too large |

## CSS parts

| Part          | Element                            |
| ------------- | ---------------------------------- |
| `fields`      | The fields of the expression       |
| `field`       | One field                          |
| `description` | The description in words           |
| `runs`        | The list of next runs              |
| `week`        | The hours of the week grid         |
| `table`       | The table of crontab entries       |
| `command`     | A command                          |
| `status`      | The validation status in edit mode |

Field colors follow `--vt-chart-1` … `--vt-chart-6` when they are set.

## Accessibility

Each field has a tooltip saying what it allows ("Minute: 0, 15 and 30"), and the description says the whole schedule in words, so the colors are never needed. Runs are `<time>` elements with their ISO date. The grid is a table with a row header per day; each cell has a tooltip with its day, hour and number of runs. In a crontab, each schedule is a toggle button (`aria-pressed`) that shows its details; the edit status is a live region.

## Limits

- An expression is read up to 512 characters; a crontab up to 5,000 lines.
- Runs are searched 8 years ahead at most.
- The size limit of the [configuration](../configuration.md) applies to `content` and `src` (2 MB by default).
