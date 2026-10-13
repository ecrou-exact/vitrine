# `<vt-env>`

`<vt-env>` displays configuration files — dotenv (`.env`), INI and Java `.properties` — as a table of keys and values grouped by section, with comments next to their entry, `${VAR}` references marked, and secrets masked until the reader reveals them.

```html
<vt-env variant="full" label=".env.example" src="/config/.env.example"></vt-env>
```

Keys, values and comments are inserted as text, never parsed as HTML. References are never expanded and nothing is evaluated.

## Variants

| Feature                    | `simple` (default) | `full` |
| -------------------------- | ------------------ | ------ |
| `header`                   | off                | on     |
| `dot`                      | off                | on     |
| `copy`                     | off                | on     |
| `search` (filters entries) | off                | on     |
| `download`                 | off                | on     |
| `fullscreen`               | off                | on     |
| `tabs` (Table / Raw)       | off                | on     |
| `line-numbers`             | off                | on     |
| `mask-secrets`             | on                 | on     |
| `comments`                 | on                 | on     |

Every feature can be turned on or off individually, whatever the variant.

## Formats

The format is detected from the text; set `format` to choose it.

| Format       | Example                                     | Read as                                                                                      |
| ------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `dotenv`     | `export DB_URL="postgres://${DB_HOST}/app"` | `KEY=value`, `export`, single, double and backtick quotes, `#` comments                      |
| `ini`        | `[database]` then `host = db.local`         | Sections, `key = value` and `key: value`, `;` and `#` comments                               |
| `properties` | `app.name=Demo` or `greeting: Hello \`      | `key=value`, `key: value` or `key value`, `\` continued lines, `\uXXXX` escapes, `!` and `#` |

**Quotes**: double-quoted values decode `\n`, `\t`, `\"` and `\\`, and may span several lines (keys, certificates). Single-quoted values are kept as written. Unquoted values end at a ` #` comment.

**Comments** written on the lines just above an entry, or at the end of its line, are shown under its value; `comments="false"` hides them.

**References** `${VAR}`, `${VAR:-default}` and `$VAR` are marked. When the variable is defined in the same file, the reference is a link to its row. References in single-quoted values are not marked, as shells do not expand them.

Lines that cannot be read (an unclosed quote, a line without `=`) are listed in a notice above the table.

## Secrets

With `mask-secrets` (on by default), values whose key names a secret are masked: keys ending in `PASSWORD`, `PASSWD`, `PWD`, `SECRET`, `TOKEN`, `KEY`, `API_KEY`, `AUTH`, `CREDENTIALS`, `SIGNATURE`, `SESSION`… (the rules of [`<vt-http>`](http.md)). Long values keep their last 4 characters. Add more key names with `secret-keys`:

```html
<vt-env secret-keys="DSN SENTRY_URL" src="/config/.env"></vt-env>
```

The eye button in the header shows or hides them. Masked values are masked everywhere: in the table, the Raw view, the search, copy and download. In edit mode the editor holds the real text.

## Search

The search filters the table to the entries whose key, value, section or comment contains the text and marks it. Masked values are not searched. In the Raw view, the search marks the text.

## Editing

With `mode="edit"`, the Raw tab is an editor and the Table tab shows the entries as typed. See [Editing](../editing.md).

## Attributes

This table lists the attributes specific to `<vt-env>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute      | Type                                    | Default | Description                           |
| -------------- | --------------------------------------- | ------- | ------------------------------------- |
| `format`       | `auto`, `dotenv`, `ini` or `properties` | `auto`  | File format.                          |
| `mask-secrets` | boolean                                 | on      | Mask secret values until revealed.    |
| `secret-keys`  | key names separated by spaces or commas |         | More keys to mask (case-insensitive). |
| `tabs`         | boolean                                 | preset  | Table / Raw tabs.                     |
| `view`         | `table` or `raw`                        | `table` | Initial view (`raw` in edit mode).    |
| `comments`     | boolean                                 | on      | Comments under their entry.           |
| `line-numbers` | boolean                                 | preset  | Line numbers of the file.             |

## Properties

| Member    | Description                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| `content` | The file text.                                                                                                |
| `entries` | Parsed entries, read-only and never masked: `{ line, lines, section, key, value, quote, exported, comment }`. |
| `format`  | The format read: `dotenv`, `ini` or `properties`.                                                             |

## Events

| Event           | `detail`             | When                                    |
| --------------- | -------------------- | --------------------------------------- |
| `vt-ready`      | `{ type: "env" }`    | The file was rendered                   |
| `vt-tab-change` | `{ tab }`            | Table / Raw changed                     |
| `vt-search`     | `{ query, matches }` | A search ran                            |
| `vt-copy`       | `{ text }`           | The file was copied (masked if masking) |
| `vt-error`      | `{ message, cause }` | Loading failed or the text is too large |

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part             | Element                        |
| ---------------- | ------------------------------ |
| `table`          | The table of entries           |
| `section`        | An INI section heading row     |
| `key`            | A key                          |
| `value`          | A value                        |
| `secret`         | A masked value                 |
| `reference`      | A `${VAR}` reference           |
| `comment`        | A comment                      |
| `secrets-button` | The show / hide secrets button |

## Accessibility

The table has column headers, and each key is the header of its row. Section rows are group headers. Masked values have a "Secret value, masked" tooltip, and the eye button is a toggle button (`aria-pressed`) that announces when secrets are shown or hidden. Line numbers are hidden from assistive technologies.

## Limits

- At most 20,000 entries are read; a quoted value spans at most 200 lines, a continued property 500.
- The size limit of the [configuration](../configuration.md) applies to `content` and `src` (2 MB by default).
