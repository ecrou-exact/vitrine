# `<vt-download>`

`<vt-download>` is the download block of an application's website: one button with the file that suits the reader's system, the other files of that system next to it, every file of the release in a table with its size and SHA-256, and the command that checks a download.

```html
<vt-download
  variant="full"
  json-src="https://api.github.com/repos/owner/app/releases/latest"
  allow-remote
></vt-download>
```

## What it reads

- A release of the GitHub API (`/repos/{owner}/{repo}/releases/latest` or `/releases/tags/{tag}`): its files (`assets`) with their `digest`, its tag, date, notes link and the archives of the source code.
- The list of releases (`/releases`): the newest one that is neither a draft nor a pre-release, unless `prerelease` is set or `version` names one.
- Your own JSON: `{ "version": "1.2.0", "date": "2026-11-01", "notes": "/changelog", "files": [{ "name": "App.dmg", "url": "…", "size": 90000000, "sha256": "…" }] }`, or a list of files. `os` and `arch` may be given for a file whose name does not tell them, and `checksums` may hold the text of a `SHA256SUMS` file.

The GitHub API allows 60 requests an hour per visitor without a token. For a busy page, save the release JSON when you publish (in CI) and serve it with your site.

## How files are sorted out

The system, the architecture and the format are read from each file name, as tools such as eget do: `x86_64-apple-darwin.tar.gz` is macOS x64, `app_1.2_amd64.deb` Linux x64, `App-Setup.exe` Windows, `aarch64`, `arm64`, `armv7`, `i686` and `universal` are understood. Signatures and checksums (`.sig`, `.asc`, `.minisig`, `SHA256SUMS`, `checksums.txt`, SBOMs…) are listed apart, never offered as the download.

For each system, the formats come in this order, unless `prefer` names others first:

| System  | Formats, best first                                   |
| ------- | ----------------------------------------------------- |
| Windows | `.exe` (setup first), `.msi`, `.msix`, `.zip`         |
| macOS   | `.dmg`, `.pkg`, `.zip`, `.tar.gz`                     |
| Linux   | `.AppImage`, `.deb`, `.rpm`, `.tar.gz`, Flatpak, Snap |
| Android | `.apk`                                                |

Debug symbols, portable and nightly builds come last.

## The reader's system

The system and its architecture are read from the browser (`navigator.userAgentData`, then the user agent, and the architecture from client hints in Chromium) and never sent anywhere. The guess can be wrong: every file stays listed, and the table opens by itself when no file suits. A Mac does not tell whether it has an Apple Silicon or an Intel processor, so a universal build comes first, then Apple Silicon; a file without an architecture in its name counts as an x64 one, as it nearly always is.

Set `platform` to show the files of a given system instead, for example on a page per system, or `platform="none"` for the table alone.

## Checking a download

When the SHA-256 of the file is known (GitHub `digest`, `sha256`, or `checksums`), it is shown with the command that prints it on the system of the file: `Get-FileHash -Algorithm SHA256 .\App-Setup.exe` in PowerShell, `shasum -a 256 App.dmg` on macOS, `sha256sum app.AppImage` elsewhere. File names are quoted for that shell.

## Attributes

| Attribute    | Type    | Default      | Description                                                                                                 |
| ------------ | ------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| `platform`   | string  | the reader's | `windows`, `macos`, `linux`, `android`… with an architecture: `macos-arm64`, `linux-x64`; `none`: no button |
| `prefer`     | string  | —            | Formats chosen first, separated by commas: `deb,rpm`                                                        |
| `prerelease` | boolean | off          | From a list of releases, the newest even if it is a pre-release                                             |
| `version`    | string  | the newest   | From a list of releases, the one with this tag                                                              |
| `all`        | boolean | on           | The table of every file                                                                                     |
| `verify`     | boolean | on           | The SHA-256 and the command that checks the file                                                            |

Shared attributes are in [Common attributes](../common-attributes.md). The full variant adds the header, with the version as its badge, and full screen.

## Properties

`release` is the release read: `{ version, name, date, url, prerelease, assets }`, each asset `{ name, url, size, os, arch, format, sha256, verify }`. `platform` is the system files are chosen for: `{ os, arch }`.

## Events

| Event         | When                                                     | Detail                                 |
| ------------- | -------------------------------------------------------- | -------------------------------------- |
| `vt-download` | A file link was followed (cancelable: then not followed) | `{ name, url, os, arch, recommended }` |
| `vt-copy`     | A hash or the command was copied                         | `{ text }`                             |

`vt-download` is the place to count downloads, or to open a "Thanks for downloading" page.

## CSS parts

`main`, `button`, `verify` and `table`.
