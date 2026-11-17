# `<vt-yara>`

`<vt-yara>` shows YARA rules explained. Each rule appears with its tags, meta, strings and condition. The strings are text, hex with its wildcards and jumps, or regular expressions, and the element says what each modifier does. The condition is colored and read in words. Each rule lists the problems the YARA compiler or a reviewer would raise.

```html
<vt-yara variant="full" src="rules/loader.yar"></vt-yara>
```

The element only reads the rules: they are never compiled or run against a file.

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |
| `tabs`       | on                 | on     |

## Input

YARA source:

- `import` and `include` lines;
- rules with `private` and `global`, tags, and `meta:`, `strings:` and `condition:` sections;
- `//` and `/* */` comments.

Up to 500 rules and 1 MB of text are read. The Source tab shows the whole text colored.

## Rules

Each rule is a card with:

- **Name and flags**: `private` (never reported alone) and `global` (applies to every rule), each with a hint in words.
- **Tags**.
- **Problems**: a count, then each problem with its line.
- **Meta**: keys and values. Numbers and booleans are told apart from text.
- **Strings**: one row per string, with:
  - its identifier;
  - its kind (text, hex or regex);
  - its value. Hex strings separate fixed bytes, wildcards (`??`, `4?`) and jumps (`[2-4]`).
  - its modifiers. Each one explains itself when hovered, and to screen readers: `nocase`, `wide`, `ascii`, `fullword`, `private`, `xor(1-255)`, `base64`, `base64wide`.

  Strings the condition never uses are struck through and tagged unused.

- **Condition**: colored the way YARA reads it, with keywords, string references (`$a`, `#a`, `@a`, `!a`), numbers and module calls.
- **Reads as**: the parts of the condition with a plain meaning:

| Condition                                  | Read as                                                    |
| ------------------------------------------ | ---------------------------------------------------------- |
| `uint16(0) == 0x5A4D`                      | The file starts with the bytes of MZ (Windows executable). |
| `uint32(0) == 0x464C457F`                  | The file starts with the bytes of ELF.                     |
| `filesize < 500KB`                         | The file is smaller than 500KB.                            |
| `2 of ($a*)`, `any of them`, `all of (…)`  | The strings it names, wildcards expanded.                  |
| `#a > 3`                                   | `$a` is found more than 3 times.                           |
| `$a at 0`, `$a in (0..1024)`               | Where the string must be.                                  |
| `pe.number_of_sections`, `math.entropy(…)` | The module used.                                           |

The first bytes it recognizes also cover ZIP, PDF, OLE, Mach-O, DEX, LNK, RAR, GZIP and 7-Zip.

## Problems

| Level   | Problem                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Error   | Syntax errors and unclosed strings, comments or hex strings, with their line.                                                                    |
| Error   | Duplicate rule names, duplicate strings.                                                                                                         |
| Error   | Strings used but not defined, or defined but never used. YARA refuses both; `$_name` and anonymous `$` strings are exempt from the unused check. |
| Error   | Modifiers not allowed on a kind of string, `nocase` with `xor` or `base64`, empty strings, hex strings that cannot be read.                      |
| Error   | A rule without a condition, a module (`pe`, `elf`, `math`, `hash`, `dotnet`…) used without its `import`.                                         |
| Warning | Text strings shorter than 4 bytes, hex strings without two fixed bytes in a row, unbounded jumps `[-]`.                                          |
| Warning | Regular expressions starting with `.*`, or that may be invalid.                                                                                  |
| Info    | Hex strings starting with a wildcard, rules without a `description` in meta.                                                                     |

`lint="false"` hides the problems and the colored edge of the cards.

## Attributes

| Attribute | Values            | Default | Description                  |
| --------- | ----------------- | ------- | ---------------------------- |
| `view`    | `rules`, `source` | `rules` | Tab shown first.             |
| `lint`    | boolean           | on      | The problems of each rule.   |
| `explain` | boolean           | on      | The condition read in words. |
| `tabs`    | boolean           | on      | The Rules and Source tabs.   |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md). `mode="edit"` (or the edit button) edits the rules. The cards follow as you type.

## Copy

| Button             | Output                |
| ------------------ | --------------------- |
| Copy the rules     | The YARA text.        |
| Copy the rule name | The name of one rule. |

## Properties

| Property  | Type     | Description                                                                                                                                                                                                                                        |
| --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content` | `string` | The YARA rules.                                                                                                                                                                                                                                    |
| `ruleset` | `object` | Read-only. It has the form `{ imports, includes, rules, findings, capped }`. Each rule is `{ name, line, private, global, tags, meta, strings, condition, findings, notes, source }`. Each string is `{ id, kind, value, modifiers, line, used }`. |

## Events

| Event           | Detail               | When                                 |
| --------------- | -------------------- | ------------------------------------ |
| `vt-ready`      | `{ type: "yara" }`   | The rules are rendered.              |
| `vt-tab-change` | `{ tab }`            | The tab changed.                     |
| `vt-copy`       | `{ text }`           | Rules or a rule name copied.         |
| `vt-error`      | `{ message, cause }` | Loading failed or content too large. |

## CSS parts

| Part        | Element                          |
| ----------- | -------------------------------- |
| `rule`      | The card of a rule.              |
| `verdict`   | The count of problems of a rule. |
| `meta`      | The meta of a rule.              |
| `strings`   | The table of strings.            |
| `condition` | The condition.                   |
| `notes`     | The condition read in words.     |
| `findings`  | The problems of a rule.          |
| `source`    | The colored source.              |

## Accessibility

Each rule is a section named after the rule, and its strings are a table with a caption and column headers. Modifiers carry their explanation as text for screen readers. Problems and their levels are words; colors only repeat them.

## Security

Rules are read with a tokenizer written for YARA and every value is inserted as text. Nothing is compiled, run or fetched. Regular expressions are only tried with `new RegExp()` to warn when they may be invalid; they are never run against data. At most 500 rules and 1 MB of text are read.
