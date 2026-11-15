// @ts-check
/**
 * Releases and their files: read from the GitHub API (a release or a list of releases) or a
 * plain list, each file sorted out by system, architecture and format from its name, and the
 * file that suits a platform chosen.
 *
 * @module components/download/releases
 */
import { firstText, isObject, safeLink, text, toNumber, toTime } from '../../core/data.js';

/** @typedef {'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'bsd' | 'source' | 'other'} Os */
/** @typedef {'x64' | 'arm64' | 'x86' | 'arm' | 'universal' | 'riscv64'} Arch */

/**
 * @typedef {object} Asset
 * @property {string} name
 * @property {string} url
 * @property {number | null} size - In bytes.
 * @property {Os} os
 * @property {Arch | null} arch
 * @property {string} format - `dmg`, `exe`, `tar.gz`…
 * @property {string | null} sha256 - Lowercase hexadecimal.
 * @property {boolean} verify - A signature or a checksums file.
 */

/**
 * @typedef {object} Release
 * @property {string} version
 * @property {string} name
 * @property {number | null} date
 * @property {string | null} url - The release notes.
 * @property {boolean} prerelease
 * @property {Asset[]} assets
 */

/** @typedef {{ os: Os | null, arch: Arch | null }} Platform */

export class ReleaseError extends Error {}

export const SYSTEMS = /** @type {const} */ (['windows', 'macos', 'linux', 'android', 'ios', 'bsd', 'source', 'other']); // prettier-ignore
export const ARCHES = /** @type {const} */ (['x64', 'arm64', 'x86', 'arm', 'universal', 'riscv64']); // prettier-ignore

/** Files of one release. */
const MAX_ASSETS = 500;

/** Formats with two dots, longest first. */
const LONG_FORMATS = ['pkg.tar.zst', 'tar.gz', 'tar.xz', 'tar.bz2', 'tar.zst', 'flatpakref'];

/** Formats each system prefers, best first. */
const PREFERRED = /** @type {Record<Os, string[]>} */ ({
  windows: ['exe', 'msi', 'msix', 'appx', 'zip', '7z'],
  macos: ['dmg', 'pkg', 'zip', 'tar.gz', 'tar.xz'],
  linux: ['appimage', 'deb', 'rpm', 'tar.gz', 'tar.xz', 'flatpak', 'flatpakref', 'snap', 'pkg.tar.zst', 'zip'], // prettier-ignore
  android: ['apk', 'aab'],
  ios: ['ipa'],
  bsd: ['pkg', 'tar.gz', 'tar.xz'],
  source: ['tar.gz', 'zip'],
  other: [],
});

/** A word that is a whole word of a file name: `win` in `app-win-x64.zip`, not in `darwin`. */
const word = (/** @type {string} */ w) => new RegExp(`(?:^|[^a-z0-9])(?:${w})(?=[^a-z0-9]|$)`);

const VERIFY = /\.(?:sig|asc|gpg|minisig|sha1|sha256|sha512|sha256sum|md5|pem|crt|cert|sbom|spdx|spdx\.json|cdx\.json|intoto\.jsonl|sigstore|sigstore\.json|bundle)$|(?:^|[^a-z0-9])(?:checksums?|sha256sums?|sha512sums?|hashes)(?:[^a-z0-9]|$)/; // prettier-ignore

/**
 * @param {string} name
 * @returns {string} The format, from the end of the name.
 */
export function formatOf(name) {
  const lower = name.toLowerCase();
  const long = LONG_FORMATS.find((f) => lower.endsWith(`.${f}`));
  if (long) return long;
  if (lower.endsWith('.tgz')) return 'tar.gz';
  const dot = lower.lastIndexOf('.');
  return dot > 0 && lower.length - dot <= 11 ? lower.slice(dot + 1) : '';
}

/**
 * @param {string} name
 * @returns {Os}
 */
export function osOf(name) {
  const n = name.toLowerCase();
  const format = formatOf(n);
  if (word('android').test(n) || ['apk', 'aab'].includes(format)) return 'android';
  if (word('ios|iphoneos').test(n) || format === 'ipa') return 'ios';
  if (word('win|windows|win32|win64|mingw|msvc').test(n) || ['exe', 'msi', 'msix', 'appx'].includes(format)) return 'windows'; // prettier-ignore
  if (word('mac|macos|macosx|osx|darwin|apple').test(n) || ['dmg', 'pkg'].includes(format)) return 'macos'; // prettier-ignore
  if (word('freebsd|openbsd|netbsd').test(n)) return 'bsd';
  if (word('linux|musl|gnu|ubuntu|debian|fedora').test(n) || ['appimage', 'deb', 'rpm', 'flatpak', 'flatpakref', 'snap', 'pkg.tar.zst'].includes(format)) return 'linux'; // prettier-ignore
  if (word('src|source|sources').test(n)) return 'source';
  return 'other';
}

/**
 * @param {string} name
 * @returns {Arch | null}
 */
export function archOf(name) {
  const n = name.toLowerCase();
  if (word('universal|universal2|fat').test(n)) return 'universal';
  if (/aarch64|arm64|armv8(?!l)/.test(n)) return 'arm64';
  if (/riscv64/.test(n)) return 'riscv64';
  if (/x86[-_]?64|amd64|x64|win64/.test(n) || word('64bit|64-bit').test(n)) return 'x64';
  if (/armv[67]|armhf|armel|armv8l/.test(n) || word('arm').test(n)) return 'arm';
  if (/i[3-6]86|ia32|win32/.test(n) || word('x86|32bit|32-bit').test(n)) return 'x86';
  return null;
}

/**
 * Hashes from a checksums file: `<hash>  <name>` (sha256sum) or `SHA256 (<name>) = <hash>` (BSD).
 *
 * @param {string} source
 * @returns {Map<string, string>}
 */
export function readChecksums(source) {
  /** @type {Map<string, string>} */
  const hashes = new Map();
  for (const line of source.split(/\r?\n/).slice(0, 5000)) {
    const gnu = /^([a-f0-9]{64})\s+\*?(.+)$/i.exec(line.trim());
    const bsd = /^SHA256\s*\((.+)\)\s*=\s*([a-f0-9]{64})$/i.exec(line.trim());
    if (gnu) hashes.set(gnu[2].trim(), gnu[1].toLowerCase());
    else if (bsd) hashes.set(bsd[1].trim(), bsd[2].toLowerCase());
  }
  return hashes;
}

/**
 * @param {unknown} value - `sha256:…` (GitHub `digest`) or a bare hash.
 * @returns {string | null}
 */
function sha256Of(value) {
  const match = /^(?:sha256:)?([a-f0-9]{64})$/i.exec(text(value, 100));
  return match ? match[1].toLowerCase() : null;
}

/**
 * @param {Record<string, any>} item
 * @param {Map<string, string>} hashes
 * @returns {Asset | null}
 */
function readAsset(item, hashes) {
  const url = safeLink(item.browser_download_url ?? item.url ?? item.href ?? item.download);
  const name = firstText(item, ['name', 'file', 'filename', 'label'], 300) || (url ? decodeName(url) : ''); // prettier-ignore
  if (!url || !name) return null;
  const given = (/** @type {readonly string[]} */ list, /** @type {unknown} */ value) => { const v = text(value, 20).toLowerCase(); return list.includes(v) ? v : null; }; // prettier-ignore
  const os = /** @type {Os | null} */ (given(SYSTEMS, item.os ?? item.platform)) ?? osOf(name);
  const verify = item.verify === true || VERIFY.test(name.toLowerCase());
  return {
    name,
    url,
    size: toNumber(item.size),
    os: verify ? 'other' : os,
    arch:
      /** @type {Arch | null} */ (given(ARCHES, item.arch ?? item.architecture)) ?? archOf(name),
    format: text(item.format, 20).toLowerCase() || formatOf(name),
    sha256: sha256Of(item.sha256 ?? item.digest ?? item.checksum) ?? hashes.get(name) ?? null,
    verify,
  };
}

/**
 * @param {string} url
 * @returns {string}
 */
function decodeName(url) {
  const last = url.split(/[?#]/)[0].split('/').pop() ?? '';
  try {
    return decodeURIComponent(last).slice(0, 300);
  } catch {
    return last.slice(0, 300);
  }
}

/**
 * Reads a release: a GitHub release, the list of releases of the GitHub API (the newest one
 * that is not a draft, nor a pre-release unless allowed), `{ version, files }` or a list of files.
 *
 * @param {unknown} data
 * @param {{ prerelease?: boolean, version?: string }} [options]
 * @returns {Release}
 */
export function readRelease(data, options = {}) {
  /** @type {unknown} */
  let value = data;
  if (Array.isArray(value) && value.some((r) => isObject(r) && Array.isArray(r.assets))) {
    const list = value.filter((r) => isObject(r) && !r.draft);
    value = options.version
      ? list.find((r) => [r.tag_name, r.name, r.version].includes(options.version))
      : list.find((r) => options.prerelease || !r.prerelease);
    if (!value) throw new ReleaseError('none');
  }
  if (Array.isArray(value)) value = { files: value };
  if (!isObject(value)) throw new ReleaseError('shape');
  const r = /** @type {Record<string, any>} */ (value);
  const files = [r.assets, r.files, r.downloads].find(Array.isArray);
  if (!files) throw new ReleaseError('shape');
  const hashes = readChecksums(typeof r.checksums === 'string' ? r.checksums : '');
  /** @type {Asset[]} */
  const assets = files
    .filter(isObject)
    .slice(0, MAX_ASSETS)
    .map((item) => readAsset(item, hashes))
    .filter((a) => a !== null);
  // GitHub links the archives of the source code apart from the files.
  const tag = text(r.tag_name ?? r.version, 100);
  for (const [key, format] of /** @type {const} */ ([
    ['zipball_url', 'zip'],
    ['tarball_url', 'tar.gz'],
  ])) {
    // prettier-ignore
    const url = safeLink(r[key]);
    if (url) assets.push({ name: `${tag || 'source'}.${format}`, url, size: null, os: 'source', arch: null, format, sha256: null, verify: false }); // prettier-ignore
  }
  return {
    version: tag,
    name: text(r.name, 200),
    date: toTime(r.published_at ?? r.date ?? r.created_at),
    url: safeLink(r.html_url ?? r.notes ?? r.url),
    prerelease: r.prerelease === true,
    assets,
  };
}

/**
 * How well an architecture runs on a platform: `0` natively, higher through emulation, `-1` not
 * at all. A file without an architecture in its name is most often an x64 one, or universal on
 * a Mac; a Mac that does not tell its architecture is most likely an Apple Silicon one.
 *
 * @param {Arch | null} a
 * @param {Platform} platform
 * @returns {number}
 */
export function archTier(a, { os, arch }) {
  const key = a ?? 'none';
  /** @type {Record<string, number>} */
  let tiers;
  if (arch === null)
    tiers = os === 'macos' ? { universal: 0, arm64: 0, none: 0, x64: 1 } : { x64: 0, none: 0, universal: 0, x86: 1, arm64: 2 }; // prettier-ignore
  else {
    tiers = { [arch]: 0, universal: 0, none: arch === 'x64' ? 0 : 1 };
    if (arch === 'x64') tiers.x86 = 2;
    if (arch === 'arm64' && os === 'windows') Object.assign(tiers, { x64: 2, x86: 3 });
    if (arch === 'arm64' && os === 'macos') tiers.x64 = 2;
  }
  return tiers[key] ?? -1;
}

/**
 * How well a file suits a platform: `-1` when it does not run there.
 *
 * @param {Asset} asset
 * @param {Platform} platform
 * @param {string[]} prefer - Formats the page prefers.
 * @returns {number}
 */
export function score(asset, platform, prefer = []) {
  if (asset.verify || !platform.os || asset.os !== platform.os) return -1;
  const tier = archTier(asset.arch, platform);
  if (tier < 0) return -1;
  const formats = [...prefer, ...PREFERRED[asset.os]];
  const formatRank = formats.indexOf(asset.format);
  let value = (10 - tier) * 10000 + (formatRank < 0 ? 0 : (100 - formatRank) * 10);
  // The build of the platform's own architecture, before a universal one in the same format.
  if (platform.arch && asset.arch === platform.arch) value += 5;
  const name = asset.name.toLowerCase();
  // Debug symbols and portable builds are rarely what one wants first.
  if (/debug|symbols|dbg|pdb|portable|nightly/.test(name)) value -= 500;
  if (asset.os === 'windows' && /setup|install/.test(name)) value += 3;
  return value;
}

/**
 * The file that suits a platform best, and the others for the same system.
 *
 * @param {Asset[]} assets
 * @param {Platform} platform
 * @param {string[]} [prefer]
 * @returns {{ best: Asset | null, others: Asset[] }}
 */
export function recommend(assets, platform, prefer = []) {
  const ranked = assets
    .map((asset) => ({ asset, value: score(asset, platform, prefer) }))
    .filter((r) => r.value >= 0)
    .sort((a, b) => b.value - a.value);
  const best = ranked[0]?.asset ?? null;
  const others = assets.filter((a) => a !== best && !a.verify && a.os === platform.os);
  return { best, others };
}

/**
 * The platform of the reader, read from the browser: never sent anywhere. A Mac does not say
 * whether it is an Apple Silicon one: its architecture is then unknown.
 *
 * @param {{ userAgent?: string, platform?: string, maxTouchPoints?: number, userAgentData?: { platform?: string } }} nav
 * @returns {Platform}
 */
export function detectPlatform(nav) {
  const ua = nav.userAgent ?? '';
  const hint = `${nav.userAgentData?.platform ?? ''} ${nav.platform ?? ''}`.toLowerCase();
  /** @type {Os | null} */
  let os = null;
  if (/android/i.test(ua)) os = 'android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'ios';
  else if (/win/.test(hint) || /windows nt/i.test(ua)) os = 'windows';
  else if (/mac/.test(hint) || /mac os x/i.test(ua))
    os = (nav.maxTouchPoints ?? 0) > 1 ? 'ios' : 'macos'; // prettier-ignore
  else if (/cros/i.test(ua)) os = null;
  else if (/freebsd|openbsd|netbsd/i.test(ua + hint)) os = 'bsd';
  else if (/linux|x11/i.test(ua + hint)) os = 'linux';
  /** @type {Arch | null} */
  let arch = null;
  if (os !== 'macos' && os !== 'ios') {
    if (/arm64|aarch64/i.test(ua)) arch = 'arm64';
    else if (/x86_64|x64|win64|wow64|amd64/i.test(ua)) arch = 'x64';
    else if (/armv[67]|armv8l/i.test(ua)) arch = 'arm';
    else if (/i[3-6]86/i.test(ua)) arch = 'x86';
  }
  return { os, arch };
}

/**
 * The architecture from client hints, where the browser gives them (Chromium).
 *
 * @param {{ userAgentData?: { getHighEntropyValues?: (hints: string[]) => Promise<Record<string, any>> } }} nav
 * @returns {Promise<Arch | null>}
 */
export async function detectArch(nav) {
  const getValues = nav.userAgentData?.getHighEntropyValues;
  if (typeof getValues !== 'function') return null;
  try {
    const values = await getValues.call(nav.userAgentData, ['architecture', 'bitness']);
    const bits64 = values.bitness !== '32';
    if (values.architecture === 'arm') return bits64 ? 'arm64' : 'arm';
    if (values.architecture === 'x86') return bits64 ? 'x64' : 'x86';
  } catch {
    // Hints refused: the architecture stays unknown.
  }
  return null;
}

/**
 * Reads `platform`: `macos-arm64`, `windows`, `linux-x64`…
 *
 * @param {string} value
 * @returns {Platform | null}
 */
export function readPlatform(value) {
  const [os, arch] = value
    .trim()
    .toLowerCase()
    .split(/[-_\s/]+/);
  if (!(/** @type {readonly string[]} */ (SYSTEMS).includes(os))) return null;
  return {
    os: /** @type {Os} */ (os),
    arch: /** @type {readonly string[]} */ (ARCHES).includes(arch) ? /** @type {Arch} */ (arch) : null, // prettier-ignore
  };
}
