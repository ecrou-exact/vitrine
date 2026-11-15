# `<vt-install>`

`<vt-install>` shows an install command for every package manager, as tabs. Write the command once, in the syntax of the manager you use, and each tab gets the command of its own manager: `npm install -D vitest` becomes `pnpm add -D vitest`, `yarn add -D vitest`, `bun add -d vitest` and `deno add --dev npm:vitest`. The reader's choice is shared by every `<vt-install>` of the page and kept for their next visit, so a guide with ten commands asks only once.

```html
<vt-install>npm install -D vitrine</vt-install>

<!-- Or from attributes -->
<vt-install package="vitrine" dev></vt-install>
```

## What it reads

Commands of npm, npx, pnpm, yarn, bun and bunx, or of pip, `python -m pip`, uv, uvx, poetry, pdm and pipx, one per line. Lines starting with `#` are comments; `&&` joins commands; a `$` or `>` prompt copied with a command is dropped.

| Command                                     | What it does                    | pnpm / yarn / bun / deno                                                    |
| ------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `npm install` (`i`, `add`)                  | Installs the project            | `pnpm install`, `yarn install`, `bun install`, `deno install`               |
| `npm install <pkg>` (`-D`, `-E`, `-O`)      | Adds a dependency               | `pnpm add`, `yarn add`, `bun add` (`-d`), `deno add npm:<pkg>`              |
| `npm install -g <pkg>`                      | Installs a tool globally        | `pnpm add -g`, `yarn global add`, `bun add -g`, `deno install -g`           |
| `npm uninstall <pkg>`                       | Removes a dependency            | `pnpm remove`, `yarn remove`, `bun remove`, `deno remove`                   |
| `npm ci`                                    | Installs from the lockfile only | `--frozen-lockfile`, `--immutable`, `--frozen-lockfile`, `--frozen`         |
| `npx <pkg> <args>`                          | Runs a package once             | `pnpm dlx`, `yarn dlx`, `bunx`, `deno run npm:<pkg>`                        |
| `npm create <pkg> <args>`, `npm init <pkg>` | Starts a project                | `pnpm create`, `yarn create`, `bun create`, `deno init --npm` (`--` placed) |
| `npm run <script>`, `npm test`, `npm start` | Runs a script                   | `pnpm run`, `yarn run`, `bun run`, `deno task`                              |

Python commands work the same way: `pip install` becomes `uv add`, `poetry add` and `pdm add` (`--dev`, `--group dev`, `-d`), `pipx install` becomes `uv tool install`, `uvx` becomes `pipx run`, `pip install -r requirements.txt` becomes `uv pip install -r requirements.txt`. When a manager has no equivalent (`uvx` with poetry), its tab says so.

A line that is not understood (an unknown flag, `cd my-app`) is kept as written. When it is a command of a manager, it only appears in that manager's tab. Words are quoted for a POSIX shell when they need it, so `pip install "requests>=2.31"` stays one word: `uv add 'requests>=2.31'`. A line with `$`, backquotes, `;`, `|` or a redirection is never rewritten.

## Tabs given as they are

A `<template data-tab>` child adds a tab shown as written, without a prompt; a tab named like a manager replaces its command.

```html
<vt-install>
  npm install vitrine
  <template data-tab="CDN">
    <script src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/vitrine.min.js"></script>
  </template>
</vt-install>
```

As JSON, `data` (or `json`) takes `{ "command": "npm i vitrine", "tabs": { "CDN": "…" } }`, or `{ "package": "vitrine", "dev": true }`.

## Attributes

| Attribute   | Type    | Default                               | Description                                                                                      |
| ----------- | ------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `package`   | string  | —                                     | Packages, separated by spaces, when no command is written                                        |
| `action`    | string  | `add`                                 | With `package`: `add`, `install`, `ci`, `remove`, `global`, `exec`, `create`, `init`, `run`      |
| `dev`       | boolean | off                                   | With `package`: a development dependency                                                         |
| `ecosystem` | string  | from the command, else `js`           | `js` or `python`                                                                                 |
| `managers`  | string  | `npm,pnpm,yarn,bun` / `pip,uv,poetry` | Tabs, separated by commas; `deno` and `pdm` are available too                                    |
| `manager`   | string  | the first tab                         | Tab selected when the reader has not chosen one                                                  |
| `sync`      | string  | `install`                             | Elements with the same value change tabs together and share the remembered choice; `false`: none |
| `prompt`    | string  | `$`                                   | Prompt before each command; `false`: none                                                        |

Shared attributes are in [Common attributes](../common-attributes.md). Both variants have the header and the copy button, which copies the commands of the tab shown.

## Properties

`tabs` is the list of tabs: `{ id, label, lines, custom }`, with `lines` `null` when the manager has no equivalent. `selected` is the label of the tab shown; setting it changes the tab of this element only.

## Events

| Event           | When                     | Detail     |
| --------------- | ------------------------ | ---------- |
| `vt-tab-change` | The reader chose a tab   | `{ tab }`  |
| `vt-copy`       | The commands were copied | `{ text }` |

## CSS parts

`tabs`, `code` and `prompt`.

## Storage

The choice is kept in `localStorage` under `vitrine-install:<sync>`, and windows of the same site follow each other. When storage is refused (private browsing), the choice lasts for the page.
