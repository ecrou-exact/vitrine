# `<vt-hash>`

`<vt-hash>` hashes a text or a file in the page, MD5, SHA-1, SHA-256, SHA-384 and SHA-512, and compares the result with a fingerprint. Use it to verify a download, to give the SRI value of a script, or to compute the SHA-512 a tool such as Lookyloo uses to find a resource.

```html
<vt-hash variant="full" expected="sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad">abc</vt-hash>
```

Nothing is sent: the text and the files are hashed in memory, in the page.

## Variants

| Feature       | `simple` (default) | `full` |
| ------------- | ------------------ | ------ |
| `header`      | off                | on     |
| `dot`         | off                | on     |
| `copy`        | off                | on     |
| `fullscreen`  | off                | on     |
| `edit-toggle` | on                 | on     |

## What is hashed

- **The text**: the content of the element, encoded in UTF-8. The edit button turns it into a field to type or paste into, and the hashes follow as you type. Inline content is dedented and its line endings become `\n`; to hash exact bytes, set the `content` property from JavaScript.
- **A file**: dropped on the element or chosen with the button (with `file`, on by default), or set with the `file` property. It is read in memory, up to 256 MB. "Hash the text instead" goes back to the text.

With no text and no file, the element shows the zone to drop a file and the edit button.

## Algorithms and formats

| Algorithm | Computed with | Note                                                                                         |
| --------- | ------------- | -------------------------------------------------------------------------------------------- |
| MD5       | JavaScript    | Marked "Weak": collisions can be made. Fine to find a file, not to prove it was not changed. |
| SHA-1     | Web Crypto    | Marked "Weak", for the same reason.                                                          |
| SHA-256   | Web Crypto    |                                                                                              |
| SHA-384   | Web Crypto    | The usual Subresource Integrity algorithm.                                                   |
| SHA-512   | Web Crypto    | Used by Lookyloo for resource body hashes.                                                   |

Web Crypto needs a secure page (HTTPS or `localhost`); elsewhere, only MD5 is computed and the other rows say why.

The format list writes every hash in hexadecimal, hexadecimal in upper case, base64, or as a Subresource Integrity value (`sha384-…`), ready for an `integrity` attribute.

## Comparing

The comparison field (with `compare`, on by default; `expected` fills it) reads a fingerprint in the forms tools print:

| Form                  | Example                                                         |
| --------------------- | --------------------------------------------------------------- |
| Hexadecimal           | `ba7816bf…`, upper case, with spaces or colons (`BA:78:16:BF…`) |
| Base64                | `ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=`                  |
| Subresource Integrity | `sha256-ungWv48B…`                                              |
| Prefixed              | `sha256:ba7816bf…` (container digests)                          |
| `sha256sum` line      | `ba7816bf…  file.txt`                                           |
| BSD line              | `SHA256 (file.txt) = ba7816bf…`                                 |

The algorithm is found from the prefix or the length, and the result says it: "Matches the SHA-256", "Does not match the SHA-256: the content is different", a fingerprint of an algorithm that is not computed, or text that is not a fingerprint. Digests are compared in constant time.

## Attributes

| Attribute    | Values                              | Default  | Description                                                        |
| ------------ | ----------------------------------- | -------- | ------------------------------------------------------------------ |
| `algorithms` | names separated by spaces or commas | all five | Algorithms computed (`md5`, `sha1`, `sha256`, `sha384`, `sha512`). |
| `format`     | `hex`, `upper`, `base64`, `sri`     | `hex`    | How hashes are written first.                                      |
| `expected`   | a fingerprint                       |          | Compared with the hashes.                                          |
| `file`       | boolean                             | on       | The zone to drop or choose a file.                                 |
| `compare`    | boolean                             | on       | The comparison field.                                              |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

From JSON: a string, or `{ text, expected }`; `hash`, `sha256`, `sha512` and `algorithms` set the attributes of the same meaning.

## Copy

Each row has its copy button. In the full variant, "Copy all" copies every hash in the BSD form, `SHA256 (file.txt) = …` (`-` for the text), which `shasum -c` reads.

## Properties

| Property  | Type             | Description                                                                       |
| --------- | ---------------- | --------------------------------------------------------------------------------- |
| `content` | `string`         | The text hashed.                                                                  |
| `file`    | `File \| null`   | The file hashed instead of the text; `null` goes back to the text.                |
| `hashes`  | `object \| null` | Read-only: `{ md5, sha1, sha256, sha384, sha512 }` in hexadecimal, once computed. |

## Events

| Event       | Detail                           | When                                                                 |
| ----------- | -------------------------------- | -------------------------------------------------------------------- |
| `vt-ready`  | `{ type: "hash" }`               | The element is rendered.                                             |
| `vt-hash`   | `{ source, name, size, hashes }` | Hashes computed (`source`: `text` or `file`; hexadecimal).           |
| `vt-verify` | `{ state, algorithm }`           | A fingerprint compared: `match`, `mismatch`, `invalid` or `unknown`. |
| `vt-copy`   | `{ text }`                       | A hash copied.                                                       |
| `vt-error`  | `{ message, cause }`             | Loading failed or content too large.                                 |

## CSS parts

| Part      | Element                           |
| --------- | --------------------------------- |
| `source`  | What is hashed: the text or file. |
| `zone`    | The zone where a file is dropped. |
| `hashes`  | The table of hashes.              |
| `value`   | A hash value.                     |
| `compare` | The comparison field.             |
| `result`  | The comparison result.            |

## Accessibility

The format list and the comparison field have labels; the result of the comparison is announced and written in words, with an icon. Hashes are a table with a header per algorithm. Files can be chosen with the keyboard.

## Security

The text and files are never sent, stored or shown as markup; the file is read with `Blob.arrayBuffer()` and hashed in memory. Files over 256 MB are refused.
