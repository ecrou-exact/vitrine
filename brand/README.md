# Vitrine brand assets

Logo files for Vitrine. The full specification (construction, colors, clear space, don'ts, variants) is in [LOGO.md](LOGO.md). Read it before you create a new variant.

## Logo

| File | Use |
|---|---|
| `logo-horizontal.svg` | Default lockup (mark + `vitrine_`) on light backgrounds: README header, docs site, slides |
| `logo-horizontal-dark.svg` | Same, on dark backgrounds |
| `logo-stacked.svg` | Mark above the wordmark, for square spaces (avatars, stickers) on light backgrounds |
| `logo-stacked-dark.svg` | Same, on dark backgrounds |
| `logo-mark.svg` | Outline mark alone, light backgrounds, rendered at 48 px or more |
| `logo-mark-dark.svg` | Outline mark alone, dark backgrounds, rendered at 48 px or more |

The wordmark in these files is outlined to paths, so they do not need any installed font. Minimum widths: 32 px for the outline mark and 120 px for the horizontal lockup. Below that, use the icons.

README header (switches between light and dark on GitHub):

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/logo-horizontal-dark.svg">
  <img src="brand/logo-horizontal.svg" alt="Vitrine" width="280">
</picture>
```

## Icons (size ladder)

| Rendered size | File |
|---|---|
| 48 px and up | `icon-paper.svg` (paper tile), or the outline mark |
| 24 to 47 px | `icon-accent.svg` (accent tile, no dot) |
| 16 to 23 px | `favicon.svg` (accent tile, bold V only) |

## Raster exports

| File | Use |
|---|---|
| `favicon.ico` | Legacy favicon: 16 px (from `favicon.svg`), 32 px and 48 px (from `icon-accent.svg`) |
| `apple-touch-icon.png` | 180 × 180 iOS home screen icon, from `icon-paper.svg` on an opaque paper background |
| `icon-192.png`, `icon-512.png` | Web app manifest icons, from `icon-paper.svg` |
| `social-preview.png` | 1280 × 640 GitHub/Open Graph preview: dark lockup and tagline on ink |

Recommended `<head>` tags:

```html
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

## Editable sources

`source/` holds the editable versions with live `<text>` (horizontal and stacked, light and dark, plus the social preview layout). Opening them needs JetBrains Mono installed. After you edit a source file, outline the text again before you update the files in this folder (see LOGO.md, section 4).

## Font license

The wordmark and the tagline are set in [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) (Bold 700 for the wordmark, Regular 400 for the tagline). The outlines in the exported files come from the official font files. JetBrains Mono is licensed under the SIL Open Font License 1.1, Copyright 2020 The JetBrains Mono Project Authors.

## Colors

| Token | Hex |
|---|---|
| ink | `#11151C` |
| paper | `#F3F4F1` |
| accent | `#14B8A6` |
