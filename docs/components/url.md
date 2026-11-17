# `<vt-url>`

`<vt-url>` takes URLs apart and checks them: scheme, credentials, host with punycode decoded and look-alike letters found, registered domain, port, path, decoded parameters and fragment, and the URLs hidden in parameters. Each finding says, in words, what phishing links use: a host written before `@`, disguised IP addresses, homographs, deceptive subdomains, shorteners, shared hosting, executable downloads, e-mail addresses carried in the link.

```html
<vt-url variant="full">https://www.paypal.com@evil.example/login</vt-url>
```

The element only reads the text: nothing is opened, fetched or resolved, and URLs are never links. They are shown defanged by default (`hxxps[://]evil[.]example`).

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |

## Input

One URL per line; blank lines and lines starting with `# ` are ignored, and at most 200 URLs are read. Defanged URLs (`hxxp`, `[.]`, `[:]`, `[@]`) are read as the real ones, a URL without a scheme (`example.com/a`) is read as `http://`, and `//host` as `https://`.

With `chain`, the lines are the steps of a redirect chain, in order: a summary gives the number of steps and the domains crossed, and says when a step goes from HTTPS to HTTP.

From JSON (`data`, `json`, `json-src`): a URL, a list of URLs (strings, or objects with `url`, `href`, `uri` or `value`), `{ url }`, `{ urls }`, or a redirect list such as Lookyloo's `{ "response": { "redirects": [...] } }`.

## What each URL shows

- **The verdict**: Dangerous (a finding of the danger level), Suspicious (a warning) or No finding.
- **The URL**, each part in its own color: scheme, credentials (struck through), subdomain (muted), the registered domain in bold, port, path, query and fragment. The host is shown as a reader sees it, in Unicode.
- **The findings**, most severe first.
- **The parts**: scheme, user, password (its length only), host in Unicode and as sent (punycode), registered domain, subdomain, public suffix, port, decoded path and fragment; then the parameters with their decoded values, tracking parameters marked. `parts="false"` hides them.
- **The URLs hidden in it**, each taken apart and checked the same way, up to three levels deep: in a parameter (`?url=`, `?q=`, `?next=`…), in the fragment (`#/route?to=`), encoded twice, in base64 or in Proofpoint URL Defense's encoding.

The registered domain uses the common public suffixes (`co.uk`, `com.au`, `github.io`…), not the whole Public Suffix List: a rare suffix is treated as a domain.

## Findings

| Level   | Finding                                                                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Danger  | `javascript:`, `vbscript:`, `file:` and `blob:` URLs; `data:` URLs (with their type)                                                    |
| Danger  | A domain written before `@` (`https://www.bank.example@evil.example/`): the browser opens the host after it                             |
| Danger  | A disguised IP address (`http://3232235777/`, `0x7f.1`, `0177.0.0.1`), with the address browsers open                                   |
| Danger  | Letters of other alphabets that imitate Latin ones (`аррӏе.com`, with the domain it looks like), or a label that mixes alphabets        |
| Danger  | A subdomain that imitates another site (`paypal.com.secure-login.xyz`), with the real registered domain                                 |
| Danger  | Invisible characters: zero-width spaces, right-to-left overrides, soft hyphens                                                          |
| Warning | Not encrypted (`http:`, `ws:`); credentials in the URL; an IP address as host; a percent-encoded host; an internationalized domain name |
| Warning | Four levels of subdomains or more; a link shortener; backslashes; double percent-encoding (`%25…`); spaces or line breaks               |
| Warning | A file that installs or runs something (`.exe`, `.msi`, `.apk`, `.js`, `.hta`, `.iso`, `.lnk`, macro documents…)                        |
| Warning | An e-mail address in a parameter or the fragment, plain or in base64, as phishing kits use to fill in the victim's address              |
| Warning | A URL hidden in a parameter that leads to another domain (Info when it stays on the same domain)                                        |
| Info    | A site on shared hosting where anyone can publish (`github.io`, `pages.dev`, `web.app`, `ngrok`, `duckdns.org`…)                        |
| Info    | Tracking parameters (`utm_*`, `fbclid`, `gclid`, `msclkid`…); a non-standard port; a private or reserved address; many hyphens; FTP     |
| Info    | The URL was defanged, had no scheme, or was longer than 16,384 characters                                                               |

Findings are hints for review: a site on shared hosting, or a link with tracking parameters, is often fine.

## Attributes

| Attribute | Values  | Default | Description                                 |
| --------- | ------- | ------- | ------------------------------------------- |
| `defang`  | boolean | on      | Show URLs, hosts and domains defanged.      |
| `parts`   | boolean | on      | The table of parts and parameters.          |
| `chain`   | boolean | off     | The URLs are the steps of a redirect chain. |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

## Copy

| Button           | Output                                                            |
| ---------------- | ----------------------------------------------------------------- |
| Defanged         | The URLs defanged, one per line.                                  |
| Without tracking | The URLs without their tracking parameters (when they have some). |
| Copy the URL     | The URLs as a browser reads them, one per line.                   |

## Properties

| Property   | Type       | Description                                                                                                                                                                                                                                                        |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `content`  | `string`   | One URL per line.                                                                                                                                                                                                                                                  |
| `analyses` | `object[]` | Read-only: for each URL `{ ok, input, parts, findings, verdict, nested }`; `parts` is `{ scheme, username, password, host, hostUnicode, domain, subdomain, suffix, hostType, port, path, segments, query, fragment, href }`; each finding `{ id, level, params }`. |

## Events

| Event      | Detail               | When                                 |
| ---------- | -------------------- | ------------------------------------ |
| `vt-ready` | `{ type: "url" }`    | The URLs are rendered.               |
| `vt-copy`  | `{ text }`           | URLs are copied.                     |
| `vt-error` | `{ message, cause }` | Loading failed or content too large. |

## CSS parts

| Part       | Element                          |
| ---------- | -------------------------------- |
| `url`      | The card of a URL.               |
| `verdict`  | The verdict of a URL.            |
| `line`     | The URL with its parts colored.  |
| `findings` | The list of findings.            |
| `parts`    | The table of parts.              |
| `params`   | The table of parameters.         |
| `nested`   | A URL hidden in another one.     |
| `chain`    | The summary of a redirect chain. |

## Accessibility

Each URL is a labelled section. Verdicts and finding levels are words, with an icon; colors only repeat them. The parts and parameters are tables with row and column headers.

## Security

Every value is inserted as text and URLs are never `<a>` elements. Nothing is fetched or resolved: the host is read by the browser's URL parser, punycode is decoded in JavaScript. At most 200 URLs, 16,384 characters each, 500 parameters per URL and five hidden URLs per URL, three levels deep.
