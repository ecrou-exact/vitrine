# `<vt-workflow>`

`<vt-workflow>` shows a workflow run as a CI system does: the run and its status, a graph of its jobs linked by what each one needs, and the steps and logs of the job chosen. Put a build in a release page, a status page or an internal dashboard, and follow it live.

```html
<vt-workflow variant="full" json-src="/runs/4821.json"></vt-workflow>
```

## What it reads

| Source         | Shape                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions | A run (`/actions/runs/{id}`) with `jobs` from `/actions/runs/{id}/jobs`, or `{ workflow_run, jobs }`                 |
| GitLab         | A pipeline with its `jobs` (`stage`, `needs`, `status`, `duration`)                                                  |
| Your own JSON  | `{ name, status, jobs: [{ id, name, needs, status, started, duration, steps: [{ name, status, duration, log }] }] }` |

Statuses are read in the words of each system (`completed` with a `conclusion`, `in_progress`, `created`, `manual`, `canceled`…) into queued, in progress, success, failed, cancelled or skipped. GitHub's API does not say which job needs which: add `needs` to the jobs, as in your workflow file, to get the links.

## The graph

Jobs are columns: a job comes after every job it needs, or, without `needs`, in the column of its stage. Curves link each job to those that need it, green after a success, red after a failure, and moving while the job that waits runs. Running jobs glow, and their time counts up. Choose a job with the mouse, or move with the arrow keys and press Enter. The first failed job, else the first running one, is open at first (`job` chooses another).

## Steps and logs

Each step shows its status and duration, and opens on its log; failed and running steps are open at first. Logs keep their ANSI colors, fold GitHub's `##[group]` and `::group::` sections, mark `##[error]` and `##[warning]` lines, and show the time GitHub writes before each line apart from the text. A job without steps shows its own log (GitLab's trace).

## Live

```js
const run = document.querySelector('vt-workflow');
run.updateJob('test', { status: 'in_progress', started: Date.now() });
run.appendLog('test', 'Running 128 tests…');
run.updateJob('test', { status: 'success', duration: 94_000 });
```

`updateJob(job, changes)` changes `status`, `started`, `duration` and `steps` (by name); `appendLog(job, text, step?)` adds lines to a step (the running one by default). The status of the run follows, and a change of status is announced to screen readers.

## Attributes

| Attribute | Type   | Default                        | Description                           |
| --------- | ------ | ------------------------------ | ------------------------------------- |
| `job`     | string | the first failed, else running | The job shown at first, by id or name |
| `now`     | string | the current time               | The time running jobs are measured at |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header with the status of the run, full screen, download (the JSON) and copy (the log of the job shown).

## Properties

`workflow` is the run read, with its live changes: `{ name, title, status, event, branch, commit, actor, url, started, duration, jobs, columns }`, each job `{ id, name, status, stage, needs, started, duration, url, runner, steps, log, column, row }`.

## Events

| Event           | When                               | Detail                      |
| --------------- | ---------------------------------- | --------------------------- |
| `vt-select`     | A job was chosen                   | `{ id, name, status }`      |
| `vt-toggle`     | The log of a step opened or closed | `{ job, step, open }`       |
| `vt-job-change` | `updateJob()` changed a status     | `{ job, status, previous }` |

## CSS parts

`summary`, `graph`, `job`, `details` and `log`.
