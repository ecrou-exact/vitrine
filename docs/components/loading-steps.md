# `<vt-loading-steps>`

`<vt-loading-steps>` shows the steps of a long task with their status: pending, running, done, done with warnings, failed or skipped, with a detail and a duration for each, and an overall bar with "Step 2 of 5".

```html
<vt-loading-steps text="Deploying" id="deploy">
  <template>
    done Build image (42s)
    done Run tests — 214 passed (1m 3s)
    running Push to registry — layer 3 of 7
    pending Roll out
  </template>
</vt-loading-steps>
<script>
  deploy.setStep('Push to registry', { status: 'done', duration: 12000 });
  deploy.setStep(3, { status: 'running' });
</script>
```

## Writing the steps

One step per line: an optional status, the label, an optional detail after `—`, `|` or `--`, and an optional duration in parentheses (`850ms`, `42s`, `1m 3s`, `1:20`).

| Status    | Also written                                     |
| --------- | ------------------------------------------------ |
| `pending` | `todo`, `waiting`, `queued`, `[ ]`, nothing      |
| `running` | `active`, `current`, `in-progress`, `[~]`, `[>]` |
| `done`    | `ok`, `success`, `complete`, `[x]`               |
| `warning` | `warn`, `[!]`                                    |
| `error`   | `failed`, `fail`, `[-]`                          |
| `skipped` | `skip`, `[/]`                                    |

Or JSON: `[{ "label", "status", "detail", "duration" }]` (or `{ "steps": [...] }`), inside the element or set with the `steps` property. A `<template>` keeps the text from showing before the script loads.

## Updating

`setStep(indexOrLabel, changes)` changes one step; `steps = [...]` replaces them all. Each change fires `vt-progress` (finished steps out of all), and `vt-complete` once every step is finished or one failed, with the overall status (`done`, `warning` or `error`). Editing the text inside the element also updates it.

## Layouts

`layout="list"` (default) joins the marks with a line and shows details; `compact` is denser; `horizontal` is a stepper for checkouts and wizards (details hidden). `progress="false"` removes the overall bar, `durations="false"` and `details="false"` hide those. `cancelable` shows a Cancel button while a step runs.

## Attributes

| Attribute    | Values                          | Default | Description                        |
| ------------ | ------------------------------- | ------- | ---------------------------------- |
| `text`       | text                            | —       | A title above the steps.           |
| `layout`     | `list`, `compact`, `horizontal` | `list`  | The layout.                        |
| `progress`   | boolean                         | on      | The overall bar and "Step 2 of 5". |
| `durations`  | boolean                         | on      | Durations of the steps.            |
| `details`    | boolean                         | on      | Details under the steps.           |
| `cancelable` | boolean                         | off     | A Cancel button while a step runs. |
| `size`       | `xs`…`xl` or a CSS length       | `sm`    | Size of the status marks.          |

`active`, `delay`, `min-duration`, `size`, `tone`, `speed`, `motion`, `label`, `theme` and `lang-ui` are shared by every loading indicator: see [loading indicators](../loading.md#shared-attributes).

## Properties and methods

| Member                    | Description                                                        |
| ------------------------- | ------------------------------------------------------------------ |
| `steps`                   | The steps (read and write): `{ label, status, detail, duration }`. |
| `setStep(which, changes)` | Updates one step, by index or label.                               |
| `start()`                 | Shows it.                                                          |
| `stop()`                  | Hides it.                                                          |

## Events

| Event              | Detail                  | When                                |
| ------------------ | ----------------------- | ----------------------------------- |
| `vt-progress`      | `{ value, max, ratio }` | A step changed (finished steps).    |
| `vt-complete`      | `{ status }`            | Every step finished, or one failed. |
| `vt-cancel`        | `{}`                    | Cancel pressed.                     |
| `vt-loading-start` | `{ type }`              | Shown, after `delay`.               |
| `vt-loading-end`   | `{ type, duration }`    | Hidden.                             |

## CSS parts

| Part        | Element                                                 |
| ----------- | ------------------------------------------------------- |
| `indicator` | The wrapper.                                            |
| `title`     | The title.                                              |
| `summary`   | "Step 2 of 5" and the bar.                              |
| `bar`       | The overall bar (role="progressbar").                   |
| `steps`     | The list.                                               |
| `step`      | A step; also `step-done`, `step-running`, `step-error`… |
| `mark`      | The status mark.                                        |
| `detail`    | The detail.                                             |
| `duration`  | The duration.                                           |
| `cancel`    | The Cancel button.                                      |

## Accessibility

The steps are an ordered list named by `text` or "Tasks"; each step says its status in words for screen readers ("Build image, Done"), and the running one is `aria-current="step"`. The overall bar is a `role="progressbar"` ("2 of 5 done"). Marks use icons and shapes as well as colors.
