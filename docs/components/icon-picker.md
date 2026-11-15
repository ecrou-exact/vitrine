# `<vt-icon-picker>`

`<vt-icon-picker>` is an icon field for forms and admin pages: about 7,000 free icons, searched by name and keyword, chosen with the mouse or the keyboard, and submitted as `set:name`. Use it wherever people choose an icon: menu items, categories, tags, status pages, a country.

```html
<form>
  <vt-icon-picker name="icon" label="Menu icon" value="fa-solid:house"></vt-icon-picker>
</form>
```

## Icon sets

| Set id       | Icons                                                                                  | License                   | Code copied           |
| ------------ | -------------------------------------------------------------------------------------- | ------------------------- | --------------------- |
| `fa-solid`   | Font Awesome Free solid (about 2,000)                                                  | Icons CC BY 4.0, code MIT | `fa-solid fa-house`   |
| `fa-regular` | Font Awesome Free regular                                                              | Icons CC BY 4.0, code MIT | `fa-regular fa-heart` |
| `fa-brands`  | Font Awesome Free brands (GitHub, Discord, Stripe…)                                    | Icons CC BY 4.0, code MIT | `fa-brands fa-github` |
| `lucide`     | Lucide (about 2,000)                                                                   | ISC                       | `lucide-house`        |
| `bootstrap`  | Bootstrap Icons (about 2,000)                                                          | MIT                       | `bi bi-house`         |
| `flags`      | The flag of every country and region, searched by country, code, capital and continent | MIT (flag-icons)          | `fi fi-fr`            |

Each set is a file of `dist/vendor/icons/`, loaded the first time a picker shows it: a page with a picker downloads only the sets its readers open. `sets="fa-solid,flags"` offers only those, in that order. Font Awesome icons are under CC BY 4.0: the SVG copied keeps the credit Font Awesome puts in its own files, and the preview links to each license.

Add your own sets with [`registerIconSet()`](../configuration.md#registericonsetset).

## Choosing

The field shows the icon chosen and its name; the button opens a panel with the set, a search field and the icons. Search matches names first, then keywords (`love` finds `heart`), and every word must match. The icon under the focus is shown large with its name, its code and its license, and buttons that copy its SVG, its code or its `set:name`. The last icons chosen come back first, under Recent (kept in `localStorage`).

| Key                 | In the icons                        |
| ------------------- | ----------------------------------- |
| Arrow keys          | Move by one icon, or one row        |
| Home / End          | First / last icon                   |
| Page Up / Page Down | Four rows                           |
| Enter, Space        | Choose the icon                     |
| Arrow Down          | From the search field, to the icons |
| Escape              | Close the panel, back to the field  |

`inline` shows the icons in the page instead of a popup: an icon browser for a documentation site.

## Forms

The picker takes part in `<form>` like a native field: its `name` is submitted with `set:name`, `required` blocks the form until an icon is chosen, and reset and `disabled` (also from a `<fieldset>`) work.

## Attributes

| Attribute  | Type    | Default   | Description                                 |
| ---------- | ------- | --------- | ------------------------------------------- |
| `value`    | string  | —         | The icon chosen at first: `set:name`        |
| `name`     | string  | —         | Name of the field in a form                 |
| `sets`     | string  | every set | Sets offered, separated by commas           |
| `inline`   | boolean | off       | The icons in the page instead of in a popup |
| `label`    | string  | —         | Label of the field                          |
| `hint`     | string  | —         | Help under the field                        |
| `required` | boolean | off       | An icon must be chosen                      |
| `disabled` | boolean | off       | The field cannot be used                    |
| `page`     | number  | 300       | Icons shown before "Show more"              |

## Properties

`value` is the icon chosen (`set:name`, or an empty string). `icon` is the icon chosen once its set is loaded: `{ set, name, label, svg, code }`, with `svg` its markup to save or inline.

## Events

| Event       | When                          | Detail                 |
| ----------- | ----------------------------- | ---------------------- |
| `vt-change` | An icon was chosen or removed | `{ value, set, name }` |
| `vt-copy`   | The SVG, code or name copied  | `{ text }`             |

## CSS parts

`label`, `trigger`, `panel`, `option` and `preview`.
