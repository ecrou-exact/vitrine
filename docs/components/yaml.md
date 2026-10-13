# `<vt-yaml>`

`<vt-yaml>` displays YAML as a collapsible tree or as highlighted text, with search, copy, download, a path bar and a copy as JSON. It works like [`<vt-json>`](json.md): same tree, same keyboard, same attributes.

```html
<vt-yaml variant="full" label="compose.yaml">
  <template>
    # Services of the shop
    services:
      web:
        image: nginx:1.27
        ports: ["80:80", "443:443"]
      db: &db
        image: postgres:17
        restart: always
  </template>
</vt-yaml>
```

YAML is read by [js-yaml](https://github.com/nodeca/js-yaml) with the **core schema** and merge keys: values are only strings, numbers, booleans, null, lists and mappings, never functions or class instances. The reader lives in `dist/vendor/yaml.js` (about 15 KB gzipped), loaded the first time a page shows YAML and shared with `<vt-openapi>`. Its location follows the `vendorUrl` option ([configuration](../configuration.md)).

## Variants

| Feature                   | `simple` (default) | `full` |
| ------------------------- | ------------------ | ------ |
| Initial view (`view`)     | `raw`              | `tree` |
| `header`                  | off                | on     |
| `dot`                     | off                | on     |
| `copy` (YAML and JSON)    | off                | on     |
| `search`                  | off                | on     |
| `download`                | off                | on     |
| `tabs` (Tree / Raw)       | off                | on     |
| `show-types`              | off                | on     |
| `expand-controls`         | off                | on     |
| `path`                    | off                | on     |
| `line-numbers` (raw view) | off                | on     |
| `fullscreen`              | off                | on     |

## What is shown

- **Tree view**: every mapping, list and scalar as in `<vt-json>`, with type badges (`string`, `number`, `boolean`, `null`, `object`, `array`). Aliases (`*name`) and merge keys (`<<: *name`) are shown resolved.
- **Raw view**: the YAML as written, highlighted, with its comments, anchors and aliases.
- **Several documents**: a stream with `---` separators is shown as a list, one item per document, and the number of documents is written under the tree.
- **Anchors**: the anchors of the text (`&name`) are listed under the tree with the number of aliases that use them; the title of each gives its line.
- **Scalars**: the core schema keeps dates such as `2026-10-13` as strings; `.inf` and `.nan` are shown as the strings `Infinity` and `NaN`.

## Attributes

The attributes of `<vt-json>` apply: `view`, `tabs`, `depth`, `sort-keys`, `show-types`, `expand-controls`, `path`, `line-numbers` and `on-invalid`. `indent` has no effect, since the raw view shows the text as written. Shared attributes are in [common attributes](../common-attributes.md).

## Properties

| Property  | Type      | Description                                                                                                                |
| --------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `content` | `string`  | The YAML text.                                                                                                             |
| `data`    | `unknown` | Reading returns the parsed value (a list for several documents). Setting it writes the value as JSON, which is valid YAML. |

## Copy and download

| Button       | What it copies or downloads                        |
| ------------ | -------------------------------------------------- |
| Copy         | The YAML text                                      |
| Copy as JSON | The content as JSON, pretty-printed                |
| Download     | The YAML text, as `data.yaml` (`application/yaml`) |

The path bar copies the path and the value of the selected node, as in `<vt-json>`.

## Search

The search finds keys and values in the tree, or text in the raw view. Focus stays in the search field while typing; Enter and Shift+Enter move between matches.

## Editing

In edit mode, an editor holds the YAML, highlighted, and checks it 150 ms after typing stops: "Valid YAML", or the line and column of the first error, with that line highlighted. See [editing](../editing.md).

## Events

| Event           | Detail               | When                                             |
| --------------- | -------------------- | ------------------------------------------------ |
| `vt-ready`      | `{ type: "yaml" }`   | The YAML was rendered.                           |
| `vt-tab-change` | `{ tab }`            | The view changed (`"tree"` or `"raw"`).          |
| `vt-copy`       | `{ text }`           | YAML, JSON, a value or a path was copied.        |
| `vt-search`     | `{ query, matches }` | The search was updated.                          |
| `vt-change`     | `{ value }`          | The text was edited.                             |
| `vt-error`      | `{ message, cause }` | Invalid YAML, or the YAML reader could not load. |

## CSS parts

The parts of `<vt-json>` (`tree`, `tree-item`, `row`, `tree-toggle`, `key`, `index`, `value`, `count`, `type-badge`, `more-item`, `path`), and:

| Part      | Element                                        |
| --------- | ---------------------------------------------- |
| `anchors` | Number of documents and anchors under the tree |

## Accessibility

The tree is a WAI-ARIA tree, as in `<vt-json>`: arrow keys, Home and End, `*` to expand siblings. Anchors are written as text, with their uses in the title.

## Limits

- The nesting limit of `<vt-json>` applies (`maxDepth`, 512 by default).
- Anchors are listed from the first 100,000 lines, 50 at most.
- An alias that expands to a huge structure ("billion laughs") is limited by js-yaml and by the content size limit (`maxContentSize`).
- If `dist/vendor/yaml.js` cannot load, an error says so ("The YAML reader could not be loaded").

## Examples

A Kubernetes stream with two documents:

```html
<vt-yaml variant="full" label="deploy.yaml">
  <template>
    apiVersion: v1
    kind: Service
    metadata: { name: web }
    ---
    apiVersion: apps/v1
    kind: Deployment
    metadata: { name: web }
    spec:
      replicas: 3
  </template>
</vt-yaml>
```

Merge keys:

```html
<vt-yaml variant="full">
  <template>
    defaults: &defaults
      retries: 3
      timeout: 30s
    build:
      <<: *defaults
      script: npm run build
  </template>
</vt-yaml>
```
