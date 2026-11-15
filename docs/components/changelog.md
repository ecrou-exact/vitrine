# `<vt-changelog>`

`<vt-changelog>` turns a changelog into a release-notes page: the `CHANGELOG.md` of a project, its GitHub releases, or a list of your own. Each version with its date and badges, its changes in colored groups, breaking changes first, issues and commits linked, filters by kind, and "what's new since" a version.

```html
<vt-changelog src="/CHANGELOG.md" repo="https://github.com/owner/name"></vt-changelog>
```

## Sources

- **Keep a Changelog**: `## [1.2.0] - 2026-11-01`, `## [Unreleased]`, `[YANKED]`, groups `### Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`, and the compare links at the bottom (`[1.2.0]: https://…/compare/v1.1.0...v1.2.0`).
- **conventional-changelog** (semantic-release, release-please, standard-version): `# [2.0.0](compare-url) (2026-11-10)`, groups `Features`, `Bug Fixes`, `Performance Improvements`, `⚠ BREAKING CHANGES`, and scopes (`**parser:** read YAML`).
- **GitHub releases** (`/repos/{owner}/{repo}/releases`) and GitLab releases: tag, name, date, pre-release, release page, and the notes, generated ("What's Changed", "Full Changelog") or written.
- **Your own JSON**: `[{ "version": "1.2.0", "date": "2026-11-01", "url": "…", "changes": { "added": ["…"], "fixed": ["…"] } }]`.

Other headings (`Documentation`, `Chores`…) are kept as they are written. Release headings are those of level 1 or 2 with a version or "Unreleased"; text before the first one is left out.

## Reading a release

Each release shows its version (linked with `#v1.2.0`), its name when it says more, its date, the badges Latest, Pre-release and Yanked, its Compare and Release page links, and two buttons: a link to the release and its notes as Markdown. Groups come in a fixed order: breaking changes, security, added, changed, deprecated, removed, fixed, other. A change marked breaking in another group gets a badge.

The text of a change keeps its code, bold, italic and links. With `repo`, `#123` links to the issue, `@user` to the profile and commit hashes to the commit, on GitHub or GitLab; pull request addresses are shown as `#123`. A page address ending in `#v1.2.0` scrolls to that release.

## Filters and "since"

`filters` (on in the `full` variant) adds buttons with the count of each kind of change: press Fixed to see only fixes, press more to add kinds. `kinds="breaking,security"` starts with some. `since="1.2.0"` shows only the releases after it, with a summary of their changes: the page to send someone who upgrades. `limit="5"` shows five releases and a button for the older ones; `unreleased="false"` leaves out the Unreleased section.

## Attributes

| Attribute    | Type    | Default | Description                                          |
| ------------ | ------- | ------- | ---------------------------------------------------- |
| `repo`       | string  | —       | Repository address, for issues, mentions and commits |
| `since`      | string  | —       | Shows the releases after this version                |
| `limit`      | number  | all     | Releases shown before "Show older releases"          |
| `kinds`      | string  | all     | Kinds shown at first, separated by commas            |
| `filters`    | boolean | `full`  | The buttons that keep some kinds                     |
| `unreleased` | boolean | on      | The Unreleased section                               |

The [common attributes](../common-attributes.md) apply: `src`, `variant`, `label`, `theme`, `editable` (the Markdown in an editor beside the preview), `download`, `copy` (everything shown, as Markdown)…

## Properties

`content` is the changelog text. `releases` is what was read: `[{ version, title, date, unreleased, yanked, prerelease, url, compare, notes, groups: [{ kind, label, items: [{ text, scope, breaking }] }] }]`.

## Events

| Event              | When                | Detail             |
| ------------------ | ------------------- | ------------------ |
| `vt-filter-change` | Kinds shown changed | `{ kinds, shown }` |

## CSS parts

`filters`, `release`, `version`, `group` and `kind`.
