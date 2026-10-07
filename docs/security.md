# Security

Vitrine is built to display content you do not control: user comments in Markdown, API responses, uploaded code. This page explains what Vitrine guarantees, how it does it, how to configure a Content Security Policy, and what it cannot protect you from.

To report a vulnerability, follow the [security policy](../SECURITY.md).

## Threat model

Vitrine assumes that the **content** you pass through the `content` property, the `data` or `exchange` property or `src` may be hostile. It must never:

- run script, in any form (script tags, event handlers, `javascript:` URLs, SVG, mutation XSS);
- inject styles or markup outside the sanitizer's allow-list;
- load resources the page did not allow (blocked images, external stylesheets);
- escape the element's area or break the page through size or nesting.

Vitrine also treats **attribute values** defensively: invalid values fall back to defaults, labels are rendered as text, and lengths, language names, file names and URLs are validated.

Vitrine trusts the **page itself**: its HTML, its scripts and its CSS.

## Guarantees by component

| Component       | How content is displayed                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<vt-code>`     | As text. Highlighting output is sanitized again (see below). No HTML parsing of the content.                                                                                                                                                                                                                                                                                                                     |
| `<vt-json>`     | With DOM text APIs only. The built-in parser never evaluates anything, and keys such as `__proto__` are plain data.                                                                                                                                                                                                                                                                                              |
| `<vt-markdown>` | Through the sanitization pipeline below. Raw HTML is shown as text unless `allow-html` is set.                                                                                                                                                                                                                                                                                                                   |
| `<vt-csv>`      | Cells, headers and the raw view as text only. No HTML parsing of the content.                                                                                                                                                                                                                                                                                                                                    |
| `<vt-diff>`     | As text. Highlighting output is sanitized like `<vt-code>`; changed words are wrapped with DOM APIs.                                                                                                                                                                                                                                                                                                             |
| `<vt-tags>`     | Labels, groups, descriptions and counts as text. Colors, links and part names are validated (see [Tags](#tags)).                                                                                                                                                                                                                                                                                                 |
| `<vt-terminal>` | Commands and output as text. ANSI escape sequences are parsed into colors and text styles only; everything else is removed. OSC 8 links become links only for absolute `http:` or `https:` URLs, with `rel="noopener noreferrer nofollow"`.                                                                                                                                                                      |
| `<vt-tree>`     | Names and notes as text. `href-template` URLs are checked with the [URL rules](#url-rules), and path segments are URL-encoded; a refused URL leaves the name as text.                                                                                                                                                                                                                                            |
| `<vt-http>`     | Methods, URLs, headers and bodies as text. Nothing is ever sent: curl commands are only parsed, never run. The Code tab quotes every value for its language. Secrets are masked by default, but masking is a display feature, not a security boundary.                                                                                                                                                           |
| `<vt-log>`      | Times, levels, messages, fields and stack traces as text. ANSI escape sequences are parsed like in `<vt-terminal>`: colors and text styles only.                                                                                                                                                                                                                                                                 |
| `<vt-chart>`    | Labels and values are drawn on a canvas by Apache ECharts. Tooltips are drawn on the canvas too, never inserted as HTML. The ECharts build shipped in `dist/vendor/` replaces its `innerHTML` clearing with `textContent`, so it works under Trusted Types. ECharts 6.1 has no known vulnerability.                                                                                                              |
| `<vt-openapi>`  | Every name, path, type and value as text. Markdown descriptions go through the [sanitization pipeline](#markdown-sanitization-pipeline), with images blocked. Only local `$ref` references are followed; references to other files are never fetched. Nothing is ever sent to the API. YAML is read with the core schema, which produces only plain data (strings, numbers, booleans, null, arrays and objects). |

Interface text (labels, titles, translations, search queries, error messages) is always inserted with `textContent`. Vitrine's own interface is built with `createElement`; the security module is the only place where an HTML string becomes DOM nodes.

Editors are native `<textarea>` elements: what is typed is text, and the highlighted layer under it is built like the read-only view.

## Markdown sanitization pipeline

1. **marked** parses the Markdown (GFM) into an HTML string. Without `allow-html`, any raw HTML in the source is escaped at this step, so it ends up as visible text.
2. **DOMPurify** parses that string in an inert document and keeps only an allow-list of tags and attributes. `data-*` and `aria-*` attributes, unknown URL protocols, and the content of `<script>`-like elements are dropped. Removed elements keep their text.
3. **Post-processing** on the resulting DOM fragment:
   - every `class` is removed, except `language-*` classes on `<code>` (used for code block highlighting);
   - every `href` is checked with the URL rules below; an unsafe `href` is removed (the text stays);
   - relative URLs are resolved against the `src` file when the content came from `src`;
   - links to another origin get `rel="noopener noreferrer nofollow"`, and `target="_blank"` unless `external-links="same"`;
   - images follow the image policy;
   - `<input>` elements other than checkboxes are removed, and checkboxes are disabled.
4. **Enrichment**: heading ids and anchors, code block highlighting, table wrappers. These are built with DOM APIs.

### Allowed tags and attributes

Everything not listed here is removed.

Tags:

```text
a, abbr, b, blockquote, br, caption, code, col, colgroup, dd, del,
details, div, dl, dt, em, figcaption, figure, h1, h2, h3, h4, h5, h6,
hr, i, img, input, ins, kbd, li, mark, ol, p, pre, q, s, samp,
small, span, strong, sub, summary, sup, table, tbody, td, tfoot, th,
thead, tr, u, ul, var
```

Attributes:

```text
align, alt, checked, class, colspan, dir, disabled, height, href, lang,
open, rowspan, span, src, start, title, type, width
```

`style`, `id`, `name`, event handlers (`on*`), `data-*` and `aria-*` are always removed. As a result there is no `<script>`, `<style>`, `<link>`, `<meta>`, `<base>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<button>`, `<textarea>`, `<select>`, `<svg>`, `<math>`, `<video>`, `<audio>` or `<template>` in the output.

### Syntax highlighting output

highlight.js escapes the code it highlights. Its output is still sanitized a second time, independently: only `<span>` elements survive, with only `hljs-*` classes (and highlight.js sub-scope suffixes such as `function_`). A bug in a grammar therefore cannot inject markup.

### URL rules

A URL in `href` or `src` is accepted when, after the same normalization browsers apply (leading and trailing control characters and spaces removed, tabs and newlines removed anywhere):

- it is empty, relative (`/a`, `./b`, `../c`, `page.html?x=1`), a fragment (`#top`) or a query (`?q`);
- or its scheme is `http:`, `https:`, `mailto:` or `tel:` (case-insensitive).

Everything else is rejected, including `javascript:`, `vbscript:`, `data:`, `file:`, `blob:` and `ftp:`, whatever the case or obfuscation (`JaVaScRiPt:`, `java\tscript:`, leading control characters, HTML entities). The only exception is images: a raster `data:` image (`data:image/png`, `gif`, `jpeg`, `jpg`, `webp` or `avif`, base64 encoded) is allowed when the image policy is `allow`. SVG `data:` images are always rejected.

### Image policy

Set with the `images` attribute of `<vt-markdown>`:

| Value             | Images shown                                                      |
| ----------------- | ----------------------------------------------------------------- |
| `allow` (default) | Safe URLs (`http:`, `https:`, relative) and raster `data:` images |
| `same-origin`     | Only URLs on the page's origin; no `data:` images                 |
| `block`           | None                                                              |

A blocked image is replaced by a text placeholder showing its alternative text, before it is inserted in the page, so it is never requested. Use `same-origin` or `block` to prevent tracking pixels in user content. Displayed images get `referrerpolicy="no-referrer"`, `loading="lazy"` and `decoding="async"`.

### Sanitizer self-test

DOMPurify returns its input unchanged when it considers the environment unsupported, and some non-browser DOM implementations make it fail silently. Before the first use, Vitrine sanitizes a known hostile sample and checks the result. If anything dangerous survives, Vitrine logs "HTML sanitizer unavailable: rich content is shown as plain text." and every later sanitization returns the input as inert text instead of HTML. It fails closed.

## Tags

`<vt-tags>` receives data from pages, backends (`options-src`, `suggest-src`, the `suggest` function) and people typing. Every tag goes through the same normalization:

- **Values are text.** `value`, `label`, `group` and `description` are converted to strings, control characters are replaced by spaces, and they are cut to 200, 200, 100 and 300 characters. They are displayed with `textContent`, never as HTML, and submitted as text in the form value (JSON, CSV or lines).
- **Colors are validated** before being set as a CSS custom property: at most 60 characters, no `;`, `{`, `}`, `<`, `>` or `\`, no `url(`, `var(` or `expression`, and `CSS.supports('color', value)` must accept it. Anything else is dropped. A color therefore cannot load a resource or inject other declarations.
- **Links are checked** with the same [URL rules](#url-rules) as Markdown links (`isSafeUrl`): only relative URLs, `http:`, `https:`, `mailto:` and `tel:`. Links that are not in-page or root-relative get `rel="noopener noreferrer"`. Links are only rendered in view mode.
- **Part names are slugified.** `tag-<value>` and `tag-kind-<kind>` parts are built from slugs limited to `a-z`, `0-9` and `-` (40 characters), so data cannot create arbitrary part names or break the `part` attribute.
- **Counts** must be finite numbers; `disabled` must be `true`.
- **Size**: at most 100,000 entries per list; suggestions are cut to 50, and a `suggest-src` response is limited to 2,000,000 characters (or `maxSize` if lower). Invalid JSON gives an empty list.
- **`pattern`** is compiled from the page's attribute (not from data), limited to 500 characters; an invalid pattern is ignored.

`vt-tag-create` lets the page refuse a tag before it is added, but validation in the browser is never a substitute for validating the submitted value on the server.

## Loading content with `src`

- Only `http:` and `https:` URLs. Others show "URL blocked: only http(s) URLs can be loaded."
- **Same-origin by default.** Without `allow-remote`, a cross-origin URL is refused before any request. Same-origin requests use `mode: "same-origin"`, so a redirect to another origin fails too.
- **`allow-remote`** permits other origins. The request uses CORS mode, so the remote server must allow your origin. Credentials (cookies) are only sent to your own origin, and the referrer policy is `strict-origin-when-cross-origin`.
- **Size limit.** If the `Content-Length` header announces more than four times `maxSize`, the request is refused immediately. Otherwise the body is streamed and the download is aborted as soon as the text exceeds `maxSize` characters, so a huge response is never fully downloaded.
- **Timeout.** Requests are aborted after `fetchTimeout` (15 seconds by default) with "Request timed out."
- **Cancellation.** Changing `src` or removing the element aborts the pending request. Only the latest request can update the element.

Content loaded with `src` goes through the same rendering and sanitization as any other content.

The same rules (protocol, same-origin unless `allow-remote`, credentials, size limit, timeout, cancellation) apply to the other URLs that Vitrine fetches for an element:

| Attribute                      | Component   | Loads                                                            |
| ------------------------------ | ----------- | ---------------------------------------------------------------- |
| `original-src`, `modified-src` | `<vt-diff>` | The two texts to compare                                         |
| `options-src`                  | `<vt-tags>` | A JSON array of options                                          |
| `suggest-src`                  | `<vt-tags>` | Suggestions; `{query}` is replaced by the URL-encoded typed text |

Syntax theme files are fetched differently: only names from Vitrine's built-in list become a URL, under the configured `syntaxThemesUrl` (or the `syntax-themes/` folder next to the script), with `http:` or `https:` only and cookies sent to the same origin only. The files are generated at build time without `url()` values, and are applied as constructable stylesheets.

The files of `dist/vendor/` (`echarts.js` for `<vt-chart>`, `yaml.js` for `<vt-openapi>`) are code: they are imported with `import()` from the configured `vendorUrl` (or the `vendor/` folder next to the script), and only these two file names are ever requested. Like the language files, they run with the rights of your page, so serve them from an origin you trust.

## Size and complexity limits

| Limit                            | Default                                              | Setting                             |
| -------------------------------- | ---------------------------------------------------- | ----------------------------------- |
| Content length                   | 2,097,152 characters                                 | `maxSize` (ceiling 50 MiB)          |
| Syntax highlighting              | Skipped above 300,000 characters                     | `highlightLimit` (ceiling 5 MiB)    |
| JSON nesting depth               | 512                                                  | `maxDepth` (ceiling 10,000)         |
| `src` timeout                    | 15,000 ms                                            | `fetchTimeout` (ceiling 120,000 ms) |
| JSON tree rows per render        | 20,000                                               | none                                |
| Search matches                   | 5,000                                                | none                                |
| Search query                     | 200 characters                                       | none                                |
| CSV columns per row              | 1,000                                                | none                                |
| CSV cell preview                 | 1,000 characters                                     | none                                |
| Diff exact comparison            | 2,000 edits, then simplified                         | none                                |
| Tags per list                    | 100,000                                              | none                                |
| Terminal line length             | 20,000 characters                                    | none                                |
| Tree entries                     | 20,000 entries, 64 levels                            | none                                |
| HTTP headers per message         | 200                                                  | none                                |
| Log line length                  | 20,000 characters                                    | none                                |
| Log continuation lines           | 1,000 per entry                                      | none                                |
| Log fields                       | 50 per JSON line                                     | none                                |
| Log entries kept                 | 50,000                                               | `max-entries` (100 to 1,000,000)    |
| Chart data                       | 12 series of 5,000 points                            | none                                |
| OpenAPI endpoints                | 2,000                                                | none                                |
| OpenAPI schemas                  | 12 levels shown, examples built 8 levels deep        | none                                |
| OpenAPI properties and responses | 200 properties per object, 40 responses per endpoint | none                                |
| Editor undo history              | 300 steps, 20,000,000 characters                     | none                                |

The JSON parser and the JSON serializer are iterative, so deep nesting cannot overflow the call stack. If the Markdown parser fails on pathological input, the element shows an error instead of breaking the page. Configuration values cannot exceed the ceilings, even when set from page code.

## Trusted Types

When the browser supports Trusted Types, Vitrine creates a policy named **`vitrine`** the first time it sanitizes HTML. The policy is private to Vitrine's security module and only handed to DOMPurify, so its pass-through function is never reachable with unsanitized input from outside.

To enforce Trusted Types on your page, allow the policy name:

```text
require-trusted-types-for 'script'; trusted-types vitrine
```

If your policy list does not include `vitrine`, the policy cannot be created and Vitrine logs: `Could not create the "vitrine" Trusted Types policy. Add it to your CSP "trusted-types" directive.` If you already use other policies, list them all: `trusted-types vitrine my-app-policy`.

## Content Security Policy

Vitrine needs no `'unsafe-inline'`, no `'unsafe-eval'` and no inline styles: styles are applied with constructable stylesheets and the CSSOM, and nothing is evaluated. The end-to-end tests run every component under this policy, with Trusted Types enforced, and fail on any console error:

```text
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types vitrine
```

| Directive                            | Why                                                                                                                                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default-src 'self'`                 | Fallback for every resource type not listed.                                                                                                                                                                                        |
| `script-src 'self'`                  | The Vitrine script, the lazy-loaded language files and the files of `dist/vendor/`. They are ES modules loaded with `import()` from the `languages/` and `vendor/` folders, so `script-src` must allow the origin that serves them. |
| `style-src 'self'`                   | Only for your own stylesheets. Vitrine itself does not need any `style-src` source.                                                                                                                                                 |
| `img-src 'self' data:`               | Images in rendered Markdown. Adjust it to your image policy (below).                                                                                                                                                                |
| `connect-src 'self'`                 | Requests made for `src`, `original-src`, `modified-src`, `options-src`, `suggest-src`, and for syntax theme files. Add the origins you load with `allow-remote`, and the origin of `syntaxThemesUrl`.                               |
| `object-src 'none'`                  | No plugins. Vitrine does not use any.                                                                                                                                                                                               |
| `base-uri 'none'`                    | Prevents `<base>` injection from changing how relative URLs resolve.                                                                                                                                                                |
| `require-trusted-types-for 'script'` | Enforces Trusted Types for DOM injection sinks.                                                                                                                                                                                     |
| `trusted-types vitrine`              | Allows Vitrine's policy (see [Trusted Types](#trusted-types)).                                                                                                                                                                      |

### Adapting the policy

Loading Vitrine from jsDelivr, and loading Markdown from an API on another origin:

```text
default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data:; connect-src 'self' https://api.example.com; object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types vitrine
```

`img-src` depends on the `images` attribute of your `<vt-markdown>` elements:

| Image policy                                | `img-src` needed                                             |
| ------------------------------------------- | ------------------------------------------------------------ |
| `block`                                     | Nothing for Vitrine                                          |
| `same-origin`                               | `'self'`                                                     |
| `allow` with relative or same-origin images | `'self'`, plus `data:` if content may contain `data:` images |
| `allow` with external images                | The origins you accept (`https:` to allow any HTTPS image)   |

The CSP and the image policy work together: the image policy decides which images are kept in the document, and `img-src` decides which ones the browser may fetch.

If the language files are served from another origin than the page, add that origin to `script-src`. If they cannot load, code is shown without highlighting and a warning is logged. The same applies to the files of `dist/vendor/`: if `echarts.js` or `yaml.js` cannot load, `<vt-chart>` or `<vt-openapi>` shows a notice that says so ("The chart library could not be loaded", "The YAML reader could not be loaded").

Syntax themes are loaded with `fetch()`, so their origin must be allowed by `connect-src` (not `style-src`). With the files served from jsDelivr, add `https://cdn.jsdelivr.net` to `connect-src`. If a theme cannot load, the built-in colors are kept and a warning is logged.

## What Vitrine cannot protect against

- **Inline content written in your HTML.** Content written inside the element (element text, a `<template>`, a `<script type="text/plain">`) is parsed by the browser as part of your page before Vitrine runs. If it contains untrusted data, the damage is done before Vitrine sees it: a `</script>` closes a data script early, and markup in the element is parsed as page HTML. Always pass untrusted data through the `content` property, the `data` property or `src`. See [Getting started](getting-started.md#content-sources).
- **Executable scripts inside the element.** A child `<script>` without a data type runs like any script on your page.
- **Your own page code and styles.** Code on the page can change element attributes, properties and global configuration. Your CSS can change how parts look.
- **Where links go.** Markdown links may point to any `http:`, `https:`, `mailto:` or `tel:` URL. Vitrine marks external links `nofollow` and removes the opener and referrer, but it cannot judge the destination.
- **Images under the `allow` policy.** External images are fetched by the browser, which reveals the reader's IP address to the image host. Use `images="same-origin"` or `images="block"` for untrusted content.
- **Credentials in `<vt-http>`.** Masking hides values on screen and in what copy and download produce, but the real values are in the page source. Never publish real credentials; use example values.
- **Remote servers you allow.** With `allow-remote`, the content of the remote URL is still sanitized, but you rely on that server for what is displayed.

## How the test suite verifies it

- **XSS payload suite.** 72 payloads (OWASP filter evasion vectors, known mutation XSS vectors, Markdown-specific vectors) are rendered in eight modes: `<vt-markdown>` with and without `allow-html` and in split view, `<vt-code>` with HTML and Markdown highlighting, and `<vt-json>` in tree view, raw view and with invalid JSON. The suite runs on a page **without any CSP**, so a sanitizer failure would really execute, in Chromium, Firefox and WebKit. `alert`, `confirm`, `prompt` and `print` are replaced by traps, every shadow root is audited for dangerous elements, event handler attributes, inline styles and dangerous URLs, and the test fails if any payload ran.
- **Network side channels.** Tests check that blocked images are never requested, and that the content of `<vt-code>` and `<vt-json>` never triggers a request.
- **Attributes and API.** Labels and titles containing payloads are rendered as text, search queries are never interpreted as markup, and `Vitrine.render()` ignores event handler options.
- **Strict CSP.** The end-to-end tests of every component run under the strict policy above with enforced Trusted Types and fail on any console error. They also check `src` handling: cross-origin and non-HTTP URLs are refused, oversized responses are cut off, HTTP errors are reported, and only the latest `src` wins.
- **Unit tests** cover the URL rules, the sanitizer configuration, the image policy, the sanitizer self-test (including its fallback to text in a DOM implementation where DOMPurify fails silently), theme value validation, and the safe parsing of every attribute.
