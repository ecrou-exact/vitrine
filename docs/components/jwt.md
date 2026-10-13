# `<vt-jwt>`

`<vt-jwt>` decodes a JSON Web Token and shows it colored by part, its validity, warnings about risky values, the decoded header and payload as trees, and a table that explains each claim in words.

```html
<vt-jwt variant="full">
  <template>
    eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiIsImV4cCI6MTc5MDAwMDAwMH0.c2lnbmF0dXJl
  </template>
</vt-jwt>
```

The token is **only decoded**. The signature is never verified, the token is never sent anywhere, and nothing it names is ever fetched. See [Security](#security).

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |

The claims table and the warnings are shown in both variants; `claims="false"` and `warnings="false"` hide them.

## Formats

- **Signed tokens (JWS)**: three base64url parts, `header.payload.signature`. The header and payload are decoded as UTF-8 and shown as JSON trees, like [`<vt-json>`](json.md). A payload that is text but not JSON is shown as text.
- **Unsecured tokens**: `alg` is `none` and the signature is empty. They are shown, with a warning.
- **Encrypted tokens (JWE)**: five parts. Only the header can be read without the key; the five parts are colored and the header is shown.

Spaces and line breaks inside the token are ignored, and a leading `Bearer ` is removed, so a token can be pasted from an `Authorization` header or wrapped over several lines. Text that is not a token gets a notice that says why (number of parts, header or payload not base64url).

## Validity

The header badge and the status line tell whether the token is valid, from `exp` and `nbf`:

| State         | When                    | Example                     |
| ------------- | ----------------------- | --------------------------- |
| Valid         | Between `nbf` and `exp` | "Valid, expires in 3 hours" |
| Expired       | After `exp`             | "Expired 2 days ago"        |
| Not valid yet | Before `nbf`            | "Not valid before tomorrow" |
| No expiry     | Neither `exp` nor `nbf` | "No expiry"                 |

Times are relative to now. Set `now` (an ISO 8601 date or seconds since 1970) to show a token as it was, or will be, at a fixed time; documentation and tests stay the same from one day to the next.

## Claims

The Claims table lists every claim of the payload: registered claims first (`iss`, `sub`, `aud`, `exp`, `nbf`, `iat`, `jti`), then common ones (`azp`, `scope`, `scp`, `roles`, `name`, `email`, `email_verified`, `preferred_username`, `nonce`, `auth_time`, `sid`, `tid`, `acr`, `amr`), then the others, marked "Custom claim". Dates (`exp`, `nbf`, `iat`, `auth_time`) are written in the page language with a relative time. Lists of strings are joined with commas.

## Warnings

| Warning                    | Shown when                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Not signed                 | `alg` is `none` or missing on a signed token.                                           |
| Shared secret              | `alg` is `HS256`, `HS384` or `HS512`: whoever can verify the token can also create one. |
| Key location in the header | `jku` or `x5u` is set, or `kid` looks like a URL or a path.                             |
| No expiry                  | The payload has no `exp`.                                                               |
| Long lifetime              | `exp` is more than 30 days after `nbf` (or `iat`).                                      |
| Payload not JSON           | The payload decodes to text that is not JSON.                                           |
| Encrypted                  | The token is a JWE: only its header can be read.                                        |

## Signature

`mask-signature` replaces the signature with dots until the eye button is pressed. Copying the token always copies it in full.

## Editing

In edit mode, an editor holds the token, and the decoded view under it is updated 200 ms after typing stops. Paste a token there to read it.

## Attributes

| Attribute        | Values                    | Default      | Description                                           |
| ---------------- | ------------------------- | ------------ | ----------------------------------------------------- |
| `now`            | ISO 8601 date, or seconds | current time | Time used to tell whether the token is valid.         |
| `mask-signature` | boolean                   | off          | Hide the signature until revealed.                    |
| `claims`         | boolean                   | on           | Claims table.                                         |
| `warnings`       | boolean                   | on           | Warnings about risky values.                          |
| `depth`          | integer                   | `2`          | Levels open at first in the header and payload trees. |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

## Properties and methods

| Property  | Type             | Description                                                                                                                                                |
| --------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content` | `string`         | The token.                                                                                                                                                 |
| `token`   | `object \| null` | Read-only: `{ kind, compact, parts, header, payload, signature }`, `null` when the text is not a token. `header` and `payload` are `{ raw, text, value }`. |

## Events

| Event      | Detail               | When                                    |
| ---------- | -------------------- | --------------------------------------- |
| `vt-ready` | `{ type: "jwt" }`    | The token is rendered.                  |
| `vt-copy`  | `{ text }`           | The token, header or payload is copied. |
| `vt-error` | `{ message, cause }` | Loading failed or content too large.    |

## CSS parts

| Part              | Element                               |
| ----------------- | ------------------------------------- |
| `token`           | The token, colored by part.           |
| `token-header`    | The header part of the token.         |
| `token-payload`   | The payload part of the token.        |
| `token-signature` | The signature (or JWE tag) part.      |
| `status`          | The validity.                         |
| `section`         | A section: header, payload or claims. |
| `claims`          | The claims table.                     |
| `warning`         | A warning.                            |

The parts are colored with the syntax tokens of the theme: `--vt-syntax-keyword` for the header, `--vt-syntax-function` for the payload and `--vt-syntax-string` for the signature.

## Accessibility

Validity is written in words, with an icon, never shown by color alone. Warnings are text notices. The claims table has column and row headers, and dates are `<time>` elements with their ISO value. The header and payload trees have the keyboard support of `<vt-json>`.

## Security

- **Nothing is verified.** A decoded token tells what it claims, not that it is true: anyone can write a token with any claims. Verify signatures on your server, with the expected key and algorithm.
- **Nothing is sent or fetched.** The token stays in the page. `jku`, `x5u` and `kid` are shown as text, never followed.
- **Tokens are credentials.** Showing a real token on a page shows it to everyone who can read the page. Use `mask-signature`, and prefer expired or example tokens in documentation.
- Every value is inserted as text. Tokens are read up to 64 KB, and JSON nesting is limited by `maxDepth`, like `<vt-json>`.
