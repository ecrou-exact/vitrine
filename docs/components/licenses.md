# `<vt-licenses>`

`<vt-licenses>` shows the licenses of a project's dependencies: how many packages each license covers, which ones are permissive or copyleft, and the packages whose license is not in the list you allow. It is the license page of a project, or a check in a release review.

```html
<vt-licenses variant="full" allow="permissive,MPL-2.0" src="/sbom.cdx.json"></vt-licenses>
```

## What it reads

| Source                  | How to get it                                                          |
| ----------------------- | ---------------------------------------------------------------------- |
| A CycloneDX SBOM (JSON) | `npx @cyclonedx/cyclonedx-npm`, `cyclonedx-py`, Syft, Trivy…           |
| An SPDX SBOM (JSON)     | GitHub's dependency graph export, Syft, `spdx-sbom-generator`…         |
| license-checker         | `npx license-checker --json` (`MIT*` marks a license read from a file) |
| pip-licenses            | `pip-licenses --format=json`                                           |
| A list                  | `[{ "name": "react", "version": "19.0.0", "license": "MIT" }]`         |

## Kinds of license

| Kind            | Licenses                                                               |
| --------------- | ---------------------------------------------------------------------- |
| Permissive      | MIT, ISC, BSD, Apache-2.0, 0BSD, Unlicense, CC0, Zlib, PSF…            |
| Weak copyleft   | LGPL, MPL-2.0, EPL, CDDL, CC-BY-SA, Artistic, OFL…                     |
| Strong copyleft | GPL, AGPL, SSPL, OSL, EUPL…                                            |
| Other           | Any other license named                                                |
| Unknown         | No license, `UNKNOWN`, `NOASSERTION`, `UNLICENSED`, "SEE LICENSE IN …" |

Common names that are not SPDX ids ("Apache License 2.0", "GPLv3", "Mozilla Public License 2.0 (MPL 2.0)") are understood. In an SPDX expression, `OR` (a dual license) counts as its most permissive choice and `AND` as the least; a GPL `WITH` the Classpath or GCC exception is a weak copyleft. In a CycloneDX SBOM, several license entries all apply.

This is a summary to review, not legal advice.

## Allowed licenses

`allow` lists the licenses you accept, as SPDX ids or kinds: `allow="permissive,MPL-2.0,LGPL-3.0"`. A dual license is allowed when one choice is; `AND` needs every part. `GPL-3.0` also allows `GPL-3.0-only` and `GPL-3.0-or-later`. Packages not allowed are marked, counted in the header, opened in the Licenses view, and kept by the "Not allowed" filter.

## Attributes

| Attribute | Type    | Default      | Description                                             |
| --------- | ------- | ------------ | ------------------------------------------------------- |
| `allow`   | string  | —            | Allowed licenses and kinds, separated by commas         |
| `view`    | string  | `licenses`   | `licenses` (grouped) or `packages` (a table) at first   |
| `filters` | boolean | full variant | Buttons that keep one kind, or the packages not allowed |
| `tabs`    | boolean | full variant | Licenses / Packages tabs                                |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header, filters, tabs, search, full screen, copy and download (CSV with the kind and whether it is allowed).

## Properties

`dependencies` is the list read: `{ name, version, license, category, ids, url, guessed }`. `violations` holds those not allowed.

## Events

| Event              | When              | Detail                                                |
| ------------------ | ----------------- | ----------------------------------------------------- |
| `vt-filter-change` | A kind was chosen | `{ category }`: a kind, `"denied"`, or `null` for all |
| `vt-tab-change`    | The view changed  | `{ tab }`                                             |

## CSS parts

`bar`, `filters` and `table`.
