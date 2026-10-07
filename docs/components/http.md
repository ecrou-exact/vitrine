# `<vt-http>`

`<vt-http>` shows an HTTP request and its response, and writes the same request as code for curl, JavaScript `fetch`, Python `requests` and HTTPie. It is made for API documentation: paste an exchange from a `.http` file, a curl command, or your browser's developer tools.

```html
<vt-http variant="full" label="Create a task">
  <template>
    POST /v1/tasks HTTP/1.1
    Host: api.example.com
    Content-Type: application/json
    Authorization: Bearer example-token-0123456789abcdef

    {"title": "Write docs", "priority": 2}

    HTTP/1.1 201 Created
    Content-Type: application/json

    {"id": 981, "title": "Write docs", "status": "open"}
  </template>
</vt-http>
```

Nothing is ever sent: the component only displays the exchange. Every value is inserted as text.

## Variants

| Feature                   | `simple` (default) | `full` |
| ------------------------- | ------------------ | ------ |
| `header`                  | off                | on     |
| `dot`                     | off                | on     |
| `copy` (raw HTTP)         | off                | on     |
| `search`                  | off                | on     |
| `download` (`.http` file) | off                | on     |
| `fullscreen`              | off                | on     |
| `tabs` (Exchange / Code)  | off                | on     |
| `mask-secrets`            | on                 | on     |

Every feature can be turned on or off individually, whatever the variant.

## Formats

The format is detected from the content.

### Raw HTTP

A request line, headers, a blank line and the body, then optionally the response: a status line (`HTTP/1.1 201 Created`), headers, a blank line and the body. This is the format of `.http` files (VS Code REST Client, JetBrains HTTP Client) and of RFC examples.

- The HTTP version is optional: `GET https://api.example.com/users` is a complete request.
- Lines starting with `#` or `//` before the request (comments, `###` separators) are ignored.
- The response starts at a status line that follows a blank line; a body line that merely looks like a status line stays in the body.
- A response alone (starting with `HTTP/…`) is accepted too.
- A missing reason phrase is filled with the standard one (`HTTP/2 404` shows "404 Not Found").

### curl

Paste a curl command, as copied from browser developer tools ("Copy as cURL") or from documentation:

```html
<vt-http variant="full">
  <template>
    curl -X PATCH 'https://api.example.com/items/7' \
      -H 'Content-Type: application/json' \
      --data-raw '{"done": true}'
  </template>
</vt-http>
```

Quotes, backslashes, `$'…'` strings and line continuations are read like a shell reads them (without running anything). Supported options: `-X`, `-H`, `-d` and the other `--data` forms, `--data-urlencode`, `--json`, `-F` (fields listed as text), `-u` (turned into an `Authorization: Basic` header), `-b`, `-A`, `-e`, `-G`, `-I`, `--url`. Options that do not change the request (`-s`, `-L`, `-o file`…) are ignored. The method is POST when there is data, unless `-X` or `-G` says otherwise.

### JSON and HAR

```json
{
  "request": {
    "method": "POST",
    "url": "https://api.example.com/tasks",
    "headers": { "Content-Type": "application/json" },
    "body": { "title": "Write docs" }
  },
  "response": { "status": 201, "headers": [["Location", "/tasks/981"]], "body": "", "time": 142 }
}
```

Headers are an object or `[name, value]` pairs; a body that is not a string is shown as JSON; `time` (milliseconds) is shown next to the status. A HAR entry, or a whole HAR file (its first entry), as exported by the Network panel of browser developer tools, works as is.

The `exchange` property returns the parsed exchange and accepts the JSON shape above:

```js
const http = document.querySelector('vt-http');
http.exchange = {
  request: { method: 'GET', url: 'https://api.example.com/me', headers: { Accept: 'application/json' } },
  response: { status: 200, body: { id: 42, name: 'Ada' } },
};
```

## Display

- **Request**: the method (colored by kind: GET blue, POST green, PUT and PATCH amber, DELETE red), then the URL with its origin muted, path parameters (`{id}` or `:id`) highlighted and the query string colored. A button copies the absolute URL. Below, **Body**, **Headers** and **Query** tabs (with counts).
- **Response**: the status, colored by class (2xx green, 3xx blue, 4xx amber, 5xx red), the duration and the body size. Below, **Body** and **Headers** tabs.
- **Bodies** are formatted by content type: JSON is indented and highlighted (numbers kept exactly), XML, HTML, SVG, JavaScript and YAML are highlighted, form data (`application/x-www-form-urlencoded`) is shown as a table, anything else as text. Without a content type, JSON and markup are recognized from the text.

`layout="columns"` puts the response next to the request when the element is at least 760px wide (below that, it stays under it).

## The Code tab

The Code tab writes the request for each language:

| Language | Output                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `curl`   | `curl URL` with `-X` only when needed, one `-H` per header and `--data-raw`                                                                                               |
| `fetch`  | `await fetch(url, { method, headers, body })`, with a JSON body as an object literal in `JSON.stringify()`, and `response.json()` when the response (or `Accept`) is JSON |
| `python` | `requests.post(url, headers=…, json=…)` with a JSON body as a Python dict (`True`, `False`, `None`)                                                                       |
| `httpie` | `http METHOD URL Header:value --raw body`                                                                                                                                 |

Values are quoted for each language (shell single quotes, JavaScript and Python string literals), so no value can break out of its string. Relative URLs are completed with the `Host` header (`http` for localhost, `https` otherwise). Headers the tools set themselves (`Host`, `Content-Length`…) are left out; `fetch` also leaves out the headers browsers do not allow and uses `credentials: 'include'` instead of a `Cookie` header.

Choose the languages and their order with `snippets`:

```html
<vt-http snippets="python curl" view="code" src="/examples/create-task.http"></vt-http>
```

## Secrets

Credentials are masked by default, everywhere: in the headers, the URL, the bodies, the generated code, and what copy and download produce. The reader can show them with the eye button in the header.

| What                                                                                                                                                                    | Masked as                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `Authorization`, `Proxy-Authorization`                                                                                                                                  | `Bearer ••••••••` (scheme kept)                                     |
| `Cookie`, `Set-Cookie`                                                                                                                                                  | `session=••••••••; theme=••••••••`, attributes of `Set-Cookie` kept |
| `X-API-Key`, `X-Auth-Token`, `X-CSRF-Token`, `Private-Token`…, and any header whose name ends in `token`, `secret`, `key`, `password`, `signature`, `auth` or `session` | `••••••••`                                                          |
| Query parameters and form fields with such names (`api_key`, `access_token`, `password`…)                                                                               | `api_key=••••••••`                                                  |
| JSON fields with such names, at any depth                                                                                                                               | `"password": "••••••••"`                                            |
| A password in the URL (`https://user:pass@host`)                                                                                                                        | `https://user:••••••••@host`                                        |

Values of 16 characters or more keep their last 4 characters (`••••••••wxyz`) so readers can tell keys apart. When the code shown contains masked values, a note says so.

Masking is a display feature for documentation, not a security boundary: the real values are in the page source. Never publish real credentials; use example values. `mask-secrets="false"` turns masking off.

## Copy and download

The header copy button and the download button produce the exchange as raw HTTP, as displayed (masked or not). The Code tab has its own copy button for the current language, and the request line has one for the absolute URL.

## Editing

With `mode="edit"`, an editor holds the source and the exchange is updated live under it. See [Editing](../editing.md).

## Attributes

This table lists the attributes specific to `<vt-http>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute      | Type                          | Default                    | Description                                   |
| -------------- | ----------------------------- | -------------------------- | --------------------------------------------- |
| `view`         | `exchange` or `code`          | `exchange`                 | Initial view.                                 |
| `tabs`         | boolean                       | preset                     | Exchange / Code tabs.                         |
| `snippets`     | languages separated by spaces | `curl fetch python httpie` | Code languages and their order.               |
| `mask-secrets` | boolean                       | on                         | Mask credentials until the reader shows them. |
| `layout`       | `stacked` or `columns`        | `stacked`                  | Response under the request, or next to it.    |

## Properties

| Property   | Type     | Description                                                                     |
| ---------- | -------- | ------------------------------------------------------------------------------- |
| `content`  | `string` | The exchange as raw HTTP, a curl command or JSON.                               |
| `exchange` | `object` | `{ request, response }`, parsed. Setting it replaces the content. Never masked. |

`content` and `exchange` can be set before the element is defined.

## Events

| Event                   | `detail`                                   | When                                    |
| ----------------------- | ------------------------------------------ | --------------------------------------- |
| `vt-ready`              | `{ type: "http" }`                         | The exchange was rendered               |
| `vt-tab-change`         | `{ tab }`: a view, a section or a language | The reader chose a tab                  |
| `vt-copy`               | `{ text }`                                 | Something was copied                    |
| `vt-search`             | `{ query, matches }`                       | A search ran                            |
| `vt-input`, `vt-change` | `{ value }`                                | The source was edited (edit mode)       |
| `vt-error`              | `{ message, cause }`                       | Loading failed or the text is too large |

A message that cannot be read is shown as a notice that says why (for example "The curl command has no URL.").

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part             | Element                                                |
| ---------------- | ------------------------------------------------------ |
| `request`        | The request section                                    |
| `response`       | The response section                                   |
| `method`         | The method badge                                       |
| `url`            | The URL                                                |
| `status`         | The status badge; also `status-2xx`, `status-4xx`…     |
| `section-tabs`   | The Body / Headers / Query tabs, and the language tabs |
| `headers`        | A table of headers, query parameters or form fields    |
| `message-body`   | A formatted body                                       |
| `snippet`        | The generated code                                     |
| `secrets-button` | The show / hide secrets button                         |

```css
vt-http::part(method) {
  border-radius: 999px;
}

vt-http::part(status-5xx) {
  outline: 2px solid currentColor;
}
```

## Accessibility

Request and response are labeled sections; their tabs follow the ARIA tab pattern (arrow keys, Home, End). Headers are tables with row headers. Method and status are text, so color only adds to them. Showing or hiding secrets is announced.

## Limits

- At most 200 headers per message; header values are cut at 8,192 characters.
- The size limit of the [configuration](../configuration.md) applies (2 MB by default).
