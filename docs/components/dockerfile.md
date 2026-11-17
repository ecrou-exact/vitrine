# `<vt-dockerfile>`

`<vt-dockerfile>` shows a Dockerfile as build stages. Each stage comes with:

- its base image;
- what it copies from other stages;
- the user and ports of the final image;
- its instructions, each with what it does and the problems found on it.

Nothing is built or pulled.

```html
<vt-dockerfile variant="full" src="Dockerfile"></vt-dockerfile>
```

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |
| `tabs`       | on                 | on     |

## Input

A Dockerfile (or Containerfile) is read as Docker reads it, including:

- instructions in any case;
- continuation lines, with comment lines inside them skipped;
- the `# escape=` parser directive;
- flags (`--from`, `--chown`, `--mount`, `--platform`…);
- the exec form (`["node", "app.js"]`) and the shell form;
- BuildKit heredocs (`RUN <<EOF … EOF`).

Up to 512 KB of text is read.

## Stages

- **Summary**: the number of stages, instructions and layers of the final image (`RUN`, `COPY` and `ADD` of the final stage and the stages it is built on), the global build arguments (`ARG` before the first `FROM`), and the number of problems.
- **Stages**: each one is a card with:
  - its number and `AS` name, and its base image;
  - the stage it is built on (`FROM build`) and the stages it copies from (`COPY --from`);
  - its platform and its exposed ports;
  - for the final image, the user it runs as.

  Instructions follow with their line number. Each keyword says what it does when hovered, and to screen readers. Instructions that add a layer are underlined. Heredoc bodies are shown under their instruction, and each instruction lists its problems.

- **Source**: the Dockerfile colored (keywords, flags, variables, strings, comments), with line numbers marked when a problem is on them.

## Problems

| Level   | Problem                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Error   | Unknown instruction; an instruction other than `ARG` before the first `FROM`; no `FROM`; two stages with the same name; `COPY --from` a stage that does not exist; `apt-get install` without `-y`; a variable named like a secret (`*_TOKEN`, `PASSWORD`, `API_KEY`…) in `ENV` or `ARG`.                                                                           |
| Warning | A base image without a tag or with `latest`; the final image running as root; several `CMD` or `ENTRYPOINT`; port 22 exposed; a relative `WORKDIR`; `ADD` of a URL, or `ADD` where `COPY` does; `sudo`; `curl … \| sh`; `chmod 777`; apt lists left in the layer; `apt-get update` alone in a `RUN`.                                                               |
| Info    | A base image from a variable; no `HEALTHCHECK`; a stage the final image does not use; `MAINTAINER`; `COPY .` before installing dependencies; `CMD` or `ENTRYPOINT` in shell form; `cd` in `RUN`; `apt-get upgrade`; `--no-install-recommends`, `apk add --no-cache` or `pip --no-cache-dir` missing; `npm install` where `npm ci` fits; a pipe without `pipefail`. |

`lint="false"` hides them.

## Attributes

| Attribute | Values             | Default  | Description                                                  |
| --------- | ------------------ | -------- | ------------------------------------------------------------ |
| `view`    | `stages`, `source` | `stages` | Tab shown first.                                             |
| `lint`    | boolean            | on       | The problems found.                                          |
| `explain` | boolean            | on       | What each instruction does, on hover and for screen readers. |
| `tabs`    | boolean            | on       | The Stages and Source tabs.                                  |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md). `mode="edit"` edits the Dockerfile and the stages follow as you type.

## Properties

| Property     | Type     | Description                                                                                                                                                                                                                                                                                                               |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`    | `string` | The Dockerfile.                                                                                                                                                                                                                                                                                                           |
| `dockerfile` | `object` | Read-only. It has the form `{ instructions, stages, args, findings, escape }`. Each instruction is `{ keyword, args, raw, flags, line, lines, json, heredocs }`. Each stage is `{ index, name, image, platform, instructions, from, user, ports, final, parent, origin }`. Each finding is `{ id, level, line, params }`. |

## Events

| Event           | Detail                   | When                                 |
| --------------- | ------------------------ | ------------------------------------ |
| `vt-ready`      | `{ type: "dockerfile" }` | The Dockerfile is rendered.          |
| `vt-tab-change` | `{ tab }`                | The tab changed.                     |
| `vt-copy`       | `{ text }`               | The Dockerfile copied.               |
| `vt-error`      | `{ message, cause }`     | Loading failed or content too large. |

## CSS parts

| Part          | Element               |
| ------------- | --------------------- |
| `summary`     | The summary.          |
| `findings`    | The list of problems. |
| `stage`       | The card of a stage.  |
| `instruction` | An instruction.       |
| `source`      | The colored source.   |

## Accessibility

Each stage is a section named after it, and its instructions are an ordered list. Keywords carry their explanation as text for screen readers. Problems and their levels are words; colors only repeat them.

## Security

The Dockerfile is only read: nothing is built, run, pulled or fetched besides `src`. Every value is inserted as text.
