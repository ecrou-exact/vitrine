# `<vt-waterfall>`

`<vt-waterfall>` shows a HAR file as a network waterfall: each request with its method, status, type, size and time, and a bar split into its phases against the DOMContentLoaded and load marks. A summary counts requests, domains, third parties, bytes and failures, and lists the redirects the page went through. It reads the HAR files of browsers' developer tools, Playwright, Lookyloo captures and proxies.

```html
<vt-waterfall variant="full" src="capture.har"></vt-waterfall>
```

The element only reads the file: nothing is fetched and URLs are never links.

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |
| `tabs`       | on                 | on     |

## Input

HAR 1.2 JSON: `{ "log": { "pages", "entries" } }`, the `log` object alone, or a list of entries. Up to 5,000 entries are read. When the file has several pages, a list chooses the page (`page` sets the first one); entries without `pageref` belong to the first page.

HAR files with response bodies can be large: raise the limit with `Vitrine.configure({ maxSize })` (see [configuration](../configuration.md)).

## The page

- **Summary**: the title or URL of the page, requests, domains, third-party domains, bytes transferred and resource sizes, DOMContentLoaded, load and the end of the last request, failed requests and HTTP requests on an HTTPS page.
- **Redirects before the page**: the first document and each redirect it followed (`3xx` with `redirectURL`), up to the document the visitor lands on.
- The page is that document: requests on another registered domain are **third party**, `http:` and `ws:` requests made after it on an HTTPS page are **mixed content**.

## Requests

Each row: the file name and the host, tags (Third party, HTTP, Redirect), the status (in words when the request failed), the type, the bytes transferred (`cache` when served from cache), the time and the bar. The bar starts when the request started and is split into its phases:

| Phase          | HAR timing | Color in the bar |
| -------------- | ---------- | ---------------- |
| Queued         | `blocked`  | border           |
| DNS            | `dns`      | type color       |
| Connection     | `connect`  | warning          |
| TLS            | `ssl`      | keyword color    |
| Request sent   | `send`     | success          |
| Waiting (TTFB) | `wait`     | accent           |
| Download       | `receive`  | info             |

HAR counts TLS in `connect`: the element keeps them apart so the bar adds up. Vertical lines mark DOMContentLoaded and load. The legend names each color, and each bar has a text alternative with its start, duration and phases.

A row opens on its URL, server IP, protocol, content type, redirect target, start, each phase in milliseconds, and the request and response headers.

Types come from Chrome's and Playwright's `_resourceType`, otherwise from the content type or the file extension: Document, Script, CSS, Image, Font, Fetch/XHR, Media, Other.

## Filters and domains

With `filters` (on by default): a button per type present, "Third party only", and a field that keeps the URLs containing a text (or a status, such as `404`). The Domains tab lists each host with its requests, bytes, IP addresses and types, the busiest first.

## Attributes

| Attribute | Values                | Default    | Description                               |
| --------- | --------------------- | ---------- | ----------------------------------------- |
| `view`    | `requests`, `domains` | `requests` | Tab shown first.                          |
| `page`    | number                | 1          | The page shown when the file has several. |
| `filters` | boolean               | on         | Type, text and third-party filters.       |
| `defang`  | boolean               | off        | Show URLs and hosts defanged.             |
| `tabs`    | boolean               | on         | The Requests and Domains tabs.            |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

CSS custom property: `--vt-waterfall-name-width` sets the width of the name column (default `34%`).

## Copy

| Button        | Output                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV           | `index,method,status,type,url,ip,transfer,size,start_ms,time_ms`, the requests shown; cells a spreadsheet would run as a formula are prefixed. |
| Copy the URLs | The URLs shown, one per line (defanged with `defang`).                                                                                         |

## Properties

| Property  | Type             | Description                                                                                                                                                                                                                                                                                       |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content` | `string`         | The HAR file.                                                                                                                                                                                                                                                                                     |
| `har`     | `object \| null` | Read-only: `{ creator, browser, pages, capped }`; each page `{ id, title, url, domain, onContentLoad, onLoad, duration, redirects, entries }`; each entry `{ index, start, time, timings, method, url, host, domain, status, type, size, transfer, ip, redirect, thirdParty, mixed, failed, … }`. |

## Events

| Event              | Detail                                | When                                 |
| ------------------ | ------------------------------------- | ------------------------------------ |
| `vt-ready`         | `{ type: "waterfall" }`               | The file is rendered.                |
| `vt-tab-change`    | `{ tab }`                             | The tab changed.                     |
| `vt-filter-change` | `{ types, query, thirdParty, shown }` | The filters changed.                 |
| `vt-select`        | `{ index, url, status }`              | A request was opened.                |
| `vt-copy`          | `{ text }`                            | CSV or URLs copied.                  |
| `vt-error`         | `{ message, cause }`                  | Loading failed or content too large. |

## CSS parts

| Part        | Element                           |
| ----------- | --------------------------------- |
| `summary`   | The summary of the page.          |
| `redirects` | The redirects before the page.    |
| `filters`   | The filters.                      |
| `requests`  | The table of requests.            |
| `bar`       | The bar of a request.             |
| `details`   | The details of an opened request. |
| `domains`   | The table of domains.             |
| `legend`    | The legend of the phases.         |

## Accessibility

Requests are a table with column headers; the name of each request is a button that opens its details (`aria-expanded`). Each bar is an image with a text alternative. Filters are toggle buttons (`aria-pressed`); statuses and tags are words, colors only repeat them.

## Security

Every value is inserted as text and URLs are never links; nothing is fetched. At most 5,000 entries and 200 headers per message; line breaks in header values become spaces. Bars are positioned through CSSOM, which works under a strict CSP. CSV cells that could run as formulas are prefixed.
