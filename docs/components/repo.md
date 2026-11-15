# `<vt-repo>`

`<vt-repo>` shows a repository as a card: owner and name, description, topics, stars, forks, open issues and watchers, the languages as a bar, the license, the latest release, the last activity, the website, and the clone command. A live alternative to a row of badges on a project's home page, or a list of projects on a portfolio.

```html
<vt-repo src="https://api.github.com/repos/ecrou-exact/vitrine" allow-remote></vt-repo>
```

## Sources

- **GitHub**: the repository of the API, `https://api.github.com/repos/{owner}/{repo}`. It has the main language only; for the bar of every language and the latest release, put them together: `{ "repo": …, "languages": …(/languages), "release": …(/releases/latest) }`.
- **GitLab**: the project of the API, `https://gitlab.com/api/v4/projects/{id}` (add `?license=true` for the license).
- **Your own JSON**: `{ "name", "owner", "url", "description", "stars", "forks", "issues", "license", "topics", "languages", "release" }`.

Nothing is fetched but `src`, under the usual rules (`allow-remote` for another origin). The GitHub API allows 60 requests an hour without a token: on a busy page, export the JSON at build time, for example in a scheduled workflow:

```sh
curl -s https://api.github.com/repos/owner/name > repo.json
```

## The card

The name links to the repository and the Star button to its page. Counts are short (12.3k) with their exact value read out and in the tooltip, and link to the stargazers, forks, issues and watchers on GitHub. Languages show their share with GitHub Linguist colors, the six largest by name and the rest as Other. Dates are relative ("2 days ago"), with the date in the tooltip. Archived, fork and template repositories are marked. The `full` variant adds the clone command with a copy button.

Avatars load lazily, without a referrer.

## Attributes

| Attribute   | Type    | Default | Description                                 |
| ----------- | ------- | ------- | ------------------------------------------- |
| `stats`     | boolean | on      | Stars, forks, issues and watchers           |
| `languages` | boolean | on      | The language bar                            |
| `topics`    | boolean | on      | The topics                                  |
| `clone`     | boolean | `full`  | The clone command                           |
| `now`       | string  | —       | The current time, for tests and screenshots |

The [common attributes](../common-attributes.md) apply: `src`, `allow-remote`, `variant`, `label`, `theme`, `editable`, `download`, `copy`…

## Properties

`content` is the JSON text. `repo` is what was read: `{ host, owner, name, url, description, homepage, avatar, stars, forks, issues, watchers, languages, license, topics, created, pushed, archived, fork, template, branch, clone, release }`.

## Events

| Event     | When                     | Detail     |
| --------- | ------------------------ | ---------- |
| `vt-copy` | The clone command copied | `{ text }` |

## CSS parts

`card`, `name`, `stats`, `languages`, `meta` and `clone`.
