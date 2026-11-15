# `<vt-contributors>`

`<vt-contributors>` thanks the people behind a project: contributors and sponsors as a wall of avatars, a grid with names or a list, in groups (sponsor tiers, the most generous first), with the kinds of contributions each person made.

```html
<vt-contributors json-src="/contributors.json" max="48"></vt-contributors>
```

## What it reads

| Source                                                                                               | What is shown                                                                         |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| GitHub API, `/repos/{owner}/{repo}/contributors`                                                     | Avatars, logins and contributions; bots hidden                                        |
| An All Contributors file, `.all-contributorsrc`                                                      | Names, profiles and types of contributions (💻 code, 📖 docs, 🐛 bugs…), with filters |
| Open Collective, `https://opencollective.com/{slug}/members/all.json`                                | Backers by tier, the most generous tier first; followers left out                     |
| GitHub Sponsors, from GraphQL (`sponsorshipsAsMaintainer`)                                           | Sponsors by tier                                                                      |
| Your own JSON: `{ "groups": [{ "name": "Core team", "size": "large", "people": [...] }] }` or a list | Groups in their order, at the size given                                              |

A person has a `name` (or `login`), and may have `avatar`, `url`, `contributions` (a number, or All Contributors types), `tier` or `group`, and `amount`. Types not in the [All Contributors emoji key](https://allcontributors.org/docs/en/emoji-key) are left out.

Nothing is fetched but `src` and `json-src`. GitHub Sponsors and Open Collective private data need a token: fetch them when you build the site and serve the JSON with it.

## Groups and sizes

People with a tier, a group or an Open Collective role are grouped under its name. When groups are sponsor tiers with amounts, the most generous comes first with large avatars, the second with medium ones, the others with small ones. `size` sets one size for all, and a group of your JSON can set its own.

## Attributes

| Attribute | Type    | Default      | Description                                                |
| --------- | ------- | ------------ | ---------------------------------------------------------- |
| `layout`  | string  | `grid`       | `grid` (avatars and names), `avatars` (faces only), `list` |
| `sort`    | string  | as given     | `contributions`, `name` or `amount` within each group      |
| `max`     | number  | all          | People shown before a "Show more" button                   |
| `bots`    | boolean | off          | Shows bots (`dependabot[bot]`, `github-actions[bot]`…)     |
| `size`    | string  | by tier      | `small`, `medium` or `large` avatars                       |
| `counts`  | boolean | on           | The number of contributions under each name                |
| `filters` | boolean | full variant | Buttons that keep one type of contribution, with counts    |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header with the number of people, the filters, search, full screen, download (the JSON) and copy, which copies the people shown as a Markdown list for release notes: `- [Ada Lovelace](<https://…>) (@ada)`.

## Privacy and links

Avatars load lazily, without a referrer; GitHub avatars are asked at the size they are shown instead of 460 pixels. Links of sponsors are `rel="sponsored"`, as search engines ask for paid links.

## Properties

`groups` is the list of groups: `{ name, role, size, people }`, each person `{ name, login, avatar, url, contributions, types, group, role, amount, sponsor, bot }`.

## Events

| Event              | When                              | Detail                     |
| ------------------ | --------------------------------- | -------------------------- |
| `vt-filter-change` | A type of contribution was chosen | `{ type }`, `null` for all |

## CSS parts

`filters`, `group`, `person`, `avatar` and `name`.
