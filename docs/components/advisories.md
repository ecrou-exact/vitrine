# `<vt-advisories>`

`<vt-advisories>` turns a vulnerability scan into a report people read: the most severe first, each with its CVSS score explained in words, the packages and versions it affects, and the version that fixes it. Put it in a security page, a CI summary or a release checklist.

```html
<vt-advisories variant="full" src="/reports/osv-scanner.json"></vt-advisories>
```

## What it reads

| Source                                        | How to get it                                                      |
| --------------------------------------------- | ------------------------------------------------------------------ |
| OSV records (a list, or `{ "vulns": [...] }`) | `https://api.osv.dev/v1/query`, the osv.dev database               |
| osv-scanner results                           | `osv-scanner scan --format json -r .` (versions installed)         |
| npm audit                                     | `npm audit --json` (npm 7 and later)                               |
| GitHub security advisories                    | `GET /advisories`, `GET /repos/{owner}/{repo}/security-advisories` |
| Dependabot alerts                             | `GET /repos/{owner}/{repo}/dependabot/alerts`                      |

The same advisory reaching several packages is shown once. OSV gives only a CVSS vector: its CVSS 3.0 or 3.1 base score is computed as the specification does (CVSS 4 vectors are shown, not scored). The severity given by the source comes first, then the one of the score: critical from 9, high from 7, moderate from 4, low below.

## What is shown

Each advisory: its severity and score, title, id and aliases (`GHSA-…`, `CVE-…`), and for each package the versions affected and "fixed in …" or "no fix yet". Opening it shows its details (as text, never as HTML), its attack vector in words ("Attack: network · complexity low · privileges none · user interaction none"), its weaknesses (CWE, linked to MITRE), its date and a link to the advisory.

When the list is empty, it says "No known vulnerability."

## Attributes

| Attribute  | Type    | Default      | Description                                                      |
| ---------- | ------- | ------------ | ---------------------------------------------------------------- |
| `severity` | string  | all          | The lowest severity shown: `critical`, `high`, `moderate`, `low` |
| `expanded` | boolean | off          | Opens the details of every advisory                              |
| `filters`  | boolean | full variant | Buttons that keep one severity, with counts                      |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header with the number of advisories, filters, search, full screen, download (CSV) and copy (a Markdown table for an issue or a pull request).

## Properties

`advisories` is the list read, the most severe first: `{ id, aliases, title, details, severity, score, vector, affected, cwes, url, published }`, each affected package `{ name, ecosystem, version, range, fixed }`.

## Events

| Event              | When                                        | Detail                         |
| ------------------ | ------------------------------------------- | ------------------------------ |
| `vt-filter-change` | A severity was chosen                       | `{ severity }`, `null` for all |
| `vt-toggle`        | The details of an advisory opened or closed | `{ id, open }`                 |

## CSS parts

`summary`, `advisory` and `severity`.
