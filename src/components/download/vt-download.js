// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import dataCss from '../../styles/data.css?raw';
import csvCss from '../../styles/csv.css?raw';
import downloadCss from '../../styles/download.css?raw';
import { parseBoolean } from '../../core/attributes.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { powershellQuote, shellQuote } from '../../core/shell.js';
import { noticeView } from '../../core/ui.js';
import { formatSize } from '../upload/files.js';
import {
  ReleaseError,
  SYSTEMS,
  detectArch,
  detectPlatform,
  readPlatform,
  readRelease,
  recommend,
} from './releases.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./releases.js').Asset} Asset */
/** @typedef {import('./releases.js').Release} Release */
/** @typedef {import('./releases.js').Platform} Platform */
/** @typedef {import('./releases.js').Os} Os */
/** @typedef {import('./releases.js').Arch} Arch */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** Characters of a hash shown in the table; all of it is copied. */
const SHORT_HASH = 12;

/**
 * A download page: the file that suits the reader's system as one button, the other files of
 * that system, every file of the release in a table with its size and SHA-256, and the command
 * that checks a download.
 *
 * Reads a release of the GitHub API (`/releases/latest`), the list of releases (the newest that
 * is not a draft, nor a pre-release unless `prerelease`), or `{ version, date, notes, files }`.
 * The system and its architecture are guessed in the browser and never sent anywhere; Macs do
 * not tell their architecture, so a universal or Apple Silicon build is chosen first. Every
 * file stays listed, as the guess can be wrong.
 *
 * @element vt-download
 * @since 0.15.0
 *
 * @attr {string} platform - The system to choose for, instead of the reader's: `macos-arm64`, `windows`, `linux-x64`… (`none`: no button).
 * @attr {string} prefer - Formats chosen first, separated by commas (e.g. `deb,rpm`).
 * @attr {boolean} prerelease - From a list of releases, the newest one even if it is a pre-release.
 * @attr {string} version - From a list of releases, the one with this tag.
 * @attr {boolean} all - The table of every file. Default: on.
 * @attr {boolean} verify - The SHA-256 of the file and the command that checks it. Default: on.
 *
 * @prop {string} content - The JSON text.
 * @prop {any} data - The release, as a value.
 * @prop {Release | null} release - The release read (read-only).
 * @prop {Platform} platform - The system files are chosen for (read-only).
 *
 * @fires vt-download - A file link was followed (cancelable). Detail: `{ name, url, os, arch, recommended }`.
 * @fires vt-copy - A hash or a command copied. Detail: `{ text }`.
 *
 * @csspart main - The button and what goes with it.
 * @csspart button - The download button.
 * @csspart verify - The hash and the command that checks it.
 * @csspart table - The table of every file.
 *
 * @example
 * <vt-download variant="full" json-src="https://api.github.com/repos/owner/app/releases/latest" allow-remote></vt-download>
 */
export class VtDownload extends VtDataElement {
  static type = 'download';

  static componentAttributes = Object.freeze(['platform', 'prefer', 'prerelease', 'version', 'all', 'verify']); // prettier-ignore

  static presets = {
    simple: {},
    full: { header: true, dot: true, fullscreen: true },
  };

  static styles = [syntaxCss, codeCss, dataCss, csvCss, downloadCss];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {Platform} */
    this.detected = typeof navigator === 'undefined' ? { os: null, arch: null } : detectPlatform(navigator); // prettier-ignore
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.detected.arch || typeof navigator === 'undefined') return;
    detectArch(/** @type {any} */ (navigator)).then((arch) => {
      if (!arch || this.detected.arch) return;
      this.detected = { ...this.detected, arch };
      if (this.isConnected && !this.hasAttribute('platform')) this.render();
    });
  }

  /** @returns {{ release: Release | null, error: string | null }} */
  read() {
    try {
      const release = readRelease(JSON.parse(this.text ?? ''), {
        prerelease: parseBoolean(this.getAttribute('prerelease')) === true,
        version: this.getAttribute('version')?.trim() || undefined,
      });
      return { release, error: null };
    } catch (error) {
      if (error instanceof ReleaseError) return { release: null, error: this.t(error.message === 'none' ? 'downloadNone' : 'downloadShape') }; // prettier-ignore
      return { release: null, error: this.t('jsonInvalid', { message: error instanceof Error ? error.message : '' }) }; // prettier-ignore
    }
  }

  /** @returns {Release | null} */
  get release() {
    return this.read().release;
  }

  /** @returns {Platform} */
  get platform() {
    const value = this.getAttribute('platform');
    if (value === null) return this.detected;
    return readPlatform(value) ?? { os: null, arch: null };
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const { release, error } = this.read();
    const body = h('div', { class: 'body data-body dl-body', part: 'body' });
    if (!release) body.append(noticeView(error ?? ''));
    else if (!release.assets.length)
      body.append(h('p', { class: 'data-none', text: this.t('downloadEmpty') })); // prettier-ignore
    else this.renderRelease(body, release);
    const badge = release?.version ? release.version : '';
    this.frameWith(frame, body, this.panelId, { file: 'release.json', download: false, badge });
  }

  /**
   * @param {HTMLElement} body
   * @param {Release} release
   */
  renderRelease(body, release) {
    const platform = this.platform;
    const prefer = (this.getAttribute('prefer') ?? '').split(',').map((f) => f.trim().toLowerCase().replace(/^\./, '')).filter(Boolean); // prettier-ignore
    const { best, others } = recommend(release.assets, platform, prefer);
    body.append(this.metaView(release));
    if (platform.os || best) body.append(this.mainView(platform, best, others));
    if (this.flag('all')) body.append(this.tableView(release.assets, best, !best));
  }

  /**
   * @param {Os} os
   * @param {Arch | null} arch
   * @returns {string}
   */
  systemName(os, arch) {
    const t = this.t;
    const system = t(/** @type {StringKey} */ (`downloadOs_${os}`));
    if (!arch || os === 'source' || os === 'other') return system;
    const key = os === 'macos' && (arch === 'arm64' || arch === 'x64') ? (arch === 'arm64' ? 'downloadArch_macArm64' : 'downloadArch_macX64') : `downloadArch_${arch}`; // prettier-ignore
    return t('downloadSystemArch', { system, arch: t(/** @type {StringKey} */ (key)) });
  }

  /**
   * @param {Release} release
   * @returns {HTMLElement}
   */
  metaView(release) {
    const t = this.t;
    const meta = h('p', { class: 'dl-meta' });
    const parts = [
      release.version ? h('strong', { text: release.name && release.name !== release.version ? release.name : t('downloadVersion', { version: release.version }) }) : null, // prettier-ignore
      release.prerelease ? h('span', { class: 'dl-pre', text: t('downloadPrerelease') }) : null,
      release.date !== null ? h('time', { text: this.formatDate(release.date, { dateStyle: 'long' }), attrs: { datetime: new Date(release.date).toISOString() } }) : null, // prettier-ignore
      release.url ? h('a', { text: t('downloadNotes'), attrs: { href: release.url, rel: 'noopener' } }) : null, // prettier-ignore
    ].filter((p) => p !== null);
    for (const [n, part] of parts.entries()) {
      if (n) meta.append(h('span', { class: 'dl-sep', text: '·', attrs: { 'aria-hidden': 'true' } })); // prettier-ignore
      meta.append(part);
    }
    return meta;
  }

  /**
   * @param {Platform} platform
   * @param {Asset | null} best
   * @param {Asset[]} others
   * @returns {HTMLElement}
   */
  mainView(platform, best, others) {
    const t = this.t;
    const main = h('div', { class: 'dl-main', part: 'main' });
    const detected = !this.hasAttribute('platform');
    if (!best) {
      const system = platform.os ? this.systemName(platform.os, platform.arch) : '';
      main.append(h('p', { class: 'dl-for', text: platform.os ? t('downloadNoFile', { system }) : t('downloadUnknown') })); // prettier-ignore
      return main;
    }
    const system = this.systemName(best.os, best.arch ?? platform.arch);
    main.append(
      h('p', { class: 'dl-for', text: t(detected ? 'downloadDetected' : 'downloadChosen', { system }) }), // prettier-ignore
      this.link(
        best,
        { class: 'dl-button', part: 'button', recommended: true },
        icon('download'),
        h('span', { class: 'dl-button-text' }, h('span', { text: t('downloadFor', { system: t(/** @type {StringKey} */ (`downloadOs_${best.os}`)) }) }), h('span', { class: 'dl-button-file', text: [best.name, best.size !== null ? formatSize(best.size, this.locale) : ''].filter(Boolean).join(' · ') })), // prettier-ignore
      ),
    );
    if (others.length) {
      const also = h('p', { class: 'dl-also' }, h('span', { text: t('downloadAlso', { system: t(/** @type {StringKey} */ (`downloadOs_${best.os}`)) }) })); // prettier-ignore
      for (const [n, asset] of others.slice(0, 8).entries()) also.append(n ? ', ' : ' ', this.link(asset, { class: 'dl-alt' }, asset.name)); // prettier-ignore
      main.append(also);
    }
    if (this.flag('verify') && best.sha256) main.append(this.verifyView(best));
    return main;
  }

  /**
   * A link to a file that tells the page it was followed.
   *
   * @param {Asset} asset
   * @param {{ class: string, part?: string, recommended?: boolean }} options
   * @param {...(Node | string)} children
   * @returns {HTMLAnchorElement}
   */
  link(asset, options, ...children) {
    return h(
      'a',
      {
        class: options.class,
        part: options.part,
        attrs: { href: asset.url, rel: 'noopener', 'aria-label': options.recommended ? null : this.t('downloadFile', { name: asset.name }) }, // prettier-ignore
        on: {
          click: (event) => {
            const detail = { name: asset.name, url: asset.url, os: asset.os, arch: asset.arch, recommended: Boolean(options.recommended) }; // prettier-ignore
            if (!emit(this, EVENTS.DOWNLOAD, detail)) event.preventDefault();
          },
        },
      },
      ...children,
    );
  }

  /**
   * The hash of a file and the command that prints it, for its system.
   *
   * @param {Asset} asset
   * @returns {HTMLElement}
   */
  verifyView(asset) {
    const t = this.t;
    const hash = /** @type {string} */ (asset.sha256);
    const command =
      asset.os === 'windows'
        ? `Get-FileHash -Algorithm SHA256 ${powershellQuote(`.\\${asset.name}`)}`
        : asset.os === 'macos'
          ? `shasum -a 256 ${shellQuote(asset.name)}`
          : `sha256sum ${shellQuote(asset.name)}`;
    return h(
      'div',
      { class: 'dl-verify', part: 'verify' },
      h('p', {}, h('span', { text: `${t('downloadVerify')} ` }), h('code', { class: 'dl-hash', text: hash })), // prettier-ignore
      h(
        'div',
        { class: 'dl-command' },
        h('pre', { attrs: { tabindex: '0' } }, h('code', { text: command })),
        this.copyButton(() => command, t('downloadCopyCommand'), 'verify-command'),
      ),
    );
  }

  /**
   * Every file, by system; signatures and checksums apart.
   *
   * @param {Asset[]} assets
   * @param {Asset | null} best
   * @param {boolean} open
   * @returns {HTMLElement}
   */
  tableView(assets, best, open) {
    const t = this.t;
    const files = assets.filter((a) => !a.verify).sort((a, b) => SYSTEMS.indexOf(a.os) - SYSTEMS.indexOf(b.os)); // prettier-ignore
    const verify = assets.filter((a) => a.verify);
    const head = h('tr', {}, ...['downloadFileCol', 'downloadSystem', 'downloadSize', 'downloadHash'].map((k) => h('th', { attrs: { scope: 'col' }, class: k === 'downloadSize' ? 'col-number' : '', text: t(/** @type {StringKey} */ (k)) }))); // prettier-ignore
    const rows = h('tbody');
    for (const [n, asset] of files.entries()) {
      const hash = asset.sha256;
      rows.append(
        h(
          'tr',
          { class: asset === best ? 'dl-best' : '' },
          h('td', {}, this.link(asset, { class: 'dl-name' }, asset.name)),
          h('td', { text: this.systemName(asset.os, asset.arch) }),
          h('td', { class: 'col-number', text: asset.size !== null ? formatSize(asset.size, this.locale) : '' }), // prettier-ignore
          h('td', { class: 'dl-hash-cell' }, ...(hash ? [h('code', { text: `${hash.slice(0, SHORT_HASH)}…`, attrs: { title: hash } }), this.copyButton(() => hash, t('downloadCopyHash', { name: asset.name }), `hash-${n}`)] : [])), // prettier-ignore
        ),
      );
    }
    const details = h(
      'details',
      { class: 'dl-all', attrs: { open: open ? '' : null } },
      h('summary', { text: `${t('downloadAll')} (${files.length})` }),
      h('div', { class: 'dl-wrap', attrs: { tabindex: '0', role: 'region', 'aria-label': t('downloadAll') } }, h('table', { class: 'grid dl-table', part: 'table' }, h('thead', {}, head), rows)), // prettier-ignore
    );
    if (verify.length)
      details.append(
        h('p', { class: 'dl-verify-files' }, h('span', { text: `${t('downloadVerifyFiles')}: ` }), ...verify.flatMap((a, n) => [n ? ', ' : '', this.link(a, { class: 'dl-alt' }, a.name)])), // prettier-ignore
      );
    return details;
  }
}
