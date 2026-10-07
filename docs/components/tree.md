# `<vt-tree>`

`<vt-tree>` displays a file tree: folders that open and close, icons by file type, notes, and change markers. It reads the output of the `tree` command, indented names, a list of paths, or JSON, so you can paste what you already have.

```html
<vt-tree variant="full" label="my-app">
  <template>
    src/
      components/
        + Button.tsx  # new
        ~ Header.tsx
      app.ts
    package.json  # scripts and dependencies
    README.md
  </template>
</vt-tree>
```

Names and notes are inserted as text, never parsed as HTML.

## Variants

| Feature                      | `simple` (default) | `full` |
| ---------------------------- | ------------------ | ------ |
| `header`                     | off                | on     |
| `dot`                        | off                | on     |
| `copy` (the tree as text)    | off                | on     |
| `search` (filters the tree)  | off                | on     |
| `download`                   | off                | on     |
| `fullscreen`                 | off                | on     |
| `expand-controls`            | off                | on     |
| `path` (selected path bar)   | off                | on     |
| `icons`                      | on                 | on     |
| `guides` (indentation lines) | on                 | on     |

Every feature can be turned on or off individually, whatever the variant. The full variant's header shows the number of folders and files.

## Formats

The format is detected from the content.

### Indented text

One name per line; children are indented under their folder. Any indentation works (2 spaces, 4 spaces, tabs) as long as it is consistent. A name ending with `/` is a folder, and so is any entry with children.

```text
src/
  app.js
  lib/
    util.js
README.md
```

### `tree` output

Paste the output of `tree` as it is, with Unicode (`├──`, `└──`, `│`) or ASCII (`|--`, `` `-- ``) drawing. The summary line ("2 directories, 3 files") is ignored.

```text
.
├── src
│   ├── app.js
│   └── lib
│       └── util.js
└── package.json
```

A top folder named `.` is left out of paths.

### Paths

One path per line, without indentation; folders are created as needed and merged. This is what `git ls-files` or `find . -type f` print.

```text
src/app.js
src/lib/util.js
docs/
README.md
```

### JSON

Three shapes are accepted:

```json
["src/app.js", "src/lib/util.js", "README.md"]
```

```json
[
  {
    "name": "src",
    "children": [{ "name": "app.js", "note": "entry point", "status": "added" }]
  },
  { "name": "empty", "type": "folder" }
]
```

```json
{ "src": { "app.js": "entry point", "lib": ["util.js"] }, "README.md": null }
```

In nested objects, an object or array is a folder and any other value is a file; a string value becomes the file's note.

The `data` property returns the tree in the second shape, and accepts any of them:

```js
const tree = document.querySelector('vt-tree');
tree.data = await (await fetch('/api/repo/tree')).json();
console.log(tree.data); // [{ name, type, note?, status?, children? }]
```

## Notes and change markers

In text formats:

- `  # text` at the end of a line is a note, shown muted after the name;
- a leading `+ `, `- `, `~ ` or `* ` (with a space) marks the entry as **added**, **removed**, **modified** or **highlighted**.

```text
src/
  + Button.tsx  # new component
  ~ Header.tsx
  - Legacy.tsx
* package.json
```

Added, removed and modified entries get a colored name and a `+`, `−` or `~` badge; removed names are struck through. Highlighted entries get an accent bar. Screen readers hear the status after the name ("Header.tsx, modified"). In JSON, use `"note"` and `"status": "added" | "removed" | "modified" | "highlighted"`.

## Order

By default entries keep the order they are given in. `sort="name"` puts folders first, then sorts by name, ignoring case and comparing numbers as numbers (`file2` before `file10`).

## Opening folders

`depth` sets how many levels are open at first (default: all). `depth="1"` shows the top level with its folders closed. Click a folder, or use the keyboard, to open it. **Expand all** and **Collapse all** are in the full variant's header (`expand-controls`).

## Links to files

`href-template` turns every file into a link. `{path}` is replaced by the file's path (each segment URL-encoded) and `{name}` by its name:

```html
<vt-tree
  href-template="https://github.com/ada/app/blob/main/{path}"
  link-target="_blank"
  src="/tree.txt"
></vt-tree>
```

The resulting URL is checked like every other URL in Vitrine: `javascript:` and other unsafe schemes are refused (the name is shown as text). `link-target="_blank"` opens links in a new tab, with `rel="noopener noreferrer"`.

## Selecting

Clicking an entry, or pressing Enter or Space on it, selects it and fires `vt-select` with its path. The full variant shows the selected path under the tree with a **Copy path** button. Use the event to show the file next to the tree:

```js
tree.addEventListener('vt-select', async (event) => {
  if (event.detail.type !== 'file') return;
  viewer.label = event.detail.name;
  viewer.content = await (await fetch(`/files/${event.detail.path}`)).text();
});
```

## Search

The search filters the tree: matching entries (by name or note) stay visible with every folder on their way, and the match is highlighted. Enter and Shift+Enter move between matches. Closing the search shows the whole tree again.

## Copy and download

Copy and download use the tree drawn like the `tree` command, with `/` after folder names and notes kept, ready to paste in a README:

```text
my-app/
├── src/
│   └── app.ts
└── package.json  # scripts and dependencies
```

## Editing

With `mode="edit"`, an editor holds the source and the tree is updated live under it. See [Editing](../editing.md).

## Keyboard

The tree follows the ARIA tree pattern: it is one tab stop, and the arrow keys move inside it.

| Keys           | Action                                              |
| -------------- | --------------------------------------------------- |
| `↓` / `↑`      | Next / previous visible entry                       |
| `→`            | Open a folder, or move to its first entry           |
| `←`            | Close a folder, or move to the parent folder        |
| `Home` / `End` | First / last visible entry                          |
| `Enter`        | Follow the link of a file, or select and open/close |
| `Space`        | Select, and open or close a folder                  |
| `*`            | Open every folder at the same level                 |
| A letter       | Next entry whose name starts with it                |

## Attributes

This table lists the attributes specific to `<vt-tree>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute         | Type                        | Default    | Description                           |
| ----------------- | --------------------------- | ---------- | ------------------------------------- |
| `depth`           | integer 0 to 64             | all levels | Folder levels open at first.          |
| `sort`            | `none` or `name`            | `none`     | `name`: folders first, then by name.  |
| `href-template`   | URL with `{path}`, `{name}` | none       | Turns files into links.               |
| `link-target`     | `_self` or `_blank`         | `_self`    | Where links open.                     |
| `icons`           | boolean                     | on         | File and folder icons.                |
| `guides`          | boolean                     | on         | Indentation guides.                   |
| `expand-controls` | boolean                     | preset     | Expand all / Collapse all buttons.    |
| `path`            | boolean                     | preset     | Selected path bar with a copy button. |

## Properties

| Property  | Type       | Description                                                                               |
| --------- | ---------- | ----------------------------------------------------------------------------------------- |
| `content` | `string`   | The tree as text or JSON.                                                                 |
| `data`    | `object[]` | The tree as `{ name, type, note?, status?, children? }`. Setting it replaces the content. |

`content` and `data` can be set before the element is defined.

## Events

| Event                   | `detail`                             | When                                    |
| ----------------------- | ------------------------------------ | --------------------------------------- |
| `vt-ready`              | `{ type: "tree" }`                   | The tree was rendered                   |
| `vt-select`             | `{ path, name, type, note, status }` | An entry was selected                   |
| `vt-toggle`             | `{ path, expanded }`                 | A folder was opened or closed           |
| `vt-copy`               | `{ text }`                           | The tree or a path was copied           |
| `vt-search`             | `{ query, matches }`                 | A search ran                            |
| `vt-input`, `vt-change` | `{ value }`                          | The source was edited (edit mode)       |
| `vt-error`              | `{ message, cause }`                 | Loading failed or the text is too large |

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part    | Element                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `tree`  | The tree (`role="tree"`)                                                                                                  |
| `item`  | An entry (`role="treeitem"`)                                                                                              |
| `row`   | The visible row of an entry; also `folder`, or `file` and `file-code`, `file-data`, `file-doc`, `file-image`, `file-file` |
| `name`  | The name (a link with `href-template`)                                                                                    |
| `note`  | The note                                                                                                                  |
| `path`  | The path bar                                                                                                              |
| `match` | A search match                                                                                                            |

```css
/* Bigger rows, and data files in a custom color. */
vt-tree::part(row) {
  min-height: 32px;
}

vt-tree::part(file-data) {
  color: #b45309;
}
```

## Limits

- At most 20,000 entries are read; a notice says when the rest is ignored.
- Trees are limited to 64 levels: deeper entries are cut off.
- Names are cut at 255 characters and notes at 500; control characters are removed.
- Folder contents are built when the folder is opened, so large trees with `depth="1"` open at once.
