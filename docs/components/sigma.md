# `<vt-sigma>`

`<vt-sigma>` shows Sigma detection rules explained:

- the title, level and status;
- ATT&CK tactics, techniques, groups and software, and CVEs, as links;
- the log source;
- each search of the detection, as a table of fields with their modifiers in words;
- the condition as a tree.

It also lists what `sigma check` and reviewers flag.

```html
<vt-sigma variant="full" src="rules/proc_creation_win_whoami.yml"></vt-sigma>
```

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |
| `tabs`       | on                 | on     |

## Input

A Sigma rule in YAML, or several separated by `---`. A Sigma 1 collection works too: its `action: global` document is merged into the documents that follow it, and `action: reset` ends that. JSON (one rule or a list) is read as well. YAML is read by the same reader as `<vt-yaml>`, loaded on demand from `vendorUrl` (see [configuration](../configuration.md)). Up to 200 rules are read.

Correlation rules (`correlation:`) show their type, rules, grouping and time span. Filters (`filter:`) show their searches.

## A rule

- **Header**: the title, then the level in words (critical, high, medium, low, informational), colored. Then the count of problems.
- **Facts**: status, author, date, modified, license, identifier (with a copy button) and log source (`product`, `category`, `service`).
- **Tags**, read from their namespace:

| Tag                                 | Shown as                      | Link                                      |
| ----------------------------------- | ----------------------------- | ----------------------------------------- |
| `attack.execution`                  | ATT&CK tactic: Execution      | `attack.mitre.org/tactics/TA0002/`        |
| `attack.t1059.001`                  | ATT&CK technique: T1059.001   | `attack.mitre.org/techniques/T1059/001/`  |
| `attack.g0016`, `attack.s0002`      | ATT&CK group or software      | `attack.mitre.org/groups/G0016/`          |
| `cve.2021-44228`                    | Vulnerability: CVE-2021-44228 | `nvd.nist.gov/vuln/detail/CVE-2021-44228` |
| other (`detection.threat-hunting`…) | as written                    | none                                      |

- **Detection**: each search with its name and what it means:
  - a map means every field matches;
  - a list of maps means one of the sets matches;
  - a list of strings means keywords searched anywhere in the event.

  Fields are a table with the field, its match in words and its values. The match comes from the modifiers: `contains`, `startswith`, `endswith`, `all`, `re` with `i`, `m` and `s`, `cidr`, `base64`, `base64offset`, `utf16le`, `wide`, `windash`, `exists`, `gt`, `lte`, `fieldref`, `expand`, `cased`… Values are joined by "or", or by "and" with `|all`; `null` reads as empty or missing. Searches the condition never uses are tagged unused.

- **Condition**: colored, with names that match no search underlined in red. Below it, the condition as a tree ("All of these", "One of these", "Not"), with `1 of selection_*` and `all of them` expanded to the searches they name. `and` binds tighter than `or`, as in Sigma. A `timeframe` is shown with it.
- **False positives**, **fields to show**, **related rules** and **references** (folded, as links).

## Problems

| Level   | Problem                                                                                                                                               |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Error   | No title, no `logsource`, no `detection`, no `condition`.                                                                                             |
| Error   | A condition that cannot be read, that names a search not in the detection, or a pattern (`1 of filter_*`) matching none.                              |
| Warning | A search never used by the condition.                                                                                                                 |
| Warning | An unknown modifier, a regular expression that may be invalid.                                                                                        |
| Warning | A level or status outside the specification, a `deprecated` or `unsupported` rule, an identifier that is not a UUID, a date that is not `YYYY-MM-DD`. |
| Info    | A `*` next to `contains`, `startswith` or `endswith`, `\|all` with one value, the old date format `YYYY/MM/DD`, tags not in lowercase.                |

`lint="false"` hides them.

## Attributes

| Attribute | Values            | Default | Description                                          |
| --------- | ----------------- | ------- | ---------------------------------------------------- |
| `view`    | `rules`, `source` | `rules` | Tab shown first.                                     |
| `lint`    | boolean           | on      | The problems of each rule.                           |
| `links`   | boolean           | on      | ATT&CK, CVE and reference links. Off, they are text. |
| `tabs`    | boolean           | on      | The Rules and Source tabs.                           |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md). `mode="edit"` edits the YAML with highlighting, and the rules follow as you type.

## Properties

| Property  | Type       | Description                                                                                                                                                                                                                                                                                                                                                             |
| --------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content` | `string`   | The rules, in YAML or JSON.                                                                                                                                                                                                                                                                                                                                             |
| `rules`   | `object[]` | Read-only, and empty while the YAML reader loads. Each rule is `{ type, title, id, status, level, description, author, date, modified, license, references, tags, logsource, searches, conditions, trees, timeframe, falsepositives, fields, related, correlation, findings }`. Each tag is `{ raw, label, kind, url }`. Each search is `{ name, kind, groups, used }`. |

## Events

| Event           | Detail               | When                                 |
| --------------- | -------------------- | ------------------------------------ |
| `vt-ready`      | `{ type: "sigma" }`  | The rules are rendered.              |
| `vt-tab-change` | `{ tab }`            | The tab changed.                     |
| `vt-copy`       | `{ text }`           | The rules or an identifier copied.   |
| `vt-error`      | `{ message, cause }` | Loading failed or content too large. |

## CSS parts

| Part        | Element                     |
| ----------- | --------------------------- |
| `rule`      | The card of a rule.         |
| `level`     | The level of a rule.        |
| `tags`      | The tags of a rule.         |
| `search`    | A search of the detection.  |
| `condition` | The condition and its tree. |
| `findings`  | The problems of a rule.     |
| `source`    | The YAML source.            |

## Accessibility

Each rule is a section named after its title. Each search is a table with column headers, and the condition tree is a nested list. Levels and problems are words: the level carries a hidden "Level" prefix, and colors only repeat it. Links open in a new tab.

## Security

Every value is inserted as text. Links are made only for tags read by strict patterns (ATT&CK identifiers, CVE numbers), and for references that are `http:` or `https:` URLs passing the URL check. Links carry `rel="noopener noreferrer"`. Regular expressions are only tried with `new RegExp()`, never run. YAML is parsed by the bundled reader (no custom tags, no code), JSON with `JSON.parse`.
