# `<vt-contrast>`

`<vt-contrast>` checks color contrast against WCAG 2.2. For a text color on a background, it shows:

- the contrast ratio;
- whether it passes AA and AAA for normal and large text, and the 3:1 required of interface components and graphics;
- a preview;
- the nearest color of the same hue that passes.

```html
<vt-contrast fg="#767676" bg="#ffffff"></vt-contrast>
```

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |

## Input

- **`fg` and `bg`**: one pair. The content is ignored, and two fields (a text field and a color picker each) edit the colors.
- **Pairs in the content**, one per line: `#333 on #fff`, `#333 / #fff`, `#333, #fff`, or with a label, `Body text: #333 on #fff`. Up to 40 pairs, each in its own card.
- **A palette in the content**: lines with a single color, such as `ink: #1a1a1a`. They make a grid with each text color in a row and each background in a column. Every cell shows a sample, the ratio and the level reached.

Colors: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()`, `hsl()` and `hsla()`, `hwb()` (comma or space syntax, percentages, angles), the 148 CSS named colors and `transparent`. Lines without a color are listed apart.

## Results

| Criterion                       | Minimum |
| ------------------------------- | ------- |
| AA, normal text (1.4.3)         | 4.5:1   |
| AA, large text (1.4.3)          | 3:1     |
| AAA, normal text (1.4.6)        | 7:1     |
| AAA, large text (1.4.6)         | 4.5:1   |
| Interface and graphics (1.4.11) | 3:1     |

Large text is at least 24 px, or 18.66 px in bold.

- **Ratio**: computed from relative luminance, as WCAG 2.2 defines it, and shown with two decimals. It is rounded down, never up: 4.499 fails AA, as WCAG requires.
- **Transparency**: a transparent background is laid over white, then a transparent text color over that background.
- **Card**: each card says AAA, AA, AA large only or fails, and its colored edge only repeats it.
- **Suggestions**: when AA or AAA fails, the element gives the nearest text color of the same hue and saturation that reaches it, toward black or white, whichever is closer. Each suggestion has a copy button.

## Attributes

| Attribute | Values  | Default | Description                            |
| --------- | ------- | ------- | -------------------------------------- |
| `fg`      | color   |         | Text color of the pair checked.        |
| `bg`      | color   |         | Background of the pair checked.        |
| `field`   | boolean | on      | Color fields when one pair is checked. |
| `suggest` | boolean | on      | The nearest colors that pass.          |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

## Copy

| Button          | Output                                                    |
| --------------- | --------------------------------------------------------- |
| Copy the report | One line per pair: colors, ratio and the criteria passed. |
| Copy (a color)  | A suggested color as `#rrggbb`.                           |

## Properties

| Property  | Type       | Description                                                  |
| --------- | ---------- | ------------------------------------------------------------ |
| `content` | `string`   | Pairs or a palette, one per line.                            |
| `results` | `object[]` | Read-only: `{ label, fg, bg, ratio }` for each pair checked. |

## Events

| Event       | Detail                 | When                          |
| ----------- | ---------------------- | ----------------------------- |
| `vt-ready`  | `{ type: "contrast" }` | Rendered.                     |
| `vt-change` | `{ fg, bg, ratio }`    | A color field was edited.     |
| `vt-copy`   | `{ text }`             | A color or the report copied. |

## CSS parts

| Part         | Element                            |
| ------------ | ---------------------------------- |
| `pair`       | The card of a pair.                |
| `preview`    | The sample text on its background. |
| `ratio`      | The contrast ratio.                |
| `levels`     | The table of criteria.             |
| `suggestion` | The nearest passing colors.        |
| `grid`       | The grid of a palette.             |

## Accessibility

The results are text: the ratio, each criterion with "Pass" or "Fail", and the level of each grid cell in its title. The check and cross icons and the colors only repeat them.

The samples in the previews are illustrations of the colors being checked, which may fail on purpose. They are drawn with CSS generated content and hidden from assistive technologies. This is incidental text in WCAG's terms, and the ratio and results already say what the sample shows.

With one pair, the card is a live region: editing a color announces the new result.

## Security

Colors are read with anchored patterns and only turned into `#rrggbb` values. Those values are set through CSSOM, which works under a strict CSP. CSS from the content is never applied: `url()`, `expression()` and `var()` are not colors.
