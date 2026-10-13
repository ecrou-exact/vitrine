# `<vt-xml>`

`<vt-xml>` displays XML as a collapsible tree or as highlighted text: elements with their attributes, text, CDATA sections, comments, processing instructions and namespaces, the XPath of the selected node, and a raw view that can be indented.

```html
<vt-xml variant="full" label="feed.xml" src="/feeds/news.xml"></vt-xml>
```

Inline XML goes in a data `<script>`: a `<template>` is read by the HTML parser, which turns `<?xml?>` and processing instructions into comments and drops the DOCTYPE.

```html
<vt-xml variant="full">
  <script type="application/xml">
    <?xml version="1.0"?>
    <catalog><book id="1"><title>Vitrine</title></book></catalog>
  </script>
</vt-xml>
```

The XML is read as data by a built-in parser: nothing becomes an element of your page, and nothing is fetched. See [Safety](#safety).

## Variants

| Feature           | `simple` (default) | `full` |
| ----------------- | ------------------ | ------ |
| `header`          | off                | on     |
| `dot`             | off                | on     |
| `copy`            | off                | on     |
| `search`          | off                | on     |
| `download`        | off                | on     |
| `fullscreen`      | off                | on     |
| `tabs`            | off                | on     |
| `expand-controls` | off                | on     |
| `path`            | off                | on     |
| `line-numbers`    | off                | on     |

The simple variant shows the raw view; the full variant opens on the tree. Every feature can be turned on or off individually, whatever the variant.

## Tree

Each element is a row: `<name attr="value">`, with its child count when collapsed (`<book id="1">…</book> 3 children`). An element whose only content is a short text is shown on one row: `<title>Vitrine</title>`. Text, CDATA, comments, processing instructions and the DOCTYPE are rows of their own. Text made only of whitespace (indentation) is left out.

Namespace prefixes are shown apart (`media:` in `media:thumbnail`), and the namespace URI of an element or attribute is its title. `depth` sets how many levels are open at first (default 2).

Large elements show their children 100 at a time, with a "Show more" row. **Expand all** stops after 5,000 rows.

The bar under the tree shows the XPath of the selected node (`/rss/channel[1]/item[2]/title[1]`), with buttons to copy the XPath and to copy the node: its XML for an element, its text otherwise.

Keyboard: arrows move between rows, Right and Left open and close, Home and End go to the first and last row, Enter or Space opens or closes.

## Raw view

The Raw tab shows the XML highlighted. The **Indent** button (`pretty` attribute) switches between the text as written and the document indented with `indent` spaces (default 2). Copy and download take the text shown.

## Search

The search finds element names, attribute names and values, text, comments and CDATA in the tree, opening the elements on the way; in the raw view it searches the text. Focus stays in the search field while typing; Enter and Shift+Enter move between matches.

## Editing

`editable` or the pencil button switch to an editor that holds the XML text. It is checked as you type, and the status bar shows the first error with its line and column, which is also highlighted.

## Attributes

| Attribute         | Values         | Default                             | Description                                           |
| ----------------- | -------------- | ----------------------------------- | ----------------------------------------------------- |
| `view`            | `tree`, `raw`  | `tree` (full), `raw` (simple, edit) | Initial view                                          |
| `tabs`            | boolean        | full: on                            | Tree / Raw tabs                                       |
| `depth`           | 0–1000         | `2`                                 | Levels open at first                                  |
| `pretty`          | boolean        | off                                 | Raw view indented instead of as written               |
| `indent`          | 0–8            | `2`                                 | Spaces per level when indented                        |
| `expand-controls` | boolean        | full: on                            | Expand all / collapse all buttons                     |
| `path`            | boolean        | full: on                            | XPath bar of the selected node                        |
| `line-numbers`    | boolean        | full: on                            | Line numbers in the raw view                          |
| `on-invalid`      | `error`, `raw` | `error`                             | Invalid XML: show an error, or the text with a notice |

The [common attributes](../common-attributes.md) (`variant`, `theme`, `src`, `label`, `max-height`…) work too.

## Properties and methods

| Property   | Type             | Description                                                                                                                    |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `content`  | string           | The XML text                                                                                                                   |
| `document` | object or `null` | The parsed document (read-only): nodes with `type`, `name`, `attrs`, `children`, `value`, `ns` and `line`; `null` when invalid |

## Events

| Event           | Detail                  | When                               |
| --------------- | ----------------------- | ---------------------------------- |
| `vt-select`     | `{ xpath, type, name }` | A node was selected in the tree    |
| `vt-tab-change` | `{ tab }`               | Tree / Raw changed                 |
| `vt-error`      | `{ message, cause }`    | Invalid XML (with line and column) |

The common events (`vt-ready`, `vt-copy`, `vt-search`, `vt-change`…) are described in [common attributes](../common-attributes.md#events).

## CSS parts

| Part            | Element                            |
| --------------- | ---------------------------------- |
| `tree`          | The tree                           |
| `tree-item`     | A row and its children             |
| `row`           | The visible row                    |
| `tree-toggle`   | Open / close chevron               |
| `element`       | An element name                    |
| `prefix`        | A namespace prefix                 |
| `key`           | An attribute name                  |
| `value`         | An attribute value or a text       |
| `count`         | Child count of a collapsed element |
| `more-item`     | "Show more" row                    |
| `path`          | XPath bar                          |
| `pretty-button` | Indent button of the raw view      |

## Accessibility

The tree follows the WAI-ARIA tree pattern (`role="tree"`, `treeitem`, `group`, `aria-expanded`, `aria-level`, `aria-setsize`, `aria-posinset`) with one tab stop. The raw view is a focusable region named after the label.

## Safety

XML can attack the program that reads it. `<vt-xml>` uses its own parser and reads every node as data, so none of these attacks applies:

- **No HTML or DOM parsing.** Names, attributes and text are inserted with DOM text APIs. `<script>`, `onerror=` or `javascript:` in a document stay visible text.
- **External entities (XXE) are never resolved.** The DOCTYPE is shown as text and never processed: `<!ENTITY x SYSTEM "file:///etc/passwd">` or a parameter entity pointing to a URL fetch nothing.
- **Declared entities are never expanded** ("billion laughs"). A reference such as `&lol9;` stays an entity node shown as `&lol9;`, and a notice lists the entities left as written. Only the five predefined entities (`&lt;`, `&gt;`, `&amp;`, `&apos;`, `&quot;`) and character references (`&#233;`, `&#xE9;`) are decoded.
- **Limits.** Nesting deeper than `maxDepth` (default 512, see [configuration](../configuration.md)) and documents of more than 200,000 nodes are refused with an error; content larger than `maxSize` is refused before parsing. The tree renders at most 20,000 rows at once.
- **Errors are reported, not thrown**, with their line and column.

## Limits

The parser checks well-formedness (matching tags, one root, quoted and unique attributes, valid references); it does not validate against a DTD or a schema. Encodings other than the text's own (UTF-16 strings in JavaScript) are not converted: load XML with `src` or set `content` as text.
