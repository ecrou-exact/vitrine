# `<vt-diagram>`

`<vt-diagram>` shows a diagram written in [Mermaid](https://mermaid.js.org): flowcharts, sequence, class, state and entity relationship diagrams, Gantt charts, pie charts, mind maps, timelines, Git graphs, quadrant charts and the other types Mermaid draws, in the colors of the theme.

```html
<vt-diagram variant="full" label="Orders">
  <template>
    flowchart LR
      A[Order placed] --> B{Paid?}
      B -- yes --> C[Ship the parcel]
      B -- no --> D[Send a reminder]
      D --> B
  </template>
</vt-diagram>
```

Mermaid is loaded on demand: `dist/vendor/mermaid.js` (about 12 KB gzipped) the first time a page shows a diagram, then only the code of the types the page uses, from `dist/vendor/mermaid/`. A first flowchart downloads about 235 KB gzipped in all, a sequence diagram about 210 KB, a pie chart about 345 KB; the files of every type together are about 1.1 MB, and the browser keeps them in its cache.

## Colors

The diagram takes the colors of the element's theme: nodes on `--vt-surface-sunken`, borders, lines and text from the theme, and the accent and status colors for series (pie slices, Gantt tasks, Git branches). It is drawn again when the theme changes, for example when the system switches to dark.

`look="handDrawn"` gives Mermaid's sketched look.

## Errors

A diagram that cannot be drawn shows Mermaid's message and the source:

```text
This diagram could not be drawn.
Parse error on line 2: … Expecting 'SPACE', 'NODE_STRING', got 'EOF'
```

## Security

Mermaid runs in its strict mode: no click handlers, no HTML in labels, no `%%{init}%%` that loosens it. Everything Mermaid writes goes through Vitrine:

- the SVG it returns is sanitized again: no script, no event handler, no foreign document, no image or link to another place (only `#id` references stay), no attribute animation;
- its stylesheet becomes a constructable stylesheet inside the element, without `@import` or external `url()`; inline styles are set through CSSOM;
- while it draws, its HTML writes insert sanitized DOM, and the stylesheet of the diagram is applied to the page with only the rules scoped to that diagram, then removed.

So diagrams work under a strict Content Security Policy and enforced Trusted Types (`require-trusted-types-for 'script'; trusted-types vitrine`), and nothing is reported by the browser. The `elk` layout of Mermaid is not included (its license is EPL-2.0 or GPL-3.0): the default layout is used.

## Using another renderer

A page that already loads Mermaid can draw with it, and `dist/vendor/mermaid.js` is never fetched. The SVG it returns is sanitized the same way:

```js
// A Mermaid the page already uses (here from a CDN), or `import mermaid from 'mermaid'` in a build:
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@12.3.0/dist/mermaid.esm.min.mjs';
import { VtDiagram } from 'https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-diagram.js';

let n = 0;
VtDiagram.useEngine({
  async render(text, config) {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', ...config });
    return (await mermaid.render(`vt-diagram-own-${(n += 1)}`, text)).svg;
  },
});
```

## Attributes

| Attribute      | Type    | Default   | Description                |
| -------------- | ------- | --------- | -------------------------- |
| `tabs`         | boolean | preset    | Diagram and Source tabs    |
| `default-tab`  | string  | `diagram` | `diagram` or `source`      |
| `look`         | string  | `classic` | `classic` or `handDrawn`   |
| `line-numbers` | boolean | off       | Line numbers in the source |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header, the tabs, copy (the source), download (the drawing as an SVG file, with its stylesheet) and full screen. `label` names the diagram for screen readers, unless the source has an `accTitle`.

## Properties

`svg` is the drawing (a copy), once drawn.

## Events

| Event           | When            | Detail                               |
| --------------- | --------------- | ------------------------------------ |
| `vt-tab-change` | The tab changed | `{ tab }`: `"diagram"` or `"source"` |

## CSS parts

`canvas`, `diagram`, `source` and `diagram-error`.
