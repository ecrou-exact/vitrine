# Common attributes and events

The attributes and events on this page work the same way on `<vt-code>`, `<vt-markdown>`, `<vt-json>`, `<vt-csv>`, `<vt-tags>`, `<vt-diff>`, `<vt-terminal>`, `<vt-tree>`, `<vt-http>`, `<vt-log>`, `<vt-chart>` and `<vt-openapi>`. Component-specific attributes are described in each component reference.

## How attribute values are read

- **Boolean attributes** are on when present with no value or with any value other than `false`, `off`, `no` or `0` (case-insensitive). `copy`, `copy=""` and `copy="true"` turn the feature on; `copy="false"` turns it off.
- **An absent boolean attribute** lets the `variant` preset decide.
- **Enumerated attributes** (such as `variant`) are case-insensitive. An unknown value falls back to the default.
- **Invalid values never throw.** They are ignored and the default applies.

Attributes are observed: changing one after the element is on the page updates it.

## Attribute reference

| Attribute           | Type                 | Default                      | Description                                                               |
| ------------------- | -------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| `variant`           | `simple` or `full`   | `simple`                     | Feature preset. Individual attributes override it.                        |
| `theme`             | theme name or `auto` | configured `theme` (`auto`)  | Color theme. See [Theming](theming.md).                                   |
| `src`               | URL                  | none                         | Loads the content from a URL.                                             |
| `allow-remote`      | boolean              | off                          | Allows `src` to point to another origin.                                  |
| `max-height`        | CSS length           | none                         | Maximum height of the scrollable content area.                            |
| `copy`              | boolean              | preset                       | Shows a copy button.                                                      |
| `search`            | boolean              | preset                       | Shows a search button and search bar.                                     |
| `download`          | boolean or file name | preset                       | Shows a download button.                                                  |
| `header`            | boolean              | preset                       | Shows the header bar.                                                     |
| `dot`               | boolean              | preset                       | Shows the status dot at the start of the header.                          |
| `label`             | text                 | none                         | Header title, for example a file name.                                    |
| `title`             | text                 | none                         | Header title, used when `label` is absent.                                |
| `lang-ui`           | locale code          | configured `lang` (`en`)     | Language of the interface strings.                                        |
| `mode`              | `view` or `edit`     | `view`                       | `edit` shows the content in an editor. See [Editing](editing.md).         |
| `edit-toggle`       | boolean              | off                          | Shows a button that switches between view and edit.                       |
| `placeholder`       | text                 | none                         | Text shown in an empty editor.                                            |
| `history`           | boolean              | on                           | Shows undo and redo buttons in edit mode.                                 |
| `status`            | boolean              | on                           | Shows the status bar under the JSON and CSV editors.                      |
| `syntax-theme`      | syntax theme name    | configured `syntaxTheme`     | Syntax highlighting theme. See [Syntax themes](theming.md#syntax-themes). |
| `syntax-theme-dark` | syntax theme name    | configured `syntaxThemeDark` | Syntax theme used when the interface theme is dark.                       |
| `badge`             | boolean              | on                           | Shows the badge in the header.                                            |
| `fullscreen`        | boolean              | preset                       | Shows a full screen button.                                               |

## Presets are shortcuts

`variant` is only a shortcut: it decides the value of the boolean feature attributes that are not set on the element. Every feature can be set on its own, in either variant, and an explicit value always wins over the preset:

```html
<!-- Simple variant with only a copy button and line numbers -->
<vt-code copy line-numbers language="js">console.log('hi');</vt-code>

<!-- Full variant without search and without full screen -->
<vt-json variant="full" search="false" fullscreen="false" src="/data.json"></vt-json>
```

Features turned on by each preset (everything else is off):

| Component       | `simple`                         | `full`                                                                                                                                            |
| --------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<vt-code>`     | nothing                          | `header`, `dot`, `copy`, `search`, `download`, `line-numbers`, `wrap-toggle`, `fullscreen`                                                        |
| `<vt-markdown>` | `line-numbers`, `sync-scroll`    | `header`, `dot`, `copy`, `search`, `download`, `toc`, `anchors`, `line-numbers`, `sync-scroll`, `split-controls`, `fullscreen`; all three tabs    |
| `<vt-json>`     | nothing                          | `header`, `dot`, `copy`, `search`, `download`, `tabs`, `show-types`, `expand-controls`, `path`, `line-numbers`, `fullscreen`; initial view `tree` |
| `<vt-csv>`      | `header-row`                     | `header`, `dot`, `copy`, `search`, `download`, `tabs`, `sortable`, `line-numbers`, `header-row`, `fullscreen`                                     |
| `<vt-tags>`     | `allow-create`                   | `header`, `dot`, `copy`, `browse`, `counts`, `clear`, `fullscreen`, `allow-create`                                                                |
| `<vt-diff>`     | `line-numbers`                   | `header`, `dot`, `copy`, `search`, `download`, `tabs`, `line-numbers`, `fullscreen`; initial view `split`                                         |
| `<vt-terminal>` | `colors`, `command-copy`, `wrap` | `header`, `dot`, `copy`, `search`, `download`, `fullscreen`, `colors`, `command-copy`, `wrap`                                                     |
| `<vt-tree>`     | `icons`, `guides`                | `header`, `dot`, `copy`, `search`, `download`, `fullscreen`, `icons`, `guides`, `expand-controls`, `path`                                         |
| `<vt-http>`     | `mask-secrets`                   | `header`, `dot`, `copy`, `search`, `download`, `fullscreen`, `tabs`, `mask-secrets`                                                               |
| `<vt-log>`      | `fields`, `colors`, `wrap`       | `header`, `dot`, `copy`, `search`, `download`, `fullscreen`, `level-filter`, `line-numbers`, `fields`, `colors`, `wrap`                           |
| `<vt-chart>`    | `grid`                           | `header`, `dot`, `copy`, `download`, `fullscreen`, `tabs`, `grid`                                                                                 |
| `<vt-openapi>`  | `examples`, `markdown`           | `header`, `dot`, `copy`, `search`, `download`, `fullscreen`, `examples`, `markdown`                                                               |

`edit-toggle`, `wrap` (except in `<vt-terminal>` and `<vt-log>`), `sort-keys`, `allow-html`, `diff`, `clickable` and `case-sensitive` are off in both presets. `badge`, `history` and `status` are on unless set to a false value. `<vt-tags>` has no search or download button, and `<vt-chart>` has no search button.

### `variant`

```html
<vt-code variant="full" language="js">const a = 1;</vt-code>
```

### `theme`

Accepts the name of a built-in theme (`light`, `dark`, `dim`, `paper`, `high-contrast`), the name of a theme registered with `Vitrine.registerTheme()`, or `auto`. The value is trimmed and lowercased. An unknown name falls back to the configured default theme. See [Theming](theming.md).

```html
<vt-json theme="high-contrast">{"a": 1}</vt-json>
```

### `src` and `allow-remote`

```html
<vt-code src="/snippets/app.js" language="js"></vt-code>
<vt-markdown src="https://docs.example.com/readme.md" allow-remote></vt-markdown>
```

Rules applied to `src`:

- Only `http:` and `https:` URLs are accepted. Relative URLs are resolved against the page. Anything else shows "URL blocked: only http(s) URLs can be loaded."
- Without `allow-remote`, a URL on another origin is refused with "Cross-origin URL blocked. Add the "allow-remote" attribute to allow it." The request runs with `mode: "same-origin"`, which also rejects redirects to another origin.
- With `allow-remote`, the request runs in CORS mode, so the other server must send the appropriate CORS headers.
- Cookies are only sent to the page's own origin (`credentials: "same-origin"`).
- The response is limited by the `maxSize` setting (the download stops as soon as the limit is exceeded) and by the `fetchTimeout` setting (15 seconds by default). See [Configuration](configuration.md).
- An HTTP error status shows `Could not load "<url>": HTTP <status>`.
- Changing `src` or `allow-remote` reloads the content. A pending request is cancelled when `src` changes or the element is removed from the page.

A `content` property set from JavaScript takes priority over `src`.

### `max-height`

Limits the height of the scrollable content area (the `body` part). The header stays visible.

Accepted values are a number (up to 6 digits, with up to 4 decimals) followed by one of these units: `px`, `em`, `rem`, `vh`, `svh`, `lvh`, `dvh`, `%`, `ch`, `lh`. The value is case-insensitive.

| Value                                            | Accepted |
| ------------------------------------------------ | -------- |
| `400px`, `60vh`, `20rem`, `12.5em`, `50%`        | Yes      |
| `400` (no unit)                                  | No       |
| `calc(100vh - 2rem)`, `var(--h)`, `auto`, `none` | No       |
| `-10px`                                          | No       |

Invalid values are ignored (no height limit).

```html
<vt-code max-height="320px" src="/logs/build.txt"></vt-code>
```

In the split view of `<vt-markdown>`, `max-height` sets the height of the panes (see [Split layout](components/markdown.md#heights)). In full screen, `max-height` is ignored.

### `copy`

Shows a copy button. What is copied depends on the component:

| Component       | Button label  | Copied text                                                                                             |
| --------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| `<vt-code>`     | Copy code     | The full source text                                                                                    |
| `<vt-markdown>` | Copy source   | The Markdown source; each fenced code block also gets a "Copy code" button                              |
| `<vt-json>`     | Copy          | The pretty-printed JSON (using the current `indent` and `sort-keys`); in the editor, the text as edited |
| `<vt-csv>`      | Copy          | The CSV text                                                                                            |
| `<vt-tags>`     | Copy          | The selected values as a JSON array                                                                     |
| `<vt-diff>`     | Copy patch    | The comparison as a unified patch                                                                       |
| `<vt-terminal>` | Copy commands | Every command without its prompt, one per line; each command also gets a "Copy command" button          |
| `<vt-tree>`     | Copy tree     | The tree drawn like the `tree` command, with notes                                                      |
| `<vt-http>`     | Copy          | The exchange as raw HTTP, as displayed (secrets masked or not)                                          |
| `<vt-log>`      | Copy          | The log text                                                                                            |
| `<vt-chart>`    | Copy data     | The data as CSV                                                                                         |
| `<vt-openapi>`  | Copy          | The description text, as JSON or YAML                                                                   |

After a click, the icon changes to a check mark (or an alert icon on failure) for 1.5 seconds, "Copied" or "Copy failed" is announced to screen readers, and a `vt-copy` event is dispatched on success. Outside secure contexts (plain `http:`), where the Clipboard API is unavailable, Vitrine falls back to the legacy copy command.

### `search`

Shows a search button that opens a search bar. Search is literal (the query is never treated as a pattern) and case-insensitive. The query is limited to 200 characters, and at most 5,000 matches are highlighted; when there are more, the counter shows `1 / 5000+`.

Keyboard in the search field:

| Key         | Action                                                                 |
| ----------- | ---------------------------------------------------------------------- |
| Enter       | Go to the next match (or run the search if the query changed)          |
| Shift+Enter | Go to the previous match                                               |
| Escape      | Clear the query; press again on an empty field to close the search bar |

Typing searches automatically after a short pause (150 ms). The counter shows `current / total`, or "No matches". Closing the search bar removes the highlights and moves focus back to the search button.

### `download`

Shows a download button that saves the content as a file.

| Component       | Downloaded text                                                    | Default file name                | MIME type                                |
| --------------- | ------------------------------------------------------------------ | -------------------------------- | ---------------------------------------- |
| `<vt-code>`     | The source text                                                    | `code.<ext>`                     | `text/plain`                             |
| `<vt-markdown>` | The Markdown source                                                | `document.md`                    | `text/markdown`                          |
| `<vt-json>`     | The pretty-printed JSON (the edited text in the editor)            | `data.json`                      | `application/json`                       |
| `<vt-csv>`      | The CSV text                                                       | `data.csv`                       | `text/csv`                               |
| `<vt-diff>`     | The unified patch                                                  | `changes.diff`                   | `text/x-diff`                            |
| `<vt-terminal>` | The session as plain text (prompts kept, escape sequences removed) | `session.txt`                    | `text/plain`                             |
| `<vt-tree>`     | The tree drawn like the `tree` command                             | `tree.txt`                       | `text/plain`                             |
| `<vt-http>`     | The exchange as raw HTTP, as displayed                             | `exchange.http`                  | `text/plain`                             |
| `<vt-log>`      | The log text                                                       | `app.log`                        | `text/plain`                             |
| `<vt-chart>`    | The data as CSV                                                    | `chart.csv`                      | `text/csv`                               |
| `<vt-openapi>`  | The description text                                               | `openapi.json` or `openapi.yaml` | `application/json` or `application/yaml` |

The file name is the value of the `download` attribute when it is not a boolean value (`download="report.md"`), else the `label` or `title` when it looks like a file name (it ends with an extension of 1 to 10 letters or digits), else the default name. `<vt-tags>` has no download button.

File names are cleaned: path segments, control characters and the characters `< > : " | ? *` are removed, leading dots and spaces are stripped, and the name is limited to 120 characters.

```html
<vt-code download="install.sh" language="bash">curl -fsSL https://example.com/install | sh</vt-code>
```

### `header` and `dot`

`header` shows the header bar: optional status dot, title, tabs, badge and action buttons. `dot` shows the small accent dot at its start (it is only visible when the header is shown).

### `label` and `title`

Both set the header title. `label` is preferred: when both are present, `label` wins. Use `label` unless you also want the browser tooltip, because `title` is a global HTML attribute and browsers show it as a tooltip when hovering anywhere over the element.

The title is displayed as text only (never as HTML). Control characters are removed, whitespace is collapsed, and it is cut to 200 characters. The title also names the scrollable content region for assistive technologies, and is used for download file names.

```html
<vt-code variant="full" label="server.py" language="python">print("ready")</vt-code>
```

### `lang-ui`

Sets the language of the interface strings (button labels, messages) for this element. Vitrine ships `en` and `fr`; add others with `Vitrine.registerLocale()`. The value must look like a locale code (`de`, `pt-BR`); otherwise the configured `lang` is used. A regional code falls back to its base language, then to English (`fr-CA` uses `fr`). Numbers in messages are formatted for the locale. See [Configuration](configuration.md#locales).

```html
<vt-code variant="full" lang-ui="fr" language="js">let a = 1;</vt-code>
```

### `badge`

The header badge shows the language (`<vt-code>`), the type (`JSON`, `CSV`), the number of added and removed lines (`<vt-diff>`), the number of folders and files (`<vt-tree>`: "3 folders, 12 files"), `HTTP` (`<vt-http>` without tabs), `Chart` (`<vt-chart>` without tabs) or the API version (`<vt-openapi>`: `v2.1.0` from `info.version`, or the OpenAPI version, such as `OpenAPI 3.1.0`, when `info.version` is missing). It is on by default; `badge="false"` hides it. It is only visible when the header is shown, and is replaced by tabs in `<vt-json>`, `<vt-csv>`, `<vt-http>` and `<vt-chart>` when `tabs` is on.

```html
<vt-code variant="full" badge="false" language="bash">ls -la</vt-code>
```

### `fullscreen`

Shows a "Full screen" button (on in every full variant). The element then fills the screen with the Fullscreen API. Where the API is not available or the request is refused (for example in an `<iframe>` without `allowfullscreen`, or on some mobile browsers), the element fills the browser window instead.

- Press Escape, or the button (now "Exit full screen", with `aria-pressed="true"`), to leave. In window mode, Escape works when focus is inside the element and the key was not already used by a control (such as the search field or the tag field).
- Entering and leaving dispatches `vt-fullscreen-change` with `{ fullscreen: true }` or `{ fullscreen: false }`, and focus returns to the button.
- In full screen, the content fills the available height and `max-height` is ignored.

```html
<vt-csv fullscreen src="/data/large.csv"></vt-csv>
```

```js
element.addEventListener('vt-fullscreen-change', (event) => {
  document.body.classList.toggle('reading', event.detail.fullscreen);
});
```

### `mode`, `edit-toggle`, `placeholder`, `history` and `status`

These attributes control edit mode. They are described in [Editing](editing.md).

### `syntax-theme` and `syntax-theme-dark`

These attributes choose a syntax highlighting theme from the highlight.js collection. They are described in [Syntax themes](theming.md#syntax-themes).

```html
<vt-code language="rust" syntax-theme="github" syntax-theme-dark="github-dark">fn main() {}</vt-code>
```

## Floating toolbar when the header is off

When the header is off but some actions are on (for example `<vt-code copy>` in the simple variant), the action buttons are shown in a small floating toolbar over the top-right corner of the content. It appears when the pointer is over the element or when one of its buttons has keyboard focus, and it is always visible on devices without hover (touch screens).

```html
<vt-code copy search language="bash">npm run build</vt-code>
```

Tabs (on `<vt-markdown>`, `<vt-json>`, `<vt-csv>`, `<vt-diff>`, `<vt-http>` and `<vt-chart>`) and the search bar are shown above the content in this case.

## Events

Every event is a `CustomEvent` that bubbles and crosses the shadow DOM boundary (`composed: true`), so you can listen on the element or on any ancestor. Event names are also available as `Vitrine.EVENTS`.

| Event                  | `EVENTS` key        | Dispatched by                                                                    | When                                                                                                                        | `detail`                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vt-ready`             | `READY`             | all                                                                              | Content was rendered (after each new content: initial load, `content` change, `src` change, `maxSize` change)               | `{ type }`: `"code"`, `"markdown"`, `"json"`, `"csv"`, `"tags"`, `"diff"`, `"terminal"`, `"tree"`, `"http"`, `"log"`, `"chart"` or `"openapi"`                                                                                                                   |
| `vt-copy`              | `COPY`              | all                                                                              | Text was copied successfully                                                                                                | `{ text }`: the copied text                                                                                                                                                                                                                                      |
| `vt-search`            | `SEARCH`            | all with a search bar                                                            | A search ran (including an empty query after clearing)                                                                      | `{ query, matches }`: the query and the number of highlighted matches                                                                                                                                                                                            |
| `vt-tab-change`        | `TAB_CHANGE`        | `<vt-markdown>`, `<vt-json>`, `<vt-csv>`, `<vt-diff>`, `<vt-http>`, `<vt-chart>` | The user changed the tab or view                                                                                            | `{ tab }`: `"preview"`, `"source"`, `"split"`, `"tree"`, `"raw"`, `"table"`, `"unified"` or `"chart"`; on `<vt-http>`, a view (`"exchange"`, `"code"`), a section (`"body"`, `"headers"`, `"query"`) or a language (`"curl"`, `"fetch"`, `"python"`, `"httpie"`) |
| `vt-input`             | `INPUT`             | editors                                                                          | The content was edited                                                                                                      | `{ value }` (see [Editing](editing.md#events))                                                                                                                                                                                                                   |
| `vt-change`            | `CHANGE`            | editors, `<vt-tags>`                                                             | An editor lost focus after edits; on `<vt-tags>`, the selection changed                                                     | `{ value }`; `{ value, added, removed }` on `<vt-tags>`                                                                                                                                                                                                          |
| `vt-mode-change`       | `MODE_CHANGE`       | all                                                                              | The edit toggle button switched the mode                                                                                    | `{ mode }`: `"view"` or `"edit"`                                                                                                                                                                                                                                 |
| `vt-fullscreen-change` | `FULLSCREEN_CHANGE` | all                                                                              | Full screen was entered or left                                                                                             | `{ fullscreen }`: `true` or `false`                                                                                                                                                                                                                              |
| `vt-sort`              | `SORT`              | `<vt-csv>`                                                                       | A column header was clicked                                                                                                 | `{ column, name, direction }`                                                                                                                                                                                                                                    |
| `vt-layout-change`     | `LAYOUT_CHANGE`     | `<vt-markdown>`, `<vt-diff>`                                                     | A split view button changed the layout; on `<vt-diff>`, scroll sync was turned on or off                                    | `{ preview, sync }`; `{ sync }` on `<vt-diff>`                                                                                                                                                                                                                   |
| `vt-change-navigate`   | `CHANGE_NAVIGATE`   | `<vt-diff>`                                                                      | Moved to a change                                                                                                           | `{ index, total, original, modified }`                                                                                                                                                                                                                           |
| `vt-select`            | `SELECT`            | `<vt-tree>`, `<vt-chart>`, `<vt-openapi>`                                        | An entry was selected; on `<vt-chart>`, a value was clicked or chosen with Enter; on `<vt-openapi>`, an endpoint was opened | `{ path, name, type, note, status }`; `{ index, label, values }` on `<vt-chart>`; `{ method, path, operationId }` on `<vt-openapi>`                                                                                                                              |
| `vt-toggle`            | `TOGGLE`            | `<vt-tree>`                                                                      | A folder was opened or closed                                                                                               | `{ path, expanded }`                                                                                                                                                                                                                                             |
| `vt-filter-change`     | `FILTER_CHANGE`     | `<vt-log>`                                                                       | A level was shown or hidden, or a search ran                                                                                | `{ levels, query, shown }`                                                                                                                                                                                                                                       |
| `vt-typing-end`        | `TYPING_END`        | `<vt-terminal>`                                                                  | The typing replay finished or was stopped                                                                                   | `{}`                                                                                                                                                                                                                                                             |
| `vt-error`             | `ERROR`             | all                                                                              | Content could not be loaded or displayed                                                                                    | `{ message, cause }`: a translated message and the original error                                                                                                                                                                                                |

`<vt-tags>` also dispatches `vt-tag-add`, `vt-tag-remove`, `vt-tag-create` and `vt-tag-click` (`EVENTS.TAG_ADD`, `TAG_REMOVE`, `TAG_CREATE` and `TAG_CLICK`); see [`<vt-tags>` events](components/tags.md#events).

```js
document.addEventListener('vt-copy', (event) => {
  console.log('Copied from', event.target.localName, event.detail.text.length, 'characters');
});

document.querySelector('vt-code').addEventListener('vt-error', (event) => {
  console.warn(event.detail.message);
});
```

For loading and size errors, `detail.cause` is an `Error` whose `name` is `"VitrineError"` and whose `code` is one of `tooLarge`, `tooComplex`, `tooDeep`, `remoteBlocked`, `unsafeUrl`, `timeout`, `loadFailed` or `invalidJson`, with the message parameters in `params`. For invalid JSON in `<vt-json>`, `cause` is an object with `message`, `offset`, `line`, `column` and `tooDeep`.

Events are created as cancelable. Calling `preventDefault()` only has an effect on `vt-tag-create`, where it refuses the new tag.

## Shared CSS parts

These parts exist on every component. Style them with `::part()` (see [Theming](theming.md#styling-parts)).

| Part                         | Element                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `container`                  | The outer frame                                                                                 |
| `header`                     | The header bar                                                                                  |
| `status-dot`                 | The accent dot at the start of the header                                                       |
| `title`                      | The header title                                                                                |
| `badge`                      | The language or type badge                                                                      |
| `toolbar`                    | The group of action buttons                                                                     |
| `button`                     | Every icon button                                                                               |
| `copy-button`                | Copy buttons (icon buttons and the text buttons of the JSON path bar)                           |
| `download-button`            | The download button                                                                             |
| `search-button`              | The search toggle button                                                                        |
| `search`                     | The search bar                                                                                  |
| `search-input`               | The search field                                                                                |
| `search-count`               | The match counter                                                                               |
| `match`                      | A highlighted search match                                                                      |
| `body`                       | The scrollable content area                                                                     |
| `notice`                     | A notice above the content (for example "syntax highlighting is disabled")                      |
| `error`                      | The error message                                                                               |
| `empty`                      | The "Nothing to display" message                                                                |
| `loading`                    | The loading placeholder                                                                         |
| `tabs`                       | The tab list (`<vt-markdown>`, `<vt-json>`, `<vt-csv>`, `<vt-diff>`, `<vt-http>`, `<vt-chart>`) |
| `tab`, `tab-active`          | A tab; the selected one also has `tab-active`                                                   |
| `fullscreen-button`          | The full screen button                                                                          |
| `edit-button`                | The edit toggle button                                                                          |
| `undo-button`, `redo-button` | The undo and redo buttons (edit mode)                                                           |
| `editor`                     | The text field of a code editor (edit mode)                                                     |
