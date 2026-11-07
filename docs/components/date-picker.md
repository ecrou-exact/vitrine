# `<vt-date-picker>`

`<vt-date-picker>` is a date field for forms. The date can be typed, in the order of the reader's language, or chosen in a calendar with the mouse, a finger or the keyboard. With `mode="range"` it chooses a period, with usual periods such as "Last 7 days" on the side. Days can be blocked: dates, periods, days of the week, and everything before `min` or after `max`.

```html
<form>
  <vt-date-picker name="stay" mode="range" label="Your stay" required min="today"
                  disabled-dates="2026-12-24/2026-12-26" min-days="2"></vt-date-picker>
  <button>Book</button>
</form>
```

It takes part in the form like a native field: the value is submitted under `name`, as an ISO 8601 date (`2026-11-22`) or period (`2026-11-22/2026-11-29`), whatever the language of the page. The form is not submitted while the field is invalid, and the first invalid field takes the focus. `reset()` and a disabled `<fieldset>` work as with native fields.

## Typing a date

The field reads what people type in the order of their language: `22/11/2026` in French, `11/22/2026` in American English, with any separator (`22.11.26`, `22-11-2026`). ISO dates (`2026-11-22`) are always read, and a date without a year takes the current one. The expected format is written under the field (`Format: dd/mm/yyyy`) and in the placeholder. A date that cannot be read stays in the field, with "Enter a date such as 18/11/2026."

## The calendar

The calendar button opens it under the field; Alt + ↓ in the field opens it too. It follows the date picker dialog pattern of WAI-ARIA:

| Key                    | In the calendar                                            |
| ---------------------- | ---------------------------------------------------------- |
| ← → ↑ ↓                | Previous or next day, previous or next week                |
| Home, End              | First or last day of the week                              |
| Page Up, Page Down     | Same day of the previous or next month                     |
| Shift + Page Up / Down | Same day of the previous or next year                      |
| Enter, Space           | Chooses the day                                            |
| Escape                 | Closes the calendar, and the focus goes back to its button |

Each day is read with its full date ("Sunday, November 22, 2026"), and blocked days with "not available". The first day of the week follows the language (Monday in France, Sunday in the United States), or `first-day`. With `inline`, the calendar is always shown under the field.

## Periods

In `range` mode, the first day chosen is the start; the days up to the one under the pointer or the focus are shown while the end is chosen, and "Now choose the end date." is read out. An end before the start makes the period the other way round. Two months are shown side by side (one on phones), or `months`.

The usual periods are on the side: Today, Yesterday, Last 7 days, Last 30 days, This month, Last month and This year. `presets` chooses them (`presets="thisWeek nextWeek next30"`, also `lastWeek` and `thisYear`), and `presets="false"` hides them. A period that goes past `min` or `max` is disabled.

## Blocked days

`disabled-dates` takes dates, periods and days of the week, separated by spaces or commas, or a JSON list:

```html
<vt-date-picker label="Delivery" min="today" max="2027-06-30"
                disabled-dates="sat sun 2026-12-25 2026-12-31/2027-01-01"></vt-date-picker>
```

Blocked days cannot be chosen in the calendar, and a blocked date typed in shows "This date is not available.". `min-days` and `max-days` limit the length of a period.

## JSON

```js
document.querySelector('vt-date-picker').data = {
  label: 'Your stay',
  mode: 'range',
  value: { start: '2026-11-20', end: '2026-11-24' },
  disabledDates: ['sun', { start: '2026-12-24', end: '2026-12-26' }],
};
```

## Attributes

| Attribute        | Type    | Default              | Description                                                     |
| ---------------- | ------- | -------------------- | --------------------------------------------------------------- |
| `mode`           | string  | `single`             | `single` or `range`                                             |
| `name`           | string  | none                 | Name of the value in the form                                   |
| `label`          | string  | none                 | Label                                                           |
| `hint`           | string  | none                 | Help under the field                                            |
| `value`          | string  | none                 | `YYYY-MM-DD`, or `YYYY-MM-DD/YYYY-MM-DD`                        |
| `required`       | boolean | off                  | A date must be chosen                                           |
| `disabled`       | boolean | off                  | Cannot be used, not submitted                                   |
| `readonly`       | boolean | off                  | Cannot be changed, submitted                                    |
| `min`, `max`     | string  | none                 | First and last days that can be chosen: `YYYY-MM-DD` or `today` |
| `disabled-dates` | string  | none                 | Days that cannot be chosen                                      |
| `first-day`      | number  | from the language    | First day of the week, 0 (Sunday) to 6                          |
| `months`         | number  | 1, or 2 for a period | Months shown side by side, up to 3                              |
| `presets`        | string  | on for a period      | `false`, or the keys of the periods offered                     |
| `inline`         | boolean | off                  | The calendar is always shown                                    |
| `clearable`      | boolean | off                  | A button that empties the field                                 |
| `min-days`       | number  | none                 | Fewest days in a period                                         |
| `max-days`       | number  | none                 | Most days in a period                                           |
| `now`            | string  | today                | Date used as today, for tests and documentation                 |

Shared attributes are in [Common attributes](../common-attributes.md).

## Properties and methods

`value` is the value as submitted. `startDate` and `endDate` are the two ends (`YYYY-MM-DD`, or empty). `form`, `validity`, `validationMessage`, `checkValidity()`, `reportValidity()` and `setCustomValidity()` work as on native fields.

## Events

| Event       | When                                   | Detail                  |
| ----------- | -------------------------------------- | ----------------------- |
| `vt-input`  | The value changed                      | `{ value, start, end }` |
| `vt-change` | A date or a period was chosen or typed | `{ value, start, end }` |
| `vt-toggle` | The calendar opened or closed          | `{ expanded }`          |

## CSS parts

`label`, `control` (a text field), `toggle`, `calendar`, `day`, `presets`, `hint` and `error`.
