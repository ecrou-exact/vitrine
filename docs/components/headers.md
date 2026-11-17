# `<vt-headers>`

`<vt-headers>` checks the security headers of an HTTP response and explains each finding in words, with a grade, the Content-Security-Policy as a table and every header.

```html
<vt-headers variant="full">
  <template>
    HTTP/2 200
    strict-transport-security: max-age=63072000; includeSubDomains; preload
    content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; object-src 'none'
    x-content-type-options: nosniff
    set-cookie: session=abc; Path=/; HttpOnly
    server: nginx/1.25.3
  </template>
</vt-headers>
```

The headers are **only read**. Nothing is fetched or sent: paste what `curl -I` or the browser's developer tools show.

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |

## Input

- **Raw headers**, one `Name: value` per line, with or without the status line. Folded lines (starting with a space) continue the header before.
- **`curl -I` output**: with redirects, the last response is kept.
- **`curl -v` output**: only the `<` lines (the response) are read.
- **A Content-Security-Policy alone** (`default-src 'self'; script-src …`): only the policy is checked.
- **JSON** with `json` or `data`: an object of headers (`{ "Server": "nginx" }`, a list for a repeated header such as `Set-Cookie`), a list of `{ name, value }` or `[name, value]`, or a HAR entry or response (`{ response: { status, httpVersion, headers } }`).

## Checks

| Header                                                                   | Problem                                                                                                                                                                       | Warning                                                                     | Note                                  |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| Strict-Transport-Security                                                | Missing, or without `max-age`                                                                                                                                                 | `max-age` under 180 days                                                    |                                       |
| Content-Security-Policy                                                  | Missing; `'unsafe-inline'` scripts without nonce, hash or `'strict-dynamic'`; scripts from `*`, `https:`, `http:`, `data:` or `blob:`; neither `script-src` nor `default-src` | Report-Only only; `'unsafe-eval'`; `object-src` not `'none'`; no `base-uri` |                                       |
| X-Frame-Options / frame-ancestors                                        |                                                                                                                                                                               | Neither set; `ALLOW-FROM` or another invalid value                          |                                       |
| X-Content-Type-Options                                                   |                                                                                                                                                                               | Missing, or not `nosniff`                                                   |                                       |
| Referrer-Policy                                                          |                                                                                                                                                                               | `unsafe-url`, `no-referrer-when-downgrade`                                  | Missing (browsers use a safe default) |
| Permissions-Policy                                                       |                                                                                                                                                                               |                                                                             | Missing                               |
| Cross-Origin-Opener-Policy                                               |                                                                                                                                                                               |                                                                             | Missing                               |
| Set-Cookie (each cookie)                                                 | `SameSite=None` without `Secure`; `__Host-` or `__Secure-` prefix rules broken                                                                                                | Not `Secure`                                                                | Not `HttpOnly`; no `SameSite`         |
| Access-Control-Allow-Origin                                              | `*` with `Access-Control-Allow-Credentials: true`                                                                                                                             | `null`                                                                      | `*`                                   |
| Server, X-Powered-By, X-AspNet-Version, X-AspNetMvc-Version, X-Generator |                                                                                                                                                                               | A version or the software is named                                          |                                       |
| X-XSS-Protection, Public-Key-Pins, Expect-CT                             |                                                                                                                                                                               | X-XSS-Protection other than `0`                                             | Public-Key-Pins, Expect-CT (obsolete) |

Checks that pass are listed too ("Passed"); `passed="false"` hides them. With `https="false"` (a site served over plain HTTP), HSTS and the `Secure` flag are not checked.

## Grade

| Grade | When                           |
| ----- | ------------------------------ |
| A+    | No problem and no warning      |
| A     | No problem, 1 or 2 warnings    |
| B     | No problem, 3 warnings or more |
| C     | 1 problem                      |
| D     | 2 problems                     |
| F     | 3 problems or more             |

Notes do not change the grade. The grade sums up the headers only: it says nothing about the application behind them.

## Content-Security-Policy

The policy is shown as a table of directives and sources. Sources are colored by kind (keywords, nonces and hashes, schemes, hosts), and risky ones (`'unsafe-inline'`, `'unsafe-eval'`, `'unsafe-hashes'`, wildcards and whole schemes in `script-src`, `default-src` or `object-src`) are outlined. `policy="false"` hides the table.

## Attributes

| Attribute | Values  | Default | Description                                                    |
| --------- | ------- | ------- | -------------------------------------------------------------- |
| `https`   | boolean | on      | The response is served over HTTPS (HSTS and `Secure` checked). |
| `passed`  | boolean | on      | List the checks that passed.                                   |
| `policy`  | boolean | on      | Table of the Content-Security-Policy.                          |
| `headers` | boolean | on      | Every header, in a folded section.                             |

The shared attributes (`variant`, `theme`, `src`, `json`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

## Properties and methods

| Property / method | Type             | Description                                                                                              |
| ----------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| `content`         | `string`         | The headers.                                                                                             |
| `findings`        | `object[]`       | Read-only: `{ id, level, header, params }`, most severe first. `level` is `bad`, `warn`, `info` or `ok`. |
| `grade`           | `string \| null` | Read-only: `A+` to `F`, `null` without headers.                                                          |
| `reportText()`    | `string`         | The report as text, one finding per line (what Copy copies).                                             |

## Events

| Event      | Detail                | When                                 |
| ---------- | --------------------- | ------------------------------------ |
| `vt-ready` | `{ type: "headers" }` | The report is rendered.              |
| `vt-copy`  | `{ text }`            | The report is copied.                |
| `vt-error` | `{ message, cause }`  | Loading failed or content too large. |

## CSS parts

| Part       | Element                            |
| ---------- | ---------------------------------- |
| `grade`    | The grade.                         |
| `findings` | The list of findings.              |
| `finding`  | A finding.                         |
| `policy`   | The Content-Security-Policy table. |
| `headers`  | The folded list of every header.   |

## Editing

In edit mode, an editor holds the headers, and the report under it is updated 250 ms after typing stops.

## Accessibility

Each finding has its level in words (Problem, Warning, Note, Passed) with an icon, never by color alone. The grade has a text label. Tables have column and row headers; every header is in a native `<details>` element.

## Security

Nothing is fetched or sent: the element reads only the text it is given. Every header name and value is inserted as text. At most 500 headers are read, and JSON input cannot add lines to a header value (line breaks become spaces).
