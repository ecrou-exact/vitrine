# `<vt-job>`

`<vt-job>` displays a job — a CI run, a pipeline, a deployment, a batch task — like the job page of a CI service: its status, duration and progress bar, then each step with its status, duration and log. Failed steps are open at first, and `setStep()` and `appendLog()` follow a running job live.

```html
<vt-job variant="full" src="/runs/1841.json"></vt-job>
```

Logs are inserted as text, never parsed as HTML. ANSI colors are rendered by the same parser as [`<vt-terminal>`](terminal.md#colors-and-escape-sequences).

## Variants

| Feature                 | `simple` (default) | `full` |
| ----------------------- | ------------------ | ------ |
| `header`                | off                | on     |
| `dot`                   | off                | on     |
| `copy` (the whole log)  | off                | on     |
| `search` (in step logs) | off                | on     |
| `download` (`job.log`)  | off                | on     |
| `fullscreen`            | off                | on     |
| `progress`              | on                 | on     |
| `durations`             | on                 | on     |
| `open-failed`           | on                 | on     |

Every feature can be turned on or off individually, whatever the variant.

## Formats

**JSON**: an object with `name`, `status`, `started`, `finished`, `duration`, `progress` and `steps`, or an array of steps. Each step has `name`, `status`, `started`, `finished`, `duration`, `progress` (0 to 100) and `log` (a string, or an array of lines). GitHub Actions names are read too: `conclusion`, `started_at`, `completed_at`.

```json
{
  "name": "Build and test",
  "steps": [
    { "name": "Checkout", "status": "success", "duration": "2s", "log": "Cloning into 'app'..." },
    { "name": "Test", "status": "running", "progress": 40, "log": "> vitest run" },
    { "name": "Deploy", "status": "queued" }
  ]
}
```

**Text**: `# name` names the job, `## name` starts a step, `status:`, `started:`, `finished:`, `duration:` and `progress:` lines right after a heading set its fields, and every other line is log text of that step.

```text
# Build and test

## Checkout
status: success
duration: 2s
Cloning into 'app'...

## Test
status: running
progress: 40
> vitest run
```

**Statuses**: `queued`, `running`, `success`, `failure`, `cancelled` and `skipped`, with their usual aliases (`pending`, `in_progress`, `passed`, `failed`, `error`, `canceled`…). Without a status of its own, the job takes one from its steps: failed if one failed, running while one runs or some are left, succeeded when all are done.

**Durations** are `duration` (`90`, `1.5s`, `2m 10s`, `350ms`; a bare number is seconds), or the time between `started` and `finished`. The job duration is its own, or the sum of its steps.

## Progress

The bar of the job shows `progress` when given; otherwise each finished step counts as 100 %, a queued step as 0 %, and a running step as its own `progress`, or half done without one. A running step shows a small bar of its own instead of its status word. When the progress is unknown, the bar slides; with reduced motion, it stays still.

## Search

The search looks in every step log, opens the steps that contain the text and marks it. Enter and Shift+Enter move between marks; focus stays in the search field.

## Following a running job

```js
const job = document.querySelector('vt-job');
job.setStep('Test', { status: 'running', progress: 0 });
source.onmessage = (event) => job.appendLog('Test', event.data);
job.setStep('Test', { status: 'success', duration: 14 });
job.update({ status: 'success' });
```

Live changes keep the steps the reader opened, the search and the scroll position. With `follow`, the log of the running step stays scrolled to its end. Each status change dispatches `vt-job-change` and is announced to screen readers.

## Editing

With `mode="edit"`, an editor holds the JSON or text and the job is updated under it. See [Editing](../editing.md).

## Attributes

This table lists the attributes specific to `<vt-job>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute     | Type    | Default | Description                                     |
| ------------- | ------- | ------- | ----------------------------------------------- |
| `progress`    | boolean | on      | The progress bar of the job.                    |
| `durations`   | boolean | on      | Durations of the job and its steps.             |
| `open-failed` | boolean | on      | Failed steps are open at first.                 |
| `follow`      | boolean | off     | Keep the end of the running step's log in view. |

## Properties and methods

| Member                  | Description                                                                       |
| ----------------------- | --------------------------------------------------------------------------------- |
| `content`               | The job, as JSON or text.                                                         |
| `job`                   | The job read from the content, read-only: `{ name, status, duration, steps, … }`. |
| `update(patch)`         | Changes fields of the job (`status`, `progress`, `name`, `duration`…).            |
| `setStep(name, patch)`  | Changes a step, or adds it at the end; the job status follows its steps.          |
| `appendLog(name, text)` | Adds text at the end of a step's log (the step is added when missing).            |

## Events

| Event            | `detail`                     | When                                            |
| ---------------- | ---------------------------- | ----------------------------------------------- |
| `vt-ready`       | `{ type: "job" }`            | The job was rendered                            |
| `vt-job-change`  | `{ status, step, previous }` | The job (`step: null`) or a step changed status |
| `vt-step-toggle` | `{ name, open }`             | A step was opened or closed                     |
| `vt-search`      | `{ query, matches }`         | A search ran                                    |
| `vt-copy`        | `{ text }`                   | The log was copied                              |
| `vt-error`       | `{ message, cause }`         | Loading failed or the text is too large         |

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part        | Element                                        |
| ----------- | ---------------------------------------------- |
| `summary`   | Status, name, duration and progress of the job |
| `progress`  | The progress bar of the job                    |
| `steps`     | The list of steps                              |
| `step`      | A step; also `step-success`, `step-failure`…   |
| `step-head` | The button that opens a step                   |
| `step-log`  | The log of a step                              |
| `status`    | A status icon and word                         |

## Accessibility

Progress bars are `role="progressbar"` with `aria-valuenow` (none while the progress is unknown) and a text value. Statuses are written as words, never shown by color or icon alone. Each step is a button with `aria-expanded` that controls its log, a focusable, labeled region. Status changes are announced in a live region. Animations stop with `prefers-reduced-motion`.

## Limits

- A job keeps at most 500 steps; each log shows its first 5,000 lines (copy and download have everything).
- Lines longer than 20,000 characters are cut.
- The size limit of the [configuration](../configuration.md) applies to `content` and `src` (2 MB by default).
