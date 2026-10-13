// @ts-check
import { defineStrings } from '../../core/i18n.js';
import { en as strings, fr as stringsFr } from './strings.js';
import hexCss from '../../styles/hex.css?raw';
import { parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { deferChunk, fillChunk } from '../../core/chunks.js';
import { getConfig } from '../../core/config.js';
import { isAbortError } from '../../core/content.js';
import { h } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { MAX_MATCHES, MAX_QUERY_LENGTH } from '../../core/search.js';
import { iconButton, noticeView } from '../../core/ui.js';
import {
  asciiChar,
  byteClass,
  decodeText,
  detectType,
  findBytes,
  formatBase64,
  formatHex,
  queryBytes,
  toHex,
} from './bytes.js';
import { fetchBytes } from './fetch-bytes.js';

defineStrings({ en: strings, fr: stringsFr });

const FORMATS = /** @type {const} */ (['auto', 'hex', 'base64']);
/** Rows built at once; longer dumps are built in blocks as they scroll into view. */
const CHUNK_ROWS = 128;

/**
 * Displays binary data as a hex dump: offsets, bytes in hex and their ASCII characters,
 * colored by kind, with the file type read from its first bytes.
 *
 * Bytes come from `src` (fetched as binary with the usual origin and size rules), from
 * the `bytes` property, or from hex or base64 text written inside the element or set as
 * `content`. Hovering or selecting a byte highlights it in both columns. Arrow keys move
 * between bytes. The search finds hex sequences (`de ad be ef`) or text (`"PK"`).
 *
 * @element vt-hex
 * @since 0.9.0
 *
 * @attr {number} columns - Bytes per row (default 16, 1 to 64).
 * @attr {number} group - Bytes per group inside a row (default 8, 0: no groups).
 * @attr {"auto"|"hex"|"base64"} format - How the text content is read (default `auto`).
 * @attr {boolean} ascii - ASCII column (default on).
 * @attr {boolean} uppercase - Hex digits in capitals.
 * @attr {number} offset - Offset of the first byte, for dumps of a part of a file (default 0).
 *
 * @prop {Uint8Array} bytes - The displayed bytes. Setting it overrides `src` and `content`.
 * @prop {{ name: string, mime: string } | null} fileType - Type detected from magic bytes (read-only).
 *
 * @fires vt-select - A byte was selected. Detail: `{ offset, value }`.
 *
 * @cssprop --vt-hex-null - Color of null bytes.
 * @cssprop --vt-hex-control - Color of control bytes.
 * @cssprop --vt-hex-high - Color of bytes above 0x7f.
 *
 * @csspart dump - The grid of rows.
 * @csspart offset - An offset cell.
 * @csspart hex - The hex cells of a row.
 * @csspart ascii - The ASCII cells of a row.
 *
 * @example
 * <vt-hex variant="full" src="/samples/logo.png"></vt-hex>
 */
export class VtHex extends VtBase {
  static type = 'hex';

  static componentAttributes = Object.freeze([
    'columns', 'group', 'format', 'ascii', 'uppercase', 'offset',
  ]); // prettier-ignore

  static presets = {
    simple: { ascii: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      ascii: true,
    },
  }; // prettier-ignore

  static styles = [hexCss];

  static allowEmpty = true;

  static upgradeProperties = ['content', 'bytes'];

  constructor() {
    super();
    /** @type {Uint8Array | undefined} Bytes set with the `bytes` property. */
    this._bytes = undefined;
    /** @type {Uint8Array | null} Bytes fetched from `src`. */
    this.fetched = null;
    /** @type {Uint8Array} */
    this.data = new Uint8Array(0);
    /** @type {string | null} */
    this.decodeError = null;
    this.cursor = -1;
    /** @type {number[]} */
    this.hits = [];
    this.matchLength = 0;
    /** @type {HTMLElement | null} */
    this.dump = null;
    /** @type {HTMLElement[]} */
    this.chunks = [];
  }

  /** @type {Uint8Array} */
  get bytes() {
    return this.data.slice();
  }

  set bytes(value) {
    this._bytes = value == null ? undefined : new Uint8Array(value);
    if (this._connected) this.reload();
  }

  get fileType() {
    return detectType(this.data);
  }

  /** Cancels a request still running (the base class keeps its controller). */
  cancelFetch() {
    /** @type {AbortController | null} */ (/** @type {any} */ (this)._abort)?.abort();
  }

  /** Bytes from the `bytes` property or `src`; text sources go through the base class. */
  reload() {
    const src = this.getAttribute('src');
    this.fetched = null;
    if (this._bytes || this._content !== undefined || !src?.trim()) {
      if (this._bytes) {
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
        this.setText('');
      },
      (error) => token === this._loadToken && !isAbortError(error) && this.setError(error),
    );
  }

  contentChanged() {
    this.decodeError = null;
    this.cursor = -1;
    this.hits = [];
    if (this._bytes) this.data = this._bytes;
    else if (this.fetched) this.data = this.fetched;
    else {
      try {
        this.data = decodeText(
          this.text ?? '',
          parseEnum(this.getAttribute('format'), FORMATS, 'auto'),
        );
      } catch (error) {
        this.data = new Uint8Array(0);
        this.decodeError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  /** @param {string} name @param {string | null} oldValue @param {string | null} newValue */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'format' && oldValue !== newValue) this.contentChanged();
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  get columns() {
    return parseInteger(this.getAttribute('columns'), { min: 1, max: 64, fallback: 16 });
  }

  get base() {
    return parseInteger(this.getAttribute('offset'), { min: 0, max: 2 ** 48, fallback: 0 });
  }

  /** @param {number} value */
  hex(value, width = 2) {
    const text = toHex(value, width);
    return this.hasAttribute('uppercase') && parseBoolean(this.getAttribute('uppercase')) !== false
      ? text.toUpperCase()
      : text;
  }

  // ------------------------------------------------------------------ rendering

  /** @param {HTMLElement} frame */
  renderContent(frame) {
    const t = this.t;
    const data = this.data;
    const body = h('div', {
      class: 'body hex-body',
      part: 'body',
      attrs: { tabindex: '-1' },
    });
    if (this.decodeError) body.append(noticeView(t('hexInvalid', { message: this.decodeError })));
    else if (!data.length)
      body.append(h('div', { class: 'empty', part: 'empty', text: t('empty') }));
    else body.append(this.buildDump());

    const type = detectType(data);
    const size = t('hexSize', { size: formatNumber(data.length, this.locale) });
    const actions = [
      this.searchButton(this.searchTarget()),
      this.fullscreenButton(),
      this.feature('download') && data.length ? this.binaryDownload(type?.mime) : null,
      this.feature('copy') && data.length
        ? this.copyButton(() => formatBase64(this.data), t('hexCopyBase64'), 'copy-base64')
        : null,
      this.feature('copy') && data.length
        ? this.copyButton(() => formatHex(this.data, this.columns), t('hexCopyHex'))
        : null,
    ];
    frame.append(...this.chrome({ badge: type ? `${type.name} · ${size}` : size, actions }), body);
  }

  /** @returns {HTMLElement} */
  buildDump() {
    const data = this.data;
    const columns = this.columns;
    const rows = Math.ceil(data.length / columns);
    const digits = Math.max(8, toHex(this.base + data.length).length);
    const ascii = parseBoolean(this.getAttribute('ascii')) !== false;
    const dump = h('div', {
      class: `dump${ascii ? '' : ' no-ascii'}`,
      part: 'dump',
      attrs: {
        role: 'grid',
        tabindex: '0',
        'aria-label': this.t('hexLabel'),
        'aria-rowcount': String(rows),
        'data-focus-key': 'dump',
      },
    });
    dump.style.setProperty('--_columns', String(columns));
    dump.style.setProperty('--_digits', String(digits));
    this.dump = dump;
    this.chunks = [];
    for (let start = 0; start < rows; start += CHUNK_ROWS) {
      const end = Math.min(rows, start + CHUNK_ROWS);
      const chunk = h('div', { class: 'chunk', attrs: { role: 'rowgroup' } });
      chunk.style.setProperty('--_rows', String(end - start));
      this.chunks.push(chunk);
      dump.append(chunk);
      const fill = () => {
        for (let row = start; row < end; row += 1) chunk.append(this.buildRow(row, digits, ascii));
        chunk.classList.add('filled');
        this.paintMarks(start * columns, end * columns);
      };
      if (rows > CHUNK_ROWS) deferChunk(chunk, fill);
      else fill();
    }
    dump.addEventListener('pointerover', (event) => this.hover(event));
    dump.addEventListener('pointerleave', () => this.hover(null));
    dump.addEventListener('click', (event) => {
      const offset = byteOf(event.target);
      if (offset >= 0) this.select(offset);
    });
    dump.addEventListener('keydown', (event) => this.onKey(event));
    dump.addEventListener('focus', () => {
      if (this.cursor < 0 && this.data.length) this.select(0, false);
    });
    return dump;
  }

  /**
   * @param {number} row
   * @param {number} digits
   * @param {boolean} ascii
   * @returns {HTMLElement}
   */
  buildRow(row, digits, ascii) {
    const columns = this.columns;
    const group = parseInteger(this.getAttribute('group'), { min: 0, max: 64, fallback: 8 });
    const start = row * columns;
    const end = Math.min(this.data.length, start + columns);
    const hexCells = h('span', { class: 'hex', part: 'hex', attrs: { role: 'gridcell' } });
    const asciiCells = ascii
      ? h('span', { class: 'ascii', part: 'ascii', attrs: { role: 'gridcell' } })
      : null;
    for (let i = start; i < end; i += 1) {
      const value = this.data[i];
      const kind = byteClass(value);
      const cell = h('span', { class: `b ${kind}`, text: this.hex(value) });
      cell.dataset.i = String(i);
      if (group && i > start && (i - start) % group === 0) cell.classList.add('group');
      hexCells.append(cell);
      if (asciiCells) {
        const char = h('span', { class: `c ${kind}`, text: asciiChar(value) });
        char.dataset.i = String(i);
        asciiCells.append(char);
      }
    }
    return h(
      'div',
      { class: 'row', attrs: { role: 'row', 'aria-rowindex': String(row + 1) } },
      h('span', {
        class: 'offset',
        part: 'offset',
        text: this.hex(this.base + start, digits),
        attrs: { role: 'rowheader' },
      }),
      hexCells,
      asciiCells,
    );
  }

  /**
   * Cells of a byte in both columns (filling its block first).
   *
   * @param {number} offset
   * @returns {Element[]}
   */
  cells(offset) {
    const chunk = this.chunks[Math.floor(offset / this.columns / CHUNK_ROWS)];
    if (!chunk) return [];
    fillChunk(chunk);
    return [...chunk.querySelectorAll(`[data-i="${offset}"]`)];
  }

  /** @param {PointerEvent | null} event */
  hover(event) {
    for (const cell of this.dump?.querySelectorAll('.pair') ?? []) cell.classList.remove('pair');
    const offset = event ? byteOf(event.target) : -1;
    if (offset >= 0) for (const cell of this.cells(offset)) cell.classList.add('pair');
  }

  /**
   * @param {number} offset
   * @param {boolean} [notify]
   */
  select(offset, notify = true) {
    if (!this.dump || offset < 0 || offset >= this.data.length) return;
    for (const cell of this.dump.querySelectorAll('.selected')) cell.classList.remove('selected');
    this.cursor = offset;
    const cells = this.cells(offset);
    for (const cell of cells) cell.classList.add('selected');
    cells[0]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const value = this.data[offset];
    this.announce(
      this.t('hexByte', {
        offset: this.hex(this.base + offset, 1),
        value: this.hex(value),
        char: asciiChar(value),
      }),
    );
    if (notify) emit(this, EVENTS.SELECT, { offset: this.base + offset, value });
  }

  /** @param {KeyboardEvent} event */
  onKey(event) {
    if (this.cursor < 0) return;
    const columns = this.columns;
    const page = columns * 16;
    /** @type {Record<string, number>} */
    const moves = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns,
      ArrowUp: -columns,
      PageDown: page,
      PageUp: -page,
    };
    let next = this.cursor;
    if (event.key in moves) next += moves[event.key];
    else if (event.key === 'Home') next = event.ctrlKey ? 0 : next - (next % columns);
    else if (event.key === 'End')
      next = event.ctrlKey ? this.data.length - 1 : next - (next % columns) + columns - 1;
    else return;
    event.preventDefault();
    this.select(Math.max(0, Math.min(this.data.length - 1, next)));
  }

  // ------------------------------------------------------------------ search

  searchTarget() {
    return {
      /** @param {string} query */
      run: (query) => {
        const needle = queryBytes(query.slice(0, MAX_QUERY_LENGTH).trim());
        const text = !/^(?:[0-9a-fA-F]{2}|[\s,]|0x)+$/i.test(query.trim());
        this.hits = findBytes(this.data, needle, { limit: MAX_MATCHES, ignoreCase: text });
        this.matchLength = needle.length;
        this.repaintMarks();
        return { total: this.hits.length, capped: this.hits.length >= MAX_MATCHES };
      },
      /** @param {number} index */
      go: (index) => {
        for (const cell of this.dump?.querySelectorAll('.current') ?? [])
          cell.classList.remove('current');
        const start = this.hits[index];
        if (start === undefined) return;
        for (let i = start; i < start + this.matchLength; i += 1)
          for (const cell of this.cells(i)) cell.classList.add('current');
        this.cells(start)[0]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      },
      clear: () => {
        this.hits = [];
        this.repaintMarks();
      },
    };
  }

  repaintMarks() {
    for (const cell of this.dump?.querySelectorAll('.match, .current') ?? [])
      cell.classList.remove('match', 'current');
    this.paintMarks(0, this.data.length);
  }

  /**
   * Marks matches between two offsets, in blocks already built.
   *
   * @param {number} from
   * @param {number} to
   */
  paintMarks(from, to) {
    if (!this.dump) return;
    for (const start of this.hits) {
      if (start + this.matchLength <= from || start >= to) continue;
      for (let i = Math.max(start, from); i < Math.min(start + this.matchLength, to); i += 1) {
        for (const cell of this.dump.querySelectorAll(`.filled [data-i="${i}"]`))
          cell.classList.add('match');
      }
    }
  }

  // ------------------------------------------------------------------ actions

  /**
   * @param {string | undefined} mime
   * @returns {HTMLButtonElement}
   */
  binaryDownload(mime) {
    return iconButton({
      icon: 'download',
      label: this.t('download'),
      key: 'download',
      part: 'download-button',
      onClick: () => {
        const blob = new Blob([this.data.slice()], { type: mime ?? 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = h('a', {
          attrs: { href: url, download: this.downloadName('data.bin'), rel: 'noopener' },
        });
        link.style.display = 'none';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
    });
  }
}

/**
 * @param {EventTarget | null} target
 * @returns {number} The offset of the byte cell, or -1.
 */
function byteOf(target) {
  return target instanceof HTMLElement && target.dataset.i !== undefined
    ? Number(target.dataset.i)
    : -1;
}
