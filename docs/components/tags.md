# `<vt-tags>`

`<vt-tags>` displays a list of tags, and in edit mode becomes a form field to select and create them: typing with autocompletion, `#tag` syntax, pasted lists, a "browse all" panel, suggestions from a backend, and validation rules for new tags. It takes part in HTML forms like a native field.

```html
<vt-tags>
  <template>["design", "research", "accessibility"]</template>
</vt-tags>
```

```html
<form action="/posts" method="post">
  <vt-tags name="topics" mode="edit" prefix="#" variant="full">
    <template>{ "value": ["design"], "options": ["design", "research", "a11y"] }</template>
  </vt-tags>
  <button>Save</button>
</form>
```

Every tag is displayed as text with DOM text APIs. Colors, links and part names coming from the data are validated before use (see [Security](../security.md#tags)).

## Variants

| Feature              | `simple` (default) | `full` |
| -------------------- | ------------------ | ------ |
| `header`             | off                | on     |
| `dot`                | off                | on     |
| `copy`               | off                | on     |
| `browse`             | off                | on     |
| `counts`             | off                | on     |
| `clear`              | off                | on     |
| `fullscreen`         | off                | on     |
| `allow-create`       | on                 | on     |
| `clickable`          | off                | off    |
| `edit-toggle`        | off                | off    |
| `search`, `download` | off                | off    |

`<vt-tags>` has no search and no download button, even when the `search` or `download` attribute is set. Every feature can be turned on or off individually, whatever the variant (see [Common attributes](../common-attributes.md#presets-are-shortcuts)).

## Data format

The content (the `content` property, `src`, a child `<template>` or data `<script>`, or the element text, as for every component) is JSON in one of two forms:

- **An array**: the selected tags.

  ```json
  ["design", "research"]
  ```

- **An object** with the selected tags in `value` and the available tags in `options`. `selected` and `tags` are accepted as other names for `value`.

  ```json
  {
    "value": ["design"],
    "options": ["design", "research", "accessibility", "performance"]
  }
  ```

Empty content is an empty selection. Content that is not valid JSON, or that is neither an array nor an object, shows the error "The tags must be a JSON array, or an object with "value" and "options"." This error is only displayed: it does not dispatch `vt-error`.

### Tag objects

Each tag is a string, a number, or an object:

```json
{
  "value": "a11y",
  "label": "Accessibility",
  "color": "#14b8a6",
  "group": "Quality",
  "description": "Keyboard, screen readers, contrast",
  "count": 12,
  "kind": "topic",
  "href": "/topics/a11y",
  "disabled": false
}
```

| Field         | Type    | Description                                                                                               | Validation                                                                                                                                                     |
| ------------- | ------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`       | string  | Identifier submitted with the form and compared to detect duplicates. Falls back to `label`, then `name`. | Required. Control characters become spaces, the text is trimmed and cut to 200 characters. A tag whose value ends up empty is dropped.                         |
| `label`       | string  | Text shown. Falls back to `name`, then `value`.                                                           | Same cleaning as `value`, 200 characters.                                                                                                                      |
| `color`       | string  | Accent color of the tag.                                                                                  | At most 60 characters; refused when it contains `;`, `{`, `}`, `<`, `>`, `\`, `url(`, `var(` or `expression`, or when `CSS.supports('color', value)` is false. |
| `group`       | string  | Group heading in the suggestions list and the browse panel.                                               | Cleaned, 100 characters.                                                                                                                                       |
| `description` | string  | Secondary text in the suggestions list; tooltip of the tag; also searched when filtering.                 | Cleaned, 300 characters.                                                                                                                                       |
| `count`       | number  | Number shown next to the tag (for example how many times it is used), when `counts` is on.                | Must be a finite number.                                                                                                                                       |
| `kind`        | string  | Style hook, exposed as the `tag-kind-<kind>` part.                                                        | Turned into a slug (see [Per-tag parts](#per-tag-parts)).                                                                                                      |
| `href`        | string  | Makes the tag a link in view mode.                                                                        | Must pass the [URL rules](../security.md#url-rules): relative URLs, `http:`, `https:`, `mailto:` and `tel:` only.                                              |
| `disabled`    | boolean | The tag cannot be selected or removed.                                                                    | Only `true` counts.                                                                                                                                            |

Invalid fields are dropped silently; the rest of the tag is kept. In each list, duplicates (same value, compared as described in [`case-sensitive`](#case-sensitive)) are dropped, keeping the first, and at most 100,000 entries are read.

When a selected value matches a known option (by value or by label), the option's details (label, color, count…) are used.

## View mode and edit mode

- **View mode** (default) shows the selected tags as a list. An empty selection shows "No tags". With `href`, a tag is a link; with `clickable`, tags are buttons that dispatch `vt-tag-click`.
- **Edit mode** (`mode="edit"`) shows the tags with a remove button each, followed by a text field. A status line under the field shows the number of selected tags ("3 tags", "1 tag", or "3 / 5 tags" with `max-tags`) and, for 4 seconds, the last message (for example "design is already selected.").

```html
<vt-tags mode="edit" placeholder="Add a topic">
  <template>["design"]</template>
</vt-tags>
```

The element is not editable, even with `mode="edit"`, when it has the `disabled` attribute or is inside a disabled `<fieldset>`.

`edit-toggle` adds a button that switches between the two modes. See [Editing](../editing.md) for the attributes shared with the other components.

## Adding tags

### Typing and autocompletion

While the field has focus, a list of suggestions (`role="listbox"`) opens under it. It contains, in this order and up to 50 entries:

1. the known options matching the typed text: options whose label, value or description contains it (case-insensitive), with labels that start with the text first;
2. suggestions from [`suggest-src`](#backend-suggestions-suggest-src) or the [`suggest`](#the-suggest-property) function that are not already listed;
3. a "Create "…"" entry, when `allow-create` is on and the typed text does not match an existing option (by value or label).

Options with a `group` are shown under a group heading. Already selected options show a check mark; choosing one again removes it.

While you type, the first entry is highlighted, so Enter picks it. When the text matches the start of an option, that option is chosen rather than a new tag being created; use the arrow keys to reach the "Create" entry.

### Separators

Typing a separator character ends the tag: the text typed so far is added. The default separators are `,` and `;`. Set others with `separators`:

```html
<vt-tags mode="edit" separators=",|"></vt-tags>
```

A new line always separates tags. Each piece of text is first matched against the known options (by value or label); a match adds the existing option, anything else goes through the [rules for new tags](#rules-for-new-tags).

### Prefix (`#tag`, `@name`)

`prefix` sets a prefix of up to 3 characters, such as `#` or `@`:

- typing the prefix starts a tag, and it is removed from the value (`#design` adds `design`);
- a space or a tab also ends a tag, so `#design #research ` adds two tags;
- labels are shown with the prefix, in the chips, the suggestions and the browse panel;
- the default placeholder becomes `#tag`.

```html
<vt-tags mode="edit" prefix="#" name="hashtags"></vt-tags>
```

### Paste

Pasting text that contains a separator, a new line, or (with a prefix) a space or a tab adds every tag found in it, appended to what is already in the field. Pasting text without any of them inserts it normally.

```text
design, research; accessibility
performance
```

pasted into an empty field adds four tags.

### Rules for new tags

A typed tag that is not an existing option is created only when all of these hold. Otherwise it is refused, and the reason is announced and shown in the status line.

| Rule                                                              | Message when refused           |
| ----------------------------------------------------------------- | ------------------------------ |
| `allow-create` is on (default)                                    | "x is not in the list."        |
| Length at most `maxlength` characters (1 to 200, default 50)      | "x is too long."               |
| Length at least `minlength` characters (1 to 200, default 1)      | "x is not a valid tag."        |
| Matches `pattern`, as a whole (like the HTML `pattern` attribute) | "x is not a valid tag."        |
| No listener of `vt-tag-create` called `preventDefault()`          | "x was refused."               |
| Not already selected                                              | "x is already selected."       |
| Fewer than `max-tags` tags are selected                           | "You can select up to 5 tags." |

`pattern` is compiled as `^(?:pattern)$` with the `u` flag. A pattern longer than 500 characters is ignored, and an invalid one is ignored with the console warning `[vitrine] Invalid pattern attribute on <vt-tags>.`

```html
<!-- Lowercase words and hyphens, 2 to 30 characters, at most 5 tags -->
<vt-tags mode="edit" pattern="[a-z0-9-]+" minlength="2" maxlength="30" max-tags="5"></vt-tags>

<!-- Only the listed options can be selected -->
<vt-tags mode="edit" allow-create="false" options-src="/api/categories.json"></vt-tags>
```

Existing options are added without these checks, except `disabled`, duplicates and `max-tags`. Created tags are added to the options, so they are suggested again.

When `max-tags` is reached, the field becomes read-only and its placeholder shows "You can select up to N tags."

### Browse panel

With `browse` on (full variant) and at least one known option, edit mode shows a "Browse all tags" button. It opens a panel listing every option with a checkbox, grouped by `group` (tags without a group go under "Other" when other tags have one), with a "Filter tags" field and the number of matching tags. The panel shows 200 options at a time, followed by a "Show 200 more" button. Disabled options, and unselected options when `max-tags` is reached, have a disabled checkbox.

```html
<vt-tags mode="edit" browse options-src="/api/tags/all.json"></vt-tags>
```

### Options from a URL (`options-src`)

`options-src` loads a JSON array of options (strings or tag objects) when the element is connected and whenever the attribute changes. It follows the same rules as `src`: same-origin unless `allow-remote` is set, `maxSize` and `fetchTimeout` limits (see [`src`](../common-attributes.md#src-and-allow-remote)). A response that is not a JSON array gives no options; a failed request logs `[vitrine] Could not load options-src.` in the console.

```html
<vt-tags mode="edit" options-src="/api/labels/popular"></vt-tags>
```

Options are merged in this order, without duplicates: the `options` property, the `options` of the content, `options-src`, then tags created by the user.

### Backend suggestions (`suggest-src`)

`suggest-src` is a URL template. 250 ms after the user stops typing, Vitrine replaces every `{query}` with the URL-encoded text of the field (trimmed) and fetches the URL. The response must be a JSON array of strings or tag objects; the first 50 valid entries are listed after the matching options. Anything that is not a JSON array gives no suggestions.

```html
<vt-tags mode="edit" name="labels" suggest-src="/api/labels?q={query}"></vt-tags>
```

- The request follows the `src` rules (same-origin unless `allow-remote`, `fetchTimeout`), with a size limit of 2,000,000 characters or `maxSize` if lower.
- A new keystroke cancels the pending request, and an answer for an older query is ignored.
- An empty field sends no request and clears the suggestions.
- Failures log `[vitrine] Tag suggestions failed.` in the console.
- The text is sent as it is in the field. With a prefix, it includes the prefix when the user typed it (`#des` is sent as `%23des`).

A backend endpoint only has to return JSON, for example with Flask:

```python
@app.get("/api/labels")
def labels():
    query = request.args.get("q", "").strip().lower()
    rows = Label.query.filter(Label.name.ilike(f"{query}%")).limit(20)
    return jsonify([
        {"value": row.slug, "label": row.name, "count": row.uses, "color": row.color}
        for row in rows
    ])
```

### The `suggest` property

Set `suggest` to a function to get suggestions from anywhere (a GraphQL client, an SDK, a local index). It receives the trimmed text and an `AbortSignal`, and returns (a promise of) an array of strings or tag objects. It takes precedence over `suggest-src`, with the same 250 ms delay, cancellation and limit of 50.

```js
const tags = document.querySelector('vt-tags');

tags.suggest = async (query, signal) => {
  const response = await fetch(`/api/labels?q=${encodeURIComponent(query)}`, { signal });
  return response.json();
};
```

Set it to `null` (or anything that is not a function) to remove it.

## Removing tags

- Click the remove button of a tag (named "Remove design").
- In an empty field, press Backspace once to highlight the last tag (announced as "Press Backspace again to remove design"), and a second time to remove it. Typing or leaving the field cancels the first press.
- With `clear` on (full variant), the "Remove all tags" button removes every tag except disabled ones.

Disabled tags have no remove button and are never removed by these actions.

## Attributes

This table lists the attributes specific to `<vt-tags>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute        | Type                        | Default                            | Description                                                  |
| ---------------- | --------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| `name`           | text                        | none                               | Form field name. See [Forms](#forms).                        |
| `value-format`   | `json`, `csv` or `lines`    | `json`                             | Format of the submitted value.                               |
| `required`       | boolean                     | off                                | The form cannot be submitted without at least one tag.       |
| `disabled`       | boolean                     | off                                | Not editable, and not submitted.                             |
| `allow-create`   | boolean                     | on                                 | Typed tags that are not options can be created.              |
| `max-tags`       | integer, 1 to 100,000       | no limit                           | Most tags that can be selected.                              |
| `maxlength`      | integer, 1 to 200           | `50`                               | Longest new tag, in characters.                              |
| `minlength`      | integer, 1 to 200           | `1`                                | Shortest new tag, in characters.                             |
| `pattern`        | regular expression          | none                               | Pattern a new tag must match as a whole.                     |
| `separators`     | characters                  | `,;`                               | Characters that end a tag while typing or pasting.           |
| `prefix`         | up to 3 characters          | none                               | Tag prefix such as `#` or `@`.                               |
| `case-sensitive` | boolean                     | off                                | `Design` and `design` are different tags.                    |
| `options-src`    | URL                         | none                               | Loads a JSON array of options.                               |
| `suggest-src`    | URL template with `{query}` | none                               | Backend suggestions while typing.                            |
| `browse`         | boolean                     | preset                             | "Browse all tags" button and panel (edit mode).              |
| `counts`         | boolean                     | preset                             | Shows the `count` of tags.                                   |
| `clickable`      | boolean                     | off                                | In view mode, tags are buttons that dispatch `vt-tag-click`. |
| `clear`          | boolean                     | preset                             | "Remove all tags" button (edit mode).                        |
| `appearance`     | `chip`, `outline` or `text` | `chip`                             | Tag style: filled chips, outlined chips, or plain text.      |
| `placeholder`    | text                        | `Add a tag` (`#tag` with a prefix) | Placeholder of the text field.                               |

`minlength` is read when a tag is created; it is not an observed attribute, so changing it does not re-render the element.

### `case-sensitive`

Values are compared after trimming and Unicode normalization (NFC). By default the comparison ignores case (`toLocaleLowerCase`), so `Design` and `design` are the same tag. With `case-sensitive`, they are different. The same comparison is used to detect duplicates, to match typed text with options, and to match selected values with options.

### `appearance`

```html
<vt-tags appearance="outline"><template>["draft", "review"]</template></vt-tags>
<vt-tags appearance="text" prefix="#"><template>["css", "a11y"]</template></vt-tags>
```

### `href` and `clickable`

In view mode, a tag with an `href` is a link. Links that are not in-page (`#…`) or root-relative (`/…`) get `rel="noopener noreferrer"`. Otherwise, with `clickable`, each tag is a button that dispatches `vt-tag-click`:

```html
<vt-tags clickable id="filters"><template>["open", "bug", "help wanted"]</template></vt-tags>
```

```js
document.getElementById('filters').addEventListener('vt-tag-click', (event) => {
  applyFilter(event.detail.tag.value);
});
```

## Properties

| Property  | Type       | Description                                                                                                                                                                     |
| --------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`   | `string[]` | The selected values. Setting it accepts an array of strings or tag objects, or a JSON string of such an array. It does not dispatch events.                                     |
| `tags`    | `Tag[]`    | The selected tags with their details (copies). Read-only.                                                                                                                       |
| `options` | `Tag[]`    | Every known option (merged, copies). Setting it accepts an array of strings or tag objects, or a JSON string; it replaces the options set through this property only.           |
| `suggest` | function   | `(query, signal) => Promise<array>`. See [The `suggest` property](#the-suggest-property).                                                                                       |
| `content` | `string`   | The JSON content. Setting it replaces the selection and the content options. Reading it returns the JSON last given, not the current selection: read `value` or `tags` instead. |

```js
const field = document.querySelector('vt-tags');
field.options = [
  { value: 'bug', color: '#b2384f', group: 'Type' },
  { value: 'feature', color: '#2f55c9', group: 'Type' },
  { value: 'docs', group: 'Area' },
];
field.value = ['bug'];

console.log(field.value); // ['bug']
console.log(field.tags[0].color); // '#b2384f'
```

`value`, `options`, `suggest` and `content` can be set before the element is defined; they are applied when it upgrades.

## Forms

`<vt-tags>` is a form-associated custom element. With a `name`, the selection is submitted with its form:

| `value-format`   | Submitted value for `design`, `a "b"` | Notes                                                |
| ---------------- | ------------------------------------- | ---------------------------------------------------- |
| `json` (default) | `["design","a \"b\""]`                | A JSON array of the values.                          |
| `csv`            | `design,"a ""b"""`                    | Values containing `"`, `,` or a new line are quoted. |
| `lines`          | `design` and `a "b"` on two lines     | One value per line.                                  |

```html
<form action="/posts" method="post">
  <label for="title">Title</label>
  <input id="title" name="title" required />

  <!-- Submitted as topics=["design","a11y"] -->
  <vt-tags name="topics" mode="edit" prefix="#" required max-tags="5" pattern="[a-z0-9-]+">
    <template>{ "options": ["design", "research", "a11y"] }</template>
  </vt-tags>

  <button>Publish</button>
</form>
```

```python
# Flask: read the JSON array
topics = json.loads(request.form.get("topics", "[]"))
```

- **`required`**: without any selected tag, the field is invalid (`valueMissing`) with the message "Select at least one tag.", so the browser blocks submission and reports it on the text field.
- **`disabled`**: the value is not submitted and the field is not editable. A disabled ancestor `<fieldset>` also makes it non-editable.
- **Reset**: resetting the form restores the selection given by the content (not a selection set later through the `value` property).
- `new FormData(form)` and `form.elements` include the element like any field.

### Validating new tags on the server

`vt-tag-create` is dispatched synchronously before a typed tag is added, and is cancelable: `preventDefault()` refuses the tag ("x was refused."). Simple rules can be checked directly:

```js
const field = document.querySelector('vt-tags');
const reserved = new Set(['admin', 'staff']);

field.addEventListener('vt-tag-create', (event) => {
  if (reserved.has(event.detail.tag.value.toLowerCase())) event.preventDefault();
});
```

A listener cannot wait for a network request before deciding. To validate with a backend, refuse the tag, ask the server, and add the tag yourself when it is accepted:

```js
field.addEventListener('vt-tag-create', async (event) => {
  event.preventDefault(); // the user sees "x was refused." until the server answers
  const { value } = event.detail.tag;
  const response = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!response.ok) return;
  const created = await response.json(); // for example { "value": "new-tag", "label": "New tag" }
  field.options = [...field.options, created];
  field.value = [...field.value, created.value];
});
```

Setting `value` updates the submitted value but dispatches no event; dispatch your own or update your state directly if you rely on `vt-change`.

## Events

| Event                                                | `detail`                                     | When                                                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `vt-change`                                          | `{ value, added, removed }`                  | The selection changed through the interface. `value` is the array of selected values; `added` and `removed` are arrays of tag objects. |
| `vt-tag-add`                                         | `{ tag }`                                    | A tag was added                                                                                                                        |
| `vt-tag-remove`                                      | `{ tag }`                                    | A tag was removed (once per tag when clearing)                                                                                         |
| `vt-tag-create`                                      | `{ tag }`                                    | A new tag is about to be created. Cancelable: `preventDefault()` refuses it.                                                           |
| `vt-tag-click`                                       | `{ tag }`                                    | A tag was activated in view mode, with `clickable`                                                                                     |
| `vt-ready`                                           | `{ type: "tags" }`                           | The tags were rendered                                                                                                                 |
| `vt-copy`                                            | `{ text }`                                   | The selection was copied                                                                                                               |
| `vt-mode-change`, `vt-fullscreen-change`, `vt-error` | see [Events](../common-attributes.md#events) |                                                                                                                                        |

`tag` objects in event details are copies with the fields listed in [Tag objects](#tag-objects). `vt-tag-add`, `vt-tag-remove` and `vt-tag-create` are not listed in `Vitrine.EVENTS`; use their names directly.

Changing the selection through the `value` property or the content dispatches no event. Unlike the editors of the other components, `<vt-tags>` dispatches `vt-change` immediately on each change, and does not dispatch `vt-input`.

```js
field.addEventListener('vt-change', (event) => {
  const { value, added, removed } = event.detail;
  console.log(value, added.map((t) => t.value), removed.map((t) => t.value));
});
```

## Copy

The copy button ("Copy") copies the selected values as a JSON array, for example `["design","research"]`.

## Customizing tags

### Custom properties

| Custom property      | Default                            | Description        |
| -------------------- | ---------------------------------- | ------------------ |
| `--vt-tag-bg`        | `--vt-surface-sunken` of the theme | Tag background     |
| `--vt-tag-fg`        | `--vt-fg` of the theme             | Tag text color     |
| `--vt-tag-border`    | `--vt-border` of the theme         | Tag border color   |
| `--vt-tag-radius`    | fully rounded (`--vt-radius-full`) | Tag corner radius  |
| `--vt-tag-height`    | `26px`                             | Tag height         |
| `--vt-tag-gap`       | `6px`                              | Space between tags |
| `--vt-tag-font-size` | `13px`                             | Tag font size      |

```css
vt-tags.compact {
  --vt-tag-height: 22px;
  --vt-tag-font-size: 12px;
  --vt-tag-radius: 4px;
  --vt-tag-gap: 4px;
}
```

A tag with a `color` gets a small dot of that color, and a border and background mixed from it; its background then no longer uses `--vt-tag-bg`. The label keeps the regular text color, so color is never the only signal.

### Per-tag parts

Each tag has three kinds of parts:

- `tag`, on every tag;
- `tag-<value>`, built from the tag value;
- `tag-kind-<kind>`, when the tag has a `kind`.

`<value>` and `<kind>` are slugs: the text is lowercased, accents are removed, every run of characters other than `a-z` and `0-9` becomes `-`, leading and trailing hyphens are removed, and the result is cut to 40 characters. A value with no such character (for example `日本`) gives `tag-x`.

| Tag value or kind | Part              |
| ----------------- | ----------------- |
| `urgent`          | `tag-urgent`      |
| `Help Wanted`     | `tag-help-wanted` |
| `Équipe`          | `tag-equipe`      |
| `C++`             | `tag-c`           |
| kind `status`     | `tag-kind-status` |

```css
/* One tag */
vt-tags::part(tag-urgent) {
  --vt-tag-bg: #fde8ec;
  --vt-tag-fg: #8a1c33;
  --vt-tag-border: #f2a5b4;
  font-weight: 700;
}

/* Every tag of a kind */
vt-tags::part(tag-kind-status) {
  border-style: dashed;
}

/* Every tag */
vt-tags::part(tag) {
  text-transform: lowercase;
}
```

Custom properties set through `::part()` apply inside that tag, so the first rule changes only the `urgent` tag.

### CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part                                    | Element                                                    |
| --------------------------------------- | ---------------------------------------------------------- |
| `tags`                                  | The list of tags                                           |
| `tag`, `tag-<value>`, `tag-kind-<kind>` | A tag                                                      |
| `tag-label`                             | The text of a tag (with the prefix)                        |
| `tag-count`                             | The count of a tag                                         |
| `tag-remove`                            | The remove button of a tag (it also has `button`)          |
| `field`                                 | The editable area (tags and text field)                    |
| `input`                                 | The text field                                             |
| `listbox`                               | The suggestions list                                       |
| `option`, `option-active`               | A suggestion; the highlighted one also has `option-active` |
| `group`                                 | A group heading in the suggestions list                    |
| `browse-button`                         | The "Browse all tags" button                               |
| `browse-panel`                          | The browse panel                                           |
| `clear-button`                          | The "Remove all tags" button                               |
| `tags-status`                           | The count and messages under the field                     |

## Keyboard

In the text field (edit mode):

| Key                   | Action                                                                        |
| --------------------- | ----------------------------------------------------------------------------- |
| Down / Up arrow       | Open the suggestions and move the highlight (wraps around)                    |
| Home / End            | With the list open and the field empty: first / last suggestion               |
| Enter                 | Choose the highlighted suggestion; with none highlighted, add the typed text  |
| A separator character | Add the typed text                                                            |
| Escape                | Close the suggestions; when they are closed, clear the field                  |
| Backspace             | In an empty field: highlight the last tag, then remove it on the second press |
| Tab                   | Move to the next control (the list closes when the field loses focus)         |

The field is a combobox (`role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`), and the highlighted option is exposed with `aria-activedescendant`, so focus stays in the field. Options have `role="option"` and `aria-selected`; disabled ones have `aria-disabled="true"`. The list is `aria-multiselectable`. The field is described by the status line. Additions, removals and refusals are announced through the live region. See [Accessibility](../accessibility.md#tags-combobox).

## Limits

| Limit                  | Value                              | Configurable |
| ---------------------- | ---------------------------------- | ------------ |
| Maximum content size   | 2,097,152 characters               | `maxSize`    |
| Entries read per list  | 100,000                            | No           |
| Value and label        | 200 characters                     | No           |
| Group / description    | 100 / 300 characters               | No           |
| Color value            | 60 characters                      | No           |
| Part name slug         | 40 characters                      | No           |
| Suggestions listed     | 50                                 | No           |
| Browse panel page      | 200 options                        | No           |
| Suggestion delay       | 250 ms                             | No           |
| `suggest-src` response | 2,000,000 characters, or `maxSize` | `maxSize`    |
| Text field             | 2,000 characters                   | No           |
| `prefix`               | 3 characters                       | No           |
| `pattern`              | 500 characters                     | No           |

## Examples

### Read-only tags with colors and links

```js
document.querySelector('#labels').content = JSON.stringify([
  { value: 'bug', color: '#b2384f', href: '/issues?label=bug' },
  { value: 'docs', color: '#2f55c9', href: '/issues?label=docs', count: 4 },
]);
```

```html
<vt-tags id="labels" counts></vt-tags>
```

### Hashtags with a backend

```html
<vt-tags
  mode="edit"
  name="hashtags"
  prefix="#"
  maxlength="30"
  pattern="[\p{L}\p{N}_]+"
  suggest-src="/api/hashtags?q={query}"
></vt-tags>
```

### A closed list of categories, grouped, with a browse panel

```html
<vt-tags mode="edit" name="categories" allow-create="false" browse max-tags="3">
  <script type="application/json">
    {
      "value": [],
      "options": [
        { "value": "frontend", "group": "Engineering" },
        { "value": "backend", "group": "Engineering" },
        { "value": "ux", "label": "UX research", "group": "Design" },
        { "value": "legacy", "disabled": true }
      ]
    }
  </script>
</vt-tags>
```

### Submitted as one value per line

```html
<vt-tags name="keywords" mode="edit" value-format="lines"></vt-tags>
```

### Toggle between view and edit

```html
<vt-tags variant="full" edit-toggle label="Topics" name="topics">
  <template>["design", "research"]</template>
</vt-tags>
```
