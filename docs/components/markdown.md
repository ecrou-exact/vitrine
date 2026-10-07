# `<vt-markdown>`

`<vt-markdown>` renders GitHub Flavored Markdown (GFM) as sanitized HTML: headings, emphasis, links, images, lists, task lists, tables, block quotes, and fenced code blocks with syntax highlighting. It can also show the Markdown source, side by side with the preview, a table of contents and heading anchors.

```html
<vt-markdown>
  <script type="text/markdown">
    # Hello

    Some **bold** text and a [link](https://example.com).
  </script>
</vt-markdown>
```

The output always goes through a strict sanitizer. Raw HTML written in the Markdown is shown as text unless `allow-html` is set, and even then scripts, event handlers, styles, iframes, forms and dangerous URLs are removed. See [Security](../security.md).

## Variants

| Feature                      | `simple` (default) | `full`                 |
| ---------------------------- | ------------------ | ---------------------- |
| `header`                     | off                | on                     |
| `dot`                        | off                | on                     |
| `copy`                       | off                | on                     |
| `search`                     | off                | on                     |
| `toc`                        | off                | on                     |
| `anchors`                    | off                | on                     |
| Tabs                         | none               | Preview, Source, Split |
| `line-numbers` (source view) | on                 | on                     |
| `sync-scroll` (split view)   | on                 | on                     |
| `split-controls`             | off                | on                     |
| `download`                   | off                | on                     |
| `fullscreen`                 | off                | on                     |

```html
<vt-markdown variant="full" label="README.md" src="/README.md"></vt-markdown>
```

## Attributes

This table lists the attributes specific to `<vt-markdown>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute        | Type                                                 | Default                         | Description                                               |
| ---------------- | ---------------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| `tabs`           | comma-separated list of `preview`, `source`, `split` | none (simple), all three (full) | Tabs shown in the tab list, in the given order.           |
| `default-tab`    | `preview`, `source` or `split`                       | `preview`                       | Initially active view.                                    |
| `toc`            | boolean                                              | preset                          | Shows a table of contents built from the headings.        |
| `anchors`        | boolean                                              | preset                          | Adds a permalink anchor to each heading.                  |
| `allow-html`     | boolean                                              | off                             | Renders raw HTML found in the Markdown (still sanitized). |
| `external-links` | `new-tab` or `same`                                  | `new-tab`                       | How links to other origins open.                          |
| `images`         | `allow`, `block` or `same-origin`                    | `allow`                         | Image policy.                                             |
| `line-numbers`   | boolean                                              | on                              | Line numbers in the source view.                          |
| `split-preview`  | `right`, `left`, `bottom` or `top`                   | `right`                         | Where the preview goes in the split view.                 |
| `sync-scroll`    | boolean                                              | on                              | Keeps the two panes of the split view scrolled together.  |
| `split-controls` | boolean                                              | preset                          | Swap, stack and scroll sync buttons in the split view.    |

### Tabs: `tabs` and `default-tab`

The element has three views:

- **Preview**: the rendered Markdown.
- **Source**: the Markdown text, highlighted, with line numbers.
- **Split**: preview and source side by side, or stacked. See [Split layout](#split-layout).

`tabs` chooses which tabs appear, in order. Unknown names and duplicates are ignored. A tab list is only shown when at least two tabs remain.

```html
<!-- Source first, preview second; split is not offered -->
<vt-markdown tabs="source,preview" default-tab="source" header src="/guide.md"></vt-markdown>
```

`default-tab` selects the view shown first. If it is not one of the visible tabs, `preview` is used when available, otherwise the first visible tab. Without any tab list, `default-tab` still chooses the view, so `<vt-markdown default-tab="split">` shows the split view with no tabs.

When the user picks a tab, a `vt-tab-change` event is dispatched. Changing the `tabs` or `default-tab` attribute resets the user's choice.

Tabs follow the WAI-ARIA tabs pattern with automatic activation:

| Key                | Action                             |
| ------------------ | ---------------------------------- |
| Left / Right arrow | Previous / next tab (wraps around) |
| Home / End         | First / last tab                   |

### Split layout

#### `split-preview`

Sets where the preview goes in the split view, relative to the source:

| Value             | Layout                                   |
| ----------------- | ---------------------------------------- |
| `right` (default) | Source on the left, preview on the right |
| `left`            | Preview on the left, source on the right |
| `bottom`          | Source on top, preview below             |
| `top`             | Preview on top, source below             |

Panes are in reading order in the document: the left (or top) pane comes first for keyboard and screen reader users.

```html
<vt-markdown default-tab="split" split-preview="bottom" src="/guide.md"></vt-markdown>
```

#### Heights

In the split view, each pane scrolls on its own. Their height is set by `max-height` when it is valid, and is `min(70vh, 640px)` otherwise:

- side by side (`right`, `left`): each pane has that height;
- stacked (`bottom`, `top`): each pane has half of it.

In full screen, the panes fill the screen.

#### Narrow containers

When the element is 640px wide or less (a container query on the element itself, not on the window), side-by-side panes are stacked, each with half the height. The pane order stays the same: with `right`, the source is on top and the preview below.

#### `sync-scroll`

On by default. Scrolling one pane scrolls the other to the same place, in both directions. Every rendered block (paragraph, heading, list, table, code block…) is matched with the source line where it starts, and the scroll position is interpolated between the two closest matches, so long code blocks or images do not make the panes drift apart. The tops and the bottoms of both panes always match. The matches are measured again when a pane changes size (images loading, fonts, resizing).

Set `sync-scroll="false"` to let the panes scroll independently.

#### `split-controls`

On in the full variant. In the split view, it adds three buttons to the toolbar:

| Button         | Action                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Swap panes     | Exchanges the two panes: `right` and `left`, or `bottom` and `top`                                       |
| Stack panes    | Switches between side by side and stacked (`right` and `bottom`, `left` and `top`); pressed when stacked |
| Sync scrolling | Turns scroll sync on or off; pressed when on                                                             |

Each click dispatches `vt-layout-change` with `{ preview, sync }`, for example `{ preview: "bottom", sync: true }`. The choice lasts until the element is removed from the page or the `split-preview` (for the layout) or `sync-scroll` (for the sync) attribute changes. To remember it across visits, store the event detail and set the attributes:

```js
const doc = document.querySelector('vt-markdown');
const saved = JSON.parse(localStorage.getItem('md-layout') ?? 'null');
if (saved) {
  doc.setAttribute('split-preview', saved.preview);
  doc.setAttribute('sync-scroll', String(saved.sync));
}
doc.addEventListener('vt-layout-change', (event) => {
  localStorage.setItem('md-layout', JSON.stringify(event.detail));
});
```

### `toc`

Shows a collapsible "Table of contents" (open by default) above the rendered Markdown, linking to every heading. It is only shown when the document has more than one heading. The list is indented relative to the highest heading level used (up to three extra levels of indentation) and holds at most 300 entries.

### `anchors`

Adds a link icon at the end of each heading, pointing to the heading's id. Its accessible name is "Link to this section: " followed by the heading text.

### Heading ids

Every heading gets an id, whether or not `anchors` or `toc` are on. Ids follow the same rules as GitHub, so a link such as `guide.md#install` works both on GitHub and in `<vt-markdown>`: the heading text is lowercased, characters other than letters, digits, spaces, `-` and `_` are removed, and spaces become `-`. Ids are cut to 100 characters. Duplicates get a numeric suffix:

| Heading                  | Id                |
| ------------------------ | ----------------- |
| `# Getting started`      | `getting-started` |
| `## Usage`               | `usage`           |
| `## Usage` (second time) | `usage-1`         |
| `## Équipe`              | `équipe`          |
| `## C++ & Rust`          | `c--rust`         |
| `## !!!`                 | `section`         |

Write in-document links with these ids:

```markdown
See [Usage](#usage).
```

Headings live inside the element's shadow root. Vitrine handles clicks on `#…` links itself: it scrolls to the heading inside the element and moves focus to it, without changing the page URL. Smooth scrolling is used unless the user prefers reduced motion. Clicks with a modifier key (Ctrl, Cmd, Shift) or a non-primary button are left to the browser.

### `allow-html`

By default, raw HTML in the Markdown (such as `<b>` or `<div>`) is shown as text:

```markdown
Hello <b>world</b>
```

displays `Hello <b>world</b>` literally.

With `allow-html`, raw HTML is rendered, but only through the sanitizer's allow-list: tags such as `<b>`, `<kbd>`, `<details>`, `<summary>`, `<sub>`, `<sup>` and tables are kept, while `<script>`, `<style>`, `<iframe>`, `<form>`, `<svg>`, event handlers, `style`, `id` and `data-*` attributes are always removed. The text of removed elements is kept. The full lists are in [Security](../security.md#allowed-tags-and-attributes).

```html
<vt-markdown allow-html>
  <script type="text/markdown">
    Press <kbd>Ctrl</kbd> + <kbd>K</kbd>.

    <details>
    <summary>More</summary>

    Hidden details.

    </details>
  </script>
</vt-markdown>
```

### `external-links`

Links whose URL resolves to another origin always get `rel="noopener noreferrer nofollow"`.

- `new-tab` (default): they also get `target="_blank"`.
- `same`: they open in the same tab.

Links to the same origin and in-document links (`#…`) are left unchanged.

### `images`

| Value             | Behavior                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `allow` (default) | Images with `http:`, `https:` or relative URLs are shown. Raster `data:` images (PNG, GIF, JPEG, WebP, AVIF, base64) are also allowed. |
| `same-origin`     | Only images from the page's origin are shown. `data:` images are blocked.                                                              |
| `block`           | No image is shown.                                                                                                                     |

A blocked image is replaced by a placeholder showing its alternative text (or a small square when there is none), with the URL as a tooltip. Blocked images are never requested.

Displayed images get `loading="lazy"`, `decoding="async"` and `referrerpolicy="no-referrer"`. SVG `data:` images and unsafe URLs are always blocked.

```html
<!-- Avoid tracking pixels in user content -->
<vt-markdown images="same-origin" id="comment"></vt-markdown>
```

### Relative URLs with `src`

When the Markdown is loaded with `src`, relative link and image URLs are resolved against the Markdown file's URL, not the page URL:

```html
<vt-markdown src="/docs/guide/intro.md"></vt-markdown>
```

In `intro.md`, `[next](next.md)` points to `/docs/guide/next.md` and `![logo](img/logo.png)` loads `/docs/guide/img/logo.png`.

This only applies to content loaded with `src`. Content from the `content` property or written inline resolves relative URLs against the page.

### `line-numbers`

Line numbers in the source view. On by default in both variants; set `line-numbers="false"` to hide them.

## What is rendered

- GFM syntax: tables (column alignment), task lists, strikethrough, autolinks, fenced code blocks. Single line breaks do not create `<br>` elements.
- Fenced code blocks are highlighted when their language is known (` ```js `, ` ```python `…). Non-bundled languages are loaded on demand, then the block is highlighted. Blocks longer than the `highlightLimit` setting are shown without highlighting.
- With `copy` on, each fenced code block gets its own "Copy code" button.
- Task list checkboxes are shown disabled, and named after their item text for screen readers.
- Tables are wrapped in a focusable, horizontally scrollable region.
- Code blocks are focusable so keyboard users can scroll them.

## Properties

| Property  | Type     | Description                                                                               |
| --------- | -------- | ----------------------------------------------------------------------------------------- |
| `content` | `string` | The Markdown source. Setting it overrides `src` and inline content; `null` restores them. |

```js
const preview = document.querySelector('#preview');
editor.addEventListener('input', () => {
  preview.content = editor.value;
});
```

## Events

| Event                                     | `detail`                                        | When                                            |
| ----------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| `vt-ready`                                | `{ type: "markdown" }`                          | The Markdown was rendered                       |
| `vt-tab-change`                           | `{ tab }`: `"preview"`, `"source"` or `"split"` | The user changed the tab                        |
| `vt-layout-change`                        | `{ preview, sync }`                             | A split control button was used                 |
| `vt-copy`                                 | `{ text }`                                      | The source or a code block was copied           |
| `vt-search`                               | `{ query, matches }`                            | A search ran                                    |
| `vt-error`                                | `{ message, cause }`                            | Loading or rendering failed                     |
| `vt-input`, `vt-change`, `vt-mode-change` | `{ value }`, `{ value }`, `{ mode }`            | Edit mode (see [Editing](../editing.md#events)) |
| `vt-fullscreen-change`                    | `{ fullscreen }`                                | Full screen entered or left                     |

## Search

Search covers the visible views. In the split view, matches are counted in the preview first, then in the source. Heading anchors are not searched.

## Copy and download

- The header copy button ("Copy source") copies the whole Markdown source.
- `download` (on in the full variant) saves the source as `text/markdown`. The file name is the value of the `download` attribute, else a `label` or `title` that ends with an extension, else `document.md`.

```html
<vt-markdown download="changelog.md" label="Changelog" src="/CHANGELOG.md"></vt-markdown>
```

## Editing

With `mode="edit"`, the source pane becomes an editor and the preview follows as you type. The split view is shown by default when available. See [Editing](../editing.md#vt-markdown).

```html
<vt-markdown mode="edit" variant="full" label="post.md" src="/drafts/post.md"></vt-markdown>
```

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part                                    | Element                                     |
| --------------------------------------- | ------------------------------------------- |
| `markdown`                              | The rendered Markdown article               |
| `body preview`                          | The preview pane (it has both names)        |
| `body source`                           | The source pane (it has both names)         |
| `toc`                                   | The table of contents                       |
| `anchor`                                | A heading permalink                         |
| `code-block`                            | The wrapper of a fenced code block          |
| `tabs`, `tab`, `tab-active`             | The tab list and its tabs                   |
| `code`, `line`, `gutter`, `line-number` | The source view (same parts as `<vt-code>`) |
| `swap-button`                           | The "Swap panes" button                     |
| `stack-button`                          | The "Stack panes" button                    |
| `sync-button`                           | The "Sync scrolling" button                 |

```css
vt-markdown::part(markdown) {
  max-width: 72ch;
  margin-inline: auto;
}

vt-markdown::part(toc) {
  border-style: dashed;
}
```

## Fonts

The rendered Markdown inherits the font of the host page by default, because it is the page's content. The header, tabs and other controls keep the interface font.

| Custom property       | Default   | Description                        |
| --------------------- | --------- | ---------------------------------- |
| `--vt-font-body`      | inherited | Font of the rendered Markdown      |
| `--vt-font-size-body` | inherited | Font size of the rendered Markdown |

```css
vt-markdown {
  --vt-font-body: Georgia, serif;
  --vt-font-size-body: 1.0625rem;
}
```

## Limits

| Limit                                           | Value                                   | Configurable     |
| ----------------------------------------------- | --------------------------------------- | ---------------- |
| Maximum content size                            | 2,097,152 characters                    | `maxSize`        |
| Highlighting of the source view and code blocks | Skipped above 300,000 characters        | `highlightLimit` |
| Table of contents entries                       | 300                                     | No               |
| Heading id length                               | 100 characters, plus a duplicate suffix | No               |
| Search matches                                  | 5,000                                   | No               |

If the Markdown parser fails (for example on pathological nesting), an error is shown and `vt-error` is dispatched; the page keeps working.

## Examples

### User-written Markdown, locked down

```html
<vt-markdown id="comment" images="block" external-links="new-tab"></vt-markdown>
```

```js
document.getElementById('comment').content = commentFromServer;
```

### Documentation page with all views

```html
<vt-markdown
  variant="full"
  label="Installation"
  src="/docs/install.md"
  default-tab="preview"
  max-height="70vh"
></vt-markdown>
```

### Source view only

```html
<vt-markdown default-tab="source" src="/notes.md"></vt-markdown>
```
