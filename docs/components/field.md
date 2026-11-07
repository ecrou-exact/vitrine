# `<vt-field>`

`<vt-field>` is a form field with everything around it: a label that says when it is required, a "?" button with help, a hint, a character counter, a prefix and a suffix, and error messages written in words. It can be any kind of text input, a text area, a check box, a switch, radio buttons, check boxes, or a list with a search, groups and several choices.

```html
<form>
  <vt-field
    name="email"
    type="email"
    label="Email"
    required
    hint="We never share it."
    tip="Used to sign in and for receipts."
  ></vt-field>
  <button>Send</button>
</form>
```

It takes part in its `<form>` like a native field: its value is submitted under `name`, the form is not sent while it is invalid, and it is reset and disabled with the form or its `<fieldset>`.

## Types

| `type`                                                     | Control                                                      | Value           |
| ---------------------------------------------------------- | ------------------------------------------------------------ | --------------- |
| `text` (default), `email`, `url`, `tel`, `search`          | A text input                                                 | string          |
| `password`                                                 | A text input with a button that shows the password           | string          |
| `number`, `range`                                          | A number; a range shows its value next to it                 | string          |
| `date`, `time`, `datetime-local`, `month`, `week`, `color` | The browser's own picker                                     | string          |
| `textarea`                                                 | A text area that grows with its text                         | string          |
| `checkbox`, `switch`                                       | One check box, or a switch (`role="switch"`)                 | boolean         |
| `radio`                                                    | Radio buttons, one choice                                    | string          |
| `checkboxes`                                               | Check boxes, several choices                                 | list of strings |
| `select`                                                   | A button that opens a list, one choice                       | string          |
| `multiselect`                                              | The same list with several choices, shown as removable chips | list of strings |

A list type with several values is submitted like a native `<select multiple>`: one entry per value under the same name. A check box or switch sends `on` when checked, and nothing otherwise.

## Options

The options of the list types are the content of the element, as JSON or one per line.

```html
<vt-field type="multiselect" name="topics" label="Topics" max-selected="3">
  <template data-json>
    [
      { "group": "Front end", "options": ["HTML", "CSS", { "value": "js", "label": "JavaScript" }] },
      { "group": "Back end", "options": ["Go", "Rust", { "value": "cobol", "label": "COBOL", "disabled": true }] }
    ]
  </template>
</vt-field>
```

An option is a string, or an object with `value` (or `id`), `label` (or `name`, `title`, `text`), `description` and `disabled`. A group is `{ "group": "…", "options": [...] }`. Without JSON, each line is an option, written `value | label` or only the value:

```html
<vt-field type="radio" name="size" label="Size">
  s | Small
  m | Medium
  l | Large
</vt-field>
```

Duplicate values are dropped. Lists get a search box from ten options, or always with `searchable`. The search ignores case and accents and needs every word typed.

## JSON

The whole field can be described in JSON, through `data`, the `json` attribute or a `<template data-json>`. Keys are the attributes, in camelCase or as written, and `options` holds the options.

```json
{
  "type": "select",
  "name": "country",
  "label": "Country",
  "required": true,
  "hint": "Where you live.",
  "tip": "Sets the currency of your invoices.",
  "options": ["France", "Germany", "Luxembourg"]
}
```

Only the attributes in the table below are read from JSON; anything else is ignored.

## Help

- `required` writes a mark next to the label, read as "required" by screen readers, and the form waits for a value. `optional` writes "optional" instead, for forms where most fields are required.
- `hint` is written under the field and read with it (`aria-describedby`).
- `tip` puts a "?" button next to the label. It shows the help under the label; Escape or the button hide it again.

## Validation

Errors are checked like the browser does (`required`, `minlength`, `maxlength`, `min`, `max`, `step`, `pattern`, the format of `email` and `url`, `min-selected` and `max-selected`) and written in plain words, in the language of the page: "Enter an email address, such as name@example.com." They show after the reader leaves the field (or while typing with `validate="input"`), and on submit, when the first invalid field gets the focus. `error` replaces the message, and `setCustomValidity()` sets one from your own checks, such as "This name is taken".

```js
const field = document.querySelector('vt-field[name="username"]');
field.addEventListener('vt-change', async () => {
  const taken = await isTaken(field.value);
  field.setCustomValidity(taken ? 'This name is taken.' : '');
});
```

## Keyboard

| Key                       | In a list                                              |
| ------------------------- | ------------------------------------------------------ |
| Enter, Space, ↓           | Opens the list                                         |
| ↑ ↓, Home, End            | Moves between options                                  |
| A letter                  | Goes to the next option starting with it (no search)   |
| Enter                     | Chooses the option; a list with one choice closes      |
| Escape, Tab               | Closes the list                                        |
| Backspace (on the button) | Removes the last choice of a list with several choices |

## Attributes

| Attribute      | Type    | Default          | Description                                               |
| -------------- | ------- | ---------------- | --------------------------------------------------------- |
| `type`         | string  | `text`           | One of the types above                                    |
| `name`         | string  | none             | Name of the value in the submitted form                   |
| `hint`         | string  | none             | Help written under the field                              |
| `tip`          | string  | none             | Help shown by the "?" button                              |
| `required`     | boolean | off              | The field must be filled in                               |
| `optional`     | boolean | off              | Writes "optional" next to the label                       |
| `value`        | string  | none             | First value; several values as a JSON list or with commas |
| `checked`      | boolean | off              | A check box or switch checked at first                    |
| `disabled`     | boolean | off              | Cannot be used, and is not submitted                      |
| `readonly`     | boolean | off              | Cannot be changed, but is submitted                       |
| `min`, `max`   | string  | none             | Smallest and largest number or date                       |
| `step`         | string  | none             | Step of numbers and dates                                 |
| `minlength`    | number  | none             | Fewest characters                                         |
| `maxlength`    | number  | none             | Most characters; shows a counter                          |
| `pattern`      | string  | none             | Regular expression the whole text must match              |
| `min-selected` | number  | none             | Fewest choices                                            |
| `max-selected` | number  | none             | Most choices; more are refused                            |
| `searchable`   | boolean | from ten options | A search box in the list                                  |
| `counter`      | boolean | with `maxlength` | The character counter, read out near the limit            |
| `clearable`    | boolean | off              | A button that empties the field                           |
| `prefix`       | string  | none             | Text before the value, such as "€"                        |
| `suffix`       | string  | none             | Text after the value, such as "kg"                        |
| `error`        | string  | none             | Message shown instead of the usual ones                   |
| `rows`         | number  | `4`              | First lines of a text area                                |
| `autocomplete` | string  | none             | Autofill hint, as on `<input>`                            |
| `inputmode`    | string  | none             | Virtual keyboard, as on `<input>`                         |
| `validate`     | string  | `blur`           | When errors show: `blur` or `input`                       |

`label` and `placeholder` come from the [common attributes](../common-attributes.md).

## Properties and methods

| Name                                    | Description                                                                |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `value`                                 | A string, a list of strings for several choices, a boolean for a check box |
| `options`                               | The options read (read only)                                               |
| `form`, `validity`, `validationMessage` | As on native fields                                                        |
| `checkValidity()`, `reportValidity()`   | As on native fields; `reportValidity()` shows the error                    |
| `setCustomValidity(message)`            | Sets your own error; an empty string clears it                             |
| `focus()`                               | Focuses the control                                                        |

## Events

| Event       | When                                                  | Detail      |
| ----------- | ----------------------------------------------------- | ----------- |
| `vt-input`  | The value changed                                     | `{ value }` |
| `vt-change` | The value was committed (left the field, or a choice) | `{ value }` |
| `invalid`   | The form was submitted with this field invalid        | none        |

## CSS parts

`label`, `required`, `tip-button`, `tip`, `control`, `hint`, `counter`, `error`, `listbox`, `option` and `chip`, plus the [shared parts](../theming.md). The field draws no frame of its own, so it sits in a form like a native field; with a `theme` attribute it is drawn on that theme's background.
