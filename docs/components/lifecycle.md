# `<vt-lifecycle>`

`<vt-lifecycle>` shows the release cycles of a product and their support: which versions are supported, until when, and which ones reached their end of life. It is the "Supported versions" table of a `SECURITY.md`, and the release schedule of Node.js, Python or Django. Give `version` and it says whether that version is still supported.

```html
<vt-lifecycle
  variant="full"
  version="20.11.1"
  json-src="https://endoflife.date/api/v1/products/nodejs"
  allow-remote
></vt-lifecycle>
```

## What it reads

- The [endoflife.date](https://endoflife.date) API: `/api/v1/products/{product}` (`result.releases`, with `isLts`, `eoasFrom`, `eolFrom`, `eoesFrom` and `latest`) or the older `/api/{product}.json` (a list with `cycle`, `support`, `eol`, `lts`, `extendedSupport`). Its data is under CC BY-SA: say where it comes from on your page.
- Your own list, newest first: `[{ "version": "3.x", "released": "2025-01-10", "support": "2026-01-10", "eol": "2027-01-10", "lts": true, "latest": "3.4.1" }]`. `eol: true` or `false`, or `supported: true`, say it without a date.

## Status

| Status              | When                                                               |
| ------------------- | ------------------------------------------------------------------ |
| Upcoming            | Its release date has not come yet                                  |
| Supported           | Before the end of active support (bug and security fixes)          |
| Security fixes only | After active support, before the end of life                       |
| Extended support    | After the end of life, while extended (often paid) support goes on |
| End of life         | After the end of life, or said to be ended                         |

Dates are days, shown in UTC so a date never moves with the reader's time zone. Set `now` to judge them at another date, for documentation and tests.

## Checking a version

`version="20.11.1"` finds the cycle it belongs to (the longest cycle name it starts with: `20`, `3.12`), marks its row and says, for example, "20.11.1 is no longer supported, since Apr 30, 2026. The latest release of 20 is 20.19.5." Set it from your own version to warn readers of an old documentation page.

## Schedule

The Schedule tab draws a bar per cycle from its release to its end of life: green while it is supported, amber for security fixes only, grey for extended support, and a line for today. A cycle without an end date fades out. Each row says the same in words for screen readers.

## Attributes

| Attribute | Type    | Default      | Description                                                  |
| --------- | ------- | ------------ | ------------------------------------------------------------ |
| `version` | string  | —            | A version to check: its cycle is marked and its support said |
| `view`    | string  | `table`      | `table` or `schedule` at first                               |
| `ended`   | number  | 3            | Ended cycles shown before a "Show more" button               |
| `now`     | string  | today        | The date support is judged at (ISO 8601)                     |
| `tabs`    | boolean | full variant | Table / Schedule tabs                                        |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header with the number of supported cycles, the tabs, copy and download (the cycles as CSV) and full screen.

## Properties

`cycles` is the list of cycles, newest first: `{ name, label, codename, released, activeEnd, eol, extendedEnd, lts, latest, latestDate, link }`, dates in milliseconds.

## Events

| Event           | When             | Detail    |
| --------------- | ---------------- | --------- |
| `vt-tab-change` | The view changed | `{ tab }` |

## CSS parts

`check`, `table`, `schedule` and `status`.
