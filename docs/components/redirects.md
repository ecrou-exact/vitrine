# `<vt-redirects>`

`<vt-redirects>` shows a chain of redirects hop by hop: the status and URL of each hop, how it sends to the next one, and what changes on the way.

```html
<vt-redirects variant="full">
  <template>
    301 http://example.com/
    302 https://example.com/
    200 https://www.example.com/home
  </template>
</vt-redirects>
```

The element only reads the chain: nothing is fetched, and URLs are text, never links.

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |

## Input

| Format | Read                                                                                                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HAR    | The chain starts at the first entry (or at `start`, an exact URL or part of one) and follows each 3xx response, through `redirectURL` or `Location`, to the entry with that URL. When the next request was not captured, it is shown without a status. Server IPs and times are kept. |
| curl   | `curl -sIL`, `curl -sLD -` or `curl -v` output: one hop per `HTTP/…` status line, the next URL from `Location`. The first URL comes from a `curl …` line, the `Host` of `curl -v`, or `start`. `100 Continue` and proxy `Connection established` lines are skipped.                   |
| JSON   | An array of URLs or of hops, or `{ "hops" \| "chain" \| "redirects": [...] }`. A hop is `{ url, status, type, location, ip, time }`; `type` `meta` or `js` marks a client-side redirect (meta refresh, JavaScript). A `location` on the last hop adds where it goes.                  |
| List   | One hop per line, `301 https://a.example/` or `https://a.example/ 301`, or URLs joined with `->`, `=>` or `→`. `(meta)` or `(js)` after a URL marks a client-side redirect.                                                                                                           |

The format is found from the text.

## Steps

Between two hops, the kind of redirect is written: permanent (301, 308), temporary (302, 303, 307), meta refresh, JavaScript, or redirect. Changes are marked:

| Mark           | When                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTPS → HTTP   | The next URL leaves HTTPS (an error: what follows can be read and changed on the way).                                                                  |
| HTTP → HTTPS   | The next URL moves to HTTPS.                                                                                                                            |
| other site     | Another registrable domain (`example.com` to `example.net`), found as in [`<vt-cookies>`](cookies.md#site-and-parties).                                 |
| other host     | Another host of the same site (`example.com` to `www.example.com`).                                                                                     |
| Adds …         | Query parameters added; tracking ones (`utm_*`, `gclid`, `fbclid`, `msclkid`, `mc_eid`, `_hsenc`…) are named as such. `params="false"` hides this mark. |
| back to a URL… | A URL already visited: the chain loops.                                                                                                                 |

## Chain checks

| Level   | Check                                                                            |
| ------- | -------------------------------------------------------------------------------- |
| Error   | A loop; a redirect from HTTPS to HTTP.                                           |
| Warning | More than 10 redirects (browsers stop after 20); a last hop in error (4xx, 5xx). |
| Note    | A last page that was not captured; a chain through more than 2 sites.            |

The summary gives the number of redirects, of sites, the total time when every hop has one, and the final URL.

## Attributes

| Attribute | Values  | Default | Description                                                                                   |
| --------- | ------- | ------- | --------------------------------------------------------------------------------------------- |
| `start`   | URL     | —       | The first URL: for curl output without the command, or to start a HAR chain at another entry. |
| `params`  | boolean | on      | Query parameters added at each step.                                                          |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

## Copy

| Button             | Output                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| Chain              | One hop per line: its status (`meta`, `js` or `---` without one) and its URL. |
| Copy the final URL | The URL of the last hop.                                                      |

## Properties

| Property  | Type       | Description                                                          |
| --------- | ---------- | -------------------------------------------------------------------- |
| `content` | `string`   | The chain.                                                           |
| `hops`    | `object[]` | Read-only: `{ url, status, kind, ip, time }` for each hop, in order. |

## Events

| Event      | Detail                  | When                                  |
| ---------- | ----------------------- | ------------------------------------- |
| `vt-ready` | `{ type: "redirects" }` | The chain is rendered.                |
| `vt-copy`  | `{ text }`              | The chain or the final URL is copied. |
| `vt-error` | `{ message, cause }`    | Loading failed or content too large.  |

## CSS parts

| Part      | Element                                          |
| --------- | ------------------------------------------------ |
| `summary` | The summary.                                     |
| `issues`  | The list of chain issues.                        |
| `chain`   | The ordered list of hops.                        |
| `hop`     | A hop.                                           |
| `status`  | A status badge; also `status-2xx`, `status-3xx`… |
| `url`     | A URL.                                           |
| `step`    | What happens between two hops.                   |
| `change`  | A change marked on a step.                       |

## Accessibility

The hops are an ordered list, labelled "Redirect chain". Statuses, kinds of redirect and changes are words; colors only repeat them, and the levels of chain issues have an icon.

## Security

URLs are inserted as text and are never links, so a hostile chain cannot be opened by a click. Nothing is fetched. A HAR chain visits each entry once at most; at most 200 hops are read, and a URL is cut at 8,192 characters.
