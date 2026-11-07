# `<vt-countdown>`

`<vt-countdown>` counts down to a date: a launch, an event, the end of an offer.

```html
<vt-countdown to="2027-01-01T00:00:00" timezone="Europe/Paris"></vt-countdown>
```

## Format

A date, one countdown, or a list of them: the next one that has not passed is shown, or the last one.

```json
{
  "to": "2026-12-01T09:00:00Z",
  "title": "Launch day",
  "description": "Version 2.0 goes live.",
  "ended": "Version 2.0 is live!",
  "url": "https://example.com/launch",
  "cta": "Read the announcement"
}
```

`date`, `target` and `start` are read as `to`. A date without an offset is read in its `timezone`, or in the `timezone` attribute, or in the time zone of the reader.

## Time

Units are written in the words of the reader's language ("23 days", "23 jours"). The time is updated every second, but it is not read out each time: screen readers hear it when they reach it, and the end is announced once. Set `now` to show a fixed moment, for documentation and tests; nothing moves then.

## Attributes

| Attribute  | Type   | Default       | Description                                                                     |
| ---------- | ------ | ------------- | ------------------------------------------------------------------------------- |
| `to`       | string | none          | The date, when there is no content                                              |
| `timezone` | string | of the reader | Time zone of a date written without an offset                                   |
| `units`    | string | all           | Units to show, among `days hours minutes seconds`; the last unit takes the rest |
| `now`      | string | now           | Fixed current time                                                              |

Shared attributes are in [Common attributes](../common-attributes.md).

## Events

| Event              | When                                         | Detail   |
| ------------------ | -------------------------------------------- | -------- |
| `vt-countdown-end` | The date was reached while the page was open | `{ to }` |

## CSS parts

`title`, `timer`, `unit`, `value`, `unit-name`, `ended` and `action`, plus the [shared parts](../theming.md).
