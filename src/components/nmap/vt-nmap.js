// @ts-check
import nmapCss from '../../styles/nmap.css?raw';
import { parseBoolean } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { iconButton, noticeView } from '../../core/ui.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { isRisky, parseScan, toCsv } from './nmap.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./nmap.js').Scan} Scan */
/** @typedef {import('./nmap.js').Host} Host */
/** @typedef {import('./nmap.js').Port} Port */
/** @typedef {import('./nmap.js').Script} Script */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/**
 * Shows Nmap results: hosts with their addresses, names, OS guess and ports as a table with
 * state, service, version and script output. Services that are risky to expose (Telnet, FTP,
 * SMB, RDP, VNC, databases…) are marked. Reads XML (`-oX`), normal (`-oN`) and grepable
 * (`-oG`) output; nothing is scanned or fetched.
 *
 * @element vt-nmap
 * @since 0.15.0
 *
 * @attr {boolean} all - Also show closed and filtered ports. Default: off (open ports only).
 * @attr {boolean} down - Also show hosts that are down. Default: off.
 * @attr {boolean} scripts - Script output under each port. Default: on.
 * @attr {boolean} risky - Mark services that are risky to expose. Default: on.
 *
 * @prop {string} content - The Nmap output.
 * @prop {Scan | null} scan - The scan read (read-only), `null` when it cannot be read.
 *
 * @fires vt-ready - Scan rendered. Detail: `{ type: "nmap" }`.
 * @fires vt-copy - CSV or hosts copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart summary - The summary line.
 * @csspart host - A host.
 * @csspart ports - The ports table of a host.
 * @csspart state - The state of a port.
 * @csspart risky - The mark of a risky service.
 * @csspart script - A script output.
 *
 * @example
 * <vt-nmap variant="full" src="scan.xml"></vt-nmap>
 */
export class VtNmap extends VtBase {
  static type = 'nmap';

  static componentAttributes = Object.freeze(['all', 'down', 'scripts', 'risky']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, fullscreen: true },
  };

  static styles = [nmapCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {boolean | null} All ports shown or not with the button; `null` follows `all`. */
    this.allState = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /** @type {Scan | null} */
  get scan() {
    const result = parseScan(this.text ?? '');
    return result.ok ? result.scan : null;
  }

  /**
   * @param {string} name
   * @param {boolean} fallback
   */
  flag(name, fallback) {
    return parseBoolean(this.getAttribute(name)) ?? fallback;
  }

  get showAll() {
    return this.allState ?? this.flag('all', false);
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const result = parseScan(this.text ?? '');
    const body = h('div', { class: 'body nmap-body', part: 'body' });
    /** @type {Host[]} */
    let hosts = [];
    if (!result.ok) {
      const key = /** @type {StringKey} */ (`nmapInvalid${result.error[0].toUpperCase()}${result.error.slice(1)}`); // prettier-ignore
      body.append(noticeView(t(key, { detail: result.detail ?? '' })));
    } else {
      const scan = result.scan;
      hosts = scan.hosts;
      body.append(this.summaryView(scan));
      const shown = this.flag('down', false) ? hosts : hosts.filter((x) => x.status !== 'down');
      for (const host of shown) body.append(this.hostView(host));
    }

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('nmap-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const copy = this.feature('copy') && hosts.length > 0;
    const actions = [
      ...history,
      this.editToggleButton(),
      result.ok
        ? iconButton({
            icon: this.showAll ? 'filter' : 'list',
            label: this.showAll ? t('nmapShowOpen') : t('nmapShowAll'),
            key: 'all',
            pressed: this.showAll,
            onClick: () => {
              this.allState = !this.showAll;
              this.render();
            },
          })
        : null,
      this.fullscreenButton(),
      copy ? this.copyTextButton(() => toCsv(hosts), t('nmapCopyCsv'), 'copy-csv') : null,
      copy
        ? this.copyButton(
            () => hosts.filter((x) => x.ports.some((p) => p.state === 'open')).map((x) => x.address).join('\n'), // prettier-ignore
            t('nmapCopyHosts'),
          )
        : null,
    ];
    const up = hosts.filter((x) => x.status !== 'down').length;
    const badge = result.ok ? t('nmapHosts', { up, total: hosts.length }) : 'Nmap';
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /**
   * @param {Scan} scan
   * @returns {HTMLElement}
   */
  summaryView(scan) {
    const t = this.t;
    const open = scan.hosts.flatMap((x) => x.ports).filter((p) => p.state === 'open');
    const risky = this.flag('risky', true) ? open.filter(isRisky).length : 0;
    const up = scan.hosts.filter((x) => x.status !== 'down').length;
    return h(
      'div',
      { class: 'nmap-summary', part: 'summary' },
      h(
        'p',
        { class: 'nmap-counts' },
        h('strong', { text: t('nmapHosts', { up, total: scan.hosts.length }) }),
        h('span', { text: t('nmapOpen', { count: open.length }) }),
        risky
          ? h('span', { class: 'nmap-risky-count' }, icon('alert'), h('span', { text: t('nmapRiskyCount', { count: risky }) })) // prettier-ignore
          : null,
        scan.elapsed ? h('span', { class: 'nmap-muted', text: t('nmapElapsed', { seconds: scan.elapsed }) }) : null, // prettier-ignore
      ),
      scan.command
        ? h('p', { class: 'nmap-command' }, h('span', { class: 'nmap-muted', text: `${t('nmapCommand')} ` }), h('code', { text: scan.command })) // prettier-ignore
        : null,
    );
  }

  /**
   * @param {Host} host
   * @returns {HTMLElement}
   */
  hostView(host) {
    const t = this.t;
    const ports = this.showAll ? host.ports : host.ports.filter((p) => p.state === 'open');
    const title = host.hostnames[0] ? `${host.hostnames[0]} (${host.address})` : host.address;
    const meta = [
      host.os ? t('nmapOs', { os: host.os }) : '',
      host.mac ? `${t('nmapMac', { mac: host.mac })}${host.vendor ? ` · ${host.vendor}` : ''}` : '',
      host.latency ? t('nmapLatency', { value: host.latency }) : '',
      ...host.hostnames.slice(1),
    ].filter(Boolean);
    const status = host.status === 'down' ? 'down' : 'up';
    return h(
      'section',
      { class: `nmap-host ${status}`, part: 'host', attrs: { 'aria-label': title } },
      h(
        'header',
        { class: 'nmap-host-head' },
        h('h3', { class: 'nmap-address', text: title }),
        h('span', { class: `nmap-status ${status}`, text: t(/** @type {StringKey} */ (`nmapStatus_${status}`)) }), // prettier-ignore
      ),
      meta.length ? h('p', { class: 'nmap-meta', text: meta.join(' · ') }) : null,
      ports.length ? this.portsTable(ports) : host.status === 'down' ? null : h('p', { class: 'nmap-muted', text: t('nmapNoPorts') }), // prettier-ignore
      host.scripts.length && this.flag('scripts', true)
        ? h('div', { class: 'nmap-host-scripts' }, h('h4', { text: t('nmapHostScripts') }), ...host.scripts.map((s) => this.scriptView(s))) // prettier-ignore
        : null,
    );
  }

  /**
   * @param {Port[]} ports
   * @returns {HTMLElement}
   */
  portsTable(ports) {
    const t = this.t;
    const markRisky = this.flag('risky', true);
    const scripts = this.flag('scripts', true);
    const rows = ports.flatMap((p) => {
      const risky = markRisky && isRisky(p);
      const stateKey = /** @type {StringKey} */ (`nmapState_${p.state}`);
      const stateText = t(stateKey) === stateKey ? p.state : t(stateKey);
      const row = h(
        'tr',
        { class: risky ? 'risky' : '' },
        h('th', { attrs: { scope: 'row' } }, h('code', { text: `${p.port}/${p.protocol}` })),
        h('td', {}, h('span', { class: `nmap-state st-${p.state.replace(/\W/g, '-')}`, part: 'state', text: stateText })), // prettier-ignore
        h(
          'td',
          { class: 'nmap-service' },
          h('span', { text: p.service }),
          p.tunnel === 'ssl' ? h('span', { class: 'nmap-tag', text: t('nmapTls') }) : null,
          risky
            ? h('span', { class: 'nmap-tag risky', part: 'risky', attrs: { title: t('nmapRiskyHint') } }, icon('alert'), h('span', { text: t('nmapRisky') })) // prettier-ignore
            : null,
        ),
        h('td', { class: 'nmap-version', text: p.version }),
      );
      if (!scripts || !p.scripts.length) return [row];
      return [
        row,
        h(
          'tr',
          { class: 'nmap-script-row' },
          h('td', { attrs: { colspan: 4 } }, ...p.scripts.map((s) => this.scriptView(s))),
        ),
      ];
    });
    return h(
      'div',
      { class: 'nmap-scroll' },
      h(
        'table',
        { class: 'nmap-table', part: 'ports' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { attrs: { scope: 'col' }, text: t('nmapPort') }),
            h('th', { attrs: { scope: 'col' }, text: t('nmapState') }),
            h('th', { attrs: { scope: 'col' }, text: t('nmapService') }),
            h('th', { attrs: { scope: 'col' }, text: t('nmapVersion') }),
          ),
        ),
        h('tbody', {}, ...rows),
      ),
    );
  }

  /**
   * @param {Script} script
   * @returns {HTMLElement}
   */
  scriptView(script) {
    const multiline = script.output.includes('\n');
    if (!multiline)
      return h('p', { class: 'nmap-script', part: 'script' }, h('code', { class: 'nmap-script-id', text: script.id }), h('span', { text: ` ${script.output}` })); // prettier-ignore
    return h(
      'details',
      { class: 'nmap-script', part: 'script' },
      h('summary', {}, h('code', { class: 'nmap-script-id', text: script.id })),
      h('pre', { text: script.output }),
    );
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'plaintext',
      lineNumbers: true,
      wrap: false,
      highlightLimit: getConfig().highlightLimit,
      label: this.heading || this.t('editor'),
      placeholder: this.getAttribute('placeholder') ?? undefined,
      onInput: (text) => this.edited(text),
      onChange: (text) => emit(this, EVENTS.CHANGE, { value: text }),
      history: this.editHistory ?? undefined,
    });
    return this.editor;
  }

  contentEdited() {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.render(), 300);
  }
}
