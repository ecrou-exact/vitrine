# `<vt-treemap>`

`<vt-treemap>` shows the sizes of a hierarchy as nested rectangles, each as large as its share: what takes the space in a bundle, a disk or a budget. Choosing a rectangle opens it, and the path at the top goes back.

```html
<vt-treemap variant="full" src="/dist/meta.json"></vt-treemap>
```

## What it reads

| Data                             | Example                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| esbuild metafile (`--metafile`)  | the bytes of each input in each output                     |
| webpack stats (`webpack --json`) | the size of each module, concatenated modules opened       |
| The output of `du`               | `du -a`, `du -k`, `du -h`: a size and a path on each line  |
| CSV of paths and sizes           | `path,size` then `src/core/dom.js,3120`                    |
| CSV with a column per level      | `team,service,cost` then `web,cdn,120`                     |
| A list of paths and sizes        | `[{ "path": "src/a.js", "size": 120 }]`, or `[["a/b", 3]]` |
| A JSON tree                      | `{ "name", "value", "children" }`                          |

Paths are split on `/` and `\`. In `du` and in JSON trees, a size given to a group (a directory) is its total, and what its children do not account for is its own size. Sizes of bundles are bytes, written in kB and MB; `unit` names other units, and `unit="bytes"` writes any size as bytes.

## Reading it

The children of the group opened are drawn with the squarified layout, as close to squares as their order allows, largest first, each group in a color of the theme. Up to `depth` levels are drawn inside each other: a group shows its name on top and what it holds below. A rectangle too small to read has no name; its size is still in its group.

The line under the map describes the rectangle under the pointer or the focus: its path, its size and its share of the whole. The List tab gives the same as a table.

Searching marks the rectangles whose name matches and tells what share of the total they take.

## Keyboard

The rectangles of the group opened are a tree: one is in the tab order.

| Key               | Action                      |
| ----------------- | --------------------------- |
| ← → ↑ ↓           | The rectangle before, after |
| Home, End         | The first, the last         |
| Enter, Space      | Opens the group             |
| Escape, Backspace | Goes back one level         |

## Attributes

| Attribute     | Type    | Default        | Description                                         |
| ------------- | ------- | -------------- | --------------------------------------------------- |
| `depth`       | number  | 2              | Levels drawn inside each other, 1 to 4              |
| `unit`        | string  | none, or bytes | Unit of the sizes; `bytes` writes them as kB and MB |
| `tabs`        | boolean | preset         | Map and List tabs                                   |
| `default-tab` | string  | `map`          | `map` or `list`                                     |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header, the tabs, search, copy (the sizes of the group opened, as CSV), download (the data as written) and full screen.

## Properties

`tree` is the tree read: `{ root, format, bytes, count }`, each node `{ name, total, self, depth, children }`.

## Events

| Event           | When                                 | Detail                         |
| --------------- | ------------------------------------ | ------------------------------ |
| `vt-select`     | A group was opened, or a leaf chosen | `{ name, path, size, leaf }`   |
| `vt-tab-change` | The tab changed                      | `{ tab }`: `"map"` or `"list"` |

## CSS parts

`map`, `item` (also `item-match` during a search), `crumbs`, `details` and `table`.
