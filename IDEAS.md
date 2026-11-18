# Ideas for new components

Backlog of components to build. None of them exists yet (checked against the 84 elements in `src/components/` on 2026-11-17). When one is built, remove it from this list.

## Cybersecurity

- **`vt-attack`**: MITRE ATT&CK matrix with covered / detected techniques highlighted.

## Web development

- **`vt-graphql`**: navigable GraphQL schema and highlighted queries (the counterpart of `vt-openapi`).
- **`vt-tokens`**: design tokens as swatches and scales (could document Vitrine's own `design-tokens.json`).
- **`vt-compose`**: Docker Compose services with ports, volumes, networks and dependencies, warnings (`latest`, privileged, host network).
- **`vt-k8s`**: Kubernetes manifests as linked resources.

## Web capture analysis (for Lookyloo)

Needed to show Lookyloo captures. Already built: `<vt-http>` (HAR entries list, server IP, TLS details, sizes, image / CSS / binary bodies), `<vt-cookies>`, `<vt-redirects>`, `<vt-waterfall>`, `<vt-url>`, `<vt-hash>`.

- **`vt-domains`**: domains and IPs contacted, grouped first party / third party, with a count of resources each.
- **`vt-screenshot`**: a capture screenshot, with zoom and a before / after comparison.
- **`vt-http` → `vt-cert`**: open the full certificate from the Connection tab when the PEM is available.

## Loading & feedback (next)

The family started with ten loading indicators (`docs/loading.md`). Next in it:

- **`vt-toast`**: notifications that stack, with a type (info, success, warning, error), an action, a timeout paused on hover and focus, and announcements.
- **`vt-banner`** / **`vt-alert`**: inline messages, dismissible.
- **`vt-empty-state`**: what to show when there is nothing yet, with an action.

## Done

- `vt-ioc`, `vt-cvss`, `vt-headers` (its CSP table covers the planned `vt-csp`).
- `vt-email`, `vt-dns`, `vt-nmap`.
- `vt-url`, `vt-hash`, `vt-waterfall` (with Lookyloo captures in mind: HAR, redirects, SHA-512 body hashes).
- `vt-dockerfile`, `vt-lighthouse`, `vt-a11y` (`vt-compose` left for later).
- `vt-semver`, `vt-contrast`, `vt-sbom`.
- `vt-yara`, `vt-sigma`, `vt-pcap` (detection rules and captures for CIRCL tooling; the pcap hex dump is built in rather than a nested `vt-hex`).
- `vt-cookies`, `vt-redirects`, HAR entries in `vt-http`.
- Loading & feedback: `vt-spinner`, `vt-progress`, `vt-progress-ring`, `vt-skeleton`, `vt-loading-overlay`, `vt-page-progress`, `vt-loading-steps`, `vt-typing`, `vt-loading-button`, `vt-loading-message`.
