# Theming

Vitrine elements render inside Shadow DOM, so your page styles do not leak into them by accident. You customize them in three ways:

1. Pick a **theme** with the `theme` attribute or the global configuration.
2. Override **design tokens** (CSS custom properties named `--vt-*`) on the element or any ancestor.
3. Style individual pieces with **`::part()`** selectors.

Styles are applied with constructable stylesheets, so theming works under a strict `style-src` Content Security Policy.

## Built-in themes

| Theme           | Color scheme | Description                                            |
| --------------- | ------------ | ------------------------------------------------------ |
| `light`         | light        | Default light theme                                    |
| `dark`          | dark         | Default dark theme                                     |
| `dim`           | dark         | Softer, blue-grey dark theme for long reading sessions |
| `paper`         | light        | Warm, low-glare light theme                            |
| `high-contrast` | dark         | Maximum legibility                                     |

```html
<vt-code theme="dim" language="js">const a = 1;</vt-code>
```

The color scheme sets the native `color-scheme` of the element (scrollbars, form controls).

### `auto`

`auto` follows the user's system preference (`prefers-color-scheme`): it uses the configured `lightTheme` (default `light`) or `darkTheme` (default `dark`), and switches live when the preference changes. `auto` is the default theme.

```js
Vitrine.configure({ theme: 'auto', lightTheme: 'paper', darkTheme: 'dim' });
```

How the theme is chosen:

1. The element's `theme` attribute, when it names a registered theme or `auto` (trimmed, case-insensitive).
2. Otherwise the configured `theme`, when it names a registered theme.
3. Otherwise `auto`.

With `auto`, if the configured `lightTheme` or `darkTheme` is not a registered theme, `light` or `dark` is used.

Set a page-wide default once:

```js
Vitrine.configure({ theme: 'dark' });
```

## Overriding tokens

Every token has a public name starting with `--vt-`. Set it on the element, or on any ancestor, to override the value of the current theme:

```css
/* One element */
vt-code.brand {
  --vt-accent: #7c9cff;
  --vt-radius: 4px;
}

/* Every Vitrine element on the page */
:root {
  --vt-font-mono: 'Fira Code', ui-monospace, monospace;
  --vt-font-size: 15px;
}
```

A value set this way wins over **every** theme, including the dark ones. To change a color for one theme only, scope the rule to that theme:

```css
vt-code[theme='dark'],
vt-json[theme='dark'] {
  --vt-surface-sunken: #05070a;
}
```

### Color tokens

Every theme defines these 31 tokens. Values per built-in theme:

| Token                    | Role                                                  | `light`                             | `dark`                           | `dim`                           | `paper`                             | `high-contrast`             |
| ------------------------ | ----------------------------------------------------- | ----------------------------------- | -------------------------------- | ------------------------------- | ----------------------------------- | --------------------------- |
| `--vt-bg`                | Page background (not used inside the components)      | `#f3f4f1`                           | `#11151c`                        | `#1b2230`                       | `#f4efe4`                           | `#000000`                   |
| `--vt-surface`           | Container, header and Markdown preview background     | `#ffffff`                           | `#171c25`                        | `#212a3a`                       | `#fbf8f1`                           | `#000000`                   |
| `--vt-surface-sunken`    | Code, JSON, input and table of contents background    | `#eaece7`                           | `#0c0f14`                        | `#192030`                       | `#f0e9da`                           | `#0a0a0a`                   |
| `--vt-surface-raised`    | Raised elements (keyboard keys in Markdown)           | `#ffffff`                           | `#1e2430`                        | `#29334a`                       | `#fffdf8`                           | `#141414`                   |
| `--vt-border`            | Hairlines and dividers                                | `#d6d9d2`                           | `#262d3a`                        | `#33405a`                       | `#ddd3c0`                           | `#8a8a8a`                   |
| `--vt-border-strong`     | Input and button borders                              | `#b9beb4`                           | `#3a4354`                        | `#46557a`                       | `#c3b79f`                           | `#ffffff`                   |
| `--vt-fg`                | Main text                                             | `#11151c`                           | `#e8eae6`                        | `#dce2ec`                       | `#2b2620`                           | `#ffffff`                   |
| `--vt-fg-muted`          | Secondary text: line numbers, badges, counts          | `#4a5260`                           | `#9aa3b2`                        | `#a3adc0`                       | `#5c5347`                           | `#d6d6d6`                   |
| `--vt-accent`            | Accent fills: status dot, focus ring, active tab      | `#14b8a6`                           | `#14b8a6`                        | `#14b8a6`                       | `#14b8a6`                           | `#2ee6d0`                   |
| `--vt-accent-fg`         | Accent text and links                                 | `#0a6e6f`                           | `#14b8a6`                        | `#2dd4bf`                       | `#0a6566`                           | `#5eead4`                   |
| `--vt-on-accent`         | Text on accent fills (not used inside the components) | `#11151c`                           | `#11151c`                        | `#11151c`                       | `#11151c`                           | `#000000`                   |
| `--vt-accent-soft`       | Hover and selection background                        | `rgba(20, 184, 166, 0.12)`          | `rgba(20, 184, 166, 0.16)`       | `rgba(45, 212, 191, 0.16)`      | `rgba(20, 184, 166, 0.14)`          | `rgba(46, 230, 208, 0.22)`  |
| `--vt-highlight`         | Search match background                               | `rgba(242, 169, 59, 0.35)`          | `rgba(242, 169, 59, 0.3)`        | `rgba(242, 169, 59, 0.3)`       | `rgba(242, 169, 59, 0.38)`          | `rgba(255, 214, 0, 0.35)`   |
| `--vt-highlight-current` | Current search match background                       | `rgba(242, 169, 59, 0.7)`           | `rgba(242, 169, 59, 0.6)`        | `rgba(242, 169, 59, 0.6)`       | `rgba(242, 169, 59, 0.72)`          | `rgba(255, 214, 0, 0.55)`   |
| `--vt-line-highlight`    | Emphasized lines (`highlight-lines`)                  | `rgba(20, 184, 166, 0.1)`           | `rgba(20, 184, 166, 0.12)`       | `rgba(45, 212, 191, 0.12)`      | `rgba(20, 184, 166, 0.11)`          | `rgba(46, 230, 208, 0.18)`  |
| `--vt-success`           | Success (copied, added lines)                         | `#0a6e6f`                           | `#14b8a6`                        | `#2dd4bf`                       | `#0a6566`                           | `#5eead4`                   |
| `--vt-warning`           | Warnings                                              | `#a6510b`                           | `#f2a93b`                        | `#f2a93b`                       | `#974a09`                           | `#ffd166`                   |
| `--vt-danger`            | Errors, removed lines                                 | `#b2384f`                           | `#ff8f73`                        | `#ff9b82`                       | `#a63148`                           | `#ffa08a`                   |
| `--vt-info`              | Diff hunk headers                                     | `#2f55c9`                           | `#7c9cff`                        | `#8faeff`                       | `#2b4fbd`                           | `#a8c1ff`                   |
| `--vt-diff-added`        | Added diff line background                            | `rgba(20, 184, 166, 0.12)`          | `rgba(20, 184, 166, 0.16)`       | `rgba(45, 212, 191, 0.16)`      | `rgba(20, 184, 166, 0.14)`          | `rgba(46, 230, 208, 0.22)`  |
| `--vt-diff-removed`      | Removed diff line background                          | `rgba(178, 56, 79, 0.12)`           | `rgba(255, 143, 115, 0.14)`      | `rgba(255, 155, 130, 0.16)`     | `rgba(166, 49, 72, 0.12)`           | `rgba(255, 160, 138, 0.24)` |
| `--vt-shadow`            | Shadow value (not used inside the components)         | `0 8px 24px rgba(17, 21, 28, 0.12)` | `0 8px 24px rgba(0, 0, 0, 0.45)` | `0 8px 24px rgba(0, 0, 0, 0.4)` | `0 8px 24px rgba(43, 38, 32, 0.12)` | `0 0 0 1px #ffffff`         |
| `--vt-syntax-keyword`    | Keywords and literals (`true`, `null`)                | `#7a3ec8`                           | `#c4a5ff`                        | `#c9aeff`                       | `#7239bd`                           | `#dcc2ff`                   |
| `--vt-syntax-string`     | Strings                                               | `#0a6e6f`                           | `#5eead4`                        | `#6ee7d5`                       | `#0a6566`                           | `#7cf5e0`                   |
| `--vt-syntax-number`     | Numbers                                               | `#a6510b`                           | `#f2a93b`                        | `#f5b85c`                       | `#974a09`                           | `#ffd166`                   |
| `--vt-syntax-function`   | Function and section titles                           | `#2f55c9`                           | `#7c9cff`                        | `#8faeff`                       | `#2b4fbd`                           | `#a8c1ff`                   |
| `--vt-syntax-type`       | Types and classes                                     | `#b2384f`                           | `#ff8f73`                        | `#ff9b82`                       | `#a63148`                           | `#ffb3a1`                   |
| `--vt-syntax-comment`    | Comments                                              | `#5f6773`                           | `#8a93a3`                        | `#95a0b5`                       | `#6b6255`                           | `#c8c8c8`                   |
| `--vt-syntax-attr`       | Attributes, properties, JSON keys                     | `#2f55c9`                           | `#7c9cff`                        | `#8faeff`                       | `#2b4fbd`                           | `#a8c1ff`                   |
| `--vt-syntax-tag`        | Tags and selectors                                    | `#b2384f`                           | `#ff8f73`                        | `#ff9b82`                       | `#a63148`                           | `#ffb3a1`                   |
| `--vt-syntax-meta`       | Punctuation and meta                                  | `#4a5260`                           | `#9aa3b2`                        | `#a3adc0`                       | `#5c5347`                           | `#e0e0e0`                   |

`--vt-bg`, `--vt-on-accent` and `--vt-shadow` are part of every theme so host pages can match it, but the component styles do not currently use them.

### Typography tokens

| Token                  | Default                                                                                  | Description                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `--vt-font-ui`         | `system-ui, -apple-system, 'Segoe UI', 'IBM Plex Sans', Roboto, sans-serif`              | Interface font (header, buttons, tabs, messages)                    |
| `--vt-font-mono`       | `'JetBrains Mono', ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace` | Code, JSON and source font                                          |
| `--vt-font-size`       | `14px`                                                                                   | Code and JSON font size                                             |
| `--vt-font-size-small` | `12px`                                                                                   | Line numbers, badges, notices                                       |
| `--vt-font-size-ui`    | `13px`                                                                                   | Interface font size                                                 |
| `--vt-line-height`     | `1.6`                                                                                    | Code and JSON line height                                           |
| `--vt-font-ligatures`  | `none`                                                                                   | `font-variant-ligatures` of code (set `normal` to enable ligatures) |
| `--vt-font-body`       | inherited from the page                                                                  | Font of rendered Markdown                                           |
| `--vt-font-size-body`  | inherited from the page                                                                  | Font size of rendered Markdown                                      |
| `--vt-tab-size`        | `4`                                                                                      | Tab width, when the `tab-size` attribute is not set                 |

Vitrine never loads fonts. The stacks use fonts already installed or already loaded by your page: if your page loads JetBrains Mono, code uses it automatically.

### Spacing, shape and layout tokens

| Token                | Default | Description                                         |
| -------------------- | ------- | --------------------------------------------------- |
| `--vt-space-1`       | `4px`   | Spacing step 1                                      |
| `--vt-space-2`       | `8px`   | Spacing step 2                                      |
| `--vt-space-3`       | `12px`  | Spacing step 3                                      |
| `--vt-space-4`       | `16px`  | Spacing step 4                                      |
| `--vt-space-5`       | `24px`  | Spacing step 5                                      |
| `--vt-radius-sm`     | `6px`   | Buttons, inputs and badges                          |
| `--vt-radius`        | `10px`  | Container corners                                   |
| `--vt-radius-full`   | `999px` | Status dot                                          |
| `--vt-header-height` | `40px`  | Minimum header height                               |
| `--vt-margin`        | `0`     | Vertical margin around the element (`margin-block`) |

### Motion tokens

| Token                | Default                      | Description                          |
| -------------------- | ---------------------------- | ------------------------------------ |
| `--vt-duration-fast` | `120ms`                      | Hover and press transitions          |
| `--vt-duration`      | `180ms`                      | Expand, collapse and tab transitions |
| `--vt-easing`        | `cubic-bezier(0.2, 0, 0, 1)` | Easing curve                         |

### Examples

```css
/* Compact code blocks with square corners */
vt-code {
  --vt-font-size: 13px;
  --vt-line-height: 1.5;
  --vt-radius: 0;
  --vt-margin: 1.5rem;
}

/* Match a brand color, keeping link contrast */
.docs {
  --vt-accent: #7c3aed;
  --vt-accent-fg: #5b21b6;
  --vt-accent-soft: rgba(124, 58, 237, 0.12);
}
```

When you override colors, keep text contrast at 4.5:1 or more against the surfaces it sits on (see [Contrast](#contrast)).

## Registering a theme

`Vitrine.registerTheme(name, options)` adds a theme (or replaces an existing one, built-in themes included). Elements on the page update immediately.

```js
Vitrine.registerTheme('brand', {
  extends: 'dark',
  tokens: {
    accent: '#7c9cff',
    'accent-fg': '#7c9cff',
    'surface-sunken': '#0b1020',
  },
});
```

```html
<vt-code theme="brand" language="js">const a = 1;</vt-code>
```

| Option        | Type              | Default                                         | Description                                                                                 |
| ------------- | ----------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `extends`     | theme name        | `light`, or `dark` when `colorScheme` is `dark` | Theme that provides every token you do not set.                                             |
| `colorScheme` | `light` or `dark` | the base theme's                                | Native color scheme.                                                                        |
| `tokens`      | object            | `{}`                                            | Token values, keyed by name with or without the `--vt-` prefix (`accent` or `--vt-accent`). |

It returns the theme name. The new theme can also be used as `lightTheme` or `darkTheme` for `auto`.

### Validation rules

- **Name**: a lowercase letter followed by up to 39 lowercase letters, digits or hyphens (`brand`, `docs-dark`). `auto` is reserved. An invalid name throws a `TypeError`.
- **Base theme**: an unknown `extends` name throws a `TypeError`.
- **Tokens**: only the 31 color tokens listed above can be set. Unknown names are ignored with a console warning. Typography, spacing and motion tokens are set with CSS instead.
- **Values**: a value must be a non-empty string of at most 200 characters. Values containing `;`, `{`, `}`, `<`, `>` or `\`, or containing `url(`, `image(`, `image-set(`, `cross-fade(`, `element(`, `src(`, `@import` or `expression`, are ignored with a console warning. This keeps themes from loading external resources.

Colors in any CSS syntax are accepted (`#fff`, `rgb(1 2 3 / 50%)`, `oklch(70% 0.1 200)`, `transparent`), and so is a shadow such as `0 8px 24px rgba(0,0,0,.4)`.

### Inspecting themes

```js
Vitrine.listThemes(); // ['light', 'dark', 'dim', 'paper', 'high-contrast', 'brand']
Vitrine.BUILT_IN_THEMES; // ['light', 'dark', 'dim', 'paper', 'high-contrast']

const dark = Vitrine.getTheme('dark');
// { colorScheme: 'dark', tokens: { bg: '#11151c', surface: '#171c25', … } }
```

`getTheme(name)` returns a copy of the theme (changing it has no effect), with token names without the `--vt-` prefix, or `undefined` for an unknown name.

## Styling parts

Parts expose internal elements to `::part()` selectors. The shared parts are listed in [Common attributes](common-attributes.md#shared-css-parts), and each component reference lists its own: [code](components/code.md#css-parts), [markdown](components/markdown.md#css-parts), [json](components/json.md#css-parts).

```css
/* Uppercase, accent-colored title */
vt-code::part(title) {
  color: var(--brand-color);
  text-transform: uppercase;
}

/* Hide the language badge everywhere */
vt-code::part(badge) {
  display: none;
}

/* Thicker focus-friendly tabs */
vt-markdown::part(tab-active) {
  font-weight: 700;
}

/* Stronger search highlights */
vt-code::part(match) {
  outline: 1px solid currentColor;
}

/* Remove the frame */
vt-json::part(container) {
  border: 0;
  border-radius: 0;
}
```

`::part()` can style the element itself but not its descendants (`vt-code::part(header) span` does not match). Prefer tokens for colors, so all themes stay consistent.

## Reduced motion

When the user has enabled the reduced motion preference (`prefers-reduced-motion: reduce`):

- `--vt-duration-fast` and `--vt-duration` become `0ms`, whatever value you set;
- the loading placeholder stops pulsing;
- in-document links in `<vt-markdown>` jump instead of scrolling smoothly.

## Contrast

The built-in themes are checked by automated tests:

- In every built-in theme, the text colors meet WCAG AA (at least 4.5:1): `fg`, `fg-muted` and every syntax color on `surface-sunken`; `fg`, `fg-muted`, `accent-fg`, `success`, `warning`, `danger` and `info` on `surface`; `fg` and `fg-muted` on `bg`; and `on-accent` on `accent`.
- In `high-contrast`, `fg`, `fg-muted` and every syntax color reach WCAG AAA (at least 7:1) on `surface-sunken`.

The full components are also scanned with axe-core in all five themes. See [Accessibility](accessibility.md).
