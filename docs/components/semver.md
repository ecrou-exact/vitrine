# `<vt-semver>`

`<vt-semver>` explains a version range the way npm, Cargo and Composer read it. It shows each term in words, the bounds the range comes to, and what to watch. Given a list of versions, it marks those that match, says which one would be installed and where the latest version stands.

```html
<vt-semver range="^1.2.3">1.0.0 1.2.3 1.4.2 2.0.0</vt-semver>
```

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |

## Input

- **The range** comes from the `range` attribute. Without it, the first line of the content is the range.
- **The versions** are the rest of the content, in one of these forms:
  - one per line, or separated by spaces or commas;
  - a JSON array of strings or of `{ version }`;
  - an npm registry document (`https://registry.npmjs.org/<package>`): the keys of its `versions` and its `dist-tags`.

Up to 5,000 versions are read; duplicates are dropped and the list is sorted. Values that are not versions are listed apart.

Versions follow [SemVer 2.0.0](https://semver.org/): `major.minor.patch`, an optional pre-release (`-rc.1`) and build metadata (`+build.5`, ignored when comparing). A leading `v` or `=` is accepted.

## Ranges

| Term                      | Reading                                                            | Bounds              |
| ------------------------- | ------------------------------------------------------------------ | ------------------- |
| `^1.2.3`                  | 1.2.3 or later, without a new major version                        | `>=1.2.3 <2.0.0`    |
| `^0.2.3`                  | 0.2.3 or later within 0.2.x: before 1.0.0, `^` allows patches only | `>=0.2.3 <0.3.0`    |
| `^0.0.3`                  | exactly 0.0.3                                                      | `>=0.0.3 <0.0.4`    |
| `~1.2.3`, `~>1.2.3`       | 1.2.3 or later within 1.2.x                                        | `>=1.2.3 <1.3.0`    |
| `1.x`, `1`, `1.2.*`       | any 1.x (or 1.2.x) version                                         | `>=1.0.0 <2.0.0`    |
| `*`, empty                | any version                                                        | none                |
| `>1.2`, `<=1.2`           | comparisons with a partial version, as npm reads them              | `>=1.3.0`, `<1.3.0` |
| `1.2 - 2.3`               | from 1.2.0 to 2.3.x, both included                                 | `>=1.2.0 <2.4.0`    |
| `>=1.2 <2`, `>= 1.2, < 2` | every term together (spaces or commas, as Cargo writes them)       | `>=1.2.0 <2.0.0`    |
| `a \|\| b`                | either set                                                         | each set apart      |

**Pre-releases** follow npm's rule: a pre-release only matches when a term of the same set names a pre-release of the same `major.minor.patch`. So `^1.2.3` does not match `1.5.0-rc.1`, while `>=1.2.3-beta.2` matches `1.2.3-beta.3`. Set `prerelease` to let them match like other versions.

## What to watch

The element warns about:

- a set no version can match, because its bounds cross;
- `*`, or a set with no upper bound: a future major version that breaks the API would be installed;
- a set with no lower bound;
- an exact pin: no security fix is picked up without an edit;
- `^` below 1.0.0, which is narrower than it looks;
- a pre-release in the range.

## Versions

With versions, the element shows:

- **Installs**: the highest version that matches, the one npm or Cargo would choose, with the count of matches.
- **Latest**: whether `dist-tags.latest` (or the highest stable version) is in the range, and if not, whether reaching it is a major, minor or patch update.
- **The versions**: matches are marked with a check, and the version installed is outlined. Tags (`latest`, `next`…) are shown beside their version, and pre-releases are in italics. Up to 400 are drawn, the newest.

With `field` on (the default), a field edits the range and another tests a version. The test says whether the version matches, and why a pre-release does not.

## Attributes

| Attribute    | Values  | Default | Description                                           |
| ------------ | ------- | ------- | ----------------------------------------------------- |
| `range`      | string  |         | The range. Without it, the first line of the content. |
| `field`      | boolean | on      | The fields to edit the range and test a version.      |
| `prerelease` | boolean | off     | Pre-releases match like other versions.               |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

## Copy

| Button           | Output                                 |
| ---------------- | -------------------------------------- |
| Copy the matches | The versions that match, one per line. |
| Copy the range   | The range as currently edited.         |

## Properties

| Property   | Type       | Description                                     |
| ---------- | ---------- | ----------------------------------------------- |
| `content`  | `string`   | The versions (or the range, then versions).     |
| `range`    | `string`   | The range shown. Setting it sets the attribute. |
| `matching` | `string[]` | Read-only: the versions that match.             |

## Events

| Event       | Detail                         | When                                    |
| ----------- | ------------------------------ | --------------------------------------- |
| `vt-ready`  | `{ type: "semver" }`           | Rendered.                               |
| `vt-change` | `{ value }`                    | The range was edited in the field.      |
| `vt-match`  | `{ range, matches, resolved }` | Versions were matched (on each change). |
| `vt-copy`   | `{ text }`                     | The range or the matches copied.        |

## CSS parts

| Part       | Element                                   |
| ---------- | ----------------------------------------- |
| `field`    | The range field.                          |
| `reading`  | The range in words.                       |
| `warnings` | What to watch.                            |
| `result`   | The version installed and the latest one. |
| `versions` | The list of versions.                     |
| `test`     | The field to test a version.              |

## Accessibility

The fields have labels. The results and the test result are live regions, so a change is announced. Each version says "matches" or "does not match" to screen readers; the check and the colors only repeat it.

## Security

Versions and ranges are read with anchored patterns of bounded length (1,024 characters for a range, 5,000 versions) and inserted as text. Nothing is fetched besides `src`.
