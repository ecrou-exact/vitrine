# Ideas for new components

Backlog of components to build. None of them exists yet (checked against the 84 elements in `src/components/` on 2026-11-17). When one is built, remove it from this list.

## Cybersecurity

- **`vt-attack`**: MITRE ATT&CK matrix with covered / detected techniques highlighted.

## Web development

- **`vt-graphql`**: navigable GraphQL schema and highlighted queries (the counterpart of `vt-openapi`).
- **`vt-tokens`**: design tokens as swatches and scales (could document Vitrine's own `design-tokens.json`).
- **`vt-compose`**: Docker Compose services with ports, volumes, networks and dependencies, warnings (`latest`, privileged, host network).
- **`vt-k8s`**: Kubernetes manifests as linked resources.

## Done

- `vt-ioc`, `vt-cvss`, `vt-headers` (its CSP table covers the planned `vt-csp`).
- `vt-email`, `vt-dns`, `vt-nmap`.
- `vt-url`, `vt-hash`, `vt-waterfall` (with Lookyloo captures in mind: HAR, redirects, SHA-512 body hashes).
- `vt-dockerfile`, `vt-lighthouse`, `vt-a11y` (`vt-compose` left for later).
- `vt-semver`, `vt-contrast`, `vt-sbom`.
- `vt-yara`, `vt-sigma`, `vt-pcap` (detection rules and captures for CIRCL tooling; the pcap hex dump is built in rather than a nested `vt-hex`).
