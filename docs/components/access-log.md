# `<vt-access-log>`

`<vt-access-log>` turns the access log of a web server into an analytics page: who came (IP, user, browser or bot), what they asked for, what the server answered and how fast. It is the view between `tail -f access.log` and a full analytics product, for a small site, an admin page or an incident review.

```html
<vt-access-log variant="full" anonymize src="/logs/access.log"></vt-access-log>
```

## What it reads

Each line is read on its own, so logs can mix formats:

| Server        | Format                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------- |
| Apache, Nginx | Common and combined formats; Nginx's `$request_time` after them (`0.012` or `rt=0.012`)      |
| IIS           | W3C extended, with its `#Fields:` line (`c-ip`, `cs-uri-stem`, `sc-status`, `time-taken`…)   |
| Caddy         | JSON access logs (`request.remote_ip`, `request.uri`, `status`, `duration`, `size`)          |
| Traefik       | JSON access logs (`ClientHost`, `RequestPath`, `DownstreamStatus`, `Duration` in ns)         |
| Nginx JSON    | `log_format … escape=json` with the names of Nginx variables (`remote_addr`, `request_uri`…) |

User agents are read into a browser (Chrome, Safari, Firefox, Edge…), a system (Windows, macOS, iOS, Android, Linux), a tool (curl, Python requests, Go, Postman…) or a bot (Googlebot, bingbot, GPTBot, ClaudeBot, AhrefsBot…, and anything named a bot, crawler or spider).

## What is shown

- Totals of the requests shown: requests, visitors (different IPs), errors (4xx and 5xx) and their share, data sent, bots, and the median and 95th percentile response time.
- Requests per period (a second to a week, chosen to fit), stacked by class of status.
- The Requests tab: a table, the newest first, with the time, IP, method, path, status, size, duration and client. A path opens the row on its user agent, referer, user, host and protocol; an IP keeps only its requests.
- The Top lists tab: pages, IP addresses, browsers and bots, systems, status codes, pages not found (404), referers and the slowest pages. Each entry keeps only its requests.

## Filters

The status buttons keep 2xx, 3xx, 4xx or 5xx. The filter field keeps the requests that contain every word, anywhere, or in a field it names: `status:404`, `status:5xx`, `ip:203.0.113.7`, `method:POST`, `path:/api`, `user:alice`, `bot:yes`, `browser:Firefox`, `os:Android`.

## Privacy

Access logs hold personal data. `anonymize` hides the end of each IP address (`203.0.113.0`, `2001:db8:85a3::`) everywhere: in the table, the filters, the top lists and the CSV. Nothing is sent anywhere; the log is read in the page.

## Live

`write(lines)` adds lines as the server writes them, from a WebSocket or server-sent events.

## Attributes

| Attribute   | Type    | Default      | Description                             |
| ----------- | ------- | ------------ | --------------------------------------- |
| `anonymize` | boolean | off          | Hides the last part of IP addresses     |
| `order`     | string  | `newest`     | `newest` or `oldest` first in the table |
| `page`      | number  | 200          | Rows drawn before "Show more"           |
| `filter`    | string  | —            | The filter at first                     |
| `chart`     | boolean | on           | Requests per period                     |
| `filters`   | boolean | full variant | Status buttons and the filter field     |
| `tabs`      | boolean | full variant | Requests / Top lists tabs               |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header with the number of requests shown, filters, tabs, full screen, download (the log) and copy (the requests shown, as CSV).

## Properties

`requests` is the list read: `{ line, ip, user, time, method, path, protocol, status, bytes, referer, agent, duration, host, client }`, with `client` `{ browser, os, device, bot }`.

## Events

| Event              | When                         | Detail                      |
| ------------------ | ---------------------------- | --------------------------- |
| `vt-filter-change` | The status or filter changed | `{ status, filter, shown }` |
| `vt-tab-change`    | The view changed             | `{ tab }`                   |

## CSS parts

`stats`, `chart`, `table` and `top`.
