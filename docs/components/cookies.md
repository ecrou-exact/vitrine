# `<vt-cookies>`

`<vt-cookies>` shows cookies as a table and checks each one: its prefix, its flags, `SameSite`, its lifetime, its size, its scope, and whether it belongs to the site or to a third party.

```html
<vt-cookies variant="full" url="https://shop.example.com/">
  <template>
    Set-Cookie: __Host-sid=4f2a9c; Path=/; Secure; HttpOnly; SameSite=Lax
    Set-Cookie: _ga=GA1.2.1234; Domain=example.com; Max-Age=63072000
  </template>
</vt-cookies>
```

The element only reads the cookies: nothing is sent or stored.

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |

## Input

| Format        | Read                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Set-Cookie`  | One header per line, with or without `Set-Cookie:`. Other header lines and status lines are skipped, so a whole response header block, `curl -I` or `curl -v` output (`< set-cookie:`) works. Every attribute is read; `Max-Age` wins over `Expires`.            |
| `Cookie`      | A request header, `Cookie: a=1; b=2`: names and values only, so there is nothing to check.                                                                                                                                                                       |
| JSON          | An array of cookies, or `{ "cookies": [...] }`, as exported by browsers and extensions (`expirationDate`, `hostOnly`, `sameSite: "no_restriction"`), Playwright (`context.cookies()`, `storageState()`) or Puppeteer (`expires` in seconds, `-1` for a session). |
| HAR           | A whole HAR file: the cookies set by its responses, from their `Set-Cookie` headers (or their `cookies` array), each with the URL that set it.                                                                                                                   |
| `cookies.txt` | The Netscape format written by curl (`-c`) and wget, with `#HttpOnly_` lines.                                                                                                                                                                                    |

The format is found from the text.

## Site and parties

A cookie set without `Domain` belongs to the host that set it: give that URL with `url` for `Set-Cookie` headers (a HAR file gives it for each cookie). The site the cookies are compared with is `site`, else the host of `url`, else the host of the first entry of a HAR file. A cookie is _first-party_ when its domain has the same registrable domain as the site (`www.example.com` and `example.com`), _third-party_ otherwise. The registrable domain is found without the Public Suffix List: the last two labels, or three for endings such as `co.uk`, which is right for most sites.

## Checks

| Level   | Check                                                                                                                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Error   | `__Host-` without `Secure`, with `Domain` or with a path other than `/`; `__Secure-` without `Secure`; `SameSite=None` without `Secure`; a `Domain` that is neither the host that set the cookie nor a parent of it (known from `url` or a HAR file). Browsers reject these cookies. |
| Warning | No `Secure`; no `HttpOnly` on a name that looks like a session or a credential (`session`, `sid`, `auth`, `token`, `jwt`, `csrf`…); a lifetime over 400 days (browsers cap it); name and value over 4096 bytes.                                                                      |
| Note    | No `HttpOnly` on other cookies; no `SameSite` (treated as `Lax` by most browsers); `Domain` sharing the cookie with every subdomain; a third-party cookie kept more than 30 days; a cookie already expired, which deletes the one with its name (nothing else is checked on it).     |

The filter button shows only the cookies with errors or warnings; `issues="false"` hides the explanations under each cookie.

## Values

Values are masked by default (`••••••••` and their last four characters), since cookies often hold sessions. The eye button shows them; `mask-values="false"` shows them from the start. Long values are cut and open in a `<details>`.

## Attributes

| Attribute     | Values      | Default                   | Description                                      |
| ------------- | ----------- | ------------------------- | ------------------------------------------------ |
| `url`         | URL         | —                         | The URL the `Set-Cookie` headers came from.      |
| `site`        | host or URL | the host of `url`, or HAR | The site, to tell first and third parties apart. |
| `issues`      | boolean     | on                        | The issues under each cookie.                    |
| `mask-values` | boolean     | on                        | Mask values until revealed.                      |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

## Copy

| Button                  | Output                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| JSON                    | The cookies as JSON (`name`, `value`, `domain`, `hostOnly`, `path`, `expires`, flags), read back as is. |
| Copy as a Cookie header | `name=value; name=value`, for a request.                                                                |

The copies hold the real values, even when they are masked.

## Properties

| Property  | Type       | Description                                                                                                                                                                                                                           |
| --------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content` | `string`   | The cookies.                                                                                                                                                                                                                          |
| `cookies` | `object[]` | Read-only: `{ cookie, party, lifetime, issues }` for each cookie; `cookie` is `{ name, value, domain, hostOnly, path, expires, session, secure, httpOnly, sameSite, partitioned, attributes, url }`, `issues` is `[{ level, code }]`. |

## Events

| Event      | Detail                | When                                     |
| ---------- | --------------------- | ---------------------------------------- |
| `vt-ready` | `{ type: "cookies" }` | The cookies are rendered.                |
| `vt-copy`  | `{ text }`            | The JSON or the Cookie header is copied. |
| `vt-error` | `{ message, cause }`  | Loading failed or content too large.     |

## CSS parts

| Part            | Element                                |
| --------------- | -------------------------------------- |
| `summary`       | The summary.                           |
| `cookies`       | The table.                             |
| `cookie`        | A cookie row.                          |
| `flag`          | A flag (also `flag-off` when missing). |
| `party`         | The party of a cookie.                 |
| `issue`         | An issue.                              |
| `values-button` | The show / hide values button.         |

## Accessibility

The table has column and row headers. Flags, parties and levels are words (`no HttpOnly`, `Third`, `Warning`), with an icon for levels; colors only repeat them. Showing or hiding values is announced.

## Security

Every value is inserted as text. Nothing is sent, stored or fetched. At most 5,000 cookies are read, and a value is cut at 16,384 characters.
