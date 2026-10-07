# Vitrine — Logo Specification

> Single source of truth to rebuild the Vitrine logo exactly, export it, and create consistent variants.
> Concept name: **"Display window"** — a showcase window (frame + title bar) with a **V** displayed inside it.

---

## 1. Concept

| Element | Meaning |
|---|---|
| Rounded frame | The showcase window ("vitrine") — the component that holds content |
| Title bar line | A UI panel / code viewer header, like the components' toolbar |
| Accent dot | The "live" status light; the single spot of color in the frame |
| **V** chevron | The initial of Vitrine, and a down-chevron: "content is displayed below" |
| Wordmark `vitrine_` | Lowercase monospace name; the trailing underscore is a text cursor |

The mark must always look **drawn with one pen**: uniform stroke, round caps on the V, square joins on the frame.

---

## 2. Colors

| Token | Hex | Use in the logo |
|---|---|---|
| `ink` | `#11151C` | Frame, title bar and wordmark on light backgrounds; tile shapes on accent |
| `paper` | `#F3F4F1` | Light background; frame and wordmark on dark backgrounds |
| `accent` | `#14B8A6` | Dot, V, cursor underscore, accent app tile |

Rules:
- The accent is used **only** for the dot, the V and the cursor. Never color the frame or the letters with it.
- Never place the teal accent as **text** on a light background (contrast 2.25:1). On light backgrounds the accent only appears in the mark, which is decorative.
- Ink on accent tile: contrast 7.35:1 — accepted.

### Approved alternate accents (for variants, events or sub-brands only)

| Name | Hex |
|---|---|
| Amber | `#F2A93B` |
| Periwinkle | `#7C9CFF` |
| Coral | `#FF7A59` |

Swap the accent only. Ink and paper never change.

---

## 3. Construction (mark)

All geometry uses a **120 × 120 viewBox**. Coordinates are exact; do not eyeball.

| Shape | Primitive | Values |
|---|---|---|
| Frame | `rect` | x `12`, y `16`, width `96`, height `88`, rx `18`, no fill, stroke `9` |
| Title bar | `path` | `M12 42 L108 42`, stroke `9` |
| Status dot | `circle` | cx `29`, cy `29`, r `5`, fill accent |
| V | `path` | `M42 60 L60 86 L78 60`, stroke `11`, `stroke-linecap: round`, `stroke-linejoin: round`, fill none |

Proportions to keep when making variants:
- V stroke ≈ 1.2 × frame stroke (11 vs 9).
- V is horizontally centered (apex at x = 60), its apex sits 18 units above the frame's bottom edge.
- Dot is centered vertically inside the title bar band (y 16 → 42 ⇒ center 29).
- Frame corner radius = 18 / 96 ≈ 19 % of the frame width.

### 3.1 Primary mark — light background

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="Vitrine">
  <rect x="12" y="16" width="96" height="88" rx="18" fill="none" stroke="#11151C" stroke-width="9"/>
  <path d="M12 42 L108 42" fill="none" stroke="#11151C" stroke-width="9"/>
  <circle cx="29" cy="29" r="5" fill="#14B8A6"/>
  <path d="M42 60 L60 86 L78 60" fill="none" stroke="#14B8A6" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

### 3.2 Reversed mark — dark background

Same as 3.1, with `#11151C` replaced by `#F3F4F1` on the frame and title bar. Dot and V stay accent.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="Vitrine">
  <rect x="12" y="16" width="96" height="88" rx="18" fill="none" stroke="#F3F4F1" stroke-width="9"/>
  <path d="M12 42 L108 42" fill="none" stroke="#F3F4F1" stroke-width="9"/>
  <circle cx="29" cy="29" r="5" fill="#14B8A6"/>
  <path d="M42 60 L60 86 L78 60" fill="none" stroke="#14B8A6" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

### 3.3 App icon — paper tile (48 px and up)

The tile **is** the frame: full-bleed rounded square, title bar runs edge to edge, dot and V in ink.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="Vitrine">
  <rect x="4" y="4" width="112" height="112" rx="28" fill="#F3F4F1"/>
  <path d="M4 40 L116 40" fill="none" stroke="#11151C" stroke-width="8"/>
  <circle cx="26" cy="22" r="6" fill="#11151C"/>
  <path d="M40 60 L60 88 L80 60" fill="none" stroke="#11151C" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

### 3.4 App icon — accent tile (24–47 px)

Dot removed (too small to read), strokes thickened.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="Vitrine">
  <rect x="4" y="4" width="112" height="112" rx="28" fill="#14B8A6"/>
  <path d="M4 40 L116 40" fill="none" stroke="#11151C" stroke-width="10"/>
  <path d="M40 60 L60 88 L80 60" fill="none" stroke="#11151C" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

### 3.5 Favicon (16–23 px)

Only the tile and a bold V. No title bar, no dot.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect x="4" y="4" width="112" height="112" rx="28" fill="#14B8A6"/>
  <path d="M36 50 L60 86 L84 50" fill="none" stroke="#11151C" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

### Size ladder (which variant to use)

| Rendered size | Variant |
|---|---|
| ≥ 48 px | 3.1 / 3.2 (outline mark) or 3.3 (paper tile) |
| 24 – 47 px | 3.4 (accent tile) |
| 16 – 23 px | 3.5 (favicon) |

---

## 4. Wordmark

| Property | Value |
|---|---|
| Text | `vitrine_` — always lowercase, underscore included |
| Typeface | **JetBrains Mono**, weight **700** |
| Letter spacing | `-0.04em` |
| Color | `ink` on light, `paper` on dark |
| Underscore color | `accent` |
| License | JetBrains Mono — SIL Open Font License 1.1 (credit it in `THIRD_PARTY_NOTICES.md`) |

The underscore is part of the logo lockup but is **not** part of the project name in prose. In text, write "Vitrine".

### Outlining (required for the final files)

The exported logo files must **not** depend on an installed font. Convert the wordmark text to paths before committing:
- Inkscape: select text → *Path → Object to Path*, then save as *Plain SVG*.
- Or script it with `opentype.js` / `fonttools` from the official JetBrains Mono 700 font file.

Keep the editable source (with live text) in `brand/source/` and the outlined versions in `brand/`.

---

## 5. Lockups

### 5.1 Horizontal (default)

`[mark] [gap] vitrine_`

- Size ratio: **mark height = 1.625 × wordmark font-size** (reference: mark 104 px with wordmark at 64 px; mark 52 px with wordmark at 32 px).
- Gap between mark and wordmark = **0.34 × mark height** (≈ 22 px at 104 px; 14 px at 52 px).
- Mark and wordmark are vertically centered on each other.

Reference skeleton (text live, for the source file):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 470 120" role="img" aria-label="Vitrine">
  <g>
    <rect x="12" y="16" width="96" height="88" rx="18" fill="none" stroke="#11151C" stroke-width="9"/>
    <path d="M12 42 L108 42" fill="none" stroke="#11151C" stroke-width="9"/>
    <circle cx="29" cy="29" r="5" fill="#14B8A6"/>
    <path d="M42 60 L60 86 L78 60" fill="none" stroke="#14B8A6" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="146" y="83" font-family="JetBrains Mono" font-weight="700" font-size="74" letter-spacing="-2.96" fill="#11151C">vitrine<tspan fill="#14B8A6">_</tspan></text>
</svg>
```

Adjust `viewBox` width after outlining so the right edge hugs the underscore.

### 5.2 Stacked

Mark centered above the wordmark. Gap = 0.25 × mark height. Use for square spaces (social avatars, stickers).

### 5.3 Tagline lockup (optional)

Under the horizontal lockup, centered or left-aligned with the wordmark:
`code · markdown · json` — JetBrains Mono 400, size = 0.22 × wordmark size, color `#4A5260` (light) / `#9AA3B2` (dark), letter-spacing `0.02em`.
When new components ship, update the tagline (max 4 items).

---

## 6. Clear space and minimum size

- **Clear space**: on every side, at least the height of the title bar band = **26 / 120 of the mark height** (≈ 22 % of the mark). Nothing (text, edges, other logos) enters this zone.
- **Minimum sizes**: outline mark 32 px; horizontal lockup 120 px wide; below that use the icon ladder (section 3).

---

## 7. Don'ts

- Do not color the frame, title bar or letters with the accent.
- Do not use more than one accent at a time.
- Do not add gradients, shadows, glows, 3D or glass effects.
- Do not change stroke widths independently (keep the 9 : 11 ratio).
- Do not replace the V with another letter or icon inside the frame (except approved product variants, section 8).
- Do not set the wordmark in another typeface, uppercase, or without the underscore in the lockup.
- Do not rotate, skew, outline-stroke or stretch the logo.
- Do not place the light mark on mid-tone or busy photos; use the paper or ink tile versions instead.

---

## 8. Creating variants

Variants must keep the frame, title bar, stroke weights and color rules. Only these slots may change:

| Slot | Allowed change | Example |
|---|---|---|
| Accent color | One of the approved alternates (section 2) | Amber for a "beta" channel |
| Window content (the V) | Replace with a simple glyph for a **component sub-brand**, same stroke (11), same bounding box (x 42–78, y 60–86) | `{}` for `vt-json`, `#` for `vt-markdown`, `</>` for `vt-code` |
| Status dot | Remove at small sizes only | Section 3.4 |
| Wordmark suffix | Append a component name after the underscore, JetBrains Mono weight 400, same color as the wordmark | `vitrine_ json` |

Sub-brand glyph guidance (same 120 box, stroke 11, round caps/joins, accent color):
- **code** `</>`: left chevron `M48 60 L38 73 L48 86`, slash `M64 58 L56 88`, right chevron `M72 60 L82 73 L72 86` (strokes 8 to fit).
- **json** `{ }`: two braces drawn with arcs, inner width 36 units, centered at x 60.
- **markdown** `#`: two verticals at x 52 and 68, two horizontals at y 66 and 80, from x 44 to 76 (stroke 8).

Always render a new variant at 16, 32, 48 and 256 px before approving it.

---

## 9. Export checklist

Store under `brand/` in the repository:

| File | Content |
|---|---|
| `logo-mark.svg` | 3.1 |
| `logo-mark-dark.svg` | 3.2 |
| `logo-horizontal.svg` | 5.1, outlined, light |
| `logo-horizontal-dark.svg` | 5.1, outlined, dark |
| `logo-stacked.svg` / `-dark.svg` | 5.2 |
| `icon-paper.svg` | 3.3 |
| `icon-accent.svg` | 3.4 |
| `favicon.svg` | 3.5 |
| `favicon.ico` | 16, 32, 48 px, generated from 3.5 / 3.4 |
| `apple-touch-icon.png` | 180 × 180 from 3.3 (no transparency) |
| `icon-512.png`, `icon-192.png` | PWA / manifest, from 3.3 |
| `social-preview.png` | 1280 × 640, ink background, dark horizontal lockup centered at ~45 % width, tagline below |
| `source/` | Editable SVGs with live text |

Optimize every SVG with SVGO (keep `viewBox`, remove metadata). Keep `role="img"` and `aria-label="Vitrine"` on standalone logo files.

README header usage (auto light/dark on GitHub):

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/logo-horizontal-dark.svg">
  <img src="brand/logo-horizontal.svg" alt="Vitrine" width="280">
</picture>
```
