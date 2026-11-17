# `<vt-email>`

`<vt-email>` analyzes a raw e-mail message (`.eml`) for phishing: who it claims to come from and who sent it, the SPF, DKIM and DMARC results, the servers it went through, its text, links and attachments, and the signs of a spoofed or malicious message.

```html
<vt-email variant="full" src="suspicious.eml"></vt-email>
```

The message is **only read**. Its HTML is reduced to text without being parsed into a DOM, links are shown defanged and never opened, images are never loaded and attachments are never opened. See [Security](#security).

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |
| `tabs`       | on                 | on     |

## Input

A raw message as saved by a mail client ("Save as" / "Show original" / "Download message"): headers, a blank line, then the body. MIME is read: `multipart/*` parts (nested up to 10 levels, at most 200 parts), `base64` and `quoted-printable` encodings, charsets, RFC 2047 encoded words in headers (`=?UTF-8?B?…?=`) and RFC 2231 file names.

## Tabs

| Tab         | Content                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Summary     | From, Reply-To, To, Cc, Subject, Date, Return-Path and Message-ID; the authentication results as badges (SPF, DKIM, DMARC, ARC…); the findings.                                                         |
| Path        | The `Received` headers, oldest first: the server each hop came from, its IP address, the server that received it, the protocol, the time and the delay since the hop before (over 5 minutes is marked). |
| Body        | The text part, or the HTML part as text.                                                                                                                                                                |
| Links       | Each link with its text and the address it opens; links whose text shows another site than the one they open are marked "Deceptive".                                                                    |
| Attachments | Name, type, size and SHA-256 (computed in the browser). Files that can run code are marked "Risky".                                                                                                     |
| Headers     | Every header, decoded.                                                                                                                                                                                  |

`view` chooses the tab shown first; `tabs="false"` hides the tabs.

## Findings

| Finding               | Level   | Shown when                                                                                                                       |
| --------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Authentication fails  | Problem | SPF, DKIM or DMARC is `fail` or `permerror` in `Authentication-Results`.                                                         |
| Display name spoof    | Problem | The sender name contains an e-mail address other than the real sender (`"service@paypal.com" <x@evil.xyz>`).                     |
| Deceptive links       | Problem | A link's text shows a site (a URL or a domain) whose domain differs from the one it opens.                                       |
| Risky attachment      | Problem | An attachment ends with an extension that runs or hides code (`.exe`, `.js`, `.vbs`, `.hta`, `.lnk`, `.iso`, `.html`, `.docm`…). |
| Double extension      | Problem | An attachment hides its type behind a document extension (`invoice.pdf.exe`).                                                    |
| Weak authentication   | Warning | SPF, DKIM or DMARC is `softfail`, `none`, `neutral` or `temperror`.                                                              |
| Reply-To elsewhere    | Warning | Replies go to another domain than the sender.                                                                                    |
| Return-Path elsewhere | Note    | Bounces go to another domain (common with mailing services).                                                                     |
| No authentication     | Note    | The message has no `Authentication-Results` header.                                                                              |
| Remote images         | Note    | The HTML loads images from the web, which tells the sender the message was opened.                                               |

Domains are compared by their registrable part (`mail.example.co.uk` and `example.co.uk` are the same), with common second-level endings handled.

## Attributes

| Attribute | Values                                                       | Default   | Description                         |
| --------- | ------------------------------------------------------------ | --------- | ----------------------------------- |
| `view`    | `summary`, `path`, `body`, `links`, `attachments`, `headers` | `summary` | Tab shown first.                    |
| `defang`  | boolean                                                      | on        | Show links and addresses defanged.  |
| `hashes`  | boolean                                                      | on        | Compute the SHA-256 of attachments. |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

## Properties

| Property   | Type             | Description                                                                                                                                                                  |
| ---------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`  | `string`         | The raw message.                                                                                                                                                             |
| `message`  | `object \| null` | Read-only: `{ headers, from, to, cc, replyTo, returnPath, subject, date, messageId, hops, auth, text, fromHtml, links, remoteImages, attachments }`, `null` without headers. |
| `findings` | `object[]`       | Read-only: `{ id, level, params }`, most severe first.                                                                                                                       |

## Events

| Event           | Detail               | When                                 |
| --------------- | -------------------- | ------------------------------------ |
| `vt-ready`      | `{ type: "email" }`  | The message is rendered.             |
| `vt-tab-change` | `{ tab }`            | Another tab is chosen.               |
| `vt-copy`       | `{ text }`           | The headers are copied.              |
| `vt-error`      | `{ message, cause }` | Loading failed or content too large. |

## CSS parts

| Part          | Element                     |
| ------------- | --------------------------- |
| `summary`     | The summary fields.         |
| `auth`        | The authentication results. |
| `findings`    | The list of findings.       |
| `hops`        | The Received path table.    |
| `text`        | The body text.              |
| `links`       | The links table.            |
| `attachments` | The attachments table.      |
| `headers`     | The headers table.          |

`--vt-email-table-height` and `--vt-email-text-height` set the height after which tables and the text scroll (default `480px`).

## Accessibility

Tabs follow the WAI-ARIA tabs pattern (arrow keys, Home, End). Findings, authentication results and marks ("Deceptive", "Risky") are words with an icon, never color alone. Tables have column headers.

## Security

- **Nothing in the message is rendered or loaded.** The HTML part is turned into text by removing tags, without `innerHTML` or `DOMParser`, so it works under Trusted Types and a strict CSP, and no image, style or script of the message can load or run. Links are never `<a>` elements.
- **Defanged by default**: addresses and URLs cannot be clicked or resolved by accident.
- Attachments are decoded in memory to give their size and SHA-256; they are never opened or offered for download.
- Limits: 1,000 headers, 200 MIME parts, 10 levels, 1,000 links; text up to `maxSize`. The HTML reader works in one pass, so an unclosed `<script>` or comment cannot make it slow.
- A spoofing check is a hint, not a verdict: authentication results are those written by the receiving server, and anyone can write them into a message they forge. Trust only the headers added by your own server.
