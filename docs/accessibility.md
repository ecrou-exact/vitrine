# Accessibility

Vitrine elements are designed to be usable with a keyboard, a screen reader, touch input, and reduced motion settings. This page describes the keyboard support of each component, how focus and announcements work, and how accessibility is tested.

## Keyboard support

### Common controls

| Element                                                                                                                              | Keys                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Icon buttons (copy, search, download, wrap, expand all, full screen, edit, undo…)                                                    | Tab to reach, Enter or Space to activate                                 |
| Scrollable content areas (code, source view, Markdown preview, raw JSON, CSV table, diff, terminal, Markdown tables and code blocks) | Tab to focus, then arrow keys, Page Up / Page Down, Home / End to scroll |

### Search bar

| Key         | Action                                                          |
| ----------- | --------------------------------------------------------------- |
| Enter       | Next match (or run the search immediately if the query changed) |
| Shift+Enter | Previous match                                                  |
| Escape      | Clear the query; on an empty field, close the search bar        |

The match counter (`2 / 14`) is visual; results are announced through the live region (see below). Navigation wraps around from the last match to the first.

### Tabs (`<vt-markdown>` Preview / Source / Split, `<vt-json>` Tree / Raw, `<vt-csv>` Table / Raw, `<vt-diff>` Side by side / Unified, `<vt-http>` Exchange / Code and its section and language tabs)

Tabs follow the [WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) with automatic activation: moving to a tab selects it.

| Key         | Action                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------ |
| Tab         | Moves into the tab list, onto the selected tab (only the selected tab is in the tab order) |
| Right arrow | Next tab, wrapping to the first                                                            |
| Left arrow  | Previous tab, wrapping to the last                                                         |
| Home        | First tab                                                                                  |
| End         | Last tab                                                                                   |

The tab list has `role="tablist"` and the accessible name "View"; each tab has `role="tab"`, `aria-selected` and `aria-controls` pointing to the panel (`role="tabpanel"`). In `<vt-http>`, the section tab lists are named "Request" and "Response", and the language tab list "Language".

### JSON tree

The tree follows the [WAI-ARIA tree view pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/). It is a single Tab stop (roving `tabindex`); moving to an item selects it.

| Key            | Action                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Down arrow     | Next visible item                                                                                              |
| Up arrow       | Previous visible item                                                                                          |
| Right arrow    | Collapsed container: expand it. Expanded container: move to its first child.                                   |
| Left arrow     | Expanded container: collapse it. Otherwise: move to the parent item.                                           |
| Home           | First item                                                                                                     |
| End            | Last visible item                                                                                              |
| Enter or Space | Container: expand or collapse. "Show more" item: load the next 100 children. Cut string: show the full string. |

Each item has `role="treeitem"`, `aria-level`, `aria-setsize`, `aria-posinset`, `aria-selected`, and `aria-expanded` for containers. Child lists have `role="group"`. The tree is named after the element's `label` (or `title`), or "JSON".

### Editors

In edit mode, the editor is a native `<textarea>` named after the `label` (or "Editor"), so screen readers, input methods and the browser's own text editing work as usual. See [Editing](editing.md#keyboard).

| Key                                      | Action                           |
| ---------------------------------------- | -------------------------------- |
| Tab / Shift+Tab                          | Indent / outdent                 |
| Escape, then Tab or Shift+Tab            | Move focus out of the editor     |
| Enter                                    | New line keeping the indentation |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y | Undo, redo                       |

Because Tab indents, the editor would otherwise trap keyboard focus: pressing Escape first releases Tab until another key is pressed. The highlighted layer behind the textarea is hidden from assistive technologies. The JSON and CSV status bars have `role="status"`, so validation results are announced politely.

### Tags combobox

The text field of `<vt-tags>` in edit mode follows the [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) with a list popup: `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls` pointing to the `role="listbox"` (`aria-multiselectable="true"`), and `aria-activedescendant` for the highlighted option, so focus stays in the field.

| Key             | Action                                                                    |
| --------------- | ------------------------------------------------------------------------- |
| Down / Up arrow | Open the list, move the highlight (wraps around)                          |
| Home / End      | First / last option, when the list is open and the field is empty         |
| Enter           | Choose the highlighted option, or add the typed text                      |
| Escape          | Close the list; when closed, clear the field                              |
| Backspace       | In an empty field: first press highlights the last tag, second removes it |

Options have `role="option"` and `aria-selected`; disabled options have `aria-disabled="true"`. The field is described by the status line ("3 tags", "3 / 5 tags"). Remove buttons are named "Remove design". The selected tags are a list (`role="list"`) named after the `label`, or "Tags". The browse panel uses native checkboxes grouped with `role="group"`. Requiring two presses of Backspace prevents removing a tag by accident when deleting text.

### Sortable table headers

In `<vt-csv>` with `sortable`, each column header contains a button ("Sort by name"). Enter or Space sorts, and focus stays on the button. The header cell has `aria-sort` (`ascending`, `descending` or `none`), and the sort icon is decorative. Column headers have `scope="col"`, row numbers are row headers (`scope="row"`), and the table has a caption (visually hidden) with the `label`, or "CSV". The pager text ("Rows 1–100 of 2,345") is a polite live region.

### Diff

`<vt-diff>` is exposed as a table (`role="table"`, named after the `label`, or "Changes") of rows and cells. Line numbers are hidden from assistive technologies, and the sign of each changed line is read as "Added: " or "Removed: ". "Show N unchanged lines" buttons expand folded regions.

### Terminal

The transcript of `<vt-terminal>` is a focusable region named after the `label`, or "Terminal". Prompts are hidden from assistive technologies, and each command is introduced as "Command:". Colors only add to the text, which is always there. The copy button of each command is named "Copy command" and announces the result.

### File tree

`<vt-tree>` follows the [WAI-ARIA tree view pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/): one Tab stop (roving `tabindex`), Up and Down arrows to move, Right and Left arrows to open, close or move between levels, Home and End, `*` to open every folder at the same level, and type-ahead (a letter moves to the next entry whose name starts with it). The status of a changed entry is read after its name ("Header.tsx, modified"). See [Keyboard](components/tree.md#keyboard).

### HTTP

In `<vt-http>`, the request and the response are labeled sections. Headers, query parameters and form fields are tables with row headers. The method and the status are text, so color only adds to them. Showing or hiding secrets is announced ("Secrets shown", "Secrets hidden").

### Full screen

The full screen button has `aria-pressed` and changes its name to "Exit full screen". Escape leaves full screen: through the browser with the Fullscreen API, or through Vitrine when the element fills the window instead (focus must be inside the element). Focus returns to the button when entering and leaving.

### Markdown links and headings

Links in rendered Markdown are regular links. In-document links (`#section`), including the table of contents and heading anchors, scroll to the heading inside the element and move keyboard focus to it, so the next Tab continues from there.

## Focus management

- Vitrine re-renders parts of an element when its state changes (search, tabs, wrapping, expanding). Focus is restored to the same control after each re-render.
- Opening the search bar moves focus to the search field and selects its text. Closing it returns focus to the search button.
- Selecting a tab keeps focus on that tab.
- "Show all X lines" in `<vt-code>` moves focus to the code area.
- In the JSON tree, expanding, collapsing and loading more items keep focus on the item; "Show more" moves focus to the first newly shown item.
- Focus indicators are visible on every interactive element when using the keyboard (`:focus-visible`), as a 2px outline in the theme's accent color.

## Announcements

Each element contains a polite, atomic live region (`aria-live="polite"`). It announces:

| Situation                                           | Announcement                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| Copy succeeded                                      | "Copied"                                                                  |
| Copy failed                                         | "Copy failed"                                                             |
| Search with results                                 | "14 matches" ("5000+ matches" when capped)                                |
| Search without results                              | "No matches"                                                              |
| "Expand all" stopped early on a large JSON document | "Partially expanded: too many nodes."                                     |
| A tag was added or removed                          | "design added", "design removed"                                          |
| First Backspace in an empty tag field               | "Press Backspace again to remove design"                                  |
| A tag was refused                                   | For example "design is already selected.", "You can select up to 5 tags." |

Other states use roles:

- The loading placeholder has `role="status"` and the name "Loading…"; the frame has `aria-busy="true"` while loading.
- Error messages have `role="alert"`.
- Notices (for example "Content is large: syntax highlighting is disabled.") have `role="note"`.

Announcements are translated with the element's interface locale (`lang-ui`).

## Labels and names

- Every icon button has an accessible name (`aria-label`) and the same text as a tooltip: "Copy code", "Search", "Download", "Toggle line wrap", "Expand all"… Toggle buttons (search, wrap) expose their state with `aria-pressed`.
- The action buttons are grouped in a `role="toolbar"` named "Actions".
- The search bar has `role="search"`; the field is named "Search".
- Scrollable areas are focusable regions (`role="region"`) with a name: the element's `label` (or `title`) when set, otherwise a default such as "Code (Python)", "Preview", "Source" or "JSON". Set `label` to give each element a meaningful name, especially when several are on the same page.
- Markdown heading anchors are named "Link to this section: " followed by the heading text.
- Markdown task list checkboxes are disabled and named after their item text.
- Line numbers, diff signs, the status dot and decorative icons are hidden from assistive technologies (the sign of a `<vt-diff>` line is announced as text instead).
- Split view buttons of `<vt-markdown>` are named "Swap panes", "Stack panes" and "Sync scrolling"; the last two expose their state with `aria-pressed`.

## Touch

On devices with a coarse pointer (touch screens), icon buttons grow to 44 by 44 CSS pixels, and text buttons and tabs to a minimum height of 44 pixels. The remove buttons of tags keep their size but get a larger invisible hit area. The floating toolbar (shown when the header is off) is always visible on devices without hover.

## Reduced motion

When the user prefers reduced motion (`prefers-reduced-motion: reduce`), transitions take 0 ms, the loading placeholder stops pulsing, in-document Markdown links jump to their target instead of scrolling smoothly, and the typing replay of `<vt-terminal>` is skipped: the session is shown at once (the Replay button still plays it). See [Theming](theming.md#reduced-motion).

## Contrast

Every built-in theme is tested for text contrast of at least 4.5:1 (WCAG AA), and the `high-contrast` theme reaches 7:1 (WCAG AAA) for text and syntax colors on the code background. See [Theming](theming.md#contrast). If you override color tokens, check the contrast of your own values.

Status is never conveyed by color alone: copy feedback swaps the icon and is announced, errors include an icon and a message, diff lines have a sign column, the JSON and CSV status bars use an icon and a message, and colored tags keep their label in the regular text color, with a colored dot.

Syntax themes from the highlight.js collection are not tested by Vitrine, and most of them do not reach 4.5:1 for every token color. See [Contrast of syntax themes](theming.md#contrast-of-syntax-themes).

## How accessibility is tested

The end-to-end suite uses [axe-core](https://github.com/dequelabs/axe-core) in Chromium, Firefox and WebKit:

- Each component in its full variant, with a label and emphasized lines, is scanned in each of the five built-in themes against the WCAG 2.0 and 2.1 level A and AA rules and the WCAG 2.2 AA rules. Any violation fails the test.
- `<vt-markdown>` is also scanned in split view with the search bar open and a query entered.
- A test checks that every button of every component has an accessible name.
- A test checks that animations are disabled when reduced motion is requested.
- Keyboard tests cover the tabs pattern, the tree pattern (arrows, Home, End, single Tab stop), the search keys, and focus restoration when the search bar closes.
