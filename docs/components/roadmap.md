# `<vt-roadmap>`

`<vt-roadmap>` shows a public roadmap as columns of items: planned, in progress, done, or columns of your own.

```html
<vt-roadmap json-src="/roadmap.json"></vt-roadmap>
```

## Format

A list of items, or an object with `items` (also `features`, `roadmap`) and optional `columns`.

```json
{
  "columns": [{ "id": "planned" }, { "id": "in-progress", "title": "Building now" }, { "id": "done" }],
  "items": [
    {
      "title": "Offline sync",
      "description": "Edit without a connection.",
      "status": "in-progress",
      "progress": 60,
      "tags": ["mobile"],
      "votes": 128,
      "when": "Q1 2027",
      "url": "https://example.com/offline"
    }
  ]
}
```

Statuses `planned`, `next`, `in-progress`, `beta` and `done` have translated names and come in that order; `todo`, `backlog`, `doing`, `in progress`, `shipped`, `released` and `completed` are read as one of them. Any other status gets a column of its own, after them. Declared `columns` come first, in their order.

## Attributes

| Attribute    | Type    | Default | Description                                                |
| ------------ | ------- | ------- | ---------------------------------------------------------- |
| `layout`     | string  | `board` | `board`: columns side by side; `list`: one under the other |
| `tag-filter` | boolean | on      | Tag buttons, when items have tags                          |

On a narrow element, the board stacks its columns. Shared attributes are in [Common attributes](../common-attributes.md).

## Events

| Event              | When                  | Detail           |
| ------------------ | --------------------- | ---------------- |
| `vt-filter-change` | The tag shown changed | `{ tag, shown }` |

## CSS parts

`column`, `column-title`, `item`, `progress`, `tag` and `tag-filter`, plus the [shared parts](../theming.md).
