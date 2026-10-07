# `<vt-terminal>`

`<vt-terminal>` displays a terminal session: commands after their prompt, and their output with ANSI colors. Each command has its own copy button, which copies the command without the prompt, so readers can paste it straight into their shell.

```html
<vt-terminal variant="full" label="Install">
  <template>
    $ npm install vitrine
    added 1 package in 2s
    $ npx vitrine --version
    0.7.0
  </template>
</vt-terminal>
```

Text is inserted as text, never parsed as HTML. Escape sequences are interpreted by a parser that only produces colors, text styles and http(s) links.

## Variants

| Feature               | `simple` (default) | `full` |
| --------------------- | ------------------ | ------ |
| `header`              | off                | on     |
| `dot`                 | off                | on     |
| `copy` (all commands) | off                | on     |
| `search`              | off                | on     |
| `download`            | off                | on     |
| `fullscreen`          | off                | on     |
| `colors`              | on                 | on     |
| `command-copy`        | on                 | on     |
| `wrap`                | on                 | on     |

Every feature can be turned on or off individually, whatever the variant.

## Commands and output

A line is a command when it starts with a prompt followed by a space (or nothing). The default prompts are `$` and `❯`. A context written before the prompt is part of it, as long as it has no spaces: in `ada@box:~/app$ npm test`, the prompt is `ada@box:~/app$` and the command is `npm test`.

- A command that ends with `\` continues on the next line, as in a shell.
- Every other line is output, until the next command.
- Commands are highlighted as shell code; output keeps its own colors.

Choose the prompts with `prompt`, separated by spaces. The longest one is tried first, so `PS>` wins over `>`:

```html
<vt-terminal prompt="PS> >">
  <template>
    PS> Get-ChildItem
    >> continued
  </template>
</vt-terminal>
```

With `prompt="none"`, every line is output: use it for logs and CI output.

## Colors and escape sequences

Output is read like a terminal reads it:

| Sequence                               | Result                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| SGR colors (`ESC[31m`, `ESC[92m`…)     | The 16 ANSI colors, mapped to theme colors                                                            |
| `ESC[38;5;nm`, `ESC[38;2;r;g;bm`       | 256 colors and 24-bit colors (also as background with `48`)                                           |
| `ESC[1m`, `2`, `3`, `4`, `7`, `9`      | Bold, dim, italic, underline, inverse, strikethrough (and their resets)                               |
| Carriage return `\r`, `ESC[K`, `ESC[G` | The line is redrawn: a progress bar shows its final state                                             |
| Backspace, tab                         | Move the cursor back; tab stops every 8 columns                                                       |
| `ESC]8;;URL ESC\` (OSC 8)              | A link, only when the URL is http(s); it opens in a new tab with `rel="noopener noreferrer nofollow"` |
| Anything else                          | Removed: cursor moves, screen clearing, titles, private modes, control characters                     |

Bold text in one of the 8 base colors uses the bright variant, as most terminals do.

### Writing escapes by hand

HTML cannot contain the escape character. Add `escapes` and write `\e`, `\x1b`, `\033` or `\u001b` instead:

```html
<vt-terminal escapes>
  <template>
    $ npm test
    \e[32m✓\e[0m 42 tests passed
    \e[41m\e[1m FAIL \e[0m 1 failed
  </template>
</vt-terminal>
```

Leave `escapes` off for real captured output, which contains the real character (and may contain the text `\e` legitimately).

### Theme colors

The 16 colors come from the theme, so they keep its contrast in light and dark themes: red is `--vt-danger`, green `--vt-success`, yellow `--vt-warning`, blue `--vt-info`, magenta and cyan the keyword and string syntax colors. Bright variants are mixed toward the text color. Override any of them on the element or an ancestor:

```css
vt-terminal {
  --vt-ansi-red: #ff5f56;
  --vt-ansi-green: #27c93f;
  --vt-ansi-yellow: #ffbd2e;
  --vt-terminal-prompt: #7c9cff;
}
```

| Token                                                                      | Default                                    |
| -------------------------------------------------------------------------- | ------------------------------------------ |
| `--vt-ansi-black`, `--vt-ansi-red`, `--vt-ansi-green`, `--vt-ansi-yellow`  | Text color mixed, danger, success, warning |
| `--vt-ansi-blue`, `--vt-ansi-magenta`, `--vt-ansi-cyan`, `--vt-ansi-white` | Info, keyword, string, text color mixed    |
| `--vt-ansi-bright-black` … `--vt-ansi-bright-white`                        | Bright variants                            |
| `--vt-terminal-prompt`                                                     | Accent color                               |

256-color and 24-bit colors are used as given. `colors="false"` shows the output as plain text.

## Long output

`collapse-output="20"` collapses every output block longer than 20 lines behind a "Show N more lines" button. Search still finds text in collapsed blocks and opens them. Very long outputs are built in blocks as they scroll into view, so a 100,000-line log opens at once.

## Typing replay

`typing` replays the session when it comes into view: each command is typed, then its output appears. The element keeps its final size from the start, so the page does not move. `typing-speed` sets the milliseconds per character (5 to 200, default 35). The header gets a **Replay** button.

```html
<vt-terminal typing typing-speed="25" variant="full">
  <template>
    $ npm create vitrine@latest
    ✔ Project name: … demo
    $ cd demo && npm run dev
  </template>
</vt-terminal>
```

With reduced motion requested by the system, the session is shown at once (the Replay button still plays it). Searching stops the replay. `vt-typing-end` fires when it finishes.

## Copy and download

- Each command has a copy button (shown on hover or focus, always shown on touch screens). It copies the command lines without the prompt. `command-copy="false"` removes them.
- The header copy button copies every command, one per line: a ready-to-run script.
- Download saves the session as plain text (prompts kept, escape sequences removed), named after `download`, a label that looks like a file name, or `session.txt`.

## Editing

With `mode="edit"`, an editor holds the transcript and a live preview is shown under it (both fill the screen in full screen). Undo and redo are in the header. See [Editing](../editing.md).

## Attributes

This table lists the attributes specific to `<vt-terminal>`. The shared attributes are described in [Common attributes](../common-attributes.md).

| Attribute         | Type                                   | Default     | Description                                                     |
| ----------------- | -------------------------------------- | ----------- | --------------------------------------------------------------- |
| `prompt`          | prompts separated by spaces, or `none` | `$ ❯`       | Prompts that start a command.                                   |
| `escapes`         | boolean                                | off         | Read `\e`, `\x1b`, `\033` and `\u001b` as the escape character. |
| `colors`          | boolean                                | on          | ANSI colors and text styles.                                    |
| `command-copy`    | boolean                                | on          | A copy button on each command.                                  |
| `collapse-output` | integer                                | `0` (never) | Collapse output blocks longer than this many lines.             |
| `typing`          | boolean                                | off         | Replay the session when it comes into view.                     |
| `typing-speed`    | integer 5 to 200                       | `35`        | Milliseconds per typed character.                               |
| `wrap`            | boolean                                | on          | Wrap long lines (off: scroll horizontally).                     |

## Properties

| Property   | Type       | Description                                                                                            |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| `content`  | `string`   | The transcript.                                                                                        |
| `commands` | `string[]` | The commands without prompts (continuation lines joined with `\n`). Read-only.                         |
| `entries`  | `object[]` | `{ type: "command", prompt, text }` and `{ type: "output", text }` in order, as plain text. Read-only. |

| Method     | Description                    |
| ---------- | ------------------------------ |
| `replay()` | Plays the typing replay again. |

## Events

| Event                   | `detail`               | When                                      |
| ----------------------- | ---------------------- | ----------------------------------------- |
| `vt-ready`              | `{ type: "terminal" }` | The session was rendered                  |
| `vt-copy`               | `{ text }`             | A command or all commands were copied     |
| `vt-search`             | `{ query, matches }`   | A search ran                              |
| `vt-typing-end`         | `{}`                   | The typing replay finished or was stopped |
| `vt-input`, `vt-change` | `{ value }`            | The transcript was edited (edit mode)     |
| `vt-error`              | `{ message, cause }`   | Loading failed or the text is too large   |

## CSS parts

In addition to the [shared parts](../common-attributes.md#shared-css-parts):

| Part            | Element                             |
| --------------- | ----------------------------------- |
| `terminal`      | The transcript                      |
| `command`       | A command line (prompt and command) |
| `prompt`        | A prompt                            |
| `command-text`  | The command itself                  |
| `command-copy`  | The copy button of a command        |
| `output`        | An output block                     |
| `output-more`   | "Show N more lines" button          |
| `replay-button` | The Replay button                   |

```css
vt-terminal::part(prompt) {
  color: #7c9cff;
}

vt-terminal::part(output) {
  font-size: 13px;
}
```

## Accessibility

The transcript is a focusable region named after the `label` (or "Terminal"). Prompts are hidden from assistive technologies; each command is introduced as "Command:". Colors only add to the text, which is always there. Copy buttons have names ("Copy command") and announce the result.

## Limits

- Lines longer than 20,000 characters are cut.
- Commands longer than 2,000 characters are not highlighted.
- Escape sequences longer than 256 characters, and OSC strings longer than 4,096, are dropped.
- The size limit of the [configuration](../configuration.md) applies (2 MB by default).
