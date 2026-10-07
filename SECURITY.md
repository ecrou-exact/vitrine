# Security policy

Vitrine is designed to display untrusted content safely. Security reports are taken seriously.

## Supported versions

| Version                      | Supported |
| ---------------------------- | --------- |
| latest `0.x` / `1.x` release | Yes       |
| older releases               | No        |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private vulnerability reporting:
[Report a vulnerability](https://github.com/ecrou-exact/vitrine/security/advisories/new).

Please include:

- the affected version and component (`vt-code`, `vt-markdown`, `vt-json`, …);
- a minimal reproduction (payload, attributes, browser);
- the impact you observed (e.g. script execution, CSP bypass, data exfiltration).

## Disclosure process

1. You receive an acknowledgement within 5 business days.
2. The issue is confirmed and a fix is prepared in a private fork.
3. A patched release is published, with a GitHub Security Advisory and credit to the reporter
   (unless you prefer to stay anonymous).
4. Details are made public once a fix is available, ideally within 90 days of the report.

## Scope

In scope: XSS or script execution through any component input, sanitizer bypasses, CSP or Trusted
Types violations, unsafe URL handling, and `src` fetching restrictions bypasses.
