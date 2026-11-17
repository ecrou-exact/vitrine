// @ts-check
import pcapCss from '../../styles/pcap.css?raw';
import { parseBoolean, parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { isAbortError } from '../../core/content.js';
import { hexFromData } from '../../core/data-formats.js';
import { append, h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { createTabs, noticeView } from '../../core/ui.js';
import { asciiChar, decodeText, toHex } from '../hex/bytes.js';
import { fetchBytes } from '../hex/fetch-bytes.js';
import { formatSize } from '../upload/files.js';
import { en as strings, fr as stringsFr } from './strings.js';
import { LINK_TYPES, conversations, decode, hostNames, parseCapture, protocols, toCsv } from './pcap.js'; // prettier-ignore

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./pcap.js').Capture} Capture */
/** @typedef {import('./pcap.js').Packet} Packet */
/** @typedef {import('./pcap.js').Layer} Layer */
/** @typedef {import('./pcap.js').ParseResult} ParseResult */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */
/** @typedef {"packets" | "conversations" | "names"} View */

/** Largest file read from a drop or a file field (bytes). */
export const MAX_FILE = 64 * 1024 * 1024;
/** Rows shown at first, and added by "Show more". */
const PAGE = 500;
/** @type {readonly View[]} */
const VIEWS = Object.freeze(['packets', 'conversations', 'names']);

/**
 * Reads packet captures in the page: pcap and pcapng files as a packet list (time, source,
 * destination, protocol, length, info), each packet opening on its layers (Ethernet, ARP,
 * IPv4, IPv6, ICMP, TCP, UDP, DNS, HTTP, TLS) with every field tied to its bytes in a hex
 * dump. Conversations between endpoints, and the host names seen (DNS questions and answers,
 * TLS server names, HTTP Host headers) to copy as indicators. Filters by protocol and text.
 * Files come from `src`, a drop, a file field, the `bytes` property or base64 text; they are
 * read in memory and sent nowhere.
 *
 * @element vt-pcap
 * @since 0.15.0
 *
 * @attr {"packets" | "conversations" | "names"} view - Tab shown first. Default: packets.
 * @attr {boolean} filters - Protocol and text filters. Default: on.
 * @attr {boolean} file - A zone to drop or choose a capture. Default: on.
 * @attr {boolean} defang - Show host names defanged. Default: off.
 *
 * @prop {string} content - The capture as base64 (or hex) text.
 * @prop {Uint8Array} bytes - The capture. Setting it overrides `src` and `content`.
 * @prop {File | null} file - A capture file to read.
 * @prop {Capture | null} capture - The capture read (read-only).
 *
 * @fires vt-ready - Rendered. Detail: `{ type: "pcap" }`.
 * @fires vt-tab-change - Tab changed. Detail: `{ tab }`.
 * @fires vt-filter-change - Filters changed. Detail: `{ protocols, query, shown }`.
 * @fires vt-select - A packet opened. Detail: `{ index, protocol, info }`.
 * @fires vt-copy - CSV or names copied. Detail: `{ text }`.
 * @fires vt-error - File too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart summary - The summary of the capture.
 * @csspart zone - The zone where a file is dropped.
 * @csspart filters - The filters.
 * @csspart packets - The table of packets.
 * @csspart packet - The opened packet.
 * @csspart layers - Its layers and fields.
 * @csspart dump - Its bytes.
 * @csspart conversations - The table of conversations.
 * @csspart names - The table of host names.
 *
 * @example
 * <vt-pcap variant="full" src="capture.pcapng"></vt-pcap>
 */
export class VtPcap extends VtBase {
  static type = 'pcap';

  static componentAttributes = Object.freeze(['view', 'filters', 'file', 'defang', 'tabs']);

  static presets = {
    simple: { tabs: true },
    full: { header: true, dot: true, copy: true, fullscreen: true, tabs: true },
  };

  static styles = [pcapCss];

  static allowEmpty = true;

  static fromData = hexFromData;

  static upgradeProperties = ['content', 'bytes', 'file'];

  constructor() {
    super();
    this.panelId = uid('panel');
    this.ids = { query: uid('query') };
    /** @type {Uint8Array | undefined} */
    this._bytes = undefined;
    /** @type {Uint8Array | null} */
    this.fetched = null;
    /** @type {File | null} */
    this._file = null;
    /** @type {Uint8Array | null} */
    this.fileBytes = null;
    this.fileError = '';
    /** @type {{ key: unknown, result: ParseResult | { ok: false, error: "text", message: string } } | null} */
    this.parsed = null;
    /** @type {View | null} */
    this.viewState = null;
    /** @type {Set<string>} */
    this.shown = new Set();
    this.query = '';
    this.limit = PAGE;
    /** @type {number} Index of the opened packet, 0 for none. */
    this.selected = 0;
    /** @type {{ start: number, end: number } | null} */
    this.mark = null;
    this.dragging = 0;
    /** @type {HTMLElement[]} Byte cells of the dump, hex then ASCII. */
    this.cells = [];
  }

  /** @type {Uint8Array} */
  get bytes() {
    return (this.source() ?? new Uint8Array(0)).slice();
  }

  set bytes(value) {
    this._bytes = value == null ? undefined : new Uint8Array(value);
    this.resetView();
    if (this._connected) this.reload();
  }

  /** @type {File | null} */
  get file() {
    return this._file;
  }

  set file(value) {
    this.setFile(value instanceof Blob ? /** @type {File} */ (value) : null);
  }

  /** @type {Capture | null} */
  get capture() {
    const result = this.read();
    return result && result.ok ? result.capture : null;
  }

  /** @type {View} */
  get view() {
    return this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, 'packets');
  }

  /**
   * @param {string} name
   * @param {boolean} fallback
   */
  flag(name, fallback) {
    return parseBoolean(this.getAttribute(name)) ?? fallback;
  }

  resetView() {
    this.selected = 0;
    this.mark = null;
    this.limit = PAGE;
    this.shown.clear();
  }

  /** Cancels a request still running. */
  cancelFetch() {
    /** @type {AbortController | null} */ (/** @type {any} */ (this)._abort)?.abort();
  }

  /** Bytes from `bytes`, a file or `src`; text goes through the base class. */
  reload() {
    const src = this.getAttribute('src');
    this.fetched = null;
    if (this._bytes || this._file || this._content !== undefined || !src?.trim()) {
      if (this._bytes || this._file) {
        this._loadToken += 1;
        this.cancelFetch();
        this.setText('');
      } else super.reload();
      return;
    }
    const token = ++this._loadToken;
    this.cancelFetch();
    const controller = new AbortController();
    /** @type {any} */ (this)._abort = controller;
    this.loading = true;
    this.error = null;
    this.requestRender();
    const config = getConfig();
    fetchBytes(src, {
      allowRemote: parseBoolean(this.getAttribute('allow-remote')) === true,
      maxSize: config.maxSize,
      timeout: config.fetchTimeout,
      signal: controller.signal,
    }).then(
      (bytes) => {
        if (token !== this._loadToken) return;
        this.fetched = bytes;
        this.resetView();
        this.setText('');
      },
      (error) => token === this._loadToken && !isAbortError(error) && this.setError(error),
    );
  }

  /**
   * @param {File | null} file
   */
  async setFile(file) {
    this._file = file;
    this.fileBytes = null;
    this.fileError = '';
    this.resetView();
    if (file && file.size > MAX_FILE) {
      this.fileError = this.t('pcapTooLarge', { size: formatSize(file.size, this.locale), limit: formatSize(MAX_FILE, this.locale) }); // prettier-ignore
      this._file = null;
    }
    this.requestRender();
    if (!this._file) return;
    const current = this._file;
    try {
      const bytes = new Uint8Array(await current.arrayBuffer());
      if (this._file !== current) return;
      this.fileBytes = bytes;
    } catch {
      if (this._file !== current) return;
      this.fileError = this.t('pcapReadFailed');
      this._file = null;
    }
    this.requestRender();
  }

  /** @returns {Uint8Array | null} The bytes read, `null` while a file loads. */
  source() {
    if (this._bytes) return this._bytes;
    if (this._file) return this.fileBytes;
    if (this.fetched) return this.fetched;
    return null;
  }

  /** @returns {ParseResult | { ok: false, error: "text", message: string } | null} */
  read() {
    const bytes = this.source();
    const text = bytes ? null : (this.text ?? '');
    const key = bytes ?? text;
    if (this.parsed?.key === key) return this.parsed.result;
    if (bytes) this.parsed = { key, result: parseCapture(bytes) };
    else if (!text?.trim()) return null;
    else {
      try {
        this.parsed = { key, result: parseCapture(decodeText(text)) };
      } catch (error) {
        this.parsed = { key, result: { ok: false, error: 'text', message: error instanceof Error ? error.message : String(error) } }; // prettier-ignore
      }
    }
    return this.parsed.result;
  }

  /**
   * @param {number} us
   * @returns {string}
   */
  seconds(us) {
    return (us / 1e6).toFixed(6);
  }

  /**
   * @param {number} us
   * @returns {string}
   */
  duration(us) {
    const ms = us / 1000;
    if (ms < 1000) return `${new Intl.NumberFormat(this.locale, { maximumFractionDigits: 1 }).format(ms)} ms`; // prettier-ignore
    return `${new Intl.NumberFormat(this.locale, { maximumFractionDigits: 2 }).format(ms / 1000)} s`; // prettier-ignore
  }

  /**
   * @param {string} name
   */
  dots(name) {
    return this.flag('defang', false) ? name.replace(/\./g, '[.]') : name;
  }

  /**
   * @param {Packet[]} packets
   * @returns {Packet[]}
   */
  filtered(packets) {
    const query = this.query.trim().toLowerCase();
    return packets.filter((p) => {
      const s = p.summary;
      if (this.shown.size && !this.shown.has(s.protocol || '?')) return false;
      if (!query) return true;
      if (/^\d+$/.test(query) && (String(s.srcPort) === query || String(s.dstPort) === query)) return true; // prettier-ignore
      return `${s.src} ${s.dst} ${s.protocol} ${s.info} ${s.names.join(' ')}`.toLowerCase().includes(query); // prettier-ignore
    });
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const result = this.read();
    const capture = result && result.ok ? result.capture : null;
    const body = h('div', {
      class: `body pcap-body${this.dragging ? ' dragging' : ''}`,
      part: 'body',
      on: this.flag('file', true) ? this.dropHandlers() : {},
    });
    let tabs = null;
    if (this.fileError) body.append(h('p', { class: 'pcap-error', attrs: { role: 'alert' }, text: this.fileError })); // prettier-ignore
    if (!result) {
      if (this.flag('file', true)) body.append(this.zoneView());
      else if (!this._file) body.append(noticeView(t('pcapEmpty')));
    } else if (!result.ok) {
      body.append(noticeView(result.error === 'text' ? t('pcapInvalidText', { message: result.message }) : t(/** @type {StringKey} */ (`pcapInvalid${result.error[0].toUpperCase()}${result.error.slice(1)}`)))); // prettier-ignore
      if (this.flag('file', true)) body.append(this.zoneView());
    } else if (capture) {
      const convs = conversations(capture.packets);
      const names = hostNames(capture.packets);
      tabs = this.feature('tabs')
        ? createTabs({
            tabs: [
              { id: 'packets', label: t('pcapTabPackets', { count: formatNumber(capture.packets.length, this.locale) }) }, // prettier-ignore
              { id: 'conversations', label: t('pcapTabConversations', { count: convs.length }) },
              { id: 'names', label: t('pcapTabNames', { count: names.length }) },
            ],
            selected: this.view,
            label: t('pcapTabs'),
            panelId: this.panelId,
            onSelect: (id) => this.selectView(/** @type {View} */ (id)),
          })
        : null;
      body.append(this.summaryView(capture));
      if (capture.truncated) body.append(noticeView(t('pcapTruncated')));
      if (capture.capped) body.append(noticeView(t('pcapCapped', { count: formatNumber(capture.packets.length, this.locale) }))); // prettier-ignore
      const view = tabs ? this.view : 'packets';
      if (view === 'conversations') body.append(this.conversationsView(convs, capture));
      else if (view === 'names') body.append(this.namesView(names));
      else {
        if (this.flag('filters', true)) body.append(this.filtersView(capture.packets));
        body.append(this.packetsView(capture));
        const open = capture.packets[this.selected - 1];
        if (open) body.append(this.packetView(open, capture));
      }
    }

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null } }, body); // prettier-ignore
    const packets = capture ? this.filtered(capture.packets) : [];
    const copy = this.feature('copy') && capture;
    const actions = [
      this.fullscreenButton(),
      copy && packets.length ? this.copyTextButton(() => toCsv(packets, capture.packets[0]?.time ?? 0), t('pcapCopyCsv'), 'copy-csv') : null, // prettier-ignore
      copy ? this.copyButton(() => hostNames(capture.packets).map((n) => this.dots(n.name)).join('\n'), t('pcapCopyNames')) : null, // prettier-ignore
    ];
    const badge = capture ? `${capture.format === 'pcapng' ? 'PCAPNG' : 'PCAP'} · ${t('pcapPackets', { count: formatNumber(capture.packets.length, this.locale) })}` : 'PCAP'; // prettier-ignore
    frame.append(...this.chrome({ badge, tabs, actions }), panel);
  }

  /**
   * @param {View} view
   */
  selectView(view) {
    if (view === this.view) return;
    this.viewState = view;
    this.render();
    /** @type {HTMLElement | null} */ (this.root.querySelector(`[data-tab="${view}"]`))?.focus();
    emit(this, EVENTS.TAB_CHANGE, { tab: view });
  }

  /** @returns {Record<string, (event: Event) => void>} */
  dropHandlers() {
    const hasFiles = (/** @type {Event} */ e) => [...(/** @type {DragEvent} */ (e).dataTransfer?.types ?? [])].includes('Files'); // prettier-ignore
    return {
      dragenter: (event) => {
        if (!hasFiles(event)) return;
        this.dragging += 1;
        if (this.dragging === 1) this.render();
      },
      dragover: (event) => {
        if (hasFiles(event)) event.preventDefault();
      },
      dragleave: () => {
        if (!this.dragging) return;
        this.dragging -= 1;
        if (!this.dragging) this.render();
      },
      drop: (event) => {
        event.preventDefault();
        this.dragging = 0;
        const file = /** @type {DragEvent} */ (event).dataTransfer?.files?.[0];
        if (file) this.setFile(file);
        else this.render();
      },
    };
  }

  /** @returns {HTMLInputElement} A hidden file field. */
  fileInput() {
    const input = h('input', {
      class: 'sr-only',
      attrs: { type: 'file', accept: '.pcap,.pcapng,.cap,application/vnd.tcpdump.pcap', tabindex: '-1', 'aria-hidden': 'true' }, // prettier-ignore
      on: {
        change: () => {
          const file = input.files?.[0];
          if (file) this.setFile(file);
          input.value = '';
        },
      },
    });
    return input;
  }

  /** @returns {HTMLElement} */
  zoneView() {
    const t = this.t;
    const input = this.fileInput();
    return h(
      'div',
      { class: 'pcap-zone', part: 'zone' },
      input,
      icon('upload'),
      h('span', { text: this.dragging ? t('pcapDropNow') : `${t('pcapDrop')} ` }),
      this.dragging
        ? null
        : h('button', { class: 'text-btn', text: t('pcapChoose'), attrs: { type: 'button', 'data-focus-key': 'choose' }, on: { click: () => input.click() } }), // prettier-ignore
      h('span', { class: 'pcap-muted pcap-note', text: t('pcapFileNote') }),
    );
  }

  /**
   * @param {Capture} capture
   * @returns {HTMLElement}
   */
  summaryView(capture) {
    const t = this.t;
    const packets = capture.packets;
    const first = packets[0]?.time ?? 0;
    const last = packets.at(-1)?.time ?? 0;
    const bytes = packets.reduce((s, p) => s + p.length, 0);
    const link = LINK_TYPES[/** @type {keyof typeof LINK_TYPES} */ (capture.linkType)] ?? String(capture.linkType); // prettier-ignore
    const date = first ? new Date(first / 1000) : null;
    const input = this.flag('file', true) ? this.fileInput() : null;
    const tops = protocols(packets).slice(0, 6);
    return h(
      'div',
      { class: 'pcap-summary', part: 'summary' },
      h(
        'p',
        { class: 'pcap-facts' },
        this._file ? h('strong', { class: 'pcap-file', text: this._file.name }) : null,
        h('strong', { text: t('pcapPackets', { count: formatNumber(packets.length, this.locale) }) }), // prettier-ignore
        packets.length > 1 ? h('span', { text: t('pcapDuration', { time: this.duration(last - first) }) }) : null, // prettier-ignore
        date && !Number.isNaN(date.getTime()) ? h('span', { class: 'pcap-muted', text: t('pcapStarted', { date: date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC') }) }) : null, // prettier-ignore
        h('span', { text: t('pcapBytes', { size: formatSize(bytes, this.locale) }) }),
        h('span', { class: 'pcap-muted', text: t('pcapLink', { link }) }),
        capture.interfaces.filter(Boolean).length ? h('span', { class: 'pcap-muted', text: t('pcapInterfaces', { names: capture.interfaces.filter(Boolean).join(', ') }) }) : null, // prettier-ignore
        input,
        input ? h('button', { class: 'text-btn', text: t('pcapOpenOther'), attrs: { type: 'button', 'data-focus-key': 'open-other' }, on: { click: () => input.click() } }) : null, // prettier-ignore
      ),
      tops.length
        ? h('ul', { class: 'pcap-protocols', attrs: { 'aria-label': t('pcapProtocol') } }, ...tops.map(([name, count]) => h('li', {}, h('span', { class: `pcap-proto p-${protoClass(name)}`, text: name }), h('span', { class: 'pcap-muted', text: ` ${formatNumber(count, this.locale)}` })))) // prettier-ignore
        : null,
    );
  }

  /**
   * @param {Packet[]} packets
   * @returns {HTMLElement}
   */
  filtersView(packets) {
    const t = this.t;
    const list = protocols(packets);
    const chip = (/** @type {string} */ key, /** @type {string} */ label, /** @type {boolean} */ pressed, /** @type {() => void} */ onClick) =>
      h('button', { class: `pcap-chip${pressed ? ' on' : ''}`, text: label, attrs: { type: 'button', 'aria-pressed': String(pressed), 'data-focus-key': `filter-${key}` }, on: { click: onClick } }); // prettier-ignore
    const input = h('input', {
      class: 'pcap-query',
      attrs: { id: this.ids.query, type: 'search', value: this.query, placeholder: t('pcapFilterText'), 'aria-label': t('pcapFilterText'), 'data-focus-key': 'query', spellcheck: 'false' }, // prettier-ignore
      on: {
        input: () => {
          this.query = input.value.slice(0, 200);
          this.filtersChanged(packets);
        },
      },
    });
    return h(
      'div',
      { class: 'pcap-filters', part: 'filters', attrs: { role: 'group', 'aria-label': t('pcapFilters') } }, // prettier-ignore
      chip('all', t('pcapAll'), !this.shown.size, () => {
        this.shown.clear();
        this.filtersChanged(packets);
      }),
      ...list.slice(0, 12).map(([name, count]) =>
        chip(name, `${name} ${formatNumber(count, this.locale)}`, this.shown.has(name), () => {
          if (this.shown.has(name)) this.shown.delete(name);
          else this.shown.add(name);
          if (this.shown.size === list.length) this.shown.clear();
          this.filtersChanged(packets);
        }),
      ),
      input,
    );
  }

  /**
   * @param {Packet[]} packets
   */
  filtersChanged(packets) {
    this.limit = PAGE;
    this.render();
    emit(this, EVENTS.FILTER_CHANGE, { protocols: [...this.shown], query: this.query, shown: this.filtered(packets).length }); // prettier-ignore
  }

  /**
   * @param {Capture} capture
   * @returns {HTMLElement}
   */
  packetsView(capture) {
    const t = this.t;
    const rows = this.filtered(capture.packets);
    if (!rows.length) return noticeView(t('pcapNone'));
    const origin = capture.packets[0]?.time ?? 0;
    const cols = [t('pcapNo'), t('pcapTime'), t('pcapSource'), t('pcapDestination'), t('pcapProtocol'), t('pcapLength'), t('pcapInfo')]; // prettier-ignore
    const more =
      rows.length > this.limit
        ? h('button', {
            class: 'text-btn pcap-more',
            text: t('pcapShowMore', { count: formatNumber(Math.min(PAGE, rows.length - this.limit), this.locale) }), // prettier-ignore
            attrs: { type: 'button', 'data-focus-key': 'more' },
            on: {
              click: () => {
                this.limit += PAGE;
                this.render();
              },
            },
          })
        : null;
    return h(
      'div',
      { class: 'pcap-packets' },
      h(
        'div',
        { class: 'pcap-scroll' },
        h(
          'table',
          { class: 'pcap-table', part: 'packets' },
          h('thead', {}, h('tr', {}, ...cols.map((c) => h('th', { attrs: { scope: 'col' }, text: c })))), // prettier-ignore
          h(
            'tbody',
            {},
            ...rows.slice(0, this.limit).map((p) => {
              const s = p.summary;
              const open = p.index === this.selected;
              const end = (/** @type {string} */ a, /** @type {number} */ port) => (port >= 0 ? `${a}:${port}` : a); // prettier-ignore
              return h(
                'tr',
                { class: `pcap-row p-${protoClass(s.protocol)}${open ? ' open' : ''}`, attrs: { 'data-index': p.index } }, // prettier-ignore
                h('th', { attrs: { scope: 'row' } }, h('button', { class: 'pcap-open', text: String(p.index), attrs: { type: 'button', 'aria-pressed': String(open), 'aria-label': t('pcapPacket', { index: p.index }), 'data-focus-key': `packet-${p.index}` }, on: { click: () => this.open(p) } })), // prettier-ignore
                h('td', { class: 'pcap-num', text: this.seconds(p.time - origin) }),
                h('td', {}, h('code', { text: end(s.src, s.srcPort) })),
                h('td', {}, h('code', { text: end(s.dst, s.dstPort) })),
                h('td', {}, h('span', { class: `pcap-proto p-${protoClass(s.protocol)}`, text: s.protocol || '?' })), // prettier-ignore
                h('td', { class: 'pcap-num', text: String(p.length) }),
                h('td', { class: 'pcap-info', text: this.flag('defang', false) ? s.info.replace(/([a-z0-9-])\.([a-z])/gi, '$1[.]$2') : s.info }), // prettier-ignore
              );
            }),
          ),
        ),
      ),
      more,
    );
  }

  /**
   * @param {Packet} packet
   */
  open(packet) {
    if (this.selected === packet.index) this.selected = 0;
    else {
      this.selected = packet.index;
      emit(this, EVENTS.SELECT, { index: packet.index, protocol: packet.summary.protocol, info: packet.summary.info }); // prettier-ignore
    }
    this.mark = null;
    this.render();
    if (this.selected) /** @type {HTMLElement | null} */ (this.root.querySelector('.pcap-packet'))?.scrollIntoView?.({ block: 'nearest' }); // prettier-ignore
  }

  /**
   * @param {Packet} packet
   * @param {Capture} capture
   * @returns {HTMLElement}
   */
  packetView(packet, capture) {
    const t = this.t;
    const { layers } = decode(packet, capture.state);
    const origin = capture.packets[0]?.time ?? 0;
    const dump = this.dumpView(packet.data);
    return h(
      'section',
      { class: 'pcap-packet', part: 'packet', attrs: { 'aria-label': t('pcapPacket', { index: packet.index }) } }, // prettier-ignore
      h(
        'header',
        { class: 'pcap-packet-head' },
        h('h3', { text: t('pcapPacket', { index: packet.index }) }),
        h('span', { class: 'pcap-muted', text: t('pcapPacketSummary', { length: packet.length, captured: packet.data.length, time: `${this.seconds(packet.time - origin)} s` }) }), // prettier-ignore
        h('button', { class: 'text-btn', text: t('pcapClose'), attrs: { type: 'button', 'data-focus-key': 'close-packet' }, on: { click: () => this.open(packet) } }), // prettier-ignore
      ),
      h(
        'div',
        { class: 'pcap-split' },
        h(
          'div',
          { class: 'pcap-layers', part: 'layers', attrs: { 'aria-label': t('pcapLayers'), role: 'group' } }, // prettier-ignore
          ...layers.map((layer) => this.layerView(layer)),
        ),
        h('div', { class: 'pcap-dump-box' }, h('p', { class: 'pcap-label', text: t('pcapBytesView') }), dump), // prettier-ignore
      ),
    );
  }

  /**
   * @param {Layer} layer
   * @returns {HTMLElement}
   */
  layerView(layer) {
    const t = this.t;
    return h(
      'details',
      { class: `pcap-layer l-${layer.id}`, attrs: { open: true } },
      h('summary', {}, h('span', { class: 'pcap-layer-name', text: layer.name }), h('span', { class: 'pcap-muted', text: ` ${t('pcapFieldBytes', { from: layer.start, to: Math.max(layer.start, layer.end - 1) })}` })), // prettier-ignore
      h(
        'dl',
        {},
        ...layer.fields.flatMap((f, i) => {
          const key = /** @type {StringKey} */ (`pcapF_${f.key}`);
          const label = Object.hasOwn(strings, key) ? t(key) : f.key;
          const on = this.mark?.start === f.start && this.mark?.end === f.end;
          return [
            h('dt', {}, h('button', { class: `pcap-field${on ? ' on' : ''}`, text: label, attrs: { type: 'button', 'aria-pressed': String(on), title: t('pcapFieldBytes', { from: f.start, to: Math.max(f.start, f.end - 1) }), 'data-start': f.start, 'data-end': f.end, 'data-focus-key': `field-${layer.id}-${i}` }, on: { click: () => this.markBytes(f.start, f.end) } })), // prettier-ignore
            h('dd', {}, h('code', { text: f.key === 'tlsSni' || f.key === 'dnsQuestion' || f.key === 'dnsAnswer' ? this.dots(f.value) : f.value })), // prettier-ignore
          ];
        }),
      ),
    );
  }

  /**
   * Highlights the bytes of a field in the dump without rebuilding it.
   *
   * @param {number} start
   * @param {number} end
   */
  markBytes(start, end) {
    const same = this.mark?.start === start && this.mark?.end === end;
    this.mark = same ? null : { start, end };
    for (const cell of this.cells) {
      const byte = Number(cell.dataset.byte);
      cell.classList.toggle('mark', !same && byte >= start && byte < end);
    }
    for (const button of /** @type {NodeListOf<HTMLElement>} */ (
      this.root.querySelectorAll('.pcap-field')
    )) {
      // prettier-ignore
      const on = !same && button.dataset.start === String(start) && button.dataset.end === String(end); // prettier-ignore
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    }
    this.cells.find((c) => c.classList.contains('mark'))?.scrollIntoView?.({ block: 'nearest' });
  }

  /**
   * @param {Uint8Array} data
   * @returns {HTMLElement}
   */
  dumpView(data) {
    const shown = data.subarray(0, 64 * 1024);
    this.cells = [];
    const dump = h('div', { class: 'pcap-dump', part: 'dump', attrs: { 'aria-label': this.t('pcapBytesView'), role: 'group' } }); // prettier-ignore
    for (let row = 0; row < shown.length; row += 16) {
      const line = h('div', { class: 'pcap-dump-row' });
      const hex = h('span', { class: 'pcap-hex' });
      const ascii = h('span', { class: 'pcap-ascii' });
      for (let i = row; i < Math.min(row + 16, shown.length); i += 1) {
        const marked = this.mark && i >= this.mark.start && i < this.mark.end;
        const x = h('span', { class: `b${marked ? ' mark' : ''}`, text: toHex(shown[i]), attrs: { 'data-byte': i } }); // prettier-ignore
        const c = h('span', { class: `b${marked ? ' mark' : ''}`, text: asciiChar(shown[i]), attrs: { 'data-byte': i } }); // prettier-ignore
        this.cells.push(x, c);
        hex.append(x);
        ascii.append(c);
      }
      append(line, [h('span', { class: 'pcap-offset', text: toHex(row, 4) }), hex, ascii]);
      dump.append(line);
    }
    return dump;
  }

  /**
   * @param {import('./pcap.js').Conversation[]} list
   * @param {Capture} capture
   * @returns {HTMLElement}
   */
  conversationsView(list, capture) {
    const t = this.t;
    const origin = capture.packets[0]?.time ?? 0;
    const cols = [t('pcapEndpointA'), t('pcapEndpointB'), t('pcapTransport'), t('pcapProtocol'), t('pcapPacketsCol'), t('pcapBytesCol'), t('pcapStart'), t('pcapDurationCol')]; // prettier-ignore
    return h(
      'div',
      { class: 'pcap-scroll' },
      h(
        'table',
        { class: 'pcap-table pcap-convs', part: 'conversations' },
        h('thead', {}, h('tr', {}, ...cols.map((c) => h('th', { attrs: { scope: 'col' }, text: c })))), // prettier-ignore
        h(
          'tbody',
          {},
          ...list.slice(0, 2000).map((c) =>
            h(
              'tr',
              {},
              h('th', { attrs: { scope: 'row' } }, h('code', { text: c.a })),
              h('td', {}, h('code', { text: c.b })),
              h('td', { text: c.transport }),
              h('td', {}, h('span', { class: `pcap-proto p-${protoClass(c.protocol)}`, text: c.protocol })), // prettier-ignore
              h('td', { class: 'pcap-num', text: formatNumber(c.packets, this.locale) }),
              h('td', { class: 'pcap-num', text: formatSize(c.bytes, this.locale) }),
              h('td', { class: 'pcap-num', text: this.seconds(c.first - origin) }),
              h('td', { class: 'pcap-num', text: this.duration(c.last - c.first) }),
            ),
          ),
        ),
      ),
    );
  }

  /**
   * @param {import('./pcap.js').Name[]} names
   * @returns {HTMLElement}
   */
  namesView(names) {
    const t = this.t;
    if (!names.length) return noticeView(t('pcapNoNames'));
    return h(
      'div',
      { class: 'pcap-scroll' },
      h(
        'table',
        { class: 'pcap-table pcap-names', part: 'names' },
        h('thead', {}, h('tr', {}, ...[t('pcapName'), t('pcapSeenIn'), t('pcapResolves'), t('pcapInPackets')].map((c) => h('th', { attrs: { scope: 'col' }, text: c })))), // prettier-ignore
        h(
          'tbody',
          {},
          ...names.map((n) =>
            h(
              'tr',
              {},
              h('th', { attrs: { scope: 'row' } }, h('code', { text: this.dots(n.name) })),
              h('td', { text: n.sources.map((s) => t(/** @type {StringKey} */ (`pcapSeen_${s}`))).join(', ') }), // prettier-ignore
              h('td', {}, h('code', { text: n.addresses.map((a) => (/[a-z]/i.test(a) && !a.includes(':') ? this.dots(a) : a)).join(', ') })), // prettier-ignore
              h('td', { class: 'pcap-num', text: n.packets.slice(0, 12).join(', ') + (n.packets.length > 12 ? ' …' : '') }), // prettier-ignore
            ),
          ),
        ),
      ),
    );
  }
}

/**
 * A class name for a protocol's color.
 *
 * @param {string} protocol
 * @returns {string}
 */
function protoClass(protocol) {
  const p = protocol.toLowerCase();
  if (p === 'dns' || p === 'mdns' || p === 'llmnr') return 'dns';
  if (p === 'tls') return 'tls';
  if (p === 'http') return 'http';
  if (p === 'tcp') return 'tcp';
  if (p === 'udp') return 'udp';
  if (p.startsWith('icmp')) return 'icmp';
  if (p === 'arp') return 'arp';
  return 'other';
}
