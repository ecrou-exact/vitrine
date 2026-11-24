# `<vt-typing>`

`<vt-typing>` is the indicator of chats and assistants: three dots, bouncing or in a wave, alone or in a message bubble, with an optional text naming who is typing.

```html
<vt-typing name="Ada" show-text></vt-typing>
<vt-typing type="dots"></vt-typing>
<vt-typing name="Ada, Linus" type="wave" tone="accent"></vt-typing>
```

## Text

`name` names who is typing; several names are separated by commas: "Ada is typing…", "Ada and Linus are typing…", "3 people are typing…" (in the reader's language). Without a name: "Someone is typing…". The text is always the accessible name; `show-text` also shows it. `text` replaces it.

## Attributes

| Attribute   | Values                     | Default   | Description                            |
| ----------- | -------------------------- | --------- | -------------------------------------- |
| `type`      | `bubble`, `dots`, `wave`   | `bubble`  | The look.                              |
| `name`      | names, separated by commas | —         | Who is typing.                         |
| `show-text` | boolean                    | off       | Show the text next to the dots.        |
| `text`      | text                       | —         | The text instead of the generated one. |
| `size`      | `xs`…`xl` or a CSS length  | `sm`      | Size of the dots.                      |
| `tone`      | see shared attributes      | `neutral` | Color of the dots.                     |

`active`, `delay`, `min-duration`, `size`, `tone`, `speed`, `motion`, `label`, `theme` and `lang-ui` are shared by every loading indicator: see [loading indicators](../loading.md#shared-attributes).

## Properties and methods

| Member    | Description                      |
| --------- | -------------------------------- |
| `start()` | Shows it (after `delay`).        |
| `stop()`  | Hides it (after `min-duration`). |
| `active`  | Shown or not (read and write).   |
| `shown`   | On screen right now (read-only). |

## Events

| Event              | Detail               | When                  |
| ------------------ | -------------------- | --------------------- |
| `vt-loading-start` | `{ type }`           | Shown, after `delay`. |
| `vt-loading-end`   | `{ type, duration }` | Hidden.               |

## CSS parts

| Part        | Element                      |
| ----------- | ---------------------------- |
| `indicator` | The wrapper (role="status"). |
| `bubble`    | The bubble.                  |
| `dot`       | A dot.                       |
| `text`      | The text.                    |

## Custom properties

| Property             | Description               |
| -------------------- | ------------------------- |
| `--vt-typing-bubble` | Background of the bubble. |

## Accessibility

A `role="status"` named by the sentence ("Ada is typing…"), so screen readers announce it when it appears; the dots are hidden from them.
