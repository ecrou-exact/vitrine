# Changelog

## [Unreleased]

### Added

- A `theme` option for the dashboard (#212)

## [2.0.0] - 2026-11-10

The release that drops the old configuration format.

### Breaking changes

- **config:** `rocket.json` replaces `.rocketrc` ([migration guide](https://example.com/migrate))
- Node 18 is no longer supported

### Added

- Launch several targets at once with `rocket run --all` by @ada (#198)
- Dark mode for the dashboard

### Fixed

- The watcher no longer misses renamed files (3f9c2ab)

### Security

- Paths given to `--out` are checked against the project folder

## [1.4.1] - 2026-10-21

### Fixed

- Crash on an empty `targets` list (#187)

## [1.4.0] - 2026-10-02

### Added

- `rocket doctor` checks the setup

### Deprecated

- `.rocketrc`: use `rocket.json`

## [1.3.0] - 2026-09-01 [YANKED]

### Changed

- Faster cold starts

[unreleased]: https://github.com/acme/rocket/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/acme/rocket/compare/v1.4.1...v2.0.0
[1.4.1]: https://github.com/acme/rocket/compare/v1.4.0...v1.4.1
