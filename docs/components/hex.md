# `<vt-hex>`

`<vt-hex>` displays binary data as a hex dump: the offset of each row, its bytes in hex and their ASCII characters, bytes colored by kind, the file type read from its first bytes, keyboard navigation, a search for byte sequences or text, and copy as hex or base64.

```html
<vt-hex variant="full" label="logo.png" max-height="420px" src="/images/logo.png"></vt-hex>
```

Bytes are written into the page as text, never parsed as HTML.

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `search`     | off                | on     |
| `download`   | off                | on     |
| `fullscreen` | off                | on     |
| `ascii`      | on                 | on     |

Every feature can be turned on or off individually, whatever the variant.

## Sources

| Source           | Example                                                        | Read as                                                |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| `src`            | `<vt-hex src="/files/sample.bin">`                             | Fetched as binary, with the same rules as other `src`  |
| `bytes` property | `hex.bytes = new Uint8Array(buffer)`                           | The bytes as they are                                  |
| Hex text         | `48 65 6c 6c 6f`, `0x48,0x65`, `hexdump -C` or `xxd` output    | Pairs of digits; offsets and ASCII columns are skipped |
| Base64 text      | `SGVsbG8gd29ybGQ=` (standard or URL-safe, line breaks allowed) | Decoded                                                |

Text written inside the element or set as `content` is read as hex when it only has hex digits and separators, and as base64 otherwise. Set `format="hex"` or `format="base64"` to choose.

```html
<vt-hex variant="full">
  <template>
    00000000  89 50 4e 47 0d 0a 1a 0a  00 00 00 0d 49 48 44 52  |.PNG........IHDR|
  </template>
</vt-hex>
```

## File types

The header badge shows the size and, when the first bytes match a known signature, the file type: PNG, JPEG, GIF, WebP, PDF, ZIP, GZIP, BZIP2, XZ, 7Z, RAR, ELF, PE (`MZ`), Mach-O, WebAssembly, SQLite, OLE (legacy Office), Java class, PCAP, PCAPNG, MP3 and OGG. The detected type is also the MIME type of the download, and the `fileType` property.

## Byte colors

| Kind       | Bytes                  | Token                              |
| ---------- | ---------------------- | ---------------------------------- |
| Null       | `00`                   | `--vt-hex-null` (gutter color)     |
| Whitespace | `09`, `0a`, `0d`, `20` | string color of the syntax theme   |
| Control    | `01`–`1f`, `7f`        | `--vt-hex-control` (keyword color) |
| High       | `80`–`ff`              | `--vt-hex-high` (number color)     |
| Printable  | `21`–`7e`              | text color                         |

Characters that are not printable are shown as `.` in the ASCII column.

## Selection and keyboard

Hovering a byte highlights it in both columns. Clicking it selects it and dispatches `vt-select`. The dump is one tab stop: arrow keys move by byte and by row, Page Up and Page Down by 16 rows, Home and End to the start and end of the row, Ctrl+Home and Ctrl+End to the first and last byte. The offset, hex value and character of the selected byte are announced.

## Search

Hex digits search for bytes (`de ad be ef`, `0xCAFE`, `504b0304`); anything else, or text in quotes (`"dead"`), searches for its UTF-8 bytes, ignoring the case of ASCII letters. Matches are marked in both columns; Enter and Shift+Enter move between them, and focus stays in the search field.

## Display

- `columns` sets the bytes per row (16 by default), and `group` the bytes per group inside a row (8 by default, `0` for none).
- `offset` sets the offset of the first byte, for dumps of a part of a file.
- `uppercase` writes hex digits in capitals; `ascii="false"` hides the ASCII column.
- Long dumps are built in blocks as they scroll into view, so a 2 MB file opens at once.

## Attributes

This table lists the attributes specific to `<vt-hex>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute   | Type                      | Default | Description                               |
| ----------- | ------------------------- | ------- | ----------------------------------------- |
| `columns`   | integer 1 to 64           | `16`    | Bytes per row.                            |
| `group`     | integer 0 to 64           | `8`     | Bytes per group inside a row (`0`: none). |
| `format`    | `auto`, `hex` or `base64` | `auto`  | How text content is read.                 |
| `ascii`     | boolean                   | on      | ASCII column.                             |
| `uppercase` | boolean                   | off     | Hex digits in capitals.                   |
| `offset`    | integer                   | `0`     | Offset of the first byte.                 |

## Properties

| Member     | Description                                                                         |
| ---------- | ----------------------------------------------------------------------------------- |
| `bytes`    | The displayed bytes (a copy). Setting a `Uint8Array` overrides `src` and `content`. |
| `content`  | Hex or base64 text.                                                                 |
| `fileType` | Detected type, read-only: `{ name, mime }` or `null`.                               |

## Events

| Event       | `detail`             | When                                    |
| ----------- | -------------------- | --------------------------------------- |
| `vt-ready`  | `{ type: "hex" }`    | The dump was rendered                   |
| `vt-select` | `{ offset, value }`  | A byte was selected                     |
| `vt-search` | `{ query, matches }` | A search ran                            |
| `vt-copy`   | `{ text }`           | The bytes were copied as hex or base64  |
| `vt-error`  | `{ message, cause }` | Loading failed or the data is too large |

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part     | Element                  |
| -------- | ------------------------ |
| `dump`   | The grid of rows         |
| `offset` | An offset cell           |
| `hex`    | The hex cells of a row   |
| `ascii`  | The ASCII cells of a row |

## Accessibility

The dump is a grid named "Bytes", with one row per line and row headers for offsets. It takes one tab stop and is read byte by byte with the arrow keys; each move is announced. Byte kinds are told by their values, never by color alone, and selection and search marks have outlines in forced colors mode.

## Limits

- The size limit of the [configuration](../configuration.md) applies to `src` in bytes and to `content` in characters (2 MB by default).
- The search stops after the usual number of matches; the counter shows `+` when it does.
