# `<vt-regex>`

`<vt-regex>` shows a JavaScript regular expression and what it matches: the pattern colored by part, an explanation in plain words, the test text with every match and group marked, a table of matches, and the result of a replacement. In edit mode, the pattern and the test text are edited live.

```html
<vt-regex variant="full" pattern="(?<user>[\w.]+)@(?<host>[\w.-]+)" flags="g">
  <template>ada@example.com, alan.turing@test.org</template>
</vt-regex>
```

The test text is the content of the element (inline, `content` or `src`). It is inserted as text, never parsed as HTML.

## Variants

| Feature        | `simple` (default) | `full` |
| -------------- | ------------------ | ------ |
| `header`       | off                | on     |
| `dot`          | off                | on     |
| `copy`         | off                | on     |
| `download`     | off                | on     |
| `fullscreen`   | off                | on     |
| `flag-buttons` | off                | on     |
| `table`        | off                | on     |
| `explain`      | off                | on     |

Every feature can be turned on or off individually, whatever the variant. The simple variant shows the pattern and the marked text.

## Pattern and flags

`pattern` is the regular expression without slashes; `flags` takes any of `d g i m s u v y` (default `g`). Unknown flags are ignored, and `v` replaces `u` when both are given. With `flag-buttons`, each flag gets a button that switches it on or off.

The pattern is colored by part: groups and alternation, lookarounds, character classes, quantifiers, anchors, escapes and back references. Pointing at a parenthesis highlights its pair. An invalid pattern shows the browser's error message.

## Matches and groups

Every match is marked in the text; consecutive matches alternate in shade, and zero-length matches are shown as a thin bar. Inside a match, each capturing group has its own color (six colors, then they repeat), and the innermost group wins where groups nest. The header badge shows the number of matches.

With `table`, a table lists each match with its position and the value of each group (up to 12 group columns; named groups show their name). Copy gives the matches as JSON, and download saves them as `matches.json`. The second copy button copies the pattern as a JavaScript literal, such as `/a\/b/gi`.

## Replacement

With `replace`, the result of `text.replace(pattern, replace)` is shown under the text. The usual substitutions work: `$1`, `$<name>`, `$&`, `` $` ``, `$'` and `$$`.

```html
<vt-regex pattern="(\d{4})-(\d{2})-(\d{2})" replace="$3/$2/$1">
  <template>2026-10-13</template>
</vt-regex>
```

## Explanation

With `explain`, a tree describes the pattern in plain words, in the page language (English and French are built in): "Start of the text", "A digit, exactly 3 times", "Group “user” (1)", and so on. Groups, alternatives and repeated groups have their parts nested under them.

## Editing

In edit mode (`mode="edit"` or the edit toggle), a field holds the pattern and an editor holds the test text. Matches, the table and the explanation follow 150 ms after typing stops, and `vt-change` reports the new pattern, flags and text.

## Attributes

| Attribute      | Values            | Default | Description                              |
| -------------- | ----------------- | ------- | ---------------------------------------- |
| `pattern`      | string            | `""`    | The regular expression, without slashes. |
| `flags`        | `d g i m s u v y` | `g`     | Flags.                                   |
| `replace`      | string            | —       | Replacement whose result is shown.       |
| `flag-buttons` | boolean           | variant | Buttons to switch each flag.             |
| `table`        | boolean           | variant | Table of matches and groups.             |
| `explain`      | boolean           | variant | Explanation of the pattern.              |

The [common attributes](../common-attributes.md) also apply (`variant`, `theme`, `src`, `max-height`, `label`, `mode`…). `max-height` limits the height of the test text.

## Properties

| Property  | Type           | Description                                                                |
| --------- | -------------- | -------------------------------------------------------------------------- |
| `content` | string         | The test text.                                                             |
| `pattern` | string         | The pattern. Setting it sets the attribute; edits update it.               |
| `flags`   | string         | The flags. Setting it sets the attribute; flag buttons update it.          |
| `results` | `RegexMatch[]` | Matches: `{ index, end, text, groups, ranges, named }` (read-only copies). |

## Events

| Event       | Detail                        | When                                           |
| ----------- | ----------------------------- | ---------------------------------------------- |
| `vt-match`  | `{ count, capped, timedOut }` | Matching ran for a new pattern, flag or text.  |
| `vt-change` | `{ pattern, flags, value }`   | The reader changed the pattern, flags or text. |

The common events (`vt-ready`, `vt-copy`, `vt-input`, `vt-error`…) are described in [common attributes](../common-attributes.md#events).

## CSS parts

| Part            | Element                        |
| --------------- | ------------------------------ |
| `pattern`       | The colored pattern.           |
| `pattern-input` | The pattern field (edit mode). |
| `flags`         | The flag buttons.              |
| `text`          | The test text.                 |
| `match`         | A match.                       |
| `group`         | A group inside a match.        |
| `table`         | The table of matches.          |
| `replace`       | The replacement result.        |
| `explanation`   | The explanation tree.          |

Group colors follow `--vt-chart-2` … `--vt-chart-7` when they are set.

## Accessibility

Flag buttons are toggle buttons (`aria-pressed`) with the flag's name as tooltip. The test text is a focusable, labeled region; matches and groups have a title with their number and name. The match table has column headers, and the explanation is a disclosure (`<details>`) that is open by default.

## Limits and safety

Patterns from untrusted sources can be slow: some take exponential time on text that almost matches (catastrophic backtracking). A single run of a regular expression cannot be interrupted in the browser, and running it in a worker would need a separate script that strict Content Security Policies may block, so `<vt-regex>` uses limits instead:

| Limit                | Value         | What happens                                                                           |
| -------------------- | ------------- | -------------------------------------------------------------------------------------- |
| Pattern length       | 2,000 chars   | The rest of the pattern is ignored.                                                    |
| Text tested          | 100,000 chars | The rest is shown but not tested; a notice says so.                                    |
| Matches              | 1,000         | Matching stops; the badge shows `1,000+`.                                              |
| Time                 | 100 ms        | Checked between matches; matching stops and a notice says so.                          |
| Repeated repetitions | —             | Patterns such as `(a+)+` or `(\w*)*` are not run until the reader clicks "Run anyway". |

Zero-length matches move one character on (one code point with `u` or `v`), so they never loop. The replacement is only computed when matching finished within these limits.
