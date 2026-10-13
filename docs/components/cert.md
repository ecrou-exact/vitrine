# `<vt-cert>`

`<vt-cert>` displays X.509 certificates, certificate chains and certificate requests (CSR): subject and issuer, validity, public key, signature algorithm, extensions and fingerprints, with the raw ASN.1 structure one tab away.

```html
<vt-cert variant="full" src="/certs/chain.pem"></vt-cert>
```

Every name and value is inserted as text. Nothing is verified and nothing is fetched: see [Security](#security).

## Variants

| Feature                         | `simple` (default) | `full` |
| ------------------------------- | ------------------ | ------ |
| `header`                        | off                | on     |
| `dot`                           | off                | on     |
| `copy` (Copy PEM)               | off                | on     |
| `search`                        | off                | on     |
| `download` (`.pem`)             | off                | on     |
| `fullscreen`                    | off                | on     |
| `tabs` (Details / ASN.1)        | off                | on     |
| `fingerprints` (SHA-256, SHA-1) | on                 | on     |
| `extensions`                    | on                 | on     |

Every feature can be turned on or off individually, whatever the variant.

## Input

The content (inline, `content` or `src`) can be:

- **PEM**: one or several `CERTIFICATE`, `TRUSTED CERTIFICATE` or `CERTIFICATE REQUEST` blocks. Several certificates are shown as a chain, in the order written.
- **Base64 DER**: the body of a PEM block without its `BEGIN` and `END` lines.
- **Hex DER**: hex digits, with or without spaces or colons.

```html
<vt-cert variant="full" label="shop.example.com">
  <template>
    -----BEGIN CERTIFICATE-----
    MIIEOjCCA+CgAwIBAgIGChssPU5fMAoGCCqGSM49BAMCMEcxCzAJBgNVBAYTAkxV
    …
    -----END CERTIFICATE-----
  </template>
</vt-cert>
```

Other PEM blocks (public keys, CRLs) are ignored with a notice. **Private keys are never shown**: a `PRIVATE KEY` block is skipped and a notice says one was found.

## What is shown

Each certificate is a card with:

- **Subject** and **Issuer**, as distinguished names, with the common name (`CN`) highlighted. When the issuer is another certificate of the list (by key identifier, else by name), a link goes to its card; a self-signed certificate is marked.
- **Validity**: the two dates in UTC, and a status in words — valid with the days left, expiring within 30 days, expired, or not yet valid — also shown by the color of the card. `now` sets the date used, for pages that must not change over time.
- **Serial number**, **version**, **public key** (RSA size, EC curve, Ed25519…) and **signature algorithm**.
- **Fingerprints** SHA-256 and SHA-1, each with a copy button. They are computed with the Web Crypto API, which browsers only offer on secure origins (HTTPS or `localhost`); elsewhere they are marked as unavailable.
- **Extensions**: subject alternative names (DNS, IP, email, URI), key usage, extended key usage, basic constraints, key identifiers, CRL distribution points, authority information access (OCSP, CA issuers) and certificate policies, with critical extensions marked. Other extensions show their OID and value in hex.

Warnings appear on cards signed with MD5 or SHA-1, or with an RSA key under 2048 bits.

A certificate request shows its subject, key, signature algorithm and requested extensions.

The **ASN.1** tab shows the structure of each certificate as nested disclosures: tag, length and value (object identifiers with their name, strings, times and hex).

## Search

The search finds text in the cards (names, serials, extensions, fingerprints) or in the ASN.1 tree, and focus stays in the search field.

## Editing

In edit mode, an editor holds the PEM text, and the cards under it are updated 400 ms after typing stops.

## Attributes

In addition to the [shared attributes](../common-attributes.md):

| Attribute      | Values                   | Default      | Description                        |
| -------------- | ------------------------ | ------------ | ---------------------------------- |
| `now`          | ISO 8601 date            | current time | Date used for the validity status. |
| `tabs`         | boolean                  | preset       | Details / ASN.1 tabs.              |
| `view`         | `details` or `structure` | `details`    | Initial view.                      |
| `fingerprints` | boolean                  | on           | SHA-256 and SHA-1 fingerprints.    |
| `extensions`   | boolean                  | on           | Extensions of each certificate.    |

## Properties

| Member         | Description                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`      | The PEM, base64 or hex text.                                                                                                                                                    |
| `certificates` | Certificates read, as plain objects: `{ kind, version, serial, subject, issuer, notBefore, notAfter, publicKey, signatureAlgorithm, selfSigned, weaknesses, extensions, pem }`. |

## Events

| Event           | `detail`             | When                                    |
| --------------- | -------------------- | --------------------------------------- |
| `vt-ready`      | `{ type: "cert" }`   | The certificates were rendered          |
| `vt-tab-change` | `{ tab }`            | Details / ASN.1 changed                 |
| `vt-search`     | `{ query, matches }` | A search ran                            |
| `vt-copy`       | `{ text }`           | The PEM or a fingerprint was copied     |
| `vt-error`      | `{ message, cause }` | Loading failed or the text is too large |

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part          | Element                   |
| ------------- | ------------------------- |
| `certificate` | The card of a certificate |
| `status`      | The validity status       |
| `name`        | A distinguished name      |
| `extension`   | An extension              |
| `fingerprint` | A fingerprint             |
| `structure`   | The ASN.1 tree            |

## Accessibility

Each card is an article labeled with its common name, and its facts are a description list. The validity status is written in words; the color of the card only repeats it. The ASN.1 tree uses native disclosure elements (`<details>`), usable with the keyboard.

## Security

- **Nothing is verified.** Signatures are not checked and the chain is not validated: the issuer link only means the names or key identifiers match. Do not use this view to decide whether a certificate can be trusted.
- **Nothing is fetched.** CRL, OCSP and CA issuer URLs are shown as text, never requested or turned into links.
- **Strict DER reading.** The ASN.1 reader is written for this component and checks every length against the bytes left; it refuses indefinite and non-minimal lengths, and limits nesting to 40 levels, values to 20,000 and input to 1 MB, so malformed or hostile input fails with a message instead of hanging the page.
- **Private keys** found in the input are never displayed, copied or downloaded.

## Limits

- At most 20 PEM blocks are read; the ASN.1 tab builds at most 5,000 rows per certificate.
- The size limit of the [configuration](../configuration.md) applies to `content` and `src` (2 MB by default).
