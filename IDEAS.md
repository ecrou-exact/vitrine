# Ideas for new components

Backlog of components to build. None of them exists yet (checked against the 75 elements in `src/components/` on 2026-11-17). When one is built, remove it from this list.

## Cybersecurity

- **`vt-yara`** / **`vt-sigma`**: colored, explained rules (strings, conditions, logsource, fields, level).
- **`vt-attack`**: MITRE ATT&CK matrix with covered / detected techniques highlighted.
- **`vt-pcap`**: packet list from a capture, layers you can expand, hex of each packet (reuses `vt-hex`).
- **`vt-sbom`**: CycloneDX / SPDX SBOM as a dependency tree with linked vulnerabilities and licenses.

## Web development

- **`vt-graphql`**: navigable GraphQL schema and highlighted queries (the counterpart of `vt-openapi`).
- **`vt-lighthouse`**: Lighthouse JSON report: scores, Core Web Vitals, opportunities.
- **`vt-a11y`**: axe-core report: violations by impact, target element, suggested fix.
- **`vt-contrast`**: color contrast checker with WCAG AA / AAA and a preview.
- **`vt-tokens`**: design tokens as swatches and scales (could document Vitrine's own `design-tokens.json`).
- **`vt-semver`**: a semver range explained, with the versions it matches.
- **`vt-dockerfile`** / **`vt-compose`**: layers, stages, services with ports and volumes, warnings (`latest`, root).
- **`vt-k8s`**: Kubernetes manifests as linked resources.

## Done

- `vt-ioc`, `vt-cvss`, `vt-headers` (its CSP table covers the planned `vt-csp`).
- `vt-email`, `vt-dns`, `vt-nmap`.
- `vt-url`, `vt-hash`, `vt-waterfall` (with Lookyloo captures in mind: HAR, redirects, SHA-512 body hashes).
