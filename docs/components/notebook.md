# `<vt-notebook>`

`<vt-notebook>` shows a Jupyter notebook (`.ipynb`): Markdown cells rendered, code cells highlighted with their execution counts, and their outputs: text and errors with their ANSI colors, images, HTML tables such as pandas DataFrames, Markdown and JSON. Nothing is ever run.

```html
<vt-notebook variant="full" src="/notebooks/analysis.ipynb"></vt-notebook>
```

## What it shows

| Cell or output                   | Shown as                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| Markdown cell                    | Rendered like [`<vt-markdown>`](markdown.md), with the images it holds (`attachment:`) |
| Code cell                        | Highlighted in the kernel's language, with `In [3]:`                                   |
| Raw cell                         | Text                                                                                   |
| `stream` (`stdout`, `stderr`)    | Text with ANSI colors; `stderr` tinted                                                 |
| `execute_result`, `display_data` | The richest type it has: PNG, JPEG, GIF or WebP image, SVG, HTML, Markdown, JSON, text |
| `error`                          | The traceback with its colors                                                          |
| Widgets                          | Their text: they need a running kernel                                                 |

Cells hidden in Jupyter (`jupyter.source_hidden`, `outputs_hidden`, or the `hide-input` and `hide-output` tags) are hidden here too, with a button to show them. Notebooks in nbformat 4 are read, and the cells of nbformat 3.

## Security

HTML outputs and Markdown go through the same sanitizer as `<vt-markdown>`: no script, no event handler, no style, links that open in a new tab with `rel="noopener noreferrer"`. Raw HTML in Markdown cells is kept (sanitized), as in Jupyter; `allow-html="false"` shows it as text. Images held in the notebook are shown from their data; SVG outputs are shown as images, where they cannot run scripts. `images` sets the policy for images loaded by Markdown and HTML outputs.

## A report

`code="false"`, or the button of the full variant, hides every code cell: only the Markdown and the outputs are left, like a report.

## Attributes

| Attribute      | Type    | Default           | Description                                                               |
| -------------- | ------- | ----------------- | ------------------------------------------------------------------------- |
| `code`         | boolean | on                | Code cells                                                                |
| `outputs`      | boolean | on                | Outputs of the code cells                                                 |
| `prompts`      | boolean | on                | `In [3]:` and `Out [3]:`                                                  |
| `line-numbers` | boolean | off               | Line numbers in code cells                                                |
| `code-toggle`  | boolean | preset            | A button that shows or hides every code cell                              |
| `allow-html`   | boolean | on                | Raw HTML in Markdown cells, sanitized                                     |
| `images`       | string  | `allow`           | `allow`, `block` or `same-origin`, for images loaded by Markdown and HTML |
| `language`     | string  | from the notebook | Language of the code cells                                                |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header, search, copy (the code cells as one script, Markdown as comments), download (`.ipynb`), full screen and the code button; with `copy`, each code cell has its own copy button.

## Properties

`notebook` is the notebook read (a read-only copy): `{ cells, language, kernel, format }`, each cell `{ type, source, count, outputs, attachments, hidden, outputsHidden, tags }`.

## CSS parts

`cell` (also `cell-markdown`, `cell-code`, `cell-raw`), `prompt`, `source`, `output` (also `output-stream`, `output-error`, `output-image`, `output-html`) and `markdown`.
