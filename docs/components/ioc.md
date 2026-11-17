# `<vt-ioc>`

`<vt-ioc>` finds the indicators of compromise in a text (a threat report, an e-mail, a log, a chat message) and shows them defanged, grouped by type, with filters, ready to copy as a list, CSV, a STIX 2.1 bundle or a MISP event.

```html
<vt-ioc variant="full">
  <template>
    Phishing from hxxps://login-secure[.]example[.]com/auth. C2 at 45.33.32[.]156.
    Payload e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855, exploits CVE-2024-3400 (T1566.001).
  </template>
</vt-ioc>
```

Indicators are **only text**. Nothing is resolved, fetched or turned into a link. See [Security](#security).

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |

The type filters are shown in both variants; `filters="false"` hides them.

## Indicators

| Type                              | Found                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `url`                             | `http://`, `https://` and `ftp://` URLs. Punctuation that ends a sentence is left out.                                                   |
| `domain`                          | Domain names ending with a country code or a common generic ending (`.com`, `.xyz`, `.onion`…), or an internationalized ending (`xn--`). |
| `ipv4`                            | IPv4 addresses, with an optional `/prefix`. Each number is checked (at most 255).                                                        |
| `ipv6`                            | IPv6 addresses (full or with `::`). Times (`12:30:45`) and MAC addresses are not read as addresses.                                      |
| `email`                           | E-mail addresses.                                                                                                                        |
| `md5`, `sha1`, `sha256`, `sha512` | Hexadecimal hashes of 32, 40, 64 and 128 digits.                                                                                         |
| `cve`                             | CVE identifiers (`CVE-2024-3400`).                                                                                                       |
| `attack`                          | MITRE ATT&CK techniques and sub-techniques (`T1566`, `T1566.001`).                                                                       |

Each indicator is shown once, with the number of times it appears and the line where it is first seen. A domain inside a URL or an e-mail address is not listed again on its own.

**Defanged text is read.** `hxxp`, `hxxps`, `fxp`, `[.]`, `(.)`, `{.}`, `[dot]`, `(dot)`, `[:]`, `[://]`, `[@]`, `[at]` and `(at)` are turned back before the search, so a report written for humans gives the same indicators.

**Not everything that looks like a domain is one.** Names whose ending is a common file extension are left out (`readme.md`, `app.js`, `setup.py`, `run.sh`…), and so are code paths such as `window.location`. A real domain with such an ending (a `.md` or `.sh` site) is missed: add it by hand to your list.

**Special addresses are marked**: private (RFC 1918, `fc00::/7`), loopback, link-local, shared (CGNAT, `100.64.0.0/10`), multicast and reserved or documentation ranges. `private="false"` leaves them out.

## Defanging

Indicators are shown and copied defanged by default: `https://evil.example/a` becomes `hxxps[://]evil[.]example/a`, `1.2.3.4` becomes `1[.]2[.]3[.]4`, `a@b.org` becomes `a[@]b[.]org` and IPv6 colons become `[:]`. Hashes, CVE and ATT&CK identifiers are left as they are. The eye button, or `defang="false"`, shows them as found.

STIX and MISP exports always contain the real values, since their patterns must match.

## Exports

| Button    | Output                                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Copy list | One indicator per line, defanged or not.                                                                                                                                                                           |
| CSV       | `type,value,count,line,note`. Cells a spreadsheet would run as a formula are quoted and start with `'`.                                                                                                            |
| STIX      | A STIX 2.1 bundle: an `indicator` with a pattern per observable, a `vulnerability` per CVE and an `attack-pattern` per technique. The `label` becomes the description.                                             |
| MISP      | A MISP event (`{ "Event": { "info", "Attribute" } }`) to import: `url`, `domain`, `ip-dst`, `email-src`, hashes, `vulnerability`. Special addresses get `to_ids: false` and a comment. The `label` becomes `info`. |

When a type filter is on, the exports contain that type only. `export(format)` returns the same text from script.

## Attributes

| Attribute | Values                | Default | Description                                                                              |
| --------- | --------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `types`   | comma-separated types | all     | Types to keep: `url, domain, ipv4, ipv6, email, md5, sha1, sha256, sha512, cve, attack`. |
| `defang`  | boolean               | on      | Show and copy indicators defanged.                                                       |
| `private` | boolean               | on      | Keep private, loopback and other special addresses (marked).                             |
| `filters` | boolean               | on      | A button per type, with its count, to show one type.                                     |

The shared attributes (`variant`, `theme`, `src`, `json`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

## JSON

`json` or `data` accept a text, `{ text }`, or a list of indicators: strings, or objects with `value` (MISP attributes) or `indicator`, under `indicators`, `iocs`, `Attribute` or `attributes`.

## Properties and methods

| Property / method | Type       | Description                                                                   |
| ----------------- | ---------- | ----------------------------------------------------------------------------- |
| `content`         | `string`   | The text to read.                                                             |
| `indicators`      | `object[]` | Read-only: `{ type, value, count, line, note }`, after `types` and `private`. |
| `export(format)`  | `string`   | `"text"`, `"csv"`, `"stix"` or `"misp"`.                                      |

## Events

| Event      | Detail               | When                                 |
| ---------- | -------------------- | ------------------------------------ |
| `vt-ready` | `{ type: "ioc" }`    | The indicators are rendered.         |
| `vt-copy`  | `{ text }`           | The list or an export is copied.     |
| `vt-error` | `{ message, cause }` | Loading failed or content too large. |

## CSS parts

| Part        | Element                        |
| ----------- | ------------------------------ |
| `filters`   | The type buttons.              |
| `group`     | The section of one type.       |
| `table`     | The table of one type.         |
| `indicator` | An indicator value.            |
| `note`      | The note of a special address. |

`--vt-ioc-group-height` sets the height after which a type's table scrolls (default `360px`).

## Editing

In edit mode, an editor holds the text, and the indicators under it are updated 250 ms after typing stops: paste a report there to extract its indicators.

## Accessibility

Filters are toggle buttons (`aria-pressed`) in a labelled group, with the count as text. Each type is a section with a heading and a table with column headers. Notes on special addresses are words, not colors.

## Security

- **Nothing is resolved, fetched or linked.** URLs and domains are never `<a>` elements and never requested: opening a phishing link by mistake is not possible from the list.
- **Defanged by default**, so a list pasted into a chat, a ticket or an e-mail does not become clickable.
- Every value is inserted as text. The text is read up to `maxSize`, lines up to 20,000 characters, and at most 10,000 different indicators are kept (a notice says so). The patterns are linear, without nested repetition, so hostile text cannot make the search slow.
- CSV cells starting with `=`, `+`, `-`, `@`, a tab or a carriage return are prefixed, so a spreadsheet does not run them.
