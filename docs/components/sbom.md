# `<vt-sbom>`

`<vt-sbom>` shows a software bill of materials. A summary comes first. Then three tabs show:

- the dependency tree from the root;
- the components, with their package URL, license, depth and the path that brings them in;
- the vulnerabilities listed in the SBOM, with the components they affect.

```html
<vt-sbom variant="full" src="bom.cdx.json"></vt-sbom>
```

Nothing is fetched besides `src`, and nothing is looked up: the vulnerabilities shown are those written in the SBOM.

## Variants

| Feature      | `simple` (default) | `full` |
| ------------ | ------------------ | ------ |
| `header`     | off                | on     |
| `dot`        | off                | on     |
| `copy`       | off                | on     |
| `fullscreen` | off                | on     |
| `tabs`       | on                 | on     |

## Input

**CycloneDX JSON (1.2 to 1.6)**, as written by syft, cdxgen, Trivy, `npm sbom`, the CycloneDX plugins and Dependency-Track. The element reads:

- `metadata.component`, which is the root;
- `metadata.tools`;
- `components`, including nested components, with their `group`, `version`, `purl`, `licenses`, `scope`, `supplier` and `hashes`;
- `dependencies`, which is the graph;
- `vulnerabilities`, as in a VEX or a VDR: `ratings`, `cwes`, `analysis.state`, `recommendation` and `affects`.

**SPDX JSON (2.2, 2.3)**. The element reads:

- `packages`, with their `versionInfo`, `licenseConcluded` (or `licenseDeclared`), `supplier`, `checksums` and the `purl` among their `externalRefs`;
- `relationships`: `DESCRIBES` gives the root; `DEPENDS_ON`, `CONTAINS` and the `*_DEPENDENCY_OF` kinds give the graph. Dev, build and optional dependencies are marked as such.

`NOASSERTION` and `NONE` read as empty. Up to 10,000 components and 2,000 vulnerabilities are read. Large SBOMs may need `Vitrine.configure({ maxSize })` (see [configuration](../configuration.md)).

## Summary

The summary shows:

- the name of the root;
- the number of components, direct and transitive;
- the ecosystems, taken from the package URLs (`npm`, `pypi`, `maven`…);
- the creation date and the tools that made the SBOM;
- the license kinds;
- the vulnerabilities by severity, and the number of components they affect.

License expressions are read as in [`<vt-licenses>`](licenses.md):

- `OR` keeps the most permissive choice and `AND` the least;
- each license is permissive, weak copyleft, strong copyleft, other, or none.

## Views

- **Dependencies**: the tree from the root, each component with its version, its license and the identifiers of its vulnerabilities. `depth` sets how many levels start open. Expand all and Collapse all change it.

  A component reached a second time is marked "listed above" instead of being repeated, and cycles are marked. Components that the graph does not link to the root are listed apart. When the SBOM has no graph, components hang from the root and a note says so. Up to 3,000 nodes are drawn.

- **Components**: a table with the name and package URL, version, license, depth, vulnerabilities, and the shortest path from the root ("Brought in by"). Rows with the most severe vulnerabilities come first. With `filters` (on by default), a field keeps the components whose name, version, license, package URL or vulnerability contains a text.
- **Vulnerabilities**: most severe first. Each one shows:
  - its severity and score, from the newest CVSS rating;
  - its identifier, as a link: the source URL, or NVD for a CVE, or GitHub for a GHSA;
  - its rating method, VEX analysis and CWEs;
  - its description and the components it affects, with the path that brings them in;
  - the recommendation and the vector.

  Those analyzed as not affected, resolved or false positives have a dashed border.

## Attributes

| Attribute | Values                                  | Default | Description                                |
| --------- | --------------------------------------- | ------- | ------------------------------------------ |
| `view`    | `tree`, `components`, `vulnerabilities` | `tree`  | Tab shown first.                           |
| `depth`   | number                                  | 1       | Tree levels open at first (0: all closed). |
| `filters` | boolean                                 | on      | The text filter of the components.         |
| `tabs`    | boolean                                 | on      | The three tabs.                            |

The shared attributes (`variant`, `theme`, `src`, `label`, `copy`, `mode`…) are described in [common attributes](../common-attributes.md).

## Copy

| Button                | Output                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV                   | `name,version,type,purl,license,depth,scope,vulnerabilities`, the components shown. Cells a spreadsheet would run as a formula are prefixed. |
| Copy the package URLs | The package URLs of the components shown, one per line.                                                                                      |

## Properties

| Property  | Type             | Description                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content` | `string`         | The SBOM (JSON).                                                                                                                                                                                                                                                                                                                                                                                                          |
| `sbom`    | `object \| null` | Read-only. It has the form `{ format, spec, name, created, tools, roots, components, edges, vulns, capped, graph }`. `components` is a `Map` from ref to `{ ref, name, version, type, purl, ecosystem, license, category, scope, supplier, hashes, depth, path, vulns }`. Each vulnerability is `{ id, source, url, severity, score, method, vector, description, recommendation, state, justification, cwes, affects }`. |

## Events

| Event              | Detail               | When                                 |
| ------------------ | -------------------- | ------------------------------------ |
| `vt-ready`         | `{ type: "sbom" }`   | The SBOM is rendered.                |
| `vt-tab-change`    | `{ tab }`            | The tab changed.                     |
| `vt-filter-change` | `{ query, shown }`   | The filter changed.                  |
| `vt-copy`          | `{ text }`           | CSV or package URLs copied.          |
| `vt-error`         | `{ message, cause }` | Loading failed or content too large. |

## CSS parts

| Part              | Element                      |
| ----------------- | ---------------------------- |
| `summary`         | The summary.                 |
| `tree`            | The dependency tree.         |
| `components`      | The table of components.     |
| `vulnerabilities` | The list of vulnerabilities. |
| `severity`        | A severity badge.            |

## Accessibility

The tree uses native disclosures, and the components are a table with column headers. License kinds and severities are written in words, and colors only repeat them. Vulnerability links open in a new tab.

## Security

Every value is inserted as text. Links are made only for vulnerability sources that are safe `http(s)` URLs, and for identifiers matching the CVE and GHSA patterns. Links carry `rel="noopener noreferrer"`. The graph walk visits each component once, so cycles cannot loop. CSV cells that could run as formulas are prefixed.
