# `<vt-dns>`

`<vt-dns>` shows DNS records as a table, from `dig` output, a zone file or DNS-over-HTTPS JSON, and explains the records that carry a policy (SPF, DMARC, DKIM, CAA, MX, SOA, SRV) term by term, with checks on the mail records.

```html
<vt-dns variant="full">
  <template>
example.com.        300  IN  TXT  "v=spf1 include:_spf.google.com ~all"
_dmarc.example.com. 300  IN  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@example.com"
example.com.        3600 IN  MX   10 mail.example.com.
  </template>
</vt-dns>
```

Nothing is resolved: the element reads only the text it is given.

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |

## Input

- **`dig` output**: the answer, authority and additional sections, and the header (question, status, server, query time, flags). A status other than `NOERROR` is marked.
- **Zone files**: `$ORIGIN`, `$TTL`, `@`, names relative to the origin, records that reuse the name above (a line starting with a space), TTLs with units (`1h`, `2w`), records continued in parentheses (SOA, DNSKEY) and `;` comments.
- **JSON** with `json` or `data`: DNS-over-HTTPS answers as Google and Cloudflare return them (`{ Answer, Authority, Additional }`, numeric types), or a list of `{ name, type, ttl, data }`.

## Explanations

| Record | Explained                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| SPF    | Each term with its result: `ip4`, `ip6`, `a`, `mx`, `include`, `exists`, `ptr`, `all`, `redirect`, `exp`; Pass, Fail, Soft fail or Neutral. |
| DMARC  | Each tag: `p`, `sp`, `np`, `pct`, `rua`, `ruf`, `adkim`, `aspf`, `fo`, `ri`, `rf`.                                                          |
| DKIM   | Each tag: `k`, `p` (shortened), `h`, `t`, `s`, `n`.                                                                                         |
| CAA    | Which authority may issue certificates (`issue`, `issuewild`), where refusals are reported (`iodef`), critical flag.                        |
| MX     | Preference and mail server; null MX (`0 .`) means the domain accepts no mail.                                                               |
| SOA    | Primary server, contact (as an e-mail address), serial, and each timer as a duration.                                                       |
| SRV    | Priority, weight, port and target.                                                                                                          |

TXT records are labelled SPF, DMARC, DKIM or Verification (site ownership tokens). TTLs are shown as durations, with the seconds in a tooltip. `explain="false"` shows the data only.

## Checks

| Finding                | Level   | Shown when                                                                                                |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| SPF `+all`             | Problem | Any server may send mail for the domain.                                                                  |
| Too many SPF lookups   | Problem | More than 10 terms that need a DNS lookup (`include`, `a`, `mx`, `ptr`, `exists`, `redirect`): SPF fails. |
| Several SPF records    | Problem | One name has more than one SPF record.                                                                    |
| DMARC without policy   | Problem | No `p=`.                                                                                                  |
| SPF `?all` or no `all` | Warning | Other senders are neither allowed nor refused.                                                            |
| SPF `ptr`              | Warning | Deprecated and slow.                                                                                      |
| DMARC `p=none`         | Warning | Reports only: spoofed mail is delivered.                                                                  |
| Short DKIM key         | Warning | An RSA key that looks shorter than 2048 bits.                                                             |
| DMARC `pct` under 100  | Note    | The policy applies to part of the mail only.                                                              |
| DMARC without `rua`    | Note    | No aggregate reports.                                                                                     |
| Revoked DKIM key       | Note    | Empty `p=`.                                                                                               |

Lookups are counted in the record itself; included records are not fetched. `checks="false"` hides the findings.

## Attributes

| Attribute | Values  | Default | Description                                             |
| --------- | ------- | ------- | ------------------------------------------------------- |
| `explain` | boolean | on      | Explain SPF, DMARC, DKIM, CAA, MX, SOA and SRV records. |
| `checks`  | boolean | on      | Findings about SPF, DMARC and DKIM.                     |
| `filters` | boolean | on      | A button per record type, with its count.               |

The shared attributes (`variant`, `theme`, `src`, `json`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

## Properties

| Property   | Type       | Description                                                   |
| ---------- | ---------- | ------------------------------------------------------------- |
| `content`  | `string`   | The records.                                                  |
| `records`  | `object[]` | Read-only: `{ name, ttl, class, type, data, section, line }`. |
| `findings` | `object[]` | Read-only: `{ id, level, name, params }`, most severe first.  |

## Events

| Event      | Detail               | When                                               |
| ---------- | -------------------- | -------------------------------------------------- |
| `vt-ready` | `{ type: "dns" }`    | The records are rendered.                          |
| `vt-copy`  | `{ text }`           | The records are copied (tab-separated zone lines). |
| `vt-error` | `{ message, cause }` | Loading failed or content too large.               |

## CSS parts

| Part          | Element                                |
| ------------- | -------------------------------------- |
| `query`       | The dig header.                        |
| `findings`    | The list of findings.                  |
| `filters`     | The type buttons.                      |
| `records`     | The records table.                     |
| `type`        | The type of a record.                  |
| `explanation` | The explanation under a record's data. |

## Accessibility

Filters are toggle buttons in a labelled group. Findings have their level in words with an icon. The records table has column and row headers; explanations are definition lists.

## Security

Every name and value is inserted as text; nothing is resolved or fetched, and `include:` targets are not followed. At most 10,000 records are read. JSON values cannot add lines: line breaks become spaces.
