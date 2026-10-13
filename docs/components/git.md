# `<vt-git>`

`<vt-git>` shows a commit history as a graph, like the graph views of Git clients: one lane per branch, merges and branch points drawn as curves, branch and tag labels, and the hash, subject, author and date of each commit. A commit opens a details panel, branch buttons show only the commits a branch contains, and a search marks matching commits.

```html
<vt-git variant="full" label="vitrine" src="/history.txt"></vt-git>
```

Hashes, subjects, names and messages are inserted as text, never parsed as HTML. The drawing is built with SVG DOM methods.

## Variants

| Feature                  | `simple` (default) | `full` |
| ------------------------ | ------------------ | ------ |
| `header`                 | off                | on     |
| `dot`                    | off                | on     |
| `copy`                   | off                | on     |
| `search` (marks commits) | off                | on     |
| `download`               | off                | on     |
| `fullscreen`             | off                | on     |
| `branch-filter`          | off                | on     |
| `author`                 | on                 | on     |
| `date`                   | on                 | on     |

Every feature can be turned on or off individually, whatever the variant.

## Formats

The lanes are always computed from the parents of each commit, so the three formats are drawn the same way.

**`git log` with parents** (recommended): one commit per line, fields separated by `|`. The subject is last and may itself contain `|`.

```sh
git log --all --date-order --pretty=format:'%H|%P|%an|%ad|%D|%s' --date=iso-strict -n 500 > history.txt
```

| Field | Content                                                   |
| ----- | --------------------------------------------------------- |
| `%H`  | Hash (full or abbreviated with `%h`)                      |
| `%P`  | Parent hashes, separated by spaces (`%p` for abbreviated) |
| `%an` | Author                                                    |
| `%ad` | Date: ISO 8601, epoch seconds, or Git's default format    |
| `%D`  | Refs: `HEAD -> main, origin/main, tag: v1.0`              |
| `%s`  | Subject                                                   |

**`git log --graph --oneline --decorate`**: the parents are read from the drawing (`*`, `|`, `/`, `\`). This output has no authors or dates. Without `--graph`, each commit is taken as the parent of the one above it.

```text
*   d4e5f6a (HEAD -> main, origin/main) Merge branch 'feature'
|\
| * b2c3d4e (feature) Add feature
* | a1b2c3d Fix typo
|/
* 9f8e7d6 (tag: v1.0) Initial commit
```

**JSON**: an array of commits, or an object with a `commits` array.

```json
[
  {
    "hash": "d4e5f6a",
    "parents": ["a1b2c3d", "b2c3d4e"],
    "author": "Ada",
    "date": "2026-10-07T18:00:00Z",
    "subject": "Merge branch 'feature'",
    "body": "Longer message.",
    "refs": ["HEAD -> main", "tag: v2.0"]
  }
]
```

`sha` and `id` are read as `hash`, `message` (subject, blank line, body) as `subject` and `body`, and `author` may be an object with a `name`. `parents` may be objects with a `hash` or `sha` (the GitHub API format).

Commits are listed in the order given: newest first, children before their parents, as `git log` writes them. Parents that are not in the history are left out of the drawing.

## Graph

- A commit takes the lane that waits for it, and its first parent continues on that lane, so the main line of a branch stays straight. Other parents of a merge get their own lane, and a lane ends where its branch started.
- Lanes are colored with `--vt-git-1` to `--vt-git-8`, which default to the [chart colors](chart.md) (`--vt-chart-1` …) and then to the theme accent, info, warning and syntax colors.
- Merge commits have a hollow dot; the commit `HEAD` points to has a larger one.
- Labels: the branch `HEAD` points to is shown as `HEAD → main` in the accent color, remote branches (`origin/…`, `upstream/…` and every remote with a `<remote>/HEAD` ref) have a dashed border, and tags are amber.

## Branches

With `branch-filter` (full variant), the header has a button per branch with the number of commits it contains, and an All branches button. A branch shows the commits reachable from its tip, laid out again. Choose the branch shown at first with `branch`:

```html
<vt-git variant="full" branch="feature/login" src="/history.txt"></vt-git>
```

## Selecting a commit

Clicking a commit, or pressing Enter or Space on it, selects it and opens a details panel under the graph: full hash with a copy button, parents (each one selects that commit), author, date, refs and message body. `selected` selects a commit at first, by hash or prefix:

```html
<vt-git variant="full" selected="d4e5f6a" src="/history.txt"></vt-git>
```

## Search

The search marks the commits whose hash starts with the text, or whose subject, author, body or ref names contain it. The graph is not filtered, so lanes stay readable. Enter and Shift+Enter move between matches; focus stays in the search field.

## Display

- Dates are relative ("3 days ago") in the language of the page, with the full date as a tooltip; `date-format="absolute"` writes them in full.
- `hash-length` sets the characters of the hash shown (7 by default).
- `author="false"` and `date="false"` hide those columns; on narrow screens they are hidden.
- Long histories are built in blocks of 100 rows as they scroll into view.
- Copy and download use the content as written (`git-log.txt` or `git-log.json`).

## Editing

With `mode="edit"`, an editor holds the history and the graph is updated under it. See [Editing](../editing.md).

## Attributes

This table lists the attributes specific to `<vt-git>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute       | Type                     | Default    | Description                     |
| --------------- | ------------------------ | ---------- | ------------------------------- |
| `branch-filter` | boolean                  | preset     | Branch buttons with counts.     |
| `branch`        | branch name              | all        | Branch shown at first.          |
| `author`        | boolean                  | on         | Author column.                  |
| `date`          | boolean                  | on         | Date column.                    |
| `date-format`   | `relative` or `absolute` | `relative` | "3 days ago", or the full date. |
| `hash-length`   | integer (4 to 64)        | `7`        | Characters of the hash shown.   |
| `selected`      | hash or prefix           |            | Commit selected at first.       |

## Properties

| Member    | Description                                                                            |
| --------- | -------------------------------------------------------------------------------------- |
| `content` | The history, as `git log` output or JSON.                                              |
| `commits` | Commits read, read-only: `{ hash, parents, author, date, time, subject, body, refs }`. |

Each ref is `{ name, type, head }`, where `type` is `branch`, `remote`, `tag` or `head` (a detached `HEAD`).

## Events

| Event              | `detail`             | When                                             |
| ------------------ | -------------------- | ------------------------------------------------ |
| `vt-ready`         | `{ type: "git" }`    | The graph was rendered                           |
| `vt-select`        | `{ commit }`         | A commit was clicked, or Enter was pressed on it |
| `vt-filter-change` | `{ branch, shown }`  | A branch button was chosen                       |
| `vt-search`        | `{ query, matches }` | A search ran                                     |
| `vt-copy`          | `{ text }`           | The history or a hash was copied                 |
| `vt-error`         | `{ message, cause }` | Loading failed or the text is too large          |

## CSS parts and properties

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part            | Element                                                         |
| --------------- | --------------------------------------------------------------- |
| `graph`         | The list of commits                                             |
| `commit`        | A row; also `commit-selected`                                   |
| `lanes`         | The drawing of a row                                            |
| `hash`          | The short hash                                                  |
| `ref`           | A label; also `ref-head`, `ref-branch`, `ref-remote`, `ref-tag` |
| `subject`       | The subject                                                     |
| `details`       | The details panel                                               |
| `branch-filter` | A branch button                                                 |

| Custom property             | Default                         |
| --------------------------- | ------------------------------- |
| `--vt-git-1` … `--vt-git-8` | `--vt-chart-1` … `--vt-chart-8` |

## Accessibility

The graph is a list box: one commit takes Tab focus, the arrow keys, Page Up, Page Down, Home and End move between commits, and Enter or Space selects one (`aria-selected`). The drawing is hidden from assistive technologies; the hash, labels, subject, author and date are text. Labels are told apart by their text (`HEAD → main`, `origin/…`), not by color alone. Branch buttons are toggle buttons (`aria-pressed`).

## Limits

- At most 20,000 commits are read.
- The size limit of the [configuration](../configuration.md) applies to `content` and `src` (2 MB by default).
