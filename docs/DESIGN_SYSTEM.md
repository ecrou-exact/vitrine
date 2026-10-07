# Vitrine — Design System

> Visual rules for everything Vitrine ships: the web components, the demo pages, the documentation website, the README and social images.
> Goal: one coherent look, derived from the logo (see `LOGO.md`).
> Every value below must exist as a design token. Never hard-code a color, size or radius outside the token files.

---

## 1. Principles

1. **Content first.** The components display other people's content. Chrome (toolbars, borders, badges) stays quiet; the code, Markdown or JSON is the star.
2. **One accent.** Teal is the only brand color in the interface. Other hues exist only for syntax highlighting and status.
3. **Drawn with one pen.** Uniform strokes, rounded caps, simple geometry — same language as the logo.
4. **Calm surfaces.** Flat backgrounds, thin borders, no gradients, no glassmorphism, almost no shadows.
5. **Accessible by default.** Every text/background pair in this document meets WCAG AA (4.5:1). Contrast ratios are listed; keep them when changing anything.

---

## 2. Color

### 2.1 Core palette

| Name       | Hex       | Role                                                      |
| ---------- | --------- | --------------------------------------------------------- |
| Ink        | `#11151C` | Primary text (light), dark background                     |
| Paper      | `#F3F4F1` | Light background, primary text (dark)                     |
| Teal       | `#14B8A6` | Brand accent (fills, icons, focus, dark-mode text accent) |
| Teal Deep  | `#0A6E6F` | Accent **text** and links on light backgrounds            |
| Amber      | `#F2A93B` | Secondary hue (warnings, numbers in dark syntax)          |
| Periwinkle | `#7C9CFF` | Secondary hue (info, functions in dark syntax)            |
| Coral      | `#FF7A59` | Secondary hue (errors, types in dark syntax)              |

Teal `#14B8A6` on light backgrounds is **2.25:1** — never use it for text or thin icons on light surfaces. Use Teal Deep instead.

### 2.2 Semantic tokens

| Token                    | Light                   | Dark                    | Contrast note                        |
| ------------------------ | ----------------------- | ----------------------- | ------------------------------------ |
| `--vt-bg`                | `#F3F4F1`               | `#11151C`               | Page background                      |
| `--vt-surface`           | `#FFFFFF`               | `#171C25`               | Component container                  |
| `--vt-surface-sunken`    | `#EAECE7`               | `#0C0F14`               | Code area, inputs                    |
| `--vt-surface-raised`    | `#FFFFFF`               | `#1E2430`               | Menus, popovers                      |
| `--vt-border`            | `#D6D9D2`               | `#262D3A`               | Hairlines, dividers                  |
| `--vt-border-strong`     | `#B9BEB4`               | `#3A4354`               | Input borders, hover                 |
| `--vt-fg`                | `#11151C`               | `#E8EAE6`               | 16.6:1 / 15.1:1                      |
| `--vt-fg-muted`          | `#4A5260`               | `#9AA3B2`               | 7.1:1 / 7.2:1                        |
| `--vt-accent`            | `#14B8A6`               | `#14B8A6`               | Fills, focus ring, icons on dark     |
| `--vt-accent-fg`         | `#0A6E6F`               | `#14B8A6`               | Accent text/links: 5.5:1 / 7.4:1     |
| `--vt-on-accent`         | `#11151C`               | `#11151C`               | Text on teal fills: 7.4:1            |
| `--vt-accent-soft`       | `rgba(20,184,166,0.12)` | `rgba(20,184,166,0.16)` | Selected rows, active tab background |
| `--vt-highlight`         | `rgba(242,169,59,0.35)` | `rgba(242,169,59,0.30)` | Search match background              |
| `--vt-highlight-current` | `rgba(242,169,59,0.70)` | `rgba(242,169,59,0.60)` | Current search match                 |
| `--vt-line-highlight`    | `rgba(20,184,166,0.10)` | `rgba(20,184,166,0.12)` | `highlight-lines` background         |
| `--vt-success`           | `#0A6E6F`               | `#14B8A6`               | Copied, valid                        |
| `--vt-warning`           | `#A6510B`               | `#F2A93B`               | Warnings                             |
| `--vt-danger`            | `#B2384F`               | `#FF8F73`               | Errors, invalid JSON                 |
| `--vt-info`              | `#2F55C9`               | `#7C9CFF`               | Info notes                           |

Rules:

- Status colors are always paired with an icon or a word, never color alone.
- Diff colors: added = `--vt-accent-soft` background + `+` sign; removed = `rgba(178,56,79,0.12)` (light) / `rgba(255,143,115,0.14)` (dark) background + `−` sign.

### 2.3 Syntax highlighting theme ("Vitrine Light" / "Vitrine Dark")

Measured on `--vt-surface-sunken`. All pass AA.

| Role                 | highlight.js classes                            | Light                    | Dark                     |
| -------------------- | ----------------------------------------------- | ------------------------ | ------------------------ |
| Default text         | `hljs`                                          | `#11151C`                | `#E8EAE6`                |
| Keyword              | `hljs-keyword`, `hljs-built_in`, `hljs-literal` | `#7A3EC8` (5.3:1)        | `#C4A5FF` (9.3:1)        |
| String               | `hljs-string`, `hljs-regexp`                    | `#0A6E6F` (5.1:1)        | `#5EEAD4` (13.0:1)       |
| Number               | `hljs-number`                                   | `#A6510B` (4.6:1)        | `#F2A93B` (9.6:1)        |
| Function / title     | `hljs-title`, `hljs-title.function_`            | `#2F55C9` (5.4:1)        | `#7C9CFF` (7.4:1)        |
| Type / class         | `hljs-type`, `hljs-title.class_`                | `#B2384F` (4.9:1)        | `#FF8F73` (8.6:1)        |
| Comment              | `hljs-comment`, `hljs-quote`                    | `#5F6773` italic (4.8:1) | `#8A93A3` italic (6.2:1) |
| Attribute / property | `hljs-attr`, `hljs-property`                    | `#2F55C9`                | `#7C9CFF`                |
| Tag / selector       | `hljs-tag`, `hljs-name`, `hljs-selector-tag`    | `#B2384F`                | `#FF8F73`                |
| Meta / punctuation   | `hljs-meta`, `hljs-punctuation`                 | `#4A5260`                | `#9AA3B2`                |
| Addition / deletion  | `hljs-addition`, `hljs-deletion`                | see diff rule above      | see diff rule above      |

### 2.4 JSON viewer colors

Reuse the syntax roles so code and JSON look identical:

| JSON                                     | Role                                                              |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Key                                      | Attribute / property                                              |
| String                                   | String                                                            |
| Number                                   | Number                                                            |
| `true` / `false` / `null`                | Keyword                                                           |
| Brackets, commas, counts (`{3}`, `[12]`) | Meta / punctuation                                                |
| Type badges                              | `--vt-fg-muted` text on `--vt-surface-sunken`, 1 px `--vt-border` |

---

## 3. Typography

### 3.1 Typefaces

| Role               | Website / docs                    | Inside the web components |
| ------------------ | --------------------------------- | ------------------------- |
| Display & headings | **JetBrains Mono** 700            | —                         |
| Body & UI          | **IBM Plex Sans** 400 / 500 / 600 | System stack              |
| Code               | **JetBrains Mono** 400 / 500      | System mono stack         |

Both fonts are SIL Open Font License 1.1 — list them in `THIRD_PARTY_NOTICES.md` and **self-host** them on the website (no Google Fonts calls, for privacy and CSP).

**The components never load fonts.** They use stacks so they work offline, under strict CSP, and blend into the host site:

```css
--vt-font-ui: system-ui, -apple-system, "Segoe UI", "IBM Plex Sans", Roboto, sans-serif;
--vt-font-mono: "JetBrains Mono", ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace;
```

If the host site already loaded JetBrains Mono, the components pick it up automatically.

### 3.2 Type scale (website)

Base 16 px, ratio 1.25.

| Token               | Size / line-height           | Font          | Use                               |
| ------------------- | ---------------------------- | ------------- | --------------------------------- |
| `--vt-text-display` | 56 / 1.05, tracking −0.04em  | Mono 700      | Home hero only                    |
| `--vt-text-h1`      | 40 / 1.1, −0.03em            | Mono 700      | Page titles                       |
| `--vt-text-h2`      | 28 / 1.2, −0.02em            | Mono 700      | Sections                          |
| `--vt-text-h3`      | 20 / 1.3                     | Plex Sans 600 | Subsections                       |
| `--vt-text-body`    | 16 / 1.65                    | Plex Sans 400 | Paragraphs (max 72 ch)            |
| `--vt-text-small`   | 14 / 1.5                     | Plex Sans 400 | Captions, table cells             |
| `--vt-text-code`    | 14 / 1.6                     | Mono 400      | Code blocks                       |
| `--vt-text-label`   | 12 / 1.4, +0.04em, uppercase | Plex Sans 600 | Badges, tab labels, table headers |

### 3.3 Component type scale

| Token                  | Default | Use                      |
| ---------------------- | ------- | ------------------------ |
| `--vt-font-size`       | `14px`  | Code, JSON, toolbar text |
| `--vt-line-height`     | `1.6`   | Code lines               |
| `--vt-font-size-small` | `12px`  | Line numbers, badges     |

Markdown rendered inside `<vt-markdown>` inherits the host page's body font by default (`font-family: inherit`) — it is the host's content.

---

## 4. Spacing, radius, borders, elevation

### Spacing (4 px base)

| Token          | Value |
| -------------- | ----- |
| `--vt-space-1` | 4px   |
| `--vt-space-2` | 8px   |
| `--vt-space-3` | 12px  |
| `--vt-space-4` | 16px  |
| `--vt-space-5` | 24px  |
| `--vt-space-6` | 32px  |
| `--vt-space-7` | 48px  |
| `--vt-space-8` | 64px  |

### Radius

Derived from the logo frame (rounded, never pill-shaped except badges).

| Token              | Value | Use                      |
| ------------------ | ----- | ------------------------ |
| `--vt-radius-sm`   | 6px   | Buttons, inputs, badges  |
| `--vt-radius`      | 10px  | Component container      |
| `--vt-radius-lg`   | 16px  | Website cards, hero demo |
| `--vt-radius-full` | 999px | Status dots, toggles     |

### Borders and elevation

- Default border: `1px solid var(--vt-border)`.
- Components have **no shadow**. Only floating elements (menus, tooltips) use `--vt-shadow: 0 8px 24px rgba(17,21,28,0.12)` (light) / `0 8px 24px rgba(0,0,0,0.45)` (dark).

### Focus

```css
outline: 2px solid var(--vt-accent);
outline-offset: 2px;
```

Visible on every interactive element, keyboard only (`:focus-visible`).

---

## 5. Iconography

- Style: **outline**, stroke **1.75 px** at 20 px, round caps and joins — the logo's language.
- Sizes: 16 px (inside toolbars), 20 px (website UI).
- Color: `currentColor` (inherits `--vt-fg-muted`, becomes `--vt-fg` on hover).
- Source: inline SVG bundled with the library (no icon font, no remote sprite). If an icon set is used, prefer **Lucide** (ISC license) and credit it.
- Required icons: copy, check, search, chevron-up/down/right, wrap, download, expand-all, collapse-all, link, eye (preview), code (source), columns (split), list (TOC), alert.

---

## 6. Component anatomy

All three components share the same frame — it mirrors the logo: **a window with a title bar**.

```
┌─────────────────────────────────────────────────────┐
│ ● example.py              PYTHON   ⌕   ⤓   ⧉       │  ← header (full variant only)
├─────────────────────────────────────────────────────┤
│  1 │ def hello(name):                               │
│  2 │     return f"Hello {name}"                     │  ← body (surface-sunken)
└─────────────────────────────────────────────────────┘
```

| Part (`::part`)          | Spec                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `container`              | `--vt-surface`, `1px --vt-border`, `--vt-radius`, overflow hidden                                                               |
| `header`                 | Height 40 px, padding 0 `--vt-space-3`, bottom border, `--vt-font-ui` 13 px                                                     |
| `status-dot`             | 8 px circle, `--vt-accent` — the logo's dot. Optional (`dot` attribute), on by default in full variant                          |
| `title`                  | `--vt-fg`, weight 500, ellipsis on overflow                                                                                     |
| `badge` (language)       | `--vt-text-label`, `--vt-fg-muted`, `--vt-surface-sunken` background, `--vt-radius-sm`                                          |
| `toolbar`                | Icon buttons 28 × 28 visual, **44 × 44 hit area** on touch (`@media (pointer: coarse)`)                                         |
| `tabs`                   | Text tabs; active = `--vt-fg` + 2 px `--vt-accent` underline; inactive = `--vt-fg-muted`                                        |
| `search`                 | Input 28 px high, `--vt-surface-sunken`, match counter `3 / 12` in `--vt-fg-muted`                                              |
| `body`                   | `--vt-surface-sunken` for code/JSON, `--vt-surface` for rendered Markdown, padding `--vt-space-4`                               |
| `gutter` / `line-number` | Right-aligned, `--vt-fg-muted` at 70 % opacity, `--vt-font-size-small`, not selectable (`user-select: none`), 1 px right border |
| `tree-toggle` (JSON)     | 16 px chevron, rotates 90° when open                                                                                            |

**Simple variant** = body only (no header), same container, same radius.

### States

| State               | Treatment                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Hover (icon button) | Background `--vt-accent-soft`, icon `--vt-fg`                                                 |
| Active tab          | Underline `--vt-accent` 2 px                                                                  |
| Copied              | Icon swaps to check in `--vt-success` for 1.5 s + live region "Copied"                        |
| Loading (`src`)     | Body shows 3 skeleton lines, `--vt-surface-sunken` pulse (disabled under reduced motion)      |
| Error               | Inline message: alert icon + text in `--vt-danger`, details in `--vt-fg-muted`, never a modal |
| Empty               | `--vt-fg-muted` "Nothing to display" centered                                                 |

---

## 7. Motion

- Durations: 120 ms (hover, press), 180 ms (expand/collapse, tab switch).
- Easing: `cubic-bezier(0.2, 0, 0, 1)`.
- Animate only `opacity`, `transform`, `background-color`.
- `@media (prefers-reduced-motion: reduce)`: all durations 0, no pulse.

---

## 8. Theming contract

1. All tokens are CSS custom properties prefixed `--vt-`, declared on `:host` inside each component.
2. Light values are the default; dark values apply when `theme="dark"`, or when `theme="auto"` and `prefers-color-scheme: dark`.
3. Hosts customize by setting variables on the element or any ancestor:

```css
vt-code {
  --vt-accent: #7C9CFF;     /* approved alternate */
  --vt-radius: 4px;
  --vt-font-mono: "Fira Code", monospace;
}
```

4. Token files live in `src/styles/tokens.css`, `light.css`, `dark.css`, and are mirrored as `design-tokens.json` (W3C Design Tokens format) for the website and future tooling.
5. Any new token must be added to this document, the CSS files and the JSON file in the same commit.

---

## 9. Website guidelines

Same tokens as the components. The site is the best demo of the library: **every example on the site is a live Vitrine component**, never a screenshot.

### Layout

- Max content width 1200 px; docs text column max 72 ch.
- Header: 64 px, horizontal lockup (logo 28 px high) left, nav center/right (Docs, Components, Playground, GitHub), theme toggle. Bottom border `--vt-border`, background `--vt-bg`.
- Docs: left sidebar 260 px (sections), content, right "On this page" TOC 220 px on wide screens. Below 960 px the sidebars collapse into a menu button; below 640 px everything is one column.
- Footer: ink background in both themes, paper text, MIT license line, links, dark lockup.

### Home page structure

1. **Hero** — paper background (ink in dark mode). Display heading in JetBrains Mono, e.g. `Display anything,_ anywhere.` (underscore in accent). One-line subtitle in Plex Sans. Primary button + copy-to-clipboard install snippet.
2. **Live demo** — one large `<vt-code variant="full">` with tabs switching between code / markdown / json examples.
3. **Three component cards** — one per component, each with a live simple-variant preview.
4. **Why Vitrine** — 4 short points: no framework, secure by default, themable, accessible.
5. **Quick start** — the three install methods (CDN, ES module, git submodule).
6. **Footer**.

### Buttons

| Type      | Style                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| Primary   | `--vt-accent` background, `--vt-on-accent` text, `--vt-radius-sm`, 40 px high (44 px on touch), Plex Sans 600 |
| Secondary | Transparent, `1px --vt-border-strong`, `--vt-fg` text                                                         |
| Ghost     | Text only `--vt-accent-fg`, underline on hover                                                                |

### Links

`--vt-accent-fg`, underline offset 3 px, underline always visible in body text (not only on hover).

### Imagery

- No stock photos, no illustrations of people, no 3D renders.
- Visuals are the components themselves, or simple diagrams drawn with the icon rules (1.75 px strokes, ink/paper + teal).
- Social preview: see `LOGO.md` section 9.

---

## 10. Voice (UI copy)

- Short, plain, lowercase-friendly English. Sentence case for labels ("Copy code", not "Copy Code").
- Buttons are verbs: Copy, Download, Expand all.
- Errors say what happened and what to do: "Invalid JSON at line 4, column 12 — showing raw text."
- No exclamation marks, no jokes in UI strings, no emoji.
- All UI strings live in `src/core/i18n.js`; French (`fr`) mirrors English.

---

## 11. Checklist for any new visual element

- [ ] Uses tokens only (no raw hex, px radius or font names in component CSS)
- [ ] Works in light and dark, checked side by side
- [ ] Text contrast ≥ 4.5:1 (≥ 3:1 for text ≥ 24 px and for icons/borders that carry meaning)
- [ ] Teal only as fill/icon on light surfaces, never as small text
- [ ] Keyboard focus visible, touch targets ≥ 44 px
- [ ] Respects `prefers-reduced-motion`
- [ ] Looks right inside a host page with a different font and background
- [ ] Documented in this file if it introduces a new pattern
