# `<vt-search>`

`<vt-search>` is a site search ready for a menu. A button with its keyboard shortcut opens a dialog that searches as you type, with results grouped by section, the words found highlighted, recent searches and suggestions. It can also sit in the page as a search field.

```html
<nav>
  <a href="/">Home</a>
  <a href="/docs/">Docs</a>
  <vt-search index-src="/search.json" url-template="/docs/{id}"></vt-search>
</nav>
```

The search at the top of this site is a `<vt-search>`.

## Index

Entries come from a JSON index: the content of the element, `data`, or the file at `index-src`, loaded the first time the search opens so pages load no faster or slower.

```json
[
  {
    "id": "6ecd8c99-4036-403d-bf84-cf8400f67836",
    "title": "Getting started",
    "section": "Guides",
    "content": "Install from a CDN or npm and add your first element.",
    "keywords": ["install", "setup"],
    "featured": true
  },
  { "id": "board", "title": "<vt-board>", "section": "Components", "url": "/docs/board" }
]
```

| Key        | Description                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| `id`       | Unique id, such as a UUID or a slug; `uuid`, `slug` and `key` are read too                                  |
| `title`    | Title (required); `name` and `label` are read too                                                           |
| `section`  | Group of the result; `category`, `group` and `type` are read too                                            |
| `content`  | Text searched, shown as an extract around the words found; `description`, `summary` and `text` are read too |
| `keywords` | Words searched but never shown; `tags` is read too                                                          |
| `url`      | Address of the result (safe schemes only). Without it, `url-template` is used                               |
| `featured` | Suggested before anything is typed                                                                          |

The index can also be `{ "entries": [...] }` (or `items`, `pages`, `results`, `documents`, `hits`). Entries with a repeated id are skipped.

## Addresses from ids

An entry without `url` gets its address from `url-template`, with `{id}` replaced by the id, encoded: `url-template="/docs/{id}"` sends `6ecd8c99-…` to `/docs/6ecd8c99-…`. Templates with an unsafe scheme give no address.

Choosing a result fires `vt-select`. Cancel it to route the result yourself, in a single-page app:

```js
document.querySelector('vt-search').addEventListener('vt-select', (event) => {
  event.preventDefault();
  router.push(`/docs/${event.detail.id}`);
});
```

## Searching

Every word typed must be found. Case and accents are ignored ("acces" finds "Accessibilité"), and a word of four letters or more may have one typo. Results are ranked by where the words are found: the title first (whole words, then starts of words), then keywords, section and content.

With `search-src`, your server searches instead: `{query}` is replaced by the encoded words, after a short pause in typing, and the answer is an index in the format above. A request still running is canceled when the reader types on.

```html
<vt-search search-src="/api/search?q={query}" url-template="/item/{id}"></vt-search>
```

## Keyboard

| Key                 | Where                                                 |
| ------------------- | ----------------------------------------------------- |
| Ctrl K, ⌘ K, /      | Anywhere on the page: opens the search (`shortcut`)   |
| ↑ ↓                 | Moves between results                                 |
| Enter               | Opens the result                                      |
| Ctrl Enter, ⌘ Enter | Opens the result in a new tab                         |
| Escape              | Closes the dialog; in a field, clears it, then leaves |

`/` does nothing while the reader types in a field. `shortcut` takes other keys, separated by spaces, such as `mod+k shift+f` (`mod` is ⌘ on Apple devices and Ctrl elsewhere), or `none`. The button shows the first shortcut, and `aria-keyshortcuts` gives them all to screen readers.

## Recent searches

The last results chosen are kept in this browser (`localStorage`) and shown when the search opens, with a button to clear them. `recent="false"` turns this off. Nothing is kept when storage is unavailable.

## Accessibility

The field is a combobox and the results a listbox: the active result is read with its section, and the number of results is announced as it changes. The dialog is a modal `<dialog>`: the focus stays in it and returns to the button when it closes. On phones the dialog fills the screen.

## Attributes

| Attribute      | Type    | Default   | Description                                                         |
| -------------- | ------- | --------- | ------------------------------------------------------------------- |
| `index-src`    | string  | none      | Address of the JSON index, loaded when the search first opens       |
| `search-src`   | string  | none      | Address of a search API, with `{query}`                             |
| `url-template` | string  | none      | Address of an entry without `url`, with `{id}`                      |
| `shortcut`     | string  | `mod+k /` | Keys that open the search, or `none`                                |
| `layout`       | string  | `dialog`  | `dialog` (a button that opens it) or `inline` (a field in the page) |
| `limit`        | number  | `12`      | Results shown                                                       |
| `recent`       | boolean | on        | Remembers the results chosen                                        |
| `group`        | boolean | on        | Groups results by section                                           |
| `link-target`  | string  | `_self`   | Where results open: `_self` or `_blank`                             |

`label` names the button and the dialog, and `placeholder` the field; see [Common attributes](../common-attributes.md).

## Events

| Event       | When                             | Detail                               |
| ----------- | -------------------------------- | ------------------------------------ |
| `vt-search` | Results were shown               | `{ query, matches }`                 |
| `vt-select` | A result was chosen (cancelable) | `{ id, url, title, section, query }` |
| `vt-toggle` | The dialog opened or closed      | `{ expanded }`                       |

## Methods

`open()` opens the search, and `close()` closes it. `entries` holds the entries read.

## CSS parts

`trigger`, `shortcut`, `dialog`, `input`, `results`, `result` and `match`, plus the [shared parts](../theming.md).
