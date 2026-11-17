// @ts-check
import hashCss from '../../styles/hash.css?raw';
import { parseBoolean, parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { hashFromData } from '../../core/data-formats.js';
import { append, h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { formatSize } from '../upload/files.js';
import { en as strings, fr as stringsFr } from './strings.js';
import {
  NAMES,
  WEAK,
  canDigest,
  digestAll,
  formatDigest,
  parseAlgorithms,
  toHex,
  verify,
} from './hash.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./hash.js').Algorithm} Algorithm */
/** @typedef {import('./hash.js').Format} Format */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */
/** @typedef {Partial<Record<Algorithm, Uint8Array | null>>} Digests */

/** Largest file hashed (bytes): it is read in memory. */
export const MAX_FILE = 256 * 1024 * 1024;

/** @type {readonly Format[]} */
const FORMATS = Object.freeze(['hex', 'upper', 'base64', 'sri']);

/**
 * Hashes a text or a file in the page: MD5, SHA-1, SHA-256, SHA-384 and SHA-512, as hex,
 * base64 or Subresource Integrity values, and compares them with a fingerprint (hex, base64,
 * `sha384-…`, `sha256:…`, a `sha256sum` or BSD line). The text is the content of the element;
 * a file can be dropped or chosen. Nothing is sent: files are read in memory.
 *
 * @element vt-hash
 * @since 0.15.0
 *
 * @attr {string} algorithms - Algorithms computed, separated by spaces (`sha256 sha512`). Default: all five.
 * @attr {"hex" | "upper" | "base64" | "sri"} format - How hashes are written. Default: hex.
 * @attr {string} expected - A fingerprint to compare with.
 * @attr {boolean} file - A zone to drop or choose a file. Default: on.
 * @attr {boolean} compare - The field to compare with a fingerprint. Default: on.
 *
 * @prop {string} content - The text hashed (UTF-8).
 * @prop {File | null} file - The file hashed instead of the text; `null` goes back to the text.
 * @prop {Partial<Record<Algorithm, string>> | null} hashes - Hex hashes once computed (read-only).
 *
 * @fires vt-ready - Rendered. Detail: `{ type: "hash" }`.
 * @fires vt-hash - Hashes computed. Detail: `{ source, name, size, hashes }` (`hashes` in hex).
 * @fires vt-verify - A fingerprint compared. Detail: `{ state, algorithm }` (`match`, `mismatch`, `invalid`, `unknown`).
 * @fires vt-copy - A hash copied. Detail: `{ text }`.
 * @fires vt-error - Content too large or loading failure. Detail: `{ message, cause }`.
 *
 * @csspart source - What is hashed: the text or the file.
 * @csspart zone - The zone where a file is dropped.
 * @csspart hashes - The table of hashes.
 * @csspart value - A hash value.
 * @csspart compare - The comparison field and its result.
 * @csspart result - The comparison result.
 *
 * @example
 * <vt-hash variant="full" expected="sha256:…">Hello</vt-hash>
 */
export class VtHash extends VtBase {
  static type = 'hash';

  static componentAttributes = Object.freeze(['algorithms', 'format', 'expected', 'file', 'compare']); // prettier-ignore

  static presets = {
    simple: { 'edit-toggle': true },
    full: { header: true, dot: true, copy: true, fullscreen: true, 'edit-toggle': true },
  };

  static styles = [hashCss];

  static allowEmpty = true;

  static dataAttributes = Object.freeze(['expected', 'algorithms']);

  static fromData = hashFromData;

  static upgradeProperties = ['content', 'file'];

  constructor() {
    super();
    this.panelId = uid('panel');
    this.ids = { compare: uid('compare'), result: uid('result'), format: uid('format') };
    /** @type {File | null} */
    this._file = null;
    /** @type {Uint8Array | null} */
    this.fileBytes = null;
    /** @type {string} Error about the file, shown in the source line. */
    this.fileError = '';
    /** @type {Digests | null} */
    this.digests = null;
    /** @type {unknown} What the digests are of. */
    this.digestKey = null;
    /** @type {unknown} What is being hashed. */
    this.pendingKey = null;
    /** @type {string | null} Typed fingerprint; `null` follows `expected`. */
    this.expectedState = null;
    /** @type {Format | null} */
    this.formatState = null;
    this.dragging = 0;
    /** Counts the files set, so that hashes of an earlier file are not shown. */
    this.fileId = 0;
    /** @type {string} The last comparison dispatched with `vt-verify`. */
    this.lastVerify = '';
    /** @type {HTMLElement | null} */
    this.resultsHost = null;
    /** @type {HTMLElement | null} */
    this.verifyHost = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.hashTimer = undefined;
  }

  /** @type {File | null} */
  get file() {
    return this._file;
  }

  set file(value) {
    this.setFile(value instanceof Blob ? /** @type {File} */ (value) : null);
  }

  /** @type {Partial<Record<Algorithm, string>> | null} */
  get hashes() {
    if (!this.digests) return null;
    /** @type {Partial<Record<Algorithm, string>>} */
    const out = {};
    for (const [algorithm, bytes] of Object.entries(this.digests)) if (bytes) out[/** @type {Algorithm} */ (algorithm)] = toHex(bytes); // prettier-ignore
    return out;
  }

  get algorithms() {
    return parseAlgorithms(this.getAttribute('algorithms'));
  }

  /** @type {Format} */
  get format() {
    return this.formatState ?? parseEnum(this.getAttribute('format'), FORMATS, 'hex');
  }

  get expected() {
    return this.expectedState ?? this.getAttribute('expected') ?? '';
  }

  /**
   * @param {string} name
   * @param {boolean} fallback
   */
  flag(name, fallback) {
    return parseBoolean(this.getAttribute(name)) ?? fallback;
  }

  /** @returns {{ key: unknown, bytes: Uint8Array | null }} What is hashed now. */
  source() {
    const algorithms = this.algorithms.join();
    if (this._file) return { key: `file:${this.fileId}:${algorithms}`, bytes: this.fileBytes };
    const text = this.text ?? '';
    return { key: `text:${algorithms}\u0000${text}`, bytes: new TextEncoder().encode(text) };
  }

  /**
   * @param {File | null} file
   */
  async setFile(file) {
    this.fileId += 1;
    this._file = file;
    this.fileBytes = null;
    this.fileError = '';
    this.digests = null;
    this.digestKey = null;
    if (file && file.size > MAX_FILE) {
      this.fileError = this.t('hashTooLarge', { size: formatSize(file.size, this.locale), limit: formatSize(MAX_FILE, this.locale) }); // prettier-ignore
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
      this.fileError = this.t('hashReadFailed');
      this._file = null;
    }
    this.requestRender();
  }

  /** Computes the hashes when what is hashed changed, then refreshes the results. */
  computeIfNeeded() {
    const { key, bytes } = this.source();
    if (!bytes || key === this.digestKey || key === this.pendingKey) return;
    this.pendingKey = key;
    const algorithms = this.algorithms;
    digestAll(bytes, algorithms).then(
      (digests) => {
        if (this.pendingKey !== key) return;
        this.pendingKey = null;
        this.digests = digests;
        this.digestKey = key;
        this.refreshResults();
        const file = this._file;
        emit(this, EVENTS.HASH, { source: file ? 'file' : 'text', name: file?.name ?? '', size: bytes.length, hashes: this.hashes }); // prettier-ignore
      },
      () => {
        if (this.pendingKey === key) this.pendingKey = null;
      },
    );
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const body = h('div', {
      class: `body hash-body${this.dragging ? ' dragging' : ''}`,
      part: 'body',
      on: this.flag('file', true) ? this.dropHandlers() : {},
    });
    this.resultsHost = h('div', { class: 'hash-results', attrs: { 'aria-live': 'polite' } });
    this.verifyHost = h('p', { class: 'hash-result', part: 'result', attrs: { id: this.ids.result, 'aria-live': 'polite' } }); // prettier-ignore
    append(body, [
      this.sourceView(),
      this.flag('file', true) ? this.zoneView() : null,
      this.formatView(),
      this.resultsHost,
      this.flag('compare', true) ? this.compareView() : null,
    ]);
    this.refreshResults();

    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing && !this._file) {
      const editor = this.createEditor();
      panel.classList.add('hash-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source-text' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const actions = [
      ...history,
      this._file ? null : this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('copy') ? this.copyTextButton(() => this.allText(), t('hashCopyAll'), 'copy-all') : null, // prettier-ignore
    ];
    frame.append(...this.chrome({ badge: this._file ? t('hashFile') : t('hashTextBadge'), actions }), panel); // prettier-ignore
    this.editor?.align();
    this.computeIfNeeded();
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

  /** @returns {HTMLElement} */
  sourceView() {
    const t = this.t;
    const file = this._file;
    if (file)
      return h(
        'div',
        { class: 'hash-source', part: 'source' },
        icon('file'),
        h('span', { class: 'hash-name', text: file.name || t('hashFile') }),
        h('span', { class: 'hash-muted', text: [formatSize(file.size, this.locale), file.type].filter(Boolean).join(' · ') }), // prettier-ignore
        h('button', { class: 'text-btn', text: t('hashBackToText'), attrs: { type: 'button', 'data-focus-key': 'back' }, on: { click: () => this.setFile(null) } }), // prettier-ignore
      );
    const size = new TextEncoder().encode(this.text ?? '').length;
    return h(
      'div',
      { class: 'hash-source', part: 'source' },
      icon('file-text'),
      h('span', { text: this.text ? t('hashText', { size: formatSize(size, this.locale) }) : t('hashPrompt') }), // prettier-ignore
      this.fileError ? h('span', { class: 'hash-error', attrs: { role: 'alert' }, text: this.fileError }) : null, // prettier-ignore
    );
  }

  /** @returns {HTMLElement} */
  zoneView() {
    const t = this.t;
    const input = h('input', {
      class: 'sr-only',
      attrs: { type: 'file', tabindex: '-1', 'aria-hidden': 'true' },
      on: {
        change: () => {
          const file = input.files?.[0];
          if (file) this.setFile(file);
          input.value = '';
        },
      },
    });
    return h(
      'div',
      { class: 'hash-zone', part: 'zone' },
      input,
      icon('upload'),
      h('span', { text: this.dragging ? t('hashDropNow') : `${t('hashDrop')} ` }),
      this.dragging
        ? null
        : h('button', { class: 'text-btn', text: t('hashChoose'), attrs: { type: 'button', 'data-focus-key': 'choose' }, on: { click: () => input.click() } }), // prettier-ignore
      h('span', { class: 'hash-muted hash-note', text: t('hashFileNote') }),
    );
  }

  /** @returns {HTMLElement} */
  formatView() {
    const t = this.t;
    const select = h(
      'select',
      {
        attrs: { id: this.ids.format, 'data-focus-key': 'format' },
        on: {
          change: () => {
            this.formatState = /** @type {Format} */ (select.value);
            this.refreshResults();
          },
        },
      },
      ...FORMATS.map((f) => h('option', { text: t(/** @type {StringKey} */ (`hashFormat_${f}`)), attrs: { value: f, selected: f === this.format } })), // prettier-ignore
    );
    return h('div', { class: 'hash-format' }, h('label', { attrs: { for: this.ids.format }, text: t('hashFormat') }), select); // prettier-ignore
  }

  /** @returns {HTMLElement} */
  compareView() {
    const t = this.t;
    const input = h('input', {
      class: 'hash-input',
      attrs: {
        id: this.ids.compare,
        type: 'text',
        value: this.expected,
        spellcheck: 'false',
        autocomplete: 'off',
        placeholder: t('hashComparePlaceholder'),
        'aria-describedby': this.ids.result,
        'data-focus-key': 'compare',
      },
      on: {
        input: () => {
          this.expectedState = input.value;
          this.refreshVerify(true);
        },
      },
    });
    return h(
      'div',
      { class: 'hash-compare', part: 'compare' },
      h('label', { attrs: { for: this.ids.compare }, text: t('hashCompare') }),
      input,
      this.verifyHost,
    );
  }

  /** Rebuilds the table of hashes and the comparison result. */
  refreshResults() {
    const host = this.resultsHost;
    if (!host) return;
    const t = this.t;
    const { bytes } = this.source();
    if (!bytes || (!this._file && !this.text && !this.editing)) {
      host.replaceChildren();
      this.refreshVerify(false);
      return;
    }
    const digests = this.digestKey === this.source().key ? this.digests : null;
    const format = this.format;
    const rows = this.algorithms.map((algorithm) => {
      const value = digests?.[algorithm];
      const text = value ? formatDigest(algorithm, value, format) : '';
      const unavailable = digests && !value;
      return h(
        'tr',
        { attrs: { 'data-algorithm': algorithm } },
        h(
          'th',
          { attrs: { scope: 'row' } },
          h('span', { text: NAMES[algorithm] }),
          WEAK.has(algorithm) ? h('span', { class: 'hash-tag', attrs: { title: t('hashWeakHint') }, text: t('hashWeak') }) : null, // prettier-ignore
        ),
        h('td', {}, h('code', { class: 'hash-value', part: 'value', text: text || (unavailable ? t('hashUnavailable') : t('hashComputing')) })), // prettier-ignore
        h('td', { class: 'hash-copy' }, text ? this.copyButton(() => text, t('hashCopyOne', { algorithm: NAMES[algorithm] }), `copy-${algorithm}`) : null), // prettier-ignore
      );
    });
    host.replaceChildren();
    append(host, [
      h(
        'div',
        { class: 'hash-scroll' },
        h(
          'table',
          { class: 'hash-table', part: 'hashes', attrs: { 'aria-label': t('hashTable') } },
          h('tbody', {}, ...rows),
        ),
      ),
      !canDigest() ? h('p', { class: 'hash-muted', text: t('hashNoCrypto') }) : null,
    ]);
    this.refreshVerify(false);
  }

  /**
   * @param {boolean} typed - The user typed: dispatch `vt-verify`.
   */
  refreshVerify(typed) {
    const host = this.verifyHost;
    if (!host) return;
    const t = this.t;
    const digests = this.digests && this.digestKey === this.source().key ? this.digests : null;
    const result = verify(this.expected, digests ?? {});
    host.className = `hash-result ${result.state}`;
    const name = result.algorithm ? NAMES[result.algorithm] : '';
    /** @type {Record<string, [string, StringKey]>} */
    const views = {
      match: ['check', 'hashMatch'],
      mismatch: ['alert', 'hashMismatch'],
      invalid: ['alert', 'hashInvalid'],
      unknown: ['help', 'hashUnknown'],
    };
    const view = digests || result.state === 'invalid' ? views[result.state] : undefined;
    host.replaceChildren(...(view ? [icon(view[0]), h('span', { text: t(view[1], { algorithm: name }) })] : [])); // prettier-ignore
    const signature = view ? `${result.state}:${result.algorithm}:${this.expected}` : '';
    if (view && (typed || signature !== this.lastVerify)) emit(this, EVENTS.VERIFY, { state: result.state, algorithm: result.algorithm ?? null }); // prettier-ignore
    this.lastVerify = signature;
  }

  /** @returns {string} Every hash, one line each, in the BSD form `SHA256 (name) = …`. */
  allText() {
    const name = this._file?.name || '-';
    const digests = this.digests ?? {};
    return this.algorithms
      .filter((a) => digests[a])
      .map(
        (a) =>
          `${NAMES[a].replace('-', '')} (${name}) = ${formatDigest(a, /** @type {Uint8Array} */ (digests[a]), this.format)}`,
      ) // prettier-ignore
      .join('\n');
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'plaintext',
      lineNumbers: false,
      wrap: true,
      highlightLimit: getConfig().highlightLimit,
      label: this.heading || this.t('editor'),
      placeholder: this.getAttribute('placeholder') ?? this.t('hashPlaceholder'),
      onInput: (text) => this.edited(text),
      onChange: (text) => emit(this, EVENTS.CHANGE, { value: text }),
      history: this.editHistory ?? undefined,
    });
    return this.editor;
  }

  contentEdited() {
    clearTimeout(this.hashTimer);
    this.hashTimer = setTimeout(() => {
      const source = this.root.querySelector('[part="source"]');
      source?.replaceWith(this.sourceView());
      this.refreshResults();
      this.computeIfNeeded();
    }, 150);
  }
}
