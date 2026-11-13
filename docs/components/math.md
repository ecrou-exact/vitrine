# `<vt-math>`

`<vt-math>` shows math written in TeX, drawn by the browser as MathML: one equation, several (separated by blank lines, optionally numbered), or text with math between delimiters. With `inline`, the element sits inside a line of text.

```html
<vt-math numbered>
  \int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}

  \begin{aligned}
    (a + b)^2 &= a^2 + 2ab + b^2 \\
    \sum_{k=1}^{n} k &= \frac{n(n+1)}{2}
  \end{aligned}
</vt-math>

<p>Euler's identity, <vt-math inline>e^{i\pi} + 1 = 0</vt-math>, links five constants.</p>
```

TeX is turned into MathML by [Temml](https://temml.org), loaded on demand from `dist/vendor/temml.js` (about 58 KB gzipped) the first time a page shows math. Until then, and if it cannot be loaded, the TeX is shown as it is written. Every current browser draws MathML natively, and screen readers read it; the TeX is kept in an annotation.

## Text with math

With `delimiters`, the content is text: `$…$` and `\(…\)` are inline math, `$$…$$` and `\[…\]` display math. `\$` is a dollar sign, and "$5 and $10" stays text.

```html
<vt-math delimiters>
  The roots of $ax^2 + bx + c = 0$ are
  $$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}.$$
</vt-math>
```

## Macros

```html
<vt-math macros='{"\\R": "\\mathbb{R}", "\\norm": "\\left\\lVert #1 \\right\\rVert"}'>
  f : \R^n \to \R, \quad \norm{x} \le 1
</vt-math>
```

## Errors

TeX that cannot be read is shown as it is written, with the reason: "This TeX could not be read: Expected '}' at end of input". The other equations are drawn.

## Security

TeX never becomes HTML: Temml builds MathML with DOM methods, `\href`, `\url`, `\includegraphics` and the other commands that load or link are refused (`trust` is off), and expansion is limited against macro bombs. The MathML is then checked against an allow-list of MathML elements and attributes, and its inline styles keep only the properties Temml uses, without `url()`. It works under a strict Content Security Policy and Trusted Types.

## Fonts

The element loads no font: browsers draw MathML with a math font of the system (Cambria Math on Windows, STIX Two Math on macOS and iOS). `--vt-font-math` sets another one, such as Latin Modern Math if the page loads it, and `--vt-math-size` the size of display math (`1.15em`).

## Using another copy of Temml

A page or a build that already has Temml can hand it over, and `dist/vendor/temml.js` is never fetched:

```js
// A Temml the page already uses (here from a CDN), or `import temml from 'temml'` in a build:
import temml from 'https://cdn.jsdelivr.net/npm/temml@0.14.0/dist/temml.mjs';
import { VtMath } from 'https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-math.js';

VtMath.useEngine(temml);
```

## Attributes

| Attribute     | Type    | Default | Description                                            |
| ------------- | ------- | ------- | ------------------------------------------------------ |
| `inline`      | boolean | off     | Inside a line of text: no frame, the math in text size |
| `delimiters`  | boolean | off     | The content is text with math between delimiters       |
| `numbered`    | boolean | off     | Numbers the equations: (1), (2)…                       |
| `macros`      | JSON    | none    | Macros: `{"\\R": "\\mathbb{R}"}`                       |
| `copy-mathml` | boolean | preset  | A button that copies the MathML                        |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header, copy (the TeX), the MathML button and full screen; with `delimiters`, also the search.

## CSS parts

`equation`, `number`, `math` and `tex-error`.
