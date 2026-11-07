# JSON as input

Every Vitrine element can be fed with JSON: the answer of your API, a file next to the page, or a value in your code. JSON is the content of some elements (`<vt-json>`, `<vt-table>`, `<vt-chart>`…). The others turn a JSON value into their own format, so a code sample, a terminal session or a `.env` file can come from an API too.

```html
<!-- From an address, picking a value inside the answer -->
<vt-code json-src="/api/snippets/42" json-path="data.snippet"></vt-code>

<!-- Written in the page -->
<vt-terminal json='[{"command":"npm install vitrine","output":"added 1 package"}]'></vt-terminal>

<!-- In a script inside the element -->
<vt-faq>
  <script type="application/json" data-json>
    [{ "question": "Is it free?", "answer": "Yes." }]
  </script>
</vt-faq>
```

```js
document.querySelector('vt-stats').data = await (await fetch('/api/kpis')).json();

Vitrine.render(target, { type: 'env', data: { PORT: 8080, API_KEY: secret } });
```

## Four ways in

| Way                                                 | Use it for                            |
| --------------------------------------------------- | ------------------------------------- |
| `data` property                                     | Values you already have in JavaScript |
| `json` attribute                                    | Small values written in the page      |
| `json-src` attribute, with `json-path`              | An API or a JSON file                 |
| `<script type="application/json" data-json>` inside | Larger values written in the page     |

`json-src` follows the rules of [`src`](common-attributes.md#src-and-allow-remote): only `http(s)`, the page's own origin unless `allow-remote` is set, cookies only to the page's own origin, `maxSize` and `fetchTimeout`.

`json-path` picks a value inside the JSON: `data.items`, `results[0].code`. Only the JSON's own keys are followed. When nothing is found there, the element says so.

A `<template data-json>` works like the script; use it on pages with Trusted Types, where JavaScript cannot write the text of a script. A JSON script or template is never shown as content.

**Order.** `content` and `data` set from JavaScript come first, then `json-src`, `json` and a JSON script, then `src` and inline content.

## Options in the JSON

Some elements read options next to the content, such as the language of a code sample. They set the matching attribute, from a short list per element. **An attribute the page sets itself always wins**, and nothing that changes what is loaded or how HTML is handled (`src`, `allow-remote`, `allow-html`, `images`…) can be set from JSON.

## What each element reads

| Element                  | A JSON value is read as                                                                                              | Options it may set                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `<vt-code>`              | A string, or `{ code }` (also `content`, `source`, `text`). Any other value is shown as JSON                         | `language`, `label` (`filename`, `title`), `highlightLines`, `startLine`, `lineNumbers`, `wrap`, `tabSize` |
| `<vt-markdown>`          | A string, or `{ markdown }` (also `md`, `content`, `text`, `body`)                                                   | `label`, `toc`, `anchors`                                                                                  |
| `<vt-csv>`               | A list of objects (columns from their keys), a list of lists, or `{ columns, rows }`                                 |                                                                                                            |
| `<vt-diff>`              | `{ original, modified }`, `{ patch }`, or a patch                                                                    | `language`, `originalLabel`, `modifiedLabel`                                                               |
| `<vt-terminal>`          | A list of `{ command, output, prompt }` or of lines, or `{ commands }`                                               | `prompt`, `label`                                                                                          |
| `<vt-log>`               | A list of entries (objects or lines), or `{ entries }`                                                               | `label`                                                                                                    |
| `<vt-env>`               | `{ "PORT": 8080 }`, or a list of `{ key, value, comment }`                                                           |                                                                                                            |
| `<vt-hex>`               | A list of bytes, `{ hex }` or `{ base64 }`                                                                           | `format`, `label`                                                                                          |
| `<vt-regex>`             | `{ pattern, flags, replace, text }`                                                                                  | `pattern`, `flags`, `replace`                                                                              |
| `<vt-xml>`               | A string, `{ xml }`, or a value: keys are elements, `@` holds attributes, `#text` text                               | `label`                                                                                                    |
| `<vt-toml>`, `<vt-yaml>` | Any object                                                                                                           |                                                                                                            |
| `<vt-jwt>`               | A string, or `{ token }` (also `jwt`, `access_token`, `id_token`)                                                    | `now`                                                                                                      |
| `<vt-cron>`              | An expression, `{ expression, timezone }`, or jobs `[{ schedule, command, comment }]`                                | `timezone`, `count`, `label`                                                                               |
| `<vt-cert>`              | PEM text, `{ pem }`, or a list (a chain)                                                                             | `label`, `now`                                                                                             |
| `<vt-git>`               | Commits, including the answers of the GitHub, GitLab and Bitbucket APIs. See [`<vt-git>`](components/git.md#formats) |                                                                                                            |
| Every other element      | Its own JSON format, described in its reference                                                                      |                                                                                                            |

Values are written in each format with what it needs escaped: quotes in CSV, `&` and `<` in XML, keys and strings in TOML, values with spaces in `.env`. A key a format cannot hold is left out (`.env`) or kept as an attribute (`<item name="…">` in XML). TOML has no `null`: such values are left out.

## Security

A JSON value is data. It is turned into text with the serializers above and shown by the element like any other content, so the [usual guarantees](security.md) apply: no HTML from text, safe URL schemes only, size limits.
