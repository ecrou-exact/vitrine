# Contributing to Vitrine

Thanks for your interest in contributing! Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Development setup

Node.js (>= 20) is used for dev tooling only — it is never a runtime dependency.

```bash
git clone https://github.com/ecrou-exact/vitrine.git
cd vitrine
npm ci
npm run build          # bundles into dist/ and generates custom-elements.json
npm run check          # lint, format, type check, unit tests, generated files
npx playwright install # once
npm run site           # builds the library and the website into _site/
npm run test:e2e       # end-to-end, security, accessibility and website tests
```

Useful commands:

| Command                            | What it does                                                            |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `npm run serve`                    | Serves the repository on http://localhost:4173 (test fixtures, `demo/`) |
| `node scripts/serve.js _site 4174` | Serves the built website                                                |
| `npm run dev`                      | Rebuilds the library on change                                          |
| `npm run size`                     | Checks the gzipped bundle size budget                                   |
| `npm run tokens`                   | Regenerates `design-tokens.json` from the theme CSS files               |
| `npm run notices`                  | Regenerates `THIRD_PARTY_NOTICES.md` from the installed packages        |
| `npm run languages`                | Regenerates the highlight.js language index after an upgrade            |

## Project layout

| Path                                           | Contents                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/core/`                                    | Shared modules: base element, security, content loading, highlighter, search, UI, themes, i18n |
| `src/components/`                              | `vt-code`, `vt-markdown`, `vt-json`                                                            |
| `src/styles/`                                  | Component CSS and theme token files (`themes/*.css`)                                           |
| `tests/unit/`                                  | Vitest unit tests (`tests/unit/security.test.js` runs in jsdom)                                |
| `tests/e2e/`, `tests/security/`, `tests/site/` | Playwright tests (strict CSP fixtures, XSS suite, website)                                     |
| `site/`                                        | Website sources (assembled by `scripts/build-site.js`)                                         |
| `docs/`                                        | Documentation, rendered on the website by `<vt-markdown>`                                      |
| `brand/`                                       | Logo files and specification                                                                   |

## Rules

- English only for code, comments, docs and commit messages.
- Modern JavaScript (ES2022) with `// @ts-check` and full JSDoc — no TypeScript source files.
- Document every public element, attribute, property, event, CSS custom property and part with
  Custom Elements Manifest tags (`@element`, `@attr`, `@prop`, `@fires`, `@cssprop`, `@csspart`, `@slot`).
- Never assign untrusted strings to `innerHTML`; only sanitized output may go through it.
- No `eval`, `new Function`, inline event handlers or inline scripts.
- Keep files small and focused; avoid functions longer than ~50 lines.
- A new dependency requires updating `README.md` (Credits), `scripts/third-party.js` and
  `THIRD_PARTY_NOTICES.md` (`npm run notices`) in the same commit.
- Visual changes follow [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md): tokens only, light and dark checked.

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

Releases follow [SemVer](https://semver.org/) with tags `vX.Y.Z`. `main` never contains build
output (`dist/` is ignored). To release:

1. Open a PR that sets the version in `package.json` and moves the `[Unreleased]` entries of
   `CHANGELOG.md` under a new `[X.Y.Z]` heading. Merge it.
2. Run the **Release** workflow from the Actions tab. It runs every check, builds `dist/`,
   commits it in a release commit that only the `vX.Y.Z` tag points to, and publishes a GitHub
   release with SRI hashes.

CDN (`@1`, `@1.2.3`) and git submodule users therefore always get prebuilt files.
