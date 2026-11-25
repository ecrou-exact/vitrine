# `<vt-questionnaire>`

`<vt-questionnaire>` asks a set of questions as a guided flow: one question per screen, a progress indicator, Back, Next and Skip, a check of each answer before moving on, an optional review screen, and the answers as a JSON object. It is for onboarding, "find your setup" pickers, surveys, intake and support forms.

```html
<vt-questionnaire variant="full" name="setup">
  <script type="application/json" data-json>
    {
      "questions": [
        {
          "id": "renderer",
          "type": "single",
          "label": "How do you render?",
          "hint": "Pick one.",
          "required": true,
          "options": [
            { "value": "csr", "label": "CSR", "description": "Client-side rendering." },
            { "value": "ssr", "label": "SSR", "description": "Server-side rendering." }
          ]
        },
        { "id": "name", "type": "text", "label": "Project name", "required": true,
          "pattern": "^[a-z][a-z0-9-]{2,29}$" },
        { "id": "email", "type": "email", "label": "Email" }
      ]
    }
  </script>
</vt-questionnaire>
```

It takes part in its `<form>` like a native field: the answers are submitted as JSON under `name`, and the form is not sent while a required answer is missing or not valid (the first such question is shown, with its error).

## Questions

Questions are JSON: a `<script type="application/json" data-json>` child, the `json` attribute, the `questions` property, or `fromData()`. Either a list, or an object with `questions` and the settings `layout`, `progress`, `review`, `autoAdvance` and `allowSkip`. No question text is ever read as HTML.

| Key                      | Description                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `id`                     | Key of the answer in the value object. Letters, digits, `_`, `.` and `-`; made unique if not |
| `type`                   | One of the types below (default `text`)                                                      |
| `label`                  | The question                                                                                 |
| `short`                  | A shorter name for the step list                                                             |
| `hint`                   | Help written under the question                                                              |
| `placeholder`            | Placeholder of a text, text area, email, number or tags answer                               |
| `required`               | The question must be answered; otherwise it is marked "optional" and can be skipped          |
| `options`                | The choices of `single` and `multiple`: strings, or `{ value, label, description, group }`   |
| `groupBy`                | The key of an option that holds its group heading (default `group`)                          |
| `min`, `max`             | Fewest and most choices or tags, the smallest and largest number, or the first and last date |
| `minLength`, `maxLength` | Fewest and most characters of a text answer                                                  |
| `pattern`                | Regular expression the whole text must match                                                 |

| `type`     | Control                                                              | Answer               |
| ---------- | -------------------------------------------------------------------- | -------------------- |
| `single`   | Radio buttons in a group; arrow keys choose                          | string               |
| `multiple` | Check boxes in a group; arrow keys move the focus; groups by heading | list of strings      |
| `text`     | A `<vt-field>` text input                                            | string               |
| `textarea` | A `<vt-field>` text area                                             | string               |
| `email`    | A `<vt-field>` for an address                                        | string               |
| `number`   | A `<vt-field>` for a number                                          | number               |
| `tags`     | A `<vt-tags>` editor                                                 | list of strings      |
| `date`     | A `<vt-date-picker>`                                                 | string, `YYYY-MM-DD` |

At most 200 questions and 500 options per question are read; longer texts are cut.

## Layout

`layout="steps"` (default) shows one question per screen. `layout="all"` puts every question on one page, with one Submit button that checks them all.

| Setting        | Values                 | Default                            |
| -------------- | ---------------------- | ---------------------------------- |
| `progress`     | `none`, `bar`, `steps` | `bar`; `steps` in the full variant |
| `review`       | boolean                | off; on in the full variant        |
| `auto-advance` | boolean                | off; on in the full variant        |
| `allow-skip`   | boolean                | on                                 |

- `progress="bar"` shows "Step 2 of 6" and a bar; `steps` shows the numbered list of steps, where the steps already reached are buttons you can go back to.
- `review` adds a screen after the last question with every answer and an Edit button for each. After an Edit, Next goes straight back to the review.
- `auto-advance` moves on 350 ms after a `single` choice is clicked. Choosing with the arrow keys does not move on, so a keyboard reader can look through the options. It does not apply to the last question when there is no review screen.
- `allow-skip` gives each optional question a Skip button, which clears its answer.

The boolean settings follow the [common rules](../common-attributes.md#how-attribute-values-are-read): present means on, and `"false"`, `"off"`, `"no"` or `"0"` means off. That turns off a feature the `full` variant switches on, for example `<vt-questionnaire variant="full" review="false" auto-advance="false">`, and `allow-skip="false"` removes the Skip buttons. A setting left out follows the variant.

The attribute is called `layout` and not `mode`, because `mode` is the view / edit switch of every Vitrine element.

## Validation

Only the current step is checked before you move forward, and the whole set when you submit (then the first question with a problem is shown). A question is checked for:

- `required`: an answer is given;
- `min` and `max`: the number of choices or tags, the value of a number, or the date;
- `minLength` and `maxLength`: the characters of a text;
- `pattern`: the whole text matches (a pattern that is not valid is ignored);
- the format of an `email`, a `number` and a `date`.

An answer that does not pass its check is not part of `value`, and does not fire `vt-change`: the error is shown, and the control keeps what was typed so it can be corrected. If an answer that was valid becomes invalid, it is taken out of `value` and `vt-change` fires once with an empty answer (`''`, or `[]` for a list). `vt-input` still fires while typing, with whatever was typed. A date that cannot be read (`01152027`) is reported by the date picker and stops the step, but fires nothing.

Errors are written in words under the question, in the language of the interface, with an icon and a screen-reader "Error:" prefix, so colour is never the only sign. The error is linked to the question with `aria-describedby`, the controls get `aria-invalid`, and the message is also read out through a live region. It goes away as soon as the answer is right.

## Accessibility

- Each question is a `<fieldset>` with a `<legend>`. When the step changes, the focus goes to the question, and "Step 2 of 6" is announced.
- Choice lists are a radio group or a group of check boxes; arrow keys move between the options.
- Enter goes on to the next step from a choice, a text, email or number answer, a tag editor and a date (see [Keyboard](#keyboard)). A text area keeps Enter for a new line.
- The current step is `aria-current="step"`.
- Nothing depends on colour: the selected choice also has a thicker marker, and the step list has numbers and check marks.

## Keyboard

In the steps layout, Enter goes on to the next step (and on the last step submits), after checking the answer, unless the control uses the key itself:

| Question                  | Enter                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `single`, `multiple`      | Goes on                                                                                                                                                     |
| `text`, `email`, `number` | Goes on                                                                                                                                                     |
| `textarea`                | New line (never goes on)                                                                                                                                    |
| `tags`                    | Adds the typed text as a tag, or picks the highlighted suggestion; with nothing typed and no suggestion chosen it goes on                                   |
| `date`                    | In the field, commits the typed date and goes on if it is a valid date; in the open calendar it chooses the day and closes the calendar, and does not go on |

An answer that is not valid keeps the reader on the step, with its error.

## JSON result

`value` is an object of answers by question id: a string, a list of strings, or a number. Unanswered and skipped questions are left out, and so is an answer that does not pass its check (a text that does not match its `pattern`, too few tags…).

```js
const q = document.querySelector('vt-questionnaire');
q.addEventListener('vt-submit', (event) => {
  console.log(event.detail.value);
  // { renderer: 'ssr', name: 'my-app', components: ['code', 'json'] }
});
q.value = { renderer: 'csr' }; // sets answers; ids and shapes that do not fit are ignored
```

### Changes from code

Like a native input, setting `value` or `questions` and calling `reset()` fire no `vt-change` and no `vt-input`: the page that made the change already knows about it. Only what the reader does fires them.

`vt-step` is different, since an application that tracks the step needs every move. It fires when the step changes, whatever the cause: the reader, `next()`, `back()`, `goTo()`, `reset()` (when it returns from another step to the first) and a new list of questions that is shorter than the current step. A call that does not move (`goTo()` to the current step, `reset()` on the first step) fires nothing.

### Focus

When the step changes, the focus goes to the new question if it was inside the questionnaire: the reader pressed Next, Back, Skip, Edit or a step, or chose an option that moved on. When the step is changed from code with `goTo()`, `next()` or `back()` while the focus is somewhere else on the page, the focus stays where it is: the questionnaire does not take it. Call `focus()` on the element if you want it.

## Attributes

| Attribute      | Type    | Default       | Description                                                            |
| -------------- | ------- | ------------- | ---------------------------------------------------------------------- |
| `variant`      | string  | `simple`      | `full` turns on the review screen, the step list and auto-advance      |
| `name`         | string  | none          | Name of the value in the submitted form: the answers as JSON           |
| `layout`       | string  | `steps`       | `steps` (one question per screen) or `all` (one page)                  |
| `auto-advance` | boolean | by variant    | A `single` answer moves on after a short pause; `"false"` turns it off |
| `review`       | boolean | by variant    | A review screen with an Edit button per answer; `"false"` turns it off |
| `progress`     | string  | by variant    | `none`, `bar` or `steps`                                               |
| `allow-skip`   | boolean | on            | Optional questions get a Skip button; `"false"` turns it off           |
| `label`        | string  | none          | Accessible name of the questionnaire                                   |
| `lang-ui`      | string  | page language | `en` or `fr`, or a locale you registered                               |

## Properties and methods

| Name              | Description                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `questions`       | The questions (read and write), normalized                                                                                             |
| `value`           | The answers by question id (read and write)                                                                                            |
| `step`            | Index of the current step; the review screen comes after the last question (read only)                                                 |
| `next()`          | Checks the current step and goes on; on the last step it submits. Returns whether it moved                                             |
| `back()`          | Goes to the previous step without checking                                                                                             |
| `goTo(target)`    | Goes to a question by id or index, or to `review`. Going forward checks the current step. Moves the focus only if it is already inside |
| `reset()`         | Clears the answers and returns to the first step (also when the form is reset); fires no `vt-change`                                   |
| `submit()`        | Checks every answer and fires `vt-submit`; returns whether they passed                                                                 |
| `form`            | The form of the element (read only)                                                                                                    |
| `fromData(value)` | Static: turns a list or an object of questions into the element's content                                                              |

## Events

| Event       | When                                                                                                                                                              | Detail             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `vt-input`  | An answer is being edited, valid or not                                                                                                                           | `{ id, value }`    |
| `vt-change` | A valid answer was committed (a choice, or leaving a field), or the answer in `value` was removed (cleared, skipped, or no longer valid: `value` is `''` or `[]`) | `{ id, value }`    |
| `vt-step`   | The step changed, also through `next()`, `back()`, `goTo()` and `reset()`                                                                                         | `{ from, to, id }` |
| `vt-submit` | Every answer passed the check                                                                                                                                     | `{ value }`        |
| `invalid`   | The form was submitted with a required answer missing                                                                                                             | none               |

The events of the fields inside (`vt-input`, `vt-change` of a `<vt-field>`, `<vt-tags>` or `<vt-date-picker>`) are not passed on: you only get those of the questionnaire. `id` is `review` for the review screen.

## CSS parts

`step`, `question`, `hint`, `option`, `progress`, `nav`, `review` and `error`, plus the [shared parts](../theming.md). Colours, radii and sizes come from the `--vt-*` tokens, in light and dark.

```css
vt-questionnaire::part(option) {
  border-radius: 999px;
}
vt-questionnaire::part(nav) {
  position: sticky;
  bottom: 0;
}
```

## Languages

English and French. Other languages through `registerLocale()`; the keys start with `questionnaire`.

## Loading only this element

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-questionnaire.js"></script>
```

This module also defines `<vt-field>`, `<vt-tags>` and `<vt-date-picker>`, which the questions use.
