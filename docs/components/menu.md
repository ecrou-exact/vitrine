# `<vt-menu>`

`<vt-menu>` is a menu of actions: a button that opens a menu, a "⋮" button for the actions of a row, a menu that opens on a right click on an element of the page, or a list of actions always shown. Items are actions, links, check boxes, radio groups, headings and separators, with shortcuts, icons and submenus.

```html
<vt-menu label="File">
  <template data-json>
    [
      { "label": "Rename", "icon": "pencil", "shortcut": "F2" },
      { "label": "Share", "items": ["Copy link", { "label": "Email", "description": "Send to a teammate" }] },
      "---",
      { "type": "radio", "label": "Sort by", "group": "sort", "items": [{ "label": "Name", "checked": true }, "Date"] },
      { "type": "checkbox", "label": "Show hidden files" },
      "---",
      { "label": "Delete", "danger": true, "icon": "trash", "shortcut": "Del" }
    ]
  </template>
</vt-menu>
```

```js
document.querySelector('vt-menu').addEventListener('vt-select', (event) => {
  const { id, checked } = event.detail;
  if (id === 'delete') removeFile();
});
```

## Four ways to open

| `trigger` | What is shown                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `button`  | A button with the label (default)                                                                                                    |
| `icon`    | A "⋮" button; the label is its name for screen readers                                                                               |
| `context` | Nothing: a right click (or Shift + F10) on the parent element, or on the element named by `for`, opens the menu where the pointer is |
| `inline`  | The list of actions, always shown                                                                                                    |

```html
<div id="canvas">…</div>
<vt-menu trigger="context" for="canvas" label="Canvas">
  <template data-json>["Cut", "Copy", "Paste", "---", "Select all"]</template>
</vt-menu>
```

The menu is placed inside the window: under its button, or above it when there is no room below, and lined up with its start or, with `align="end"`, its end. Submenus open on the side that has room. A scroll or a resize of the page closes it.

## Items

A list of items, as JSON, where each item is a string (its label), `"---"` (a separator), or an object:

| Key           | Description                                                                   |
| ------------- | ----------------------------------------------------------------------------- |
| `label`       | Text of the item (required)                                                   |
| `id`          | Id sent with `vt-select`; made from the label when missing                    |
| `type`        | `item` (default), `checkbox`, `radio`, `heading` or `separator`               |
| `description` | A second line, in smaller text                                                |
| `shortcut`    | Shown on the right, such as `Ctrl+S`. It is only shown: add the key yourself  |
| `icon`        | A name of the icons of Vitrine, such as `pencil`, `copy`, `trash`, `download` |
| `href`        | Makes the item a link (safe schemes only); `target: "_blank"` opens a new tab |
| `disabled`    | Shown, but cannot be chosen                                                   |
| `danger`      | A destructive action, shown in red                                            |
| `checked`     | A check box or radio item checked at first                                    |
| `group`       | Radio items of the same group: choosing one unchecks the others               |
| `items`       | A submenu (up to four levels)                                                 |

`{ "type": "radio", "label": "Sort by", "items": [...] }` writes a heading over radio items of one group. Check boxes and radio items keep the menu open, so several can be changed.

Lines of text work too: one item per line, `---` for a separator, `# Title` for a heading, two spaces before a line to put it in the submenu of the line above, `[x]` or `[ ]` for a check box, and `Label | Ctrl+S` for a shortcut.

```html
<vt-menu label="Edit">
  Undo | Ctrl+Z
  Redo | Ctrl+Y
  ---
  Insert
    Image
    Table
  [x] Spell check
</vt-menu>
```

## Keyboard

The menu button pattern of WAI-ARIA:

| Key             | Action                                               |
| --------------- | ---------------------------------------------------- |
| Enter, Space, ↓ | On the button: opens the menu on its first item      |
| ↑               | On the button: opens the menu on its last item       |
| ↓ ↑, Home, End  | Next, previous, first and last item                  |
| A letter        | Next item that starts with it                        |
| →               | Opens a submenu                                      |
| ←               | Closes a submenu                                     |
| Enter, Space    | Chooses the item                                     |
| Escape          | Closes the menu; the focus goes back to where it was |
| Tab             | Closes the menu and moves on                         |

## Choosing an item

`vt-select` is sent with `{ id, label, value, checked, href }`. `checked` is the new state of a check box (`true` for a radio item, `null` for an action). The event can be canceled: a link is then not followed, so a single-page app can handle the navigation, and a check box keeps its state.

## Attributes

| Attribute  | Type    | Default  | Description                                                 |
| ---------- | ------- | -------- | ----------------------------------------------------------- |
| `trigger`  | string  | `button` | `button`, `icon`, `context` or `inline`                     |
| `label`    | string  | Actions  | Text of the button, and name of the menu                    |
| `for`      | string  | parent   | With `context`: id of the element that opens the menu       |
| `align`    | string  | `start`  | Side of the button the menu lines up with: `start` or `end` |
| `disabled` | boolean | off      | The button cannot be used                                   |

Shared attributes are in [Common attributes](../common-attributes.md).

## Properties

`items` is the list read, with the state of check boxes and radio items. `open` tells whether the menu is open; setting it opens or closes the menu.

## Events

| Event       | When                      | Detail                                |
| ----------- | ------------------------- | ------------------------------------- |
| `vt-select` | An item was chosen        | `{ id, label, value, checked, href }` |
| `vt-toggle` | The menu opened or closed | `{ expanded }`                        |

## CSS parts

`trigger`, `menu`, `item`, `shortcut`, `separator` and `heading`.
