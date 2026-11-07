# `<vt-board>`

`<vt-board>` is a board of tasks: columns of cards that move by drag and drop or with the keyboard, three views (board, list and table), tasks added in a column and edited in a dialog, filters, and a limit per column. Every change is sent as an event you can cancel, so the board can be saved to your server. With `readonly`, nothing changes: it is a public roadmap.

```html
<vt-board persist="my-board" label="Sprint 42">
  <template data-json>
    {
      "columns": [{ "id": "todo" }, { "id": "in-progress", "limit": 3 }, { "id": "done" }],
      "tasks": [
        { "id": "T-12", "title": "Offline sync", "column": "in-progress", "priority": "high", "labels": ["mobile"], "assignee": "Ada Lovelace", "progress": 60, "due": "2026-11-20" },
        { "id": "T-15", "title": "SSO with SAML", "column": "todo", "priority": "urgent", "labels": ["security"] }
      ]
    }
  </template>
</vt-board>
```

`<vt-board>` replaces `<vt-roadmap>`: a roadmap written for it, a list of items with a `status`, is read as it was.

## Format

A board is `{ "columns": [...], "tasks": [...] }`.

| Column key | Description                                                                |
| ---------- | -------------------------------------------------------------------------- |
| `id`       | Key of the column; tasks name it in `column`                               |
| `title`    | Title; known keys get a translated one ("To do", "In progress")            |
| `limit`    | Most tasks in the column; the count shows `2 of 3` and turns red when over |

| Task key      | Description                                                                           |
| ------------- | ------------------------------------------------------------------------------------- |
| `id`          | Unique id, such as a UUID. Made with `crypto.randomUUID()` when missing or repeated   |
| `title`       | Title (required; tasks without one are skipped)                                       |
| `description` | Text under the title                                                                  |
| `column`      | Column key; `status` and `state` are read too                                         |
| `priority`    | `urgent`, `high`, `medium`, `low` or `none`; `P0` to `P3` and `critical` are read too |
| `labels`      | List of labels (strings, or objects with `name`); `tags` is read too                  |
| `assignee`    | A person (a string, or an object with `name` or `login`)                              |
| `due`         | Due date; overdue tasks are marked                                                    |
| `progress`    | Percentage, from 0 to 100                                                             |
| `votes`       | Number of votes                                                                       |
| `when`        | A free date, such as "Q1 2027"                                                        |
| `url`         | Link of the title (safe schemes only)                                                 |

Statuses are read with their usual names: `To Do`, `WIP`, `doing`, `QA`, `closed` and `released` land in `todo`, `in-progress`, `review` and `done`. Other forms are read too:

- a list of tasks: the columns come from their statuses, in their usual order;
- columns holding their tasks: `{ "columns": [{ "id": "todo", "tasks": [...] }] }` (or `cards`, `items`);
- `items`, `cards` or `features` in place of `tasks`;
- nothing: an empty board with "To do", "In progress" and "Done".

## Moving tasks

- **Mouse**: drag a card from anywhere on it. The card follows the pointer and a place is kept for it; the board scrolls near its edges.
- **Touch**: drag a card by its handle (⋮⋮), so the page still scrolls with a finger elsewhere.
- **Keyboard**: on a card, Space picks it up; the arrow keys move it, between columns and within one; Space or Enter drops it; Escape puts it back. Each step is read out.

A move into a column that is full is still allowed: the column is marked as over its limit, as in most boards.

## Keyboard

| Key       | On a card                                 |
| --------- | ----------------------------------------- |
| ↑ ↓       | Previous or next card in the column       |
| ← →       | Same place in the previous or next column |
| Home, End | First or last card of the column          |
| Enter     | Opens the card                            |
| Space     | Picks it up, then drops it                |
| Delete    | Deletes it, after a confirmation          |

Only one card is in the tab order at a time; Tab goes from the board to the next control.

## Adding and editing

"Add a task" at the bottom of a column asks for a title; Enter adds it and keeps the field open for the next one. A click or Enter on a card opens a dialog with every field: title, description, column, priority, labels, assignee, due date and progress, and a delete button.

## Views

`view` sets the first view: `board`, `list` (grouped by column, good on phones) or `table` (sortable by every column). `views` shows tabs to switch between them; it is on in the `full` variant.

## Saving

Each change fires an event before it is made: `vt-task-add`, `vt-task-move`, `vt-task-edit` or `vt-task-delete`. Call `preventDefault()` to refuse it. Then `vt-change` sends the whole board.

```js
const board = document.querySelector('vt-board');
board.addEventListener('vt-task-move', (event) => {
  const { task, to } = event.detail;
  if (to === 'done' && task.progress < 100) event.preventDefault();
});
board.addEventListener('vt-change', (event) => {
  fetch('/api/board', { method: 'PUT', body: JSON.stringify(event.detail.value) });
});
```

`persist="name"` keeps the board in this browser (`localStorage`) instead: a personal to-do list that needs no server. The `content` property is always the board as JSON, so `<vt-board>` also works in a form or an editor.

## Methods

| Method                         | Description                                       |
| ------------------------------ | ------------------------------------------------- |
| `addTask(task)`                | Adds a task; returns it with its id               |
| `updateTask(id, changes)`      | Changes fields of a task                          |
| `moveTask(id, column, index?)` | Moves a task, to the end of the column by default |
| `removeTask(id)`               | Deletes a task                                    |

Each one fires the same cancelable events as the reader's actions. When a listener refuses the change, `addTask` returns `null` and the others return `false`. `board` and `tasks` are read-only copies of the board as it is now.

## Attributes

| Attribute  | Type    | Default  | Description                                     |
| ---------- | ------- | -------- | ----------------------------------------------- |
| `view`     | string  | `board`  | First view: `board`, `list` or `table`          |
| `views`    | boolean | full: on | Tabs to switch views                            |
| `readonly` | boolean | off      | Nothing can be changed                          |
| `filters`  | boolean | on       | Search, label and assignee filters              |
| `persist`  | string  | none     | Keeps the board in this browser under this name |
| `now`      | string  | today    | Date used as today for overdue tasks            |

Shared attributes are in [Common attributes](../common-attributes.md).

## Events

| Event            | When                          | Detail                      |
| ---------------- | ----------------------------- | --------------------------- |
| `vt-task-add`    | A task is about to be added   | `{ task }`                  |
| `vt-task-move`   | A task is about to move       | `{ task, from, to, index }` |
| `vt-task-edit`   | A task is about to change     | `{ task, changes }`         |
| `vt-task-delete` | A task is about to be deleted | `{ task }`                  |
| `vt-change`      | The board changed             | `{ value }`                 |
| `vt-tab-change`  | The view changed              | `{ tab }`                   |

The four `vt-task-*` events can be canceled.

## CSS parts

`column`, `column-title`, `card`, `handle`, `label`, `priority`, `filters` and `editor`, plus the [shared parts](../theming.md).
