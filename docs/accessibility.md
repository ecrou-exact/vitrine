# Accessibility

Vitrine elements are designed to be usable with a keyboard, a screen reader, touch input, and reduced motion settings. This page describes the keyboard support of each component, how focus and announcements work, and how accessibility is tested.

## Keyboard support

### Common controls

| Element                                                                                                | Keys                                                                     |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Icon buttons (copy, search, download, wrap, expand all…)                                               | Tab to reach, Enter or Space to activate                                 |
| Scrollable content areas (code, source view, Markdown preview, raw JSON, tables, Markdown code blocks) | Tab to focus, then arrow keys, Page Up / Page Down, Home / End to scroll |

### Search bar

| Key         | Action                                                          |
| ----------- | --------------------------------------------------------------- |
| Enter       | Next match (or run the search immediately if the query changed) |
| Shift+Enter | Previous match                                                  |
| Escape      | Clear the query; on an empty field, close the search bar        |

The match counter (`2 / 14`) is visual; results are announced through the live region (see below). Navigation wraps around from the last match to the first.

### Tabs (`<vt-markdown>` Preview / Source / Split, `<vt-json>` Tree / Raw)

Tabs follow the [WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) with automatic activation: moving to a tab selects it.

| Key         | Action                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------ |
| Tab         | Moves into the tab list, onto the selected tab (only the selected tab is in the tab order) |
| Right arrow | Next tab, wrapping to the first                                                            |
| Left arrow  | Previous tab, wrapping to the last                                                         |
| Home        | First tab                                                                                  |
| End         | Last tab                                                                                   |

The tab list has `role="tablist"` and the accessible name "View"; each tab has `role="tab"`, `aria-selected` and `aria-controls` pointing to the panel (`role="tabpanel"`).

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

### Markdown links and headings

Links in rendered Markdown are regular links. In-document links (`#h-…`), including the table of contents and heading anchors, scroll to the heading inside the element and move keyboard focus to it, so the next Tab continues from there.

## Focus management

- Vitrine re-renders parts of an element when its state changes (search, tabs, wrapping, expanding). Focus is restored to the same control after each re-render.
- Opening the search bar moves focus to the search field and selects its text. Closing it returns focus to the search button.
- Selecting a tab keeps focus on that tab.
- "Show all X lines" in `<vt-code>` moves focus to the code area.
- In the JSON tree, expanding, collapsing and loading more items keep focus on the item; "Show more" moves focus to the first newly shown item.
- Focus indicators are visible on every interactive element when using the keyboard (`:focus-visible`), as a 2px outline in the theme's accent color.

## Announcements

Each element contains a polite, atomic live region (`aria-live="polite"`). It announces:

| Situation                                           | Announcement                               |
| --------------------------------------------------- | ------------------------------------------ |
| Copy succeeded                                      | "Copied"                                   |
| Copy failed                                         | "Copy failed"                              |
| Search with results                                 | "14 matches" ("5000+ matches" when capped) |
| Search without results                              | "No matches"                               |
| "Expand all" stopped early on a large JSON document | "Partially expanded: too many nodes."      |

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
- Line numbers, diff signs, the status dot and decorative icons are hidden from assistive technologies.

## Touch

On devices with a coarse pointer (touch screens), icon buttons grow to 44 by 44 CSS pixels, and text buttons and tabs to a minimum height of 44 pixels. The floating toolbar (shown when the header is off) is always visible on devices without hover.

## Reduced motion

When the user prefers reduced motion (`prefers-reduced-motion: reduce`), transitions take 0 ms, the loading placeholder stops pulsing, and in-document Markdown links jump to their target instead of scrolling smoothly. See [Theming](theming.md#reduced-motion).

## Contrast

Every built-in theme is tested for text contrast of at least 4.5:1 (WCAG AA), and the `high-contrast` theme reaches 7:1 (WCAG AAA) for text and syntax colors on the code background. See [Theming](theming.md#contrast). If you override color tokens, check the contrast of your own values.

Status is never conveyed by color alone: copy feedback swaps the icon and is announced, errors include an icon and a message, and diff lines have a sign column.

## How accessibility is tested

The end-to-end suite uses [axe-core](https://github.com/dequelabs/axe-core) in Chromium, Firefox and WebKit:

- Each component in its full variant, with a label and emphasized lines, is scanned in each of the five built-in themes against the WCAG 2.0 and 2.1 level A and AA rules and the WCAG 2.2 AA rules. Any violation fails the test.
- `<vt-markdown>` is also scanned in split view with the search bar open and a query entered.
- A test checks that every button of every component has an accessible name.
- A test checks that animations are disabled when reduced motion is requested.
- Keyboard tests cover the tabs pattern, the tree pattern (arrows, Home, End, single Tab stop), the search keys, and focus restoration when the search bar closes.
