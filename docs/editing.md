# Editing

Every Vitrine component can switch from displaying content to editing it. In edit mode, `<vt-code>`, `<vt-markdown>`, `<vt-json>`, `<vt-csv>` and `<vt-diff>` show a highlighted code editor, and `<vt-tags>` becomes a tag field. This page covers the attributes, keyboard, undo history and events shared by all editors, then what edit mode does in each component.

```html
<vt-code mode="edit" language="python" line-numbers label="script.py">
  print("hello")
</vt-code>
```

## Turning edit mode on

| Attribute     | Type             | Default | Description                                                                     |
| ------------- | ---------------- | ------- | ------------------------------------------------------------------------------- |
| `mode`        | `view` or `edit` | `view`  | `edit` shows the content in an editor.                                          |
| `edit-toggle` | boolean          | off     | Shows a button that switches between view and edit ("Edit" / "Stop editing").   |
| `placeholder` | text             | none    | Text shown in the empty editor (or the tag field of `<vt-tags>`).               |
| `history`     | boolean          | on      | Shows undo and redo buttons in edit mode.                                       |
| `status`      | boolean          | on      | Shows the status bar under the editors that validate (`<vt-json>`, `<vt-csv>`). |

`edit-toggle` is off in both variants: add it explicitly.

```html
<vt-markdown variant="full" edit-toggle label="notes.md" src="/notes.md"></vt-markdown>
```

The toggle button has `aria-pressed`, and dispatches `vt-mode-change` with `{ mode: "edit" }` or `{ mode: "view" }`. When it enters edit mode, focus moves to the editor. Setting the `mode` attribute resets the choice made with the button, and dispatches no event.

### How the editor works

The editor is a native `<textarea>` placed exactly over the highlighted code. The textarea holds the text, the caret, the selection, input methods and spell-check settings; the highlighted layer under it is redrawn as you type. It uses the same font, line height, tab size and wrapping as the read-only view. Spell checking, autocorrection and autocapitalization are off.

The textarea is named after the `label` (or `title`), else "Editor" followed by the language, for example "Editor (Python)", "JSON editor" or "CSV editor".

### Empty content

In edit mode, every component shows its editor even without content, with its `placeholder` (in view mode, an empty element shows "Nothing to display").

## Keyboard

| Key                                        | Action                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Tab                                        | Inserts two spaces at the caret, or indents every selected line by two spaces        |
| Shift+Tab                                  | Removes one level of indentation (a tab or up to two spaces) from the selected lines |
| Enter                                      | New line with the indentation (spaces and tabs) of the current line                  |
| Escape, then Tab                           | Leaves the editor: after Escape, Tab and Shift+Tab move focus instead of indenting   |
| Ctrl+Z (Cmd+Z)                             | Undo                                                                                 |
| Ctrl+Shift+Z (Cmd+Shift+Z), Ctrl+Y (Cmd+Y) | Redo                                                                                 |

After Escape, Tab keeps moving focus until another key is pressed in the editor, so the editor is never a keyboard trap. Shift+Enter inserts a plain new line. Undo and redo from the browser's context menu use the same history.

The keys of `<vt-tags>` are different; see [Keyboard](components/tags.md#keyboard).

## Undo history

Vitrine keeps its own undo history for each editor:

- Consecutive keystrokes of the same kind (typing, or deleting) less than 600 ms apart are grouped into one step. A paste, or any change of a different kind, starts a new step.
- At most 300 steps are kept, and at most 20,000,000 characters across all steps; the oldest steps are dropped first.
- The history survives re-renders of the element (a theme change, the wrap button, switching tabs in `<vt-json>` or `<vt-markdown>`). In `<vt-diff>`, each side keeps its own history.
- Setting new content from outside (the `content` property, `src`, inline content) starts a new history.

With `history` on (default), edit mode adds Undo and Redo buttons to the toolbar, disabled when there is nothing to undo or redo. `history="false"` hides the buttons; the keyboard shortcuts keep working.

```html
<vt-json mode="edit" history="false" src="/settings.json"></vt-json>
```

## Events

| Event            | `detail`    | When                                                                 |
| ---------------- | ----------- | -------------------------------------------------------------------- |
| `vt-input`       | `{ value }` | After every change in the editor (typing, paste, indent, undo, redo) |
| `vt-change`      | `{ value }` | The editor lost focus after at least one change                      |
| `vt-mode-change` | `{ mode }`  | The edit toggle button switched the mode: `"edit"` or `"view"`       |

`value` is the full edited text. Two components use other details:

- `<vt-diff>`: `{ value, original, modified }` when comparing two texts (`value` is the unified patch), `{ value }` for a patch. See [`<vt-diff>`](components/diff.md#editing).
- `<vt-tags>`: `vt-change` is dispatched on every change of the selection with `{ value, added, removed }`, and there is no `vt-input`. See [`<vt-tags>`](components/tags.md#events).

```js
const editor = document.querySelector('vt-code[mode="edit"]');

editor.addEventListener('vt-input', (event) => {
  preview.textContent = `${event.detail.value.length} characters`;
});

editor.addEventListener('vt-change', (event) => {
  fetch('/api/snippet', { method: 'PUT', body: event.detail.value });
});
```

## Reading the edited value

Edits update the `content` property without re-rendering the element (the caret stays in place), so reading `content` returns the edited text at any time:

| Component       | Read                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| `<vt-code>`     | `content`                                                                                |
| `<vt-markdown>` | `content`                                                                                |
| `<vt-json>`     | `content` (the text, valid or not), or `data` (the parsed value, `undefined` if invalid) |
| `<vt-csv>`      | `content`, or `rows` (the parsed rows)                                                   |
| `<vt-diff>`     | `original`, `modified` and `patch`; `content` for a patch                                |
| `<vt-tags>`     | `value` (selected values) or `tags` (selected tags with details)                         |

Because edits are stored in `content`, they take priority over `src` and inline content from then on, as if `content` had been set.

```js
document.querySelector('form').addEventListener('submit', () => {
  hiddenInput.value = document.querySelector('vt-markdown').content;
});
```

Two-way bindings are safe: setting `content` to the text the element already shows does nothing, so writing each `vt-input` value back into `content` (as a framework binding does) keeps the caret and the undo history. Setting a different text replaces the document and starts a new history. See [Frameworks](frameworks.md) for bindings in Vue, React, Svelte and Angular.

## Per component

### `<vt-code>`

The whole code area becomes the editor, highlighted in the element's `language` (with `diff` and no `language`, in the diff grammar). `line-numbers`, `highlight-lines`, `wrap`, the wrap button and `tab-size` apply; `start-line` and `collapsible` do not (numbering starts at 1 and nothing is collapsed). Search searches the edited text and follows it as you type.

```html
<vt-code mode="edit" language="sql" line-numbers placeholder="SELECT …">SELECT 1;</vt-code>
```

### `<vt-markdown>`

In edit mode, the source pane is an editor (with soft wrapping) and the preview is refreshed 120 ms after typing stops, keeping its scroll position. The default view becomes the split view, when it is available, so the editor and the preview are side by side; [scroll sync](components/markdown.md#split-layout) keeps them aligned.

- Without a `tabs` attribute in the simple variant, the split view is shown without a tab list.
- The source tab, when present, also shows the editor alone.
- The preview tab shows only the preview: with `default-tab="preview"`, or with `tabs` that offer neither `split` nor `source`, no editor is visible.

```html
<vt-markdown mode="edit" split-preview="right" max-height="70vh" placeholder="Write here…">
  <script type="text/markdown"># Draft</script>
</vt-markdown>
```

### `<vt-json>`

In edit mode, the default view is `raw`, and it is an editor highlighted as JSON. The text is validated 150 ms after typing stops:

- a status bar under the editor (part `status`, `role="status"`) shows "Valid JSON", or the error, for example "Invalid JSON at line 3, column 13: Trailing comma.";
- the line of the error is emphasized in the editor.

`status="false"` hides the status bar. Invalid JSON in the editor does not dispatch `vt-error`. In the editor, copy and download use the text as edited (not reformatted). The Tree tab, when shown, displays the edited document read-only.

```html
<vt-json mode="edit" tabs label="config.json" src="/config.json"></vt-json>
```

### `<vt-csv>`

In edit mode, the default view is `raw`, and it is a plain text editor. A status bar shows the size of the table, for example "12 rows × 4 columns", or "Unclosed quote starting at line 7.", updated 150 ms after typing stops (hidden with `status="false"`). The Table tab shows the edited data. See [`<vt-csv>`](components/csv.md#editing).

### `<vt-diff>`

Edit mode adds an "Original" and a "Modified" editor (or one "Patch" editor) above the comparison, which is updated 200 ms after typing stops. See [`<vt-diff>`](components/diff.md#editing).

### `<vt-tags>`

Edit mode turns the tags into a field: type with autocompletion, paste lists, browse every option, remove tags. See [`<vt-tags>`](components/tags.md#view-mode-and-edit-mode).

## Large texts

- Up to 60,000 characters, the highlighted layer is redrawn after every change.
- Above 60,000 characters, the text is shown plain while typing and highlighted again 250 ms after typing stops.
- Above the `highlightLimit` setting (300,000 characters by default), the text is not highlighted at all.

## Framework binding

The pattern is the same everywhere: pass the initial text as the `content` property, and listen to `vt-input` or `vt-change`.

```js
// Plain JavaScript
const editor = document.querySelector('#body');
editor.content = draft.text;
editor.addEventListener('vt-change', (event) => saveDraft(event.detail.value));
```

```vue
<!-- Vue 3: initial value in, edits out -->
<vt-markdown mode="edit" :content.prop="initialText" @vt-input="text = $event.detail.value" />
```

Complete examples for Vue, React, Svelte, Angular and HTML forms are in [Frameworks](frameworks.md).
