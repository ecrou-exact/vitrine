# Contributing to Vitrine

Thanks for your interest in contributing! Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Development setup

Node.js (>= 20) is used for dev tooling only — it is never a runtime dependency.

```bash
git clone https://github.com/ecrou-exact/vitrine.git
cd vitrine
npm ci
npm run build      # bundle into dist/ and generate custom-elements.json
npm run check      # lint, format check, type check, unit tests
npm run test:e2e   # end-to-end tests (run `npx playwright install` once)
```

Open `demo/index.html` through a local server (e.g. `npx http-server .`) to try the components.

## Rules

- English only for code, comments, docs and commit messages.
- Modern JavaScript (ES2022) with `// @ts-check` and full JSDoc — no TypeScript source files.
- Document every public element, attribute, property, event, CSS custom property and part with
  Custom Elements Manifest tags (`@element`, `@attr`, `@prop`, `@fires`, `@cssprop`, `@csspart`, `@slot`).
- Never assign untrusted strings to `innerHTML`; only sanitized output may go through it.
- No `eval`, `new Function`, inline event handlers or inline scripts.
- Keep files small and focused; avoid functions longer than ~50 lines.
- A new dependency requires updating `README.md` (Credits) and `THIRD_PARTY_NOTICES.md` in the same commit.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(code): add line highlighting`.
  Scopes: `code`, `markdown`, `json`, `core`, `docs`, `build`, `ci`.
- Update `CHANGELOG.md` under `[Unreleased]`.
- Pull requests need passing CI and a linear history (rebase, no merge commits).

## Definition of done

- Works via CDN script tag and ES module, with no consumer build.
- Simple and full variants work; every feature can be toggled individually.
- JSDoc complete and present in `custom-elements.json`.
- Unit tests and at least one e2e test.
- Security tests pass (no unsanitized HTML path).
- Keyboard and screen-reader usable.
- Demo page, `docs/` page and `CHANGELOG.md` updated.

## Releases

Releases follow [SemVer](https://semver.org/) with tags `vX.Y.Z`. The `dist/` folder is committed on
release tags so CDN and git submodule users get prebuilt files. The release workflow publishes SRI
hashes in the release notes.
