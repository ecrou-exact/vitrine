# `<vt-status>`

`<vt-status>` shows the status of a service: an overall banner, components with their uptime and a bar per day, open incidents with their updates, scheduled maintenance and past incidents. It can reload its source on a timer, and it reads Atlassian Statuspage summaries as they are.

```html
<vt-status variant="full" src="/status.json" refresh="60"></vt-status>
```

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `download`   | off                | on     |
| `fullscreen` | off                | on     |

The bars and the incidents are shown in both variants; `bars="false"` and `incidents="false"` hide them.

## Format

The content is JSON: an object with a `components` list (or `services`), or the list alone.

```json
{
  "updated": "2026-11-05T11:52:00Z",
  "message": "We are looking into slow responses.",
  "components": [
    {
      "name": "API",
      "group": "Platform",
      "description": "REST and GraphQL",
      "status": "degraded",
      "url": "https://status.example.com/api",
      "since": "2026-06-01",
      "history": [{ "date": "2026-11-02", "status": "major", "minutes": 42, "note": "Failover" }]
    }
  ],
  "incidents": [
    {
      "title": "Slow API responses",
      "status": "identified",
      "impact": "minor",
      "start": "2026-11-05T10:40:00Z",
      "components": ["API"],
      "updates": [{ "time": "2026-11-05T11:10:00Z", "status": "identified", "text": "Failing over." }]
    }
  ],
  "maintenances": [
    { "title": "Network upgrade", "start": "2026-11-08T01:00:00Z", "end": "2026-11-08T03:00:00Z" }
  ]
}
```

A Statuspage summary (`/api/v2/summary.json`) needs no change: its groups, `indicator`, `incident_updates`, `shortlink` and `scheduled_maintenances` are understood. To load one from another origin, add `allow-remote`; the server must allow it with CORS.

### States

| State         | Also written                                 | Shown as       |
| ------------- | -------------------------------------------- | -------------- |
| `operational` | `ok`, `up`, `none`                           | Operational    |
| `degraded`    | `degraded_performance`, `minor`              | Degraded       |
| `partial`     | `partial_outage`                             | Partial outage |
| `major`       | `major_outage`, `outage`, `down`, `critical` | Major outage   |
| `maintenance` | `under_maintenance`                          | Maintenance    |

Any other word is `unknown`. The impact of an incident also accepts the Statuspage scale, where `major` is a partial outage and `critical` a major outage.

The overall state is `status` when the source gives one. Otherwise it is the worst of the components, the open incidents and the maintenance in progress.

### Days and uptime

`history` lists the days something happened, as `[{ date, status, minutes, note }]` or `{ "2026-11-02": "major" }`. A day that is not listed has **no data**, unless the component has a `since` date: from then on, days that are not listed were fine, and today is the current state of the component.

The uptime is the `uptime` value of the component (0 to 100) when it has one. Otherwise it is worked out from the days shown: maintenance and days without data do not count, `minutes` is used when given, and otherwise a degraded day counts as up, a partial outage as 70% and a major outage as 0. It is rounded down, so an outage never reads as 100%. Days are in UTC.

## Refreshing

`refresh="60"` reloads `src` every 60 seconds (at least 15). There is no loading state between two refreshes, a page in the background is not refreshed, and the element only renders again when something changed. When a refresh fails, the last status stays on screen with a notice and `vt-error` is dispatched. `refresh()` does the same on demand.

`vt-status-change` tells when the overall state changes, and the new state is announced to screen readers.

## Attributes

These are specific to `<vt-status>`. Shared attributes are in [Common attributes](../common-attributes.md).

| Attribute       | Type    | Default | Description                                       |
| --------------- | ------- | ------- | ------------------------------------------------- |
| `days`          | number  | `90`    | Days of history per component, at most 365        |
| `refresh`       | number  | off     | Reloads `src` every N seconds, at least 15        |
| `max-incidents` | number  | `5`     | Past incidents shown before "Show all"            |
| `bars`          | boolean | on      | Bars per day and uptime                           |
| `incidents`     | boolean | on      | Incidents and maintenance                         |
| `now`           | string  | now     | Date used as the current time, for docs and tests |

## JavaScript

| Member      | Description                                                  |
| ----------- | ------------------------------------------------------------ |
| `content`   | The JSON text                                                |
| `page`      | The parsed status page (read-only), `null` when not readable |
| `state`     | The overall state (read-only)                                |
| `refresh()` | Loads `src` again                                            |

## Events

| Event              | When                                  | Detail                 |
| ------------------ | ------------------------------------- | ---------------------- |
| `vt-ready`         | Status rendered                       | `{ type: "status" }`   |
| `vt-copy`          | JSON copied                           | `{ text }`             |
| `vt-status-change` | The overall state changed             | `{ status, previous }` |
| `vt-error`         | Too large, loading or refresh failure | `{ message, cause }`   |

## CSS parts

`banner`, `group`, `component`, `days`, `day`, `uptime`, `incident` and `update`, plus the [shared parts](../theming.md).

## Accessibility

- A state is always a word and an icon, and the bars of a bad day are taller than the others.
- The bars of a component are one stop for the keyboard. Left and Right move by a day, Page Up and Page Down by a week, Home and End to the ends. The day is read out and written under the bars.

## Security

Every value is rendered as text. Links keep `http:`, `https:`, `mailto:`, `tel:` and relative URLs only, and other links are dropped. Lists, days and texts are limited in size. See [Security](../security.md).
