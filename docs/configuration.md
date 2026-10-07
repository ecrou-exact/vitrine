# Configuration and JavaScript API

This page describes the global configuration, locales, and the JavaScript API exposed by Vitrine.

With the classic script, the API is the global `Vitrine` object. With the ES module, import the same names (the per-component modules export only part of the API; see [Per-component modules](getting-started.md#per-component-modules)):

```js
import { configure, render, defineAll } from 'https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/vitrine.esm.js';
```

## API overview

| Name                                                          | Description                                                                                        |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `configure(options)`                                          | Changes the global configuration.                                                                  |
| `getConfig()`                                                 | Returns the current configuration.                                                                 |
| `registerTheme(name, options)`                                | Adds or replaces a theme. See [Theming](theming.md#registering-a-theme).                           |
| `listThemes()`                                                | Returns the registered theme names.                                                                |
| `getTheme(name)`                                              | Returns a copy of a theme definition, or `undefined`. See [Theming](theming.md#inspecting-themes). |
| `BUILT_IN_THEMES`                                             | The built-in theme names.                                                                          |
| `listSyntaxThemes()`                                          | Returns the available syntax theme names. See [Syntax themes](theming.md#syntax-themes).           |
| `registerLocale(code, strings)`                               | Adds or extends a locale for interface strings.                                                    |
| `render(target, options)`                                     | Creates and configures an element in a container.                                                  |
| `defineAll()`                                                 | Defines the custom elements.                                                                       |
| `registry`                                                    | Map of tag names to element classes.                                                               |
| `VtCode`, `VtMarkdown`, `VtJson`, `VtCsv`, `VtTags`, `VtDiff` | The element classes.                                                                               |
| `EVENTS`                                                      | Event names.                                                                                       |
| `version`                                                     | Library version.                                                                                   |

## `configure(options)`

Sets global defaults. Attributes on an element always win over the configuration.

```js
Vitrine.configure({
  theme: 'auto',
  lightTheme: 'paper',
  darkTheme: 'dim',
  lang: 'fr',
  maxSize: 500_000,
});
```

| Option            | Type   | Default           | Ceiling             | Description                                                                                                                                |
| ----------------- | ------ | ----------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `theme`           | string | `"auto"`          |                     | Default theme name, or `auto` to follow the system color scheme.                                                                           |
| `lightTheme`      | string | `"light"`         |                     | Theme used by `auto` when the user prefers a light scheme.                                                                                 |
| `darkTheme`       | string | `"dark"`          |                     | Theme used by `auto` when the user prefers a dark scheme.                                                                                  |
| `lang`            | string | `"en"`            |                     | Default interface locale, used when an element has no valid `lang-ui`.                                                                     |
| `maxSize`         | number | `2097152` (2 MiB) | `52428800` (50 MiB) | Maximum content length, in characters. Larger content is refused with an error.                                                            |
| `highlightLimit`  | number | `300000`          | `5242880` (5 MiB)   | Content longer than this, in characters, is shown without syntax highlighting.                                                             |
| `maxDepth`        | number | `512`             | `10000`             | Maximum nesting depth accepted by the JSON parser.                                                                                         |
| `fetchTimeout`    | number | `15000`           | `120000`            | Timeout of `src` requests, in milliseconds.                                                                                                |
| `languagesUrl`    | string | `""`              |                     | Base URL of the lazy-loaded language files. Empty means "the `languages/` folder next to the Vitrine script".                              |
| `syntaxTheme`     | string | `""`              |                     | Default syntax theme, for example `"github"`. Empty uses the colors of the interface theme. See [Syntax themes](theming.md#syntax-themes). |
| `syntaxThemeDark` | string | `""`              |                     | Syntax theme used when the interface theme is dark.                                                                                        |
| `syntaxThemesUrl` | string | `""`              |                     | Base URL of the syntax theme files. Empty means "the `syntax-themes/` folder next to the Vitrine script".                                  |

Validation rules:

- Unknown option names are ignored, with a console warning.
- Number options must be finite and greater than zero; anything else is ignored with a warning. Values are rounded down to an integer and capped at the ceiling.
- String options must be strings of at most 2,048 characters; they are trimmed. Anything else is ignored with a warning.
- Theme names are not checked here: an unknown name falls back as described in [Theming](theming.md#auto).

`configure()` returns the resulting configuration. When a value actually changed, every connected Vitrine element re-renders with the new values. Elements reload their content (and fetch `src` again) only when `maxSize` changed, since it decides what may be shown.

Call `configure()` before the elements are created when you can, for example right after the Vitrine script:

```html
<script src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/vitrine.min.js"></script>
<script src="/js/vitrine-setup.js"></script>
```

```js
// /js/vitrine-setup.js
Vitrine.configure({ theme: 'dark', fetchTimeout: 30_000 });
```

## `getConfig()`

Returns a frozen snapshot of the current configuration:

```js
const { maxSize, theme } = Vitrine.getConfig();
```

## Locales

Interface strings (button labels, messages, announcements) are translated. Vitrine ships English (`en`) and French (`fr`). The locale of an element is its `lang-ui` attribute when valid, otherwise the configured `lang`.

### `registerLocale(code, strings)`

Adds a locale, or extends an existing one (including `en` and `fr`):

```js
Vitrine.registerLocale('de', {
  copy: 'Kopieren',
  copyCode: 'Code kopieren',
  copied: 'Kopiert',
  search: 'Suchen',
  searchPlaceholder: 'Suchen…',
});
```

- `code` must look like `de`, `pt-BR` or `zh-Hant-TW`: 2 or 3 lowercase letters, then optional `-` segments of 2 to 8 letters or digits. An invalid code throws a `TypeError`.
- Only the keys listed below are kept; other keys and non-string values are ignored. Each string is cut to 500 characters.
- Calling it again for the same code merges the new strings with the previous ones.
- Strings are always inserted as text, never as HTML.

Register locales before the elements render. An element that is already displayed picks up new strings the next time it renders.

### Fallback rules

For each string, Vitrine uses the first translation found in:

1. the exact locale (`pt-BR`);
2. its base language (`pt`);
3. English.

So a partial locale is fine: missing strings are shown in English.

### String keys

Placeholders in braces are replaced by values. Keep them in your translations.

| Key                  | English text                                                            |
| -------------------- | ----------------------------------------------------------------------- |
| `copy`               | Copy                                                                    |
| `copyCode`           | Copy code                                                               |
| `copied`             | Copied                                                                  |
| `copyFailed`         | Copy failed                                                             |
| `copySource`         | Copy source                                                             |
| `download`           | Download                                                                |
| `search`             | Search                                                                  |
| `searchPlaceholder`  | Search…                                                                 |
| `searchNext`         | Next match                                                              |
| `searchPrevious`     | Previous match                                                          |
| `searchClose`        | Close search                                                            |
| `searchCount`        | {current} / {total}                                                     |
| `searchCountCapped`  | {current} / {total}+                                                    |
| `searchNone`         | No matches                                                              |
| `searchResults`      | {total} matches                                                         |
| `wrap`               | Toggle line wrap                                                        |
| `showMore`           | Show all {count} lines                                                  |
| `preview`            | Preview                                                                 |
| `source`             | Source                                                                  |
| `split`              | Split                                                                   |
| `swapPanes`          | Swap panes                                                              |
| `stackPanes`         | Stack panes                                                             |
| `syncScroll`         | Sync scrolling                                                          |
| `tabs`               | View                                                                    |
| `actions`            | Actions                                                                 |
| `toc`                | Table of contents                                                       |
| `anchor`             | Link to this section                                                    |
| `table`              | Table                                                                   |
| `tree`               | Tree                                                                    |
| `raw`                | Raw                                                                     |
| `expandAll`          | Expand all                                                              |
| `collapseAll`        | Collapse all                                                            |
| `copyPath`           | Copy path                                                               |
| `copyValue`          | Copy value                                                              |
| `items`              | {count} items                                                           |
| `item`               | 1 item                                                                  |
| `keys`               | {count} keys                                                            |
| `key`                | 1 key                                                                   |
| `showMoreItems`      | Show {count} more                                                       |
| `showFullString`     | Show full string ({count} characters)                                   |
| `truncated`          | Partially expanded: too many nodes.                                     |
| `loading`            | Loading…                                                                |
| `errorTitle`         | Unable to display content                                               |
| `invalidJson`        | Invalid JSON at line {line}, column {column}: {message}.                |
| `invalidJsonRaw`     | Invalid JSON at line {line}, column {column} — showing raw text.        |
| `empty`              | Nothing to display                                                      |
| `tooLarge`           | Content is too large ({size} characters, limit {limit}).                |
| `tooDeep`            | Nesting is too deep (limit {limit}).                                    |
| `tooComplex`         | This document is nested too deeply to display.                          |
| `unserializable`     | This value cannot be converted to JSON (circular reference or BigInt).  |
| `highlightSkipped`   | Content is large: syntax highlighting is disabled.                      |
| `loadFailed`         | Could not load "{url}": {reason}                                        |
| `remoteBlocked`      | Cross-origin URL blocked. Add the "allow-remote" attribute to allow it. |
| `unsafeUrl`          | URL blocked: only http(s) URLs can be loaded.                           |
| `timeout`            | Request timed out.                                                      |
| `added`              | Added                                                                   |
| `removed`            | Removed                                                                 |
| `code`               | Code                                                                    |
| `edit`               | Edit                                                                    |
| `splitView`          | Side by side                                                            |
| `unifiedView`        | Unified                                                                 |
| `diffStats`          | +{added} −{removed}                                                     |
| `diffSimplified`     | Many changes: the comparison is simplified to removed and added blocks. |
| `noDifferences`      | No differences                                                          |
| `unchangedLines`     | Show {count} unchanged lines                                            |
| `copyPatch`          | Copy patch                                                              |
| `changes`            | Changes                                                                 |
| `original`           | Original                                                                |
| `modified`           | Modified                                                                |
| `patch`              | Patch                                                                   |
| `tags`               | Tags                                                                    |
| `noTags`             | No tags                                                                 |
| `addTag`             | Add a tag                                                               |
| `tagPlaceholder`     | tag                                                                     |
| `suggestions`        | Suggestions                                                             |
| `createTag`          | Create "{tag}"                                                          |
| `removeTag`          | Remove {tag}                                                            |
| `tagAdded`           | {tag} added                                                             |
| `tagRemoved`         | {tag} removed                                                           |
| `pressAgainToRemove` | Press Backspace again to remove {tag}                                   |
| `tagDuplicate`       | {tag} is already selected.                                              |
| `tagDisabled`        | {tag} cannot be selected.                                               |
| `tagLimit`           | You can select up to {max} tags.                                        |
| `tagNotAllowed`      | {tag} is not in the list.                                               |
| `tagTooLong`         | {tag} is too long.                                                      |
| `tagInvalid`         | {tag} is not a valid tag.                                               |
| `tagRefused`         | {tag} was refused.                                                      |
| `tagsRequired`       | Select at least one tag.                                                |
| `tagCount`           | {count} tags                                                            |
| `tagCountOne`        | 1 tag                                                                   |
| `tagCountMax`        | {count} / {max} tags                                                    |
| `browseTags`         | Browse all tags                                                         |
| `otherTags`          | Other                                                                   |
| `clearTags`          | Remove all tags                                                         |
| `filterTags`         | Filter tags                                                             |
| `tagsFound`          | {count} tags                                                            |
| `invalidTags`        | The tags must be a JSON array, or an object with "value" and "options". |
| `rowsRange`          | Rows {from}–{to} of {total}                                             |
| `noRows`             | No rows                                                                 |
| `firstPage`          | First page                                                              |
| `previousPage`       | Previous page                                                           |
| `nextPage`           | Next page                                                               |
| `lastPage`           | Last page                                                               |
| `sortBy`             | Sort by {name}                                                          |
| `column`             | Column {n}                                                              |
| `rowNumber`          | Row                                                                     |
| `csvStatus`          | {rows} rows × {columns} columns                                         |
| `csvUnclosed`        | Unclosed quote starting at line {line}.                                 |
| `tooManyColumns`     | Only the first {limit} columns are shown.                               |
| `matchingRows`       | {count} matching rows                                                   |
| `undo`               | Undo                                                                    |
| `redo`               | Redo                                                                    |
| `fullscreen`         | Full screen                                                             |
| `exitFullscreen`     | Exit full screen                                                        |
| `stopEditing`        | Stop editing                                                            |
| `editor`             | Editor                                                                  |
| `validJson`          | Valid JSON                                                              |

The `{message}` part of `invalidJson` comes from the JSON parser and is always in English. In `diffStats`, `−` is the minus sign (U+2212).

## `render(target, options)`

Creates a Vitrine element, configures it, and puts it in `target`, replacing the target's children. It defines the elements first if needed, and returns the new element.

```js
const element = Vitrine.render(document.querySelector('#target'), {
  type: 'code',
  content: source,
  variant: 'full',
  options: { language: 'python', highlightLines: '2-3', lineNumbers: true },
});
```

| Option    | Type                                                            | Description                                                         |
| --------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `type`    | `"code"`, `"markdown"`, `"json"`, `"csv"`, `"tags"` or `"diff"` | Component to create (`vt-<type>`). Required.                        |
| `content` | string                                                          | Content, set through the `content` property (never parsed as HTML). |
| `variant` | `"simple"` or `"full"`                                          | Feature preset.                                                     |
| `options` | object                                                          | Attributes to set.                                                  |

How `options` become attributes:

- camelCase names are converted to kebab-case: `lineNumbers` sets `line-numbers`, `highlightLines` sets `highlight-lines`. Kebab-case names (`'line-numbers'`) work too.
- `true` sets an empty attribute (feature on); `false` sets the value `"false"` (feature off); `null` and `undefined` are skipped. Other values are converted to strings.
- Names that match `/^on[a-z]*$/` after conversion are ignored, so event handler attributes such as `onclick` can never be set. Vitrine attributes that start with `on` contain a hyphen, so `onInvalid` (or `'on-invalid'`) still sets `on-invalid` on `<vt-json>`. Names that are not made of a lowercase letter followed by lowercase letters, digits and hyphens after conversion are ignored too.

A non-element `target` or an unknown `type` throws a `TypeError`. `type` is one of `code`, `markdown`, `json`, `csv`, `tags` and `diff`; for `<vt-tags>` and `<vt-diff>`, set their other properties (`options`, `original`, `modified`) on the returned element.

```js
Vitrine.render(container, {
  type: 'json',
  content: text,
  options: { onInvalid: 'raw', mode: 'edit', syntaxTheme: 'github' },
});
```

To listen to events, add listeners on the returned element or on an ancestor:

```js
const viewer = Vitrine.render(container, { type: 'json', content: text });
viewer.addEventListener('vt-error', (event) => console.warn(event.detail.message));
```

## `listSyntaxThemes()`

Returns the names of the syntax themes that can be used in `syntax-theme`, `syntax-theme-dark`, `syntaxTheme` and `syntaxThemeDark` (258 names in the current build), without loading any of them:

```js
const select = document.querySelector('#syntax');
for (const name of Vitrine.listSyntaxThemes()) select.add(new Option(name, name));
select.addEventListener('change', () => Vitrine.configure({ syntaxTheme: select.value }));
```

The title, color scheme and measured contrast of each theme are in `dist/syntax-themes/index.json` (see [Contrast of syntax themes](theming.md#contrast-of-syntax-themes)).

## `defineAll()`

Defines `vt-code`, `vt-markdown`, `vt-json`, `vt-csv`, `vt-tags` and `vt-diff` with `customElements.define()`, skipping any tag that is already defined. It returns the list of tags defined by this call.

The classic script calls it automatically. With the ES module, call it yourself:

```js
import { defineAll } from './vendor/vitrine/dist/vitrine.esm.js';

defineAll();
```

## `registry`

A `Map` from tag names to element classes:

```js
for (const [tag, ElementClass] of Vitrine.registry) {
  console.log(tag, ElementClass.name); // "vt-code VtCode", …
}
```

The classes are also exported directly as `VtCode`, `VtMarkdown`, `VtJson`, `VtCsv`, `VtTags` and `VtDiff`, for example to check an element with `instanceof`:

```js
const element = document.querySelector('#viewer');
if (element instanceof Vitrine.VtCode) element.content = source;
```

## `version`

The library version as a string, set at build time (for example `"1.2.0"`).

## `EVENTS`

The event names, as a frozen object:

| Key                 | Event                  |
| ------------------- | ---------------------- |
| `READY`             | `vt-ready`             |
| `COPY`              | `vt-copy`              |
| `SEARCH`            | `vt-search`            |
| `TAB_CHANGE`        | `vt-tab-change`        |
| `INPUT`             | `vt-input`             |
| `CHANGE`            | `vt-change`            |
| `MODE_CHANGE`       | `vt-mode-change`       |
| `SORT`              | `vt-sort`              |
| `FULLSCREEN_CHANGE` | `vt-fullscreen-change` |
| `LAYOUT_CHANGE`     | `vt-layout-change`     |
| `ERROR`             | `vt-error`             |

The `<vt-tags>` events `vt-tag-add`, `vt-tag-remove`, `vt-tag-create` and `vt-tag-click` are not in `EVENTS`.

```js
element.addEventListener(Vitrine.EVENTS.COPY, (event) => {
  analytics.track('copy', { length: event.detail.text.length });
});
```

Event details are described in [Common attributes](common-attributes.md#events).
