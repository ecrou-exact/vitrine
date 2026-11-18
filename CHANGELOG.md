# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A new family, loading and feedback: ten light elements (15 to 22 KB gzip each) sharing `delay` (fast loads show nothing), `min-duration` (no flicker), `size`, `tone`, `speed`, `motion` (reduced motion turns movement into a fade), `label`, `start()` / `stop()` and the events `vt-loading-start`, `vt-loading-end`, `vt-progress`, `vt-complete` and `vt-cancel`. Their text takes the page's color, so they read on any background. Guide: `docs/loading.md`.
  - `<vt-spinner>`: seven CSS-only shapes (ring, arc, dual ring, dots, bars, pulse, orbit) with an optional text.
  - `<vt-progress>`: linear bar, determinate or not, with buffer, segments, stripes, status colors and the value as a percentage, a number or a fraction.
  - `<vt-progress-ring>`: circular gauge with the value in its center and a caption.
  - `<vt-skeleton>`: twelve placeholder shapes (text, card, list, table, form, article…) with a shimmer or a pulse, wrapping the real content shown when it stops.
  - `<vt-loading-overlay>`: covers its content (made inert and busy) with a spinner, a message, progress and a Cancel button, or the whole window.
  - `<vt-page-progress>`: the thin page bar, with `start()`, a trickle, `set()`, `inc()` and `done()`.
  - `<vt-loading-steps>`: the steps of a long task with their status, details and durations, from text or JSON, as a list, a dense list or a horizontal stepper, updated with `setStep()`.
  - `<vt-typing>`: "Ada is typing…" as a bubble, dots or a wave.
  - `<vt-loading-button>`: a button with its own wait, `track(promise)`, success and error texts, and form submission.
  - `<vt-loading-message>`: messages in turn, the time elapsed and a slow notice.
- Website: a Loading & feedback category in the examples (with live demos), on the home page, in the docs navigation and in the playground; the section counts of the examples page are correct again.

- `<vt-dockerfile>`: Dockerfiles as build stages, read as Docker reads them (continuation lines, escape directive, flags, exec form, BuildKit heredocs): base image, the stage it is built on and those it copies from, user and ports of the final image, layers, build arguments, and each instruction with what it does. Problems with their line: unknown instructions, `latest` or untagged images, running as root, secrets in `ENV` or `ARG`, `COPY --from` an unknown stage, `ADD` where `COPY` does, apt and pip caches left in layers, `curl | sh`, `chmod 777`, shell-form `CMD`, `cd` instead of `WORKDIR`, unused stages, no `HEALTHCHECK`. A colored Source tab.
- `<vt-lighthouse>`: Lighthouse reports (CLI, DevTools) and PageSpeed Insights answers. Category scores as gauges, Core Web Vitals of real users (page and origin, 75th percentile, distribution), lab metrics rated with shapes and words, opportunities with their savings, and the audits of each category with their resources and elements; passed, manual and not applicable audits folded.
- `<vt-a11y>`: accessibility results from axe-core (`axe.run()`, Playwright, CLI with several pages) or Pa11y. Violations by impact with their WCAG criteria and level, the elements (selector through frames and shadow roots, HTML as text) and axe's fixes; checks to review by hand; filters by impact and text; copy as CSV or selectors.
- Markdown fences `dockerfile`, `docker`, `containerfile`, `lighthouse`, `axe` and `a11y`.
- `<vt-semver>`: version ranges as npm, Cargo and Composer read them (`^`, `~`, `x` ranges, comparisons with partial versions, hyphen ranges, `||`, commas), each term explained in words with the bounds it comes to, and warnings: no upper bound, `*`, exact pins, `^` below 1.0.0, crossed bounds, pre-releases. Given versions (a list, a JSON array or an npm registry document), the matches, the version installed and where the latest version stands; pre-releases follow npm's rule. Fields edit the range and test a version.
- `<vt-contrast>`: color contrast against WCAG 2.2. The ratio (rounded down, never up), AA and AAA for normal and large text and 3:1 for interface components, a preview, and the nearest color of the same hue that passes AA or AAA. Reads hex, `rgb()`, `hsl()`, `hwb()` and the 148 named colors, lays transparent colors over their background; color fields for one pair, cards for several, and a grid of every text color on every background for a palette.
- `<vt-sbom>`: software bills of materials in CycloneDX JSON (1.2 to 1.6) or SPDX JSON (2.2, 2.3). A summary of components, direct and transitive, ecosystems, license kinds and vulnerabilities by severity; the dependency tree from the root (repeats and cycles marked, unlinked components apart); a table with package URLs, license, depth and the path that brings each component in; the vulnerabilities of a VEX or VDR with score, analysis, CWEs and affected components. Copy as CSV or package URLs.
- Markdown fences `semver`, `contrast`, `sbom`, `cyclonedx` and `spdx`.
- `<vt-yara>`: YARA rules explained. Each rule with its `private` and `global` flags, tags, meta, and strings: text, hex with fixed bytes, wildcards and jumps told apart, and regular expressions, each modifier (`nocase`, `wide`, `fullword`, `xor`, `base64`…) explained in words. The condition is colored and read in words: file types checked by their first bytes (MZ, ELF, ZIP, PDF, OLE, Mach-O…), file size, `2 of ($a*)` with the strings it names, counts, offsets, modules. The problems YARA or a reviewer would raise, with their line: strings undefined or never used, duplicates, modifiers not allowed, modules without `import`, short strings and atoms, unbounded jumps, leading `.*`. Rules and Source tabs, editing.
- `<vt-sigma>`: Sigma detection rules explained, from YAML (several documents, Sigma 1 `action: global` collections) or JSON. Level in words, status, author, dates, identifier, log source; ATT&CK tactics, techniques, groups and software and CVEs as links; each search of the detection as a table of fields with their modifiers in words (`contains|all`, `endswith`, `re|i`, `cidr`, `base64offset`, `windash`…) and values joined by "or" or "and"; the condition colored and as a tree, with `1 of selection_*` expanded. Problems from the specification: missing fields, a condition naming unknown searches, searches never used, unknown modifiers, levels, statuses, identifiers and dates outside the specification. Correlation rules and filters are shown too.
- `<vt-pcap>`: packet captures read in the page. pcap (micro and nanoseconds, both byte orders) and pcapng, from `src`, a dropped or chosen file, `bytes` or base64 text. Packets with time, endpoints, protocol, length and a Wireshark-like summary. Ethernet with VLANs, Linux cooked captures, loopback, raw IP, ARP, IPv4, IPv6, ICMP, ICMPv6, TCP with relative sequence numbers, UDP, DNS (names decompressed, answers), HTTP/1 and TLS handshakes (server name, ALPN, versions) decoded. A packet opens on its layers, each field highlighting its bytes in a hex dump. Conversations, host names seen (DNS, TLS server names, HTTP Host) to copy as indicators, protocol and text filters, CSV. Files are sent nowhere.
- Markdown fences `yara`, `yar`, `sigma` and `pcap`.
- `<vt-url>`: URLs taken apart and checked for phishing, one per line. The URL with each part colored and the registered domain in bold; scheme, credentials, host in Unicode and as sent (punycode decoded in JavaScript), registered domain, subdomain, public suffix, port, decoded path, parameters and fragment. Findings in words, most severe first: a domain written before `@`, disguised IP addresses (`3232235777`, `0x7f.1`), letters of other alphabets imitating Latin ones (with the domain they look like) and mixed alphabets, deceptive subdomains (`paypal.com.secure-login.xyz`), invisible characters, `javascript:` and `data:` URLs, no encryption, shorteners, shared hosting, double encoding, backslashes, executable downloads, e-mail addresses carried in the link (plain or base64), tracking parameters. URLs hidden in parameters or the fragment (plain, encoded twice, base64, Proofpoint URL Defense) are taken apart too, three levels deep. `chain` reads the lines as a redirect chain (domains crossed, HTTPS dropped). Defanged by default, never links; copy defanged or without tracking. Reads Lookyloo's redirect lists as JSON.
- `<vt-hash>`: hashes of a text or a dropped file computed in the page: MD5 (in JavaScript), SHA-1, SHA-256, SHA-384 and SHA-512 (Web Crypto), as hexadecimal, base64 or Subresource Integrity values, MD5 and SHA-1 marked weak. A field compares them with a fingerprint written as hex (with or without separators), base64, `sha384-…`, `sha256:…`, a `sha256sum` or a BSD line, and says which algorithm matches; `expected` fills it. Hashes follow the text as you type; files are read in memory and sent nowhere. `vt-hash` and `vt-verify` events.
- `<vt-waterfall>`: HAR files (developer tools, Playwright, Lookyloo captures, proxies) as a network waterfall. Each request with method, status, type, size, time and a bar split into queued, DNS, connection, TLS, request, waiting and download, against DOMContentLoaded and load. A summary of requests, domains, third parties, bytes, failures and mixed content, and the redirects before the page. Rows open on URL, server IP, timings and headers; filters by type, text and third party; a Domains tab; several pages; copy as CSV or URLs.
- Markdown fences `url`, `urls`, `hash`, `har` and `waterfall`.
- `<vt-cookies>`: cookies from `Set-Cookie` headers (other header lines skipped, `curl -v` prefixes read), a `Cookie` header, JSON exported by browsers, extensions, Playwright or Puppeteer, the responses of a HAR file (with the URL that set each cookie) or a Netscape `cookies.txt`. A table with domain and path, lifetime left and expiry date, flags in words and first or third party; each cookie checked: `__Host-` and `__Secure-` prefixes, `SameSite=None` without `Secure`, a `Domain` the host cannot set, missing `Secure` or `HttpOnly` (a warning for names that look like sessions), no `SameSite`, lifetimes over 400 days, more than 4096 bytes, deletions, `Domain` shared with subdomains, persistent third-party cookies. Values masked until revealed; copy as JSON or as a `Cookie` header.
- `<vt-redirects>`: redirect chains from a HAR file (followed from entry to entry through `redirectURL` or `Location`), `curl -sIL` or `curl -v` output, JSON with client-side redirects (meta refresh, JavaScript) or a list of URLs. Each hop with its status, URL, server IP and time; each step with its kind and what changes: another host or site, HTTPS left for HTTP or the reverse, query parameters added with tracking ones (`utm_*`, `gclid`, `fbclid`…) marked. Loops, chains over 10 redirects, chains ending in an error or not captured to the end reported. URLs are never links; copy the chain or the final URL.
- `<vt-http>`: a whole HAR file can be browsed: a list of its entries (status, method, URL, type) with previous and next buttons, and `entry` to choose one by index or URL. From a HAR entry, a Connection tab with the server IP, the HTTP version, the sizes and the TLS details recorded by Chromium and Playwright (protocol, cipher, certificate subject, alternative names, issuer, validity, an expired certificate marked); the TLS protocol is shown next to the status. CSS bodies are highlighted; binary bodies (base64) are shown as images for PNG, GIF, JPEG, WebP, AVIF, BMP and ICO, decoded as source for SVG and text types, and summed up otherwise (fonts…).
- Markdown fences `cookies`, `set-cookie`, `cookies.txt` and `redirects`.

- `<vt-email>`: raw e-mail messages (`.eml`) analyzed for phishing. Sender, recipients, subject and dates with encoded words decoded; SPF, DKIM, DMARC and ARC results; the Received path oldest first with IPs and delays; the body as text (HTML reduced to text without a DOM, so nothing renders or loads); links with deceptive ones marked; attachments with size, SHA-256 and risky or double extensions marked; every header. Findings: failed or weak authentication, spoofed display names, Reply-To or Return-Path on another domain, deceptive links, risky attachments, remote images. Tabs, defanged by default.
- `<vt-dns>`: DNS records from `dig` output (with its header), zone files (`$ORIGIN`, `$TTL`, relative names, parentheses) or DNS-over-HTTPS JSON, as a table with TTLs as durations and type filters. SPF, DMARC, DKIM, CAA, MX, SOA and SRV records explained term by term; checks for SPF `+all`, `?all`, `ptr`, more than 10 lookups and several SPF records, DMARC without policy or with `p=none`, and short or revoked DKIM keys.
- `<vt-nmap>`: Nmap results from XML (`-oX`), normal (`-oN`) and grepable (`-oG`) output. Hosts with addresses, names, OS guess, MAC vendor and latency; ports with state, service, version, TLS and script output; services risky to expose (Telnet, FTP, SMB, RDP, VNC, databases…) marked and counted; open or all ports; copy as CSV or the hosts with open ports.
- Markdown fences `eml`, `email`, `dns`, `zone`, `dig` and `nmap`.

- `<vt-ioc>`: indicators of compromise found in any text: URLs, domains, IPv4 and IPv6 addresses, e-mail addresses, MD5, SHA-1, SHA-256 and SHA-512 hashes, CVE identifiers and ATT&CK techniques, defanged ones (`hxxp`, `[.]`, `[@]`…) read too. Each once with its count and first line, private and special addresses marked, grouped by type with filters, shown and copied defanged (never linked, never resolved), and exported as a list, CSV (formulas neutralized), a STIX 2.1 bundle or a MISP event. Linear patterns and limits against hostile text.
- `<vt-cvss>`: CVSS vectors as a score, a severity in words and a bar, with each metric explained by group. CVSS 3.0 and 3.1 base, temporal and environmental scores computed as the specification does; CVSS 4.0 vectors read and explained, with the score given by `score`; errors that name the metric at fault; `editable` turns it into a calculator (`vt-change` with the new vector). `<vt-advisories>` now uses its scores.
- `<vt-headers>`: HTTP security headers from raw headers, `curl -I` or `curl -v` output, JSON or a HAR response, or a Content-Security-Policy alone. A grade from A+ to F and each finding in words: HSTS, CSP (`'unsafe-inline'`, `'unsafe-eval'`, wildcards, `object-src`, `base-uri`, with nonces and `'strict-dynamic'` understood), framing, nosniff, Referrer-Policy, Permissions-Policy, COOP, each cookie (`Secure`, `HttpOnly`, `SameSite`, `__Host-` and `__Secure-`), CORS, version leaks and obsolete headers; the policy as a table with risky sources outlined. Nothing is fetched.
- Markdown fences `cvss`, `ioc`, `iocs`, `csp` and `security-headers`.

- Examples page: a sticky, scrollable section menu beside the demos, with direct links and current-section highlighting. Smaller screens keep the compact dropdown.
- `<vt-pivot>`: pivot tables from CSV or JSON. Fields in rows and columns, a value summed, counted, averaged, the smallest, the largest or the number of different values, totals, cells shaded by value, lists to change the fields as in a spreadsheet, and each cell a button that sends its records (`vt-select`). Copy and download as CSV, with formulas neutralized.
- `<vt-heatmap>`: heat maps. Values by day as a calendar of weeks (a year by default, or `year`, `from`, `to`), or values by two categories as a matrix, in 3 to 9 shades of the theme. The squares follow the WAI-ARIA grid pattern, and each says its day and value.
- `<vt-flame>`: flame graphs of CPU profiles: folded stacks (perf, py-spy, async-profiler…), Chrome and Node `.cpuprofile` files, or a JSON tree. Zoom into a function, search what share of the time matching functions take, move with the keyboard, and a Functions tab with the self and total time of each function.

- `<vt-treemap>`: treemaps of sizes from esbuild metafiles, webpack stats, the output of `du`, CSV (paths and sizes, or a column per level), lists and JSON trees. Squarified rectangles nested on up to 4 levels, a group opened by choosing it and closed with Escape, search with the share of the matches, sizes of bundles in kB and MB, and a List tab.
- `<vt-describe>`: the profile of a dataset, as pandas `describe()`. The type of each column (number, date, yes / no, text), its missing and distinct values, a summary and a histogram or the shares of its most frequent values; opening a column shows its quartiles, standard deviation and most frequent values. Copy and download as CSV.
- `<vt-compare>`: the differences between two datasets (CSV or JSON). Rows are paired by a key column, found or set with `key`, or by position; added, removed and changed rows are marked, with the old and new value of each changed cell, the columns added or removed, and filters with counts. Copy and download the differences as CSV.

- `<vt-install>`: an install command for every package manager, as tabs. Write it once for npm, pnpm, yarn, bun, pip, uv, poetry or pdm (or set `package`), and each tab gets the command of its manager: add, development dependency, global tool, remove, `ci`, `npx` / `dlx`, `create` and `run`, with `--` placed where npm needs it. The reader's choice is shared by the elements of the page and kept in `localStorage`. Words are quoted for the shell; lines that are not understood are kept as written, in their own manager's tab only. Tabs can be added as they are (a CDN `<script>`).
- `<vt-download>`: a download page from a GitHub release, a list of releases or your own JSON. The file that suits the reader's system and architecture, guessed in the browser and never sent, is one button, with the other files of that system next to it; every file is in a table with its size and SHA-256 (GitHub `digest` or a checksums file), signatures and checksums apart, and the command that checks the download on its system. `vt-download` is cancelable, to count downloads.
- `<vt-contributors>`: contributors and sponsors from the GitHub API, an All Contributors file, Open Collective members, GitHub Sponsors (GraphQL) or your own groups. A wall of avatars, a grid or a list, sponsor tiers the most generous first with larger avatars, the types of contributions of All Contributors with filters, bots hidden, "Show more", and copy as a Markdown list. Avatars load lazily without a referrer, and links of sponsors are `rel="sponsored"`.

- `<vt-lifecycle>`: supported versions and their end of life, from the endoflife.date API (v1 and v0) or a list. A table with the status of each cycle (upcoming, supported, security fixes only, extended support, end of life), LTS and latest release, a schedule of bars like the one of Node.js with a line for today, and `version`, which says whether a version is still supported and what its latest release is.
- `<vt-advisories>`: security reports from OSV records, osv-scanner, `npm audit --json`, GitHub security advisories or Dependabot alerts. The most severe first, severity filters with counts, CVSS 3 scores computed from vectors and explained in words, versions affected and fixed, weaknesses linked to CWE, copy as a Markdown table and download as CSV.
- `<vt-licenses>`: the licenses of dependencies from a CycloneDX or SPDX SBOM, license-checker or pip-licenses. Licenses sorted into permissive, weak copyleft, strong copyleft, other and unknown, SPDX expressions evaluated (`OR`, `AND`, `WITH` exceptions), common names understood, and `allow`, a list of licenses and kinds that marks and filters the packages not allowed.

- `<vt-icon-picker>`: an icon field for forms with about 7,000 free icons: Font Awesome Free (solid, regular, brands), Lucide, Bootstrap Icons and the flags of every country (flag-icons). Each set is a file of `dist/vendor/icons/` loaded when a picker shows it. Search by name and keyword, a keyboard grid, recent icons, a preview with the license of the set, copy of the SVG (with the Font Awesome credit), the class names or `set:name`, and form association (`name`, `required`, reset). Icons are drawn from an allow-list of SVG elements and attributes. `registerIconSet()` adds a page's own sets.
- `<vt-workflow>`: workflow runs as a CI system shows them, from GitHub Actions, GitLab or your own JSON. The run with its status, event, branch, commit and duration; a graph of jobs in columns by `needs` or stage, linked by curves that move while a job runs; the steps of a job with their logs, ANSI colors, folded `##[group]` sections and marked errors; keyboard moves between jobs; and `updateJob()` and `appendLog()` to follow a run live, with times counting up.
- `<vt-access-log>`: access logs of Apache, Nginx, IIS, Caddy and Traefik, line by line. Totals (requests, visitors, errors, data, bots, median and p95 response time), requests per period by class of status, a table with IP, user, path, status, size, duration and client (browsers, systems, tools and bots read from user agents), top lists that filter, a filter field with `status:`, `ip:`, `bot:yes`…, `anonymize` for IP addresses, CSV and `write()` for live lines.

- `<vt-password>`: a password field to sign in or choose a password. A strength meter (0 to 4) that finds common passwords and words, leet substitutions, reversed words, keyboard runs (QWERTY and AZERTY), sequences, repeats, dates and the user's name or email (`user-inputs`, `user-fields`), with the time four attacks would take, the main weakness and advice; requirements checked as you type (`minlength`, `require`, `min-classes`, `min-score`); a generator without ambiguous characters; a confirmation field; a Caps Lock warning; and `breach-check`, Have I Been Pwned with k-anonymity. Form associated; the password is never in an attribute or an event.
- `<vt-secret>`: API keys, tokens and secrets, shown or typed. Hidden behind a blur of stand-in characters, so the key is not in the page until shown; copy without showing, or as a `.env` line, a shell or PowerShell variable, an `Authorization` header or JSON, with `clear-clipboard`; about thirty kinds of keys recognized (GitHub, GitLab, AWS, Stripe, OpenAI, Anthropic, Slack, npm, PyPI…) with live or test and secret or publishable; created, expires, last used, scopes and randomness; `show-once`, `auto-hide` and `rotate` with a confirmation and the cancelable `vt-rotate`; `editable` with `expect` and `pattern` as a form field.
- `<vt-version>`: a version field for Semantic Versioning, `x.y`, `x.y.z.w`, CalVer tokens (`YYYY.0M.MICRO`, `YY.0M`) and decimals with a step. Only valid characters; − and +, arrow keys on the part under the caret; `segment-max` to carry into the part before (1.9 → 2.0); the `full` variant edits each part as a spin button, with pre-release, next versions (patch, minor, major, pre-release, release, today) and the kind of release from `current`; `min`, `max`, `newer` and `strict`. Form associated.
- Events `vt-generate`, `vt-breach` and `vt-rotate`.
- `<vt-consent>`: a cookie consent banner. Reject all and Accept all side by side and alike, a settings dialog with a switch per category (necessary, preferences, analytics, marketing, or your own with their cookies), and a button to change the choice later; `position="inline"` for the privacy page. Scripts, frames, images and videos marked `data-consent` wait for their category; Google Consent Mode v2 updates (`consent-mode`); Global Privacy Control followed; the choice kept with an id, a date and a `version`, asked again after `expires` days or a new version, written to a `cookie` for the server and sent to `log-url`. Methods `show()`, `accept()`, `reject()`, `reset()`; event `vt-consent`.
- `<vt-changelog>`: release notes from Keep a Changelog or conventional-changelog Markdown, GitHub or GitLab releases, or JSON. Versions with dates and badges (latest, pre-release, yanked), compare and release links, groups in a fixed order with breaking changes first, scopes, `#123`, `@user` and commits linked with `repo`, filters by kind with counts, `since` for what is new after a version, `limit`, links to each release and copy of its notes as Markdown.
- `<vt-repo>`: a repository card from the GitHub or GitLab API or JSON: owner and name, description, topics, stars, forks, open issues and watchers, a language bar with Linguist colors, license, latest release, last activity, website, archived and fork badges, and the clone command to copy.

### Removed

- Website: the moving backdrop (drifting graph, pulses, pointer links, dot grid) is replaced by still waves along the bottom; the home page and other pages no longer animate on their own: no reveal on scroll, word-by-word titles, typed-in samples, drifting hero glow, blinking cursor or scroll cue. Content shows at once; hover feedback and the theme switch stay.
- Website: the stress lab page. The XSS payload suite (`tests/security/xss.spec.js`) keeps checking every component.

### Changed

- The Playground component selector is sorted alphabetically.
- Examples are grouped by need, with category descriptions, a grouped sidebar and mobile menu, and alphabetical ordering within each category.
- Docs component links are sorted alphabetically.
- The budget of the full bundles is 680 KB: 520 KB for the twenty-one elements before `<vt-ioc>`, 530 KB with `<vt-ioc>`, `<vt-cvss>` and `<vt-headers>`, 550 KB with `<vt-email>`, `<vt-dns>` and `<vt-nmap>`, 580 KB with `<vt-url>`, `<vt-hash>` and `<vt-waterfall>`, 620 KB with `<vt-yara>`, `<vt-sigma>` and `<vt-pcap>`, 640 KB with `<vt-semver>`, `<vt-contrast>` and `<vt-sbom>`, 660 KB with `<vt-dockerfile>`, `<vt-lighthouse>` and `<vt-a11y>`, 670 KB with `<vt-cookies>`, `<vt-redirects>` and the HAR additions of `<vt-http>`, 680 KB with the ten loading indicators; `vt-markdown` 81 KB, for the icons shared by every element.
- Third-party notices: Font Awesome Free, Lucide (icon set), Bootstrap Icons and flag-icons, in `dist/vendor/icons/` only.

### Fixed

- Integrations navigation has a visible horizontal scrollbar and keyboard access so every section link is reachable.
- Docs: the rows of `<vt-treemap>`, `<vt-describe>` and `<vt-compare>` were at the top of `README.md`, `docs/README.md`, `docs/editing.md` and `docs/security.md` instead of in their tables, and the start of `README.md` was written a second time inside the `<vt-math>` item.

## [0.14.0] - 2026-11-13

### Fixed

- `package.json` declared no side effects, so a bundler could drop `import 'vitrine/code'`, which defines the element. Every file of `dist/` is now marked as having side effects.

- `<vt-field>`: Escape closes the "?" tip wherever the focus is. In Safari a click does not focus the button, so the key never reached it.
- No more Content Security Policy report on every page in recent Chromium: the check that the HTML sanitizer works no longer parses an event handler attribute, which Chromium now reports as soon as it is parsed, even in a detached document.
- `<vt-calendar>`: a day is named from its content (the full date, then the events as shown), so its name holds everything visible in it (WCAG 2.5.3, Label in Name).
- `<vt-git>`: JSON from the GitHub API showed `[object Object]` as the author, and no date or message.
- `<vt-faq>` could not be created at all: a field shadowed the read-only `Element.prefix`.
- `<vt-http>`, `<vt-openapi>`: generated commands no longer pass on what a shell tool would act on. Invalid header names are left out, HTTPie headers starting with `=` or `@` are escaped (`x:=@/etc/passwd` and `x=@/etc/passwd` uploaded a local file of the person running the command), and a URL starting with a dash is not read as an option.
- `<vt-table>`: rows copied as TSV and headers now get the same protection against spreadsheet formulas as CSV cells. Very deep arrays no longer crash the element, and `{constructor}` in a link template is empty.
- `<vt-yaml>`: aliases that expand to too much content ("billion laughs") show an error instead of freezing the page. `vt-ready` now fires when js-yaml had to be loaded first, and `vt-error` when it cannot be loaded.
- `<vt-regex>`: overlapping alternatives under a repeat, like `(a|aa)+`, and several unbounded repeats in a row, like `a*a*a*b`, are now flagged as risky and not run until confirmed. They froze the page.
- `<vt-code>` and every view with highlighted code: a line over 10,000 characters is shown without highlighting. It could freeze the page.
- `<vt-timeline>`: a date beyond what a `Date` holds no longer breaks the element.
- `<vt-job>`, `<vt-log>`, `<vt-csv>`: a status, level or delimiter named like an `Object` member (`__proto__`, `constructor`) is treated as unknown. On `<vt-job>` it broke the element.
- `<vt-openapi>`: the search no longer moves focus to the first match after each key, and the
  page scrolls again over the reference.

### Changed

- js-yaml 5 reads YAML for `<vt-yaml>` and `<vt-openapi>`, with the same core schema and merge keys.
- Each library of `dist/vendor/` is built on its own, and its banner names only what it holds. The full bundles get a budget of 390 KB.

### Added

- `dist/vitrine-loader.js`: one script of 1.2 KB that loads only the elements a page uses, from `dist/esm/`, including those added later. `data-config` applies options before the first element is drawn, `data-lazy` waits until an element comes near the screen, and `window.VitrineLoader` has `load()`, `configure()` and `ready()`. Only Vitrine's own element names become URLs; it works under a strict CSP with Trusted Types.
- Package entries for bundlers: `vitrine/<name>` for each element (`vitrine/code`, `vitrine/sql`…), `vitrine/api`, `vitrine/all`, `vitrine/markdown-it`, `vitrine/remark` and `vitrine/vitrine.css`. A release can be installed with `npm install github:ecrou-exact/vitrine#vX.Y.Z`.
- Plugins for markdown-it and remark (`dist/integrations/`): fenced code blocks become elements (` ```sql ` a `<vt-sql>`, ` ```mermaid ` a `<vt-diagram>`, ` ```math ` a `<vt-math>`, any other language a `<vt-code>`), with the code escaped. No dependencies.
- Website: "Pick your elements" on the Integrations page gives the tags to copy and the exact download size of any set of elements.
- `<vt-sql>`: SQL queries and their results. Reads a query alone, a `psql`, `mysql`, MariaDB, `sqlite3` or DuckDB session with its tables, row counts, timings, command tags and errors (columns follow the borders, so a `|` inside a value stays in its cell), or JSON, node-postgres results included. Results sort by a click on a column, `NULL` is told apart from an empty string, each result copies as CSV, and a button lays the query out (keywords in capitals, one clause per line, subqueries indented). Nothing is ever run.
- `<vt-test-report>`: test reports from JUnit XML (pytest, Maven, Gradle, Go, PHPUnit, .NET…), TAP 12 to 14 with subtests (`node --test`), and the JSON of Jest, Vitest and Mocha. The result of the run with a bar, status buttons with counts, suites with failures open, failures with their message, stack trace and output in color, flaky tests, the slowest first, a search and "Copy failures" to paste in an issue.
- `<vt-trace>`: distributed traces as a waterfall, from OpenTelemetry (OTLP JSON, also one document per line), Jaeger, Zipkin v2 or a plain list. Spans indented under their parents with a time ruler, a color per service always next to its name, errors with an icon, orphan spans, several traces in a file, the tree view keys of WAI-ARIA, a search that opens the parents of what it finds, and the attributes, events and ids of a span. Nanosecond timestamps keep their precision.
- `<vt-notebook>`: Jupyter notebooks (nbformat 4, and the cells of nbformat 3). Markdown cells with their images, code cells highlighted with their execution counts, and outputs: streams and errors with ANSI colors, images, SVG shown as images, HTML tables such as pandas DataFrames, Markdown and JSON, all sanitized; nothing is run. Hidden cells stay hidden with a button, and the code can be hidden like a report.
- `<vt-math>`: TeX drawn as native MathML by Temml, loaded on demand (`dist/vendor/temml.js`, about 58 KB gzipped). Equations separated by blank lines, numbered or not, `inline` math in a line of text, text with `$…$`, `$$…$$`, `\(…\)` and `\[…\]`, macros, and errors shown with their reason. The MathML is built with DOM methods and checked against an allow-list; `\href` and other commands that load or link are refused.
- `<vt-diagram>`: Mermaid diagrams in the colors of the theme, drawn again when it changes, with Diagram and Source tabs and an SVG download. Mermaid is loaded on demand, one type of diagram at a time (a first flowchart downloads about 235 KB gzipped), in its strict mode. Its SVG is sanitized again, its CSS becomes a constructable stylesheet, and its HTML and style writes go through Vitrine, so diagrams work under a strict CSP and enforced Trusted Types without a single report. Mermaid's ELK layout (EPL-2.0 OR GPL-3.0) is left out.
- `VtMath.useEngine()` and `VtDiagram.useEngine()` use a Temml or a Mermaid the page already loads instead of the files of `dist/vendor/`.

- Docs: a sticky, independently scrollable table of contents beside the article, with current-section highlighting, direct heading links and browser history navigation. Every component page also has a closed-by-default live preview reused from the Examples page.
- `<vt-date-picker>`: a date field for forms. Dates are typed in the order of the reader's language or chosen in a calendar that follows the date picker pattern of WAI-ARIA. `mode="range"` chooses a period, with a preview while its end is chosen and usual periods such as "Last 7 days". Days can be blocked (dates, periods, days of the week, `min`, `max`), the first day of the week follows the language, and the value is submitted in ISO 8601.
- `<vt-menu>`: a menu of actions opened by a button, a "⋮" button or a right click on an element, or always shown. Items come from JSON or lines of text: actions, links, check boxes, radio groups, headings, separators, shortcuts, icons and submenus. It follows the menu button pattern of WAI-ARIA, stays inside the window, and `vt-select` can be canceled so a link is not followed.
- `<vt-upload>`: a file field with a drop zone, paste, thumbnails of images and the reason of each file refused (`accept`, `max-size`, `max-files`). It is submitted with its form like `<input type="file">`. With `upload-url`, each file is sent as it is added, with progress, cancel and retry, and the form submits the id the server answered.
- JSON as input for every element: a `data` property, `json` and `json-src` attributes with `json-path`, and `<script type="application/json" data-json>`. Elements whose content is not JSON turn a value into their format (code, Markdown, CSV, diff, terminal, logs, `.env`, hex, regex, XML, TOML, JWT, cron, certificates), and may set a few attributes from it; the page's own attributes always win. `Vitrine.render()` takes `data`.
- `<vt-git>`: the answers of the GitHub (REST and GraphQL), GitLab and Bitbucket APIs, with branches and tags beside the commits; `git log` in its default format, with or without `--graph` and `--parents`; commits put in `git log` order when the source lists them otherwise; links to commit pages with `commit-url`.
- `<vt-faq>`: questions and answers as an accordion, with a search, categories, links to a question and schema.org data.
- `<vt-gallery>`: images as a grid, with a modal viewer that moves with the keyboard.
- `<vt-stats>`: key figures with changes written in words and a small history read with the keyboard.
- `<vt-board>`: a task board with drag and drop by mouse, touch (by the handle) and keyboard, with each move read out; board, list and table views; tasks added in a column and edited in a dialog; filters by words, label and person; limits per column; `persist` keeps it in the browser; cancelable `vt-task-add`, `vt-task-move`, `vt-task-edit` and `vt-task-delete` to save to a server. With `readonly` it is a public roadmap, and it reads the roadmaps written for `<vt-roadmap>`, which it replaces.
- `<vt-field>`: a form-associated field (text inputs of every type, text area, check box, switch, radio buttons, check boxes, and a list with search, groups and several choices) with a required mark, a "?" tip, a hint, a counter, a prefix and suffix, and validation messages in words. Its value is submitted with the form, which waits while it is invalid.
- `<vt-search>`: a site search for a menu with Ctrl K, ⌘ K or `/`; a JSON index loaded on first use or a search API; ranking that forgives case, accents and one typo; highlighted extracts; results grouped by section with their id, and addresses from `url-template`; recent searches; a cancelable `vt-select` for single-page apps. The website search now uses it.
- `<vt-testimonials>`: testimonials as a grid, a list or a carousel that only moves when asked, with ratings and their average.
- `<vt-countdown>`: a countdown to a date in a time zone, in the words of the reader's language.
- `<vt-status>`: service status pages from JSON or an Atlassian Statuspage summary; overall state; components by group with uptime and a bar per day read with the keyboard; open incidents with their updates, scheduled maintenance and past incidents; `refresh` keeps the page up to date and keeps the last status when loading fails; `vt-status-change`.
- `<vt-calendar>`: events from iCalendar or JSON as a month grid or an agenda; `RRULE`, `EXDATE` and `RECURRENCE-ID`, with wall-clock times kept across daylight saving; `timezone`; keyboard grid; Add to calendar writes an `.ics` file in which text cannot add properties; `vt-date-change` and `vt-event-select`.
- `<vt-pricing>`: plans as cards; billing periods and currencies; prices per month and savings worked out; a table comparing the plans; `vt-pricing-change`, and a cancelable `vt-plan-select` for your own checkout.
- Website: the three new elements on the home page, in the examples, the docs and the playground.
- `<vt-table>`: data table from JSON, CSV or the `data` / `columns` properties, with typed
  sorting on several columns, per-column filters (`>10`, `1..5`, `=x`, `!x`, `empty`), global
  search, row selection (click, Shift, Ctrl, keyboard) with a bulk action bar (copy, CSV, JSON,
  custom actions), grouping with expand / collapse all, expandable rows, a column chooser,
  drag-to-resize and drag-to-reorder columns, pinned columns, footer aggregates, cell editing,
  density, pagination or virtual scrolling for large tables, a card layout on narrow screens,
  a full keyboard grid with a shortcut panel, and a `state` saved with `persist`. Cell displays per
  column (badges, statuses, tags, progress, ratings, avatars, links, currencies, relative dates,
  JSON…) with long text cut behind “See all”, a filter bar that turns `column:value` into chips
  joined with AND / OR, a selection menu (page, all matching, invert), row click selection,
  numbered pagination with jump, “Show more” and a sticky header.

- `<vt-csv>`: RFC 4180 parser with delimiter detection, typed columns, sorting, pagination,
  search that filters rows, Table / Raw views and an editor.
- `<vt-tags>`: tags as chips from JSON, and a form-associated tag field with suggestions,
  prefixes, a browse panel, creation rules, backend suggestions and JSON, CSV or line output.
- `<vt-diff>`: comparison of two texts or a unified patch, side by side or unified, with word
  changes, folded context, patch copy and download, and editors for both sides.
- Edit mode for every component, with undo and redo, full screen, 258 syntax themes, a loader
  shown while content loads, and one ES module per component.
- `<vt-terminal>`: shell sessions split into commands (configurable prompts, context such as
  `user@host:~$`, continued lines) and output; ANSI parser for 16, 256 and 24-bit colors, text
  styles, carriage returns and line erasing, OSC 8 links limited to http(s), every other sequence
  removed; colors mapped to theme tokens (`--vt-ansi-*`); copy button per command and copy of all
  commands; collapsible output; typing replay; `escapes` for transcripts written by hand.
- `<vt-tree>`: file trees from `tree` output, indented text, paths, JSON (paths, entry objects or
  nested objects); notes and added, removed, modified and highlighted markers; icons by file kind;
  WAI-ARIA tree keyboard support with type-ahead; folders built when opened; search that filters
  the tree; `href-template` links; `vt-select` and `vt-toggle` events; `data` property.
- `<vt-http>`: HTTP exchanges from raw HTTP, curl commands, JSON and HAR; bodies formatted by
  content type; status colored by class; credentials masked everywhere until revealed; Code tab
  writing the request for curl, `fetch`, Python `requests` and HTTPie with values quoted for each
  language; `exchange` property.
- `<vt-log>`: application logs in plain text, JSON lines (pino, bunyan, winston, Logstash) and
  logfmt, read line by line; timestamps in the usual formats, levels by name, alias, pino number
  or logcat letter, structured fields, and stack traces kept with their entry; ANSI colors shared
  with `<vt-terminal>`; level buttons with counts; search that filters entries; `write()` for live
  streaming with `follow` and a `max-entries` cap; `vt-filter-change` event.
- `<vt-chart>`: line, area, bar and donut charts from CSV, TSV or JSON, drawn with Apache ECharts
  6.1, loaded on demand from `dist/vendor/echarts.js`; series colors from the theme
  (`--vt-chart-1` … `--vt-chart-8`); keyboard reading of values with announcements; legend
  buttons; Chart / Table tabs; copy and download as CSV; `vt-select` event; `vendorUrl` option.
- `<vt-openapi>`: API references from OpenAPI 3.0 and 3.1 and Swagger 2.0 descriptions, in JSON or
  YAML (js-yaml loaded on demand from `dist/vendor/yaml.js`); endpoints grouped by tag,
  parameters, request bodies, responses, schema trees and generated examples; example requests
  with `<vt-http>`; sanitized Markdown descriptions; endpoint search; only local `$ref` followed.
- `<vt-env>`: dotenv, INI and Java `.properties` files read line by line (quotes, `export`,
  comments, sections, multiline values, `\uXXXX` escapes); `${VAR}` references linked to their
  row; secret values masked by key name in the table, raw view, search, copy and download until
  revealed (`mask-secrets`, `secret-keys`); Table / Raw tabs; search that filters entries.
- `<vt-hex>`: hex dumps from `src` (fetched as bytes), hex text (`xxd`, `hexdump -C`) or base64,
  and the `bytes` property; offset, hex and ASCII columns with `columns` and `group`; bytes colored
  by kind; file type from magic bytes; byte and text search; keyboard grid navigation; rows built
  as they scroll; copy as hex or base64 and download of the binary.
- `<vt-timeline>`: events from JSON or a Keep a Changelog file, grouped by day, month or year,
  with durations between events, kinds colored with theme tokens, kind buttons with counts,
  search that filters events, order toggle, folding descriptions in sanitized Markdown, `events`
  property, `vt-select` and `vt-filter-change` events.
- `<vt-job>`: jobs and CI runs from JSON (GitHub fields read too) or a text format; job progress
  bar, determinate or sliding, still under reduced motion; steps with status, duration, a small
  bar while running and their log with ANSI colors; failed steps open; search across logs;
  `update()`, `setStep()` and `appendLog()`; `vt-job-change` and `vt-step-toggle` events.
- `<vt-git>`: commit graphs from `git log --graph`, a pretty format with parents, `--oneline` or
  JSON; lanes computed from parents; branch, remote and tag labels; branch buttons; commit details
  with parents to jump to; search; listbox keyboard navigation; rows built as they scroll.
- `<vt-regex>`: patterns colored by part with matching parentheses, explained in words; matches and
  groups highlighted in the text; match table; `replace`; flag buttons; live editing; limits on
  text length, matches and time, and risky patterns run only on request; `vt-match` event.
- Component modules register their own interface strings with `defineStrings()`, so a module does
  not carry the strings of the others.
- `<vt-yaml>`: YAML shown with the `<vt-json>` tree, several documents (`---`), anchors, aliases
  and merge keys, highlighted raw view, errors with line and column, copy as JSON; js-yaml shared
  with `<vt-openapi>` and loaded on demand.
- `<vt-xml>`: XML read by its own parser, never into the page: elements, attributes, text,
  CDATA, comments, processing instructions, DOCTYPE and namespaces as a tree; declared entities
  never expanded and nothing fetched; XPath and node copy; indented raw view; inline XML in
  `<script type="application/xml">`.
- `<vt-toml>`: TOML 1.0 parser (tables, arrays of tables, inline tables, dotted keys, every
  string, number and date kind) with errors at line and column; typed tree; copy as JSON with
  exact integers.
- `<vt-jwt>`: JWS and JWE compact tokens decoded (strict base64url and UTF-8); parts colored;
  header and payload as trees; claims table with meanings and dates; validity from `exp` and
  `nbf` with `now`; warnings for `alg: none`, shared secrets, URL headers, missing expiry and long
  lifetimes; `mask-signature`. Signatures are never verified and tokens never sent.
- `<vt-cron>`: 5 or 6 fields, macros, names, ranges, steps and Quartz `? L W #`; description in
  words; next runs in a time zone with daylight saving handled; week grid; crontabs with
  comments, variables, `CRON_TZ` and the `system` user column; errors at their field and column.
- `<vt-cert>`: bounded DER reader; certificates, chains and CSRs from PEM, base64 or hex; names,
  validity status, keys, signature algorithms with weak ones flagged, extensions, SHA-256 and
  SHA-1 fingerprints; issuer links; ASN.1 view; private keys never shown.
- Website: the examples page lists its sections in a drop-down list, and the playground has
  every element.
- Website: search with Ctrl+K (Cmd+K on macOS), back to top button, typing animation on the home page, Legal page,
  redesigned typography and demo windows.
- `<vt-diff>`: previous / next change arrows with a counter, `n` / `p` keys, `nextChange()`,
  `previousChange()`, `goToChange()` and `vt-change-navigate`; the two editors of edit mode
  scroll to matching lines.
- Long code views (raw JSON, CSV, Markdown source, terminal output) build their lines in blocks
  as they scroll into view.
- `<vt-code>`: syntax highlighting (12 bundled languages, 181 more loaded on demand from a
  validated list), language detection, line numbers, start line, highlighted lines, diff mode,
  wrap toggle, collapsible code, tab size, search, copy and download.
- `<vt-markdown>`: GitHub Flavored Markdown sanitized with DOMPurify, raw HTML shown as text
  unless `allow-html` is set, Preview / Source / Split tabs, table of contents, heading anchors,
  image policy (`allow`, `block`, `same-origin`), external link policy, relative URLs resolved
  against `src`, highlighted and copyable code blocks.
- `<vt-json>`: iterative parser keeping exact numbers and duplicate keys, with a depth limit and
  precise error positions; raw view (indent, sorted keys) and collapsible tree (WAI-ARIA tree
  pattern, pagination of large containers, bounded "expand all", JSONPath bar, copy path and
  value, search inside collapsed nodes); `data` property.
- Shared features: simple and full variants with per-feature attributes, content from the
  `content` property, `src`, `<template>`, data `<script>` or text; `src` same-origin by default,
  streamed with a size limit, timeout and cancellation; loading, empty and error states; search
  bar; floating toolbar without header; `vt-*` events.
- Themes: `light`, `dark`, `dim`, `paper`, `high-contrast` and `auto`, all tested for WCAG AA
  contrast; `--vt-*` custom properties on any ancestor; `::part()`; `Vitrine.registerTheme()`
  with value validation; `design-tokens.json`.
- API: `defineAll()`, `render()`, `configure()`, `registerLocale()` (English and French shipped),
  `registerTheme()`, `getTheme()`, `listThemes()`.
- Security: strict CSP and Trusted Types support (`vitrine` policy), sanitizer self-test with a
  plain text fallback, safe download file names, validated attributes.
- Website with documentation, examples, playground, theme builder and stress lab, deployed to
  GitHub Pages; brand assets; design system and logo specification.
- Tests: unit tests, end-to-end tests in Chromium, Firefox and WebKit under a strict CSP, XSS
  payload suite, axe-core accessibility audits, website checks.
- Tooling: bundle size budget, Custom Elements Manifest, generated third-party notices, release
  workflow publishing `dist/` on release tags with SRI hashes.
