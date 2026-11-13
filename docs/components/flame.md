# `<vt-flame>`

`<vt-flame>` shows a CPU profile as a flame graph: each function is a bar as wide as the time spent in it and in what it called, under its caller. Choosing a bar zooms into it, the search tells how much time the matching functions take, and the Functions tab lists the costliest functions. Nothing is ever run.

```html
<vt-flame variant="full" src="/profiles/checkout.cpuprofile"></vt-flame>
```

## What it reads

| Format                              | Written by                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Folded stacks (`a;b;c 12` per line) | `perf script \| stackcollapse-perf.pl`, `py-spy record --format raw`, async-profiler (`collapsed`), rbspy and most sampling profilers |
| Chrome and Node CPU profiles        | DevTools (Performance, Save profile), `node --cpu-prof` (`.cpuprofile`)                                                               |
| A JSON tree                         | `{ "name", "value", "children" }`, where `value` is the total of a frame (d3-flame-graph)                                             |

A `.cpuprofile` with the times of its samples is shown in milliseconds; otherwise weights are numbers of samples (`unit` names them). Frames of the same function under the same caller are merged.

## Reading it

With `direction="down"` (the default), callers are on top, as an icicle; `direction="up"` puts them at the bottom, as flames. Bars are sorted by name, so the same profile always looks the same, and colored by name in warm tones of the theme: a function keeps its color everywhere. A bar too narrow to read is not drawn; the time it takes is still in its caller.

Choosing a bar (click, Enter or Space) zooms into it: it fills the width, and its callers stay above it. The path at the top goes back. The line under the graph describes the bar under the pointer or the focus: its time, its share of the whole and its own time, and its file and line.

The Functions tab lists the functions by their own time, with their total time counted once per stack, so a recursive function is not counted twice.

## Keyboard

| Key          | Action                                      |
| ------------ | ------------------------------------------- |
| ↑ ↓          | The caller, or the widest function it calls |
| ← →          | The function beside                         |
| Enter, Space | Zooms into the function                     |
| Escape       | Zooms out one level                         |

## Attributes

| Attribute     | Type    | Default   | Description                                               |
| ------------- | ------- | --------- | --------------------------------------------------------- |
| `direction`   | string  | `down`    | `down` (callers on top) or `up` (callers at the bottom)   |
| `tabs`        | boolean | preset    | Flame graph and Functions tabs                            |
| `default-tab` | string  | `graph`   | `graph` or `functions`                                    |
| `unit`        | string  | `samples` | Unit of the weights, when the profile does not give times |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header, the tabs, search, copy (as folded stacks), download (the profile as written) and full screen.

## Properties

`profile` is the profile read: `{ root, unit, format, frames }`, each frame `{ name, file, self, total, depth, children }`.

## Events

| Event           | When                               | Detail                                |
| --------------- | ---------------------------------- | ------------------------------------- |
| `vt-select`     | A frame was chosen and zoomed into | `{ name, file, self, total, path }`   |
| `vt-tab-change` | The tab changed                    | `{ tab }`: `"graph"` or `"functions"` |

## CSS parts

`graph`, `frame` (also `frame-match` during a search), `crumbs`, `details` and `table`.
