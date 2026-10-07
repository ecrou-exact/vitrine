# Common attributes and events

The attributes and events on this page work the same way on `<vt-code>`, `<vt-markdown>` and `<vt-json>`. Component-specific attributes are described in each component reference.

## How attribute values are read

- **Boolean attributes** are on when present with no value or with any value other than `false`, `off`, `no` or `0` (case-insensitive). `copy`, `copy=""` and `copy="true"` turn the feature on; `copy="false"` turns it off.
- **An absent boolean attribute** lets the `variant` preset decide.
- **Enumerated attributes** (such as `variant`) are case-insensitive. An unknown value falls back to the default.
- **Invalid values never throw.** They are ignored and the default applies.

Attributes are observed: changing one after the element is on the page updates it.

## Attribute reference

| Attribute      | Type                 | Default                     | Description                                        |
| -------------- | -------------------- | --------------------------- | -------------------------------------------------- |
| `variant`      | `simple` or `full`   | `simple`                    | Feature preset. Individual attributes override it. |
| `theme`        | theme name or `auto` | configured `theme` (`auto`) | Color theme. See [Theming](theming.md).            |
| `src`          | URL                  | none                        | Loads the content from a URL.                      |
| `allow-remote` | boolean              | off                         | Allows `src` to point to another origin.           |
| `max-height`   | CSS length           | none                        | Maximum height of the scrollable content area.     |
| `copy`         | boolean              | preset                      | Shows a copy button.                               |
| `search`       | boolean              | preset                      | Shows a search button and search bar.              |
| `download`     | boolean or file name | preset                      | Shows a download button.                           |
| `header`       | boolean              | preset                      | Shows the header bar.                              |
| `dot`          | boolean              | preset                      | Shows the status dot at the start of the header.   |
| `label`        | text                 | none                        | Header title, for example a file name.             |
| `title`        | text                 | none                        | Header title, used when `label` is absent.         |
| `lang-ui`      | locale code          | configured `lang` (`en`)    | Language of the interface strings.                 |

The `full` variant of every component turns on `header`, `dot`, `copy` and `search`. Other preset values differ per component (for example, `download` is part of the full preset of `<vt-code>` and `<vt-json>`, but not of `<vt-markdown>`). See each component reference for the exact list.

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

In the split view of `<vt-markdown>`, each pane is limited separately.

### `copy`

Shows a copy button. What is copied depends on the component:

| Component       | Button label | Copied text                                                                |
| --------------- | ------------ | -------------------------------------------------------------------------- |
| `<vt-code>`     | Copy code    | The full source text                                                       |
| `<vt-markdown>` | Copy source  | The Markdown source; each fenced code block also gets a "Copy code" button |
| `<vt-json>`     | Copy         | The pretty-printed JSON (using the current `indent` and `sort-keys`)       |

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

| Component       | Downloaded text         | File name                                                                                                               | MIME type          |
| --------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `<vt-code>`     | The source text         | The `download` value, else a `label`/`title` that looks like a file name (it ends with an extension), else `code.<ext>` | `text/plain`       |
| `<vt-markdown>` | The Markdown source     | The `label`/`title`, else `document.md`                                                                                 | `text/markdown`    |
| `<vt-json>`     | The pretty-printed JSON | The `label`/`title`, else `data.json`                                                                                   | `application/json` |

File names are cleaned: path segments, control characters and the characters `< > : " | ? *` are removed, leading dots and spaces are stripped, and the name is limited to 120 characters.

```html
<vt-code download="install.sh" language="bash">curl -fsSL https://example.com/install | sh</vt-code>
```

Only `<vt-code>` uses the value of the `download` attribute as the file name. On `<vt-markdown>` and `<vt-json>`, use `label` to choose the file name.

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

## Floating toolbar when the header is off

When the header is off but some actions are on (for example `<vt-code copy>` in the simple variant), the action buttons are shown in a small floating toolbar over the top-right corner of the content. It appears when the pointer is over the element or when one of its buttons has keyboard focus, and it is always visible on devices without hover (touch screens).

```html
<vt-code copy search language="bash">npm run build</vt-code>
```

Tabs (on `<vt-markdown>` and `<vt-json>`) and the search bar are shown above the content in this case.

## Events

Every event is a `CustomEvent` that bubbles and crosses the shadow DOM boundary (`composed: true`), so you can listen on the element or on any ancestor. Event names are also available as `Vitrine.EVENTS`.

| Event           | `EVENTS` key | Dispatched by                | When                                                                                                              | `detail`                                                              |
| --------------- | ------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `vt-ready`      | `READY`      | all                          | Content was rendered (after each new content: initial load, `content` change, `src` change, configuration change) | `{ type }`: `"code"`, `"markdown"` or `"json"`                        |
| `vt-copy`       | `COPY`       | all                          | Text was copied successfully                                                                                      | `{ text }`: the copied text                                           |
| `vt-search`     | `SEARCH`     | all                          | A search ran (including an empty query after clearing)                                                            | `{ query, matches }`: the query and the number of highlighted matches |
| `vt-tab-change` | `TAB_CHANGE` | `<vt-markdown>`, `<vt-json>` | The user changed the tab or view                                                                                  | `{ tab }`: `"preview"`, `"source"`, `"split"`, `"tree"` or `"raw"`    |
| `vt-error`      | `ERROR`      | all                          | Content could not be loaded or displayed                                                                          | `{ message, cause }`: a translated message and the original error     |

```js
document.addEventListener('vt-copy', (event) => {
  console.log('Copied from', event.target.localName, event.detail.text.length, 'characters');
});

document.querySelector('vt-code').addEventListener('vt-error', (event) => {
  console.warn(event.detail.message);
});
```

For loading and size errors, `detail.cause` is an `Error` whose `name` is `"VitrineError"` and whose `code` is one of `tooLarge`, `tooDeep`, `remoteBlocked`, `unsafeUrl`, `timeout`, `loadFailed` or `invalidJson`, with the message parameters in `params`. For invalid JSON in `<vt-json>`, `cause` is an object with `message`, `offset`, `line`, `column` and `tooDeep`.

Events are created as cancelable, but calling `preventDefault()` has no effect on Vitrine's behavior.

## Shared CSS parts

These parts exist on every component. Style them with `::part()` (see [Theming](theming.md#styling-parts)).

| Part                | Element                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `container`         | The outer frame                                                            |
| `header`            | The header bar                                                             |
| `status-dot`        | The accent dot at the start of the header                                  |
| `title`             | The header title                                                           |
| `badge`             | The language or type badge                                                 |
| `toolbar`           | The group of action buttons                                                |
| `button`            | Every icon button                                                          |
| `copy-button`       | Copy buttons (icon buttons and the text buttons of the JSON path bar)      |
| `download-button`   | The download button                                                        |
| `search-button`     | The search toggle button                                                   |
| `search`            | The search bar                                                             |
| `search-input`      | The search field                                                           |
| `search-count`      | The match counter                                                          |
| `match`             | A highlighted search match                                                 |
| `body`              | The scrollable content area                                                |
| `notice`            | A notice above the content (for example "syntax highlighting is disabled") |
| `error`             | The error message                                                          |
| `empty`             | The "Nothing to display" message                                           |
| `loading`           | The loading placeholder                                                    |
| `tabs`              | The tab list (`<vt-markdown>`, `<vt-json>`)                                |
| `tab`, `tab-active` | A tab; the selected one also has `tab-active`                              |
