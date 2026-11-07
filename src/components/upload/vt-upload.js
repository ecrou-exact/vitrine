// @ts-check
import dataCss from '../../styles/data.css?raw';
import fieldCss from '../../styles/field.css?raw';
import uploadCss from '../../styles/upload.css?raw';
import { parseBoolean, parseInteger } from '../../core/attributes.js';
import { isObject } from '../../core/data.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { isSafeUrl, isSameOrigin } from '../../core/urls.js';
import {
  PREVIEW_MAX,
  PREVIEW_TYPES,
  acceptNames,
  checkFile,
  fileKind,
  formatSize,
  parseAccept,
  parseSize,
} from './files.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** Most files a field holds, even with a larger `max-files`. */
const MAX_FILES = 200;

/**
 * @typedef {object} Entry
 * @property {string} id
 * @property {File} file
 * @property {'ready' | 'waiting' | 'uploading' | 'done' | 'error'} status
 * @property {number} loaded - Bytes sent.
 * @property {string} preview - A `data:` URL of an image, or `''`.
 * @property {unknown} response - What the server answered.
 * @property {XMLHttpRequest | null} request
 */

/** Attributes a JSON value may set, by their JSON names. */
const DATA_KEYS = {
  label: 'label', hint: 'hint', name: 'name', required: 'required', accept: 'accept',
  multiple: 'multiple', maxFiles: 'max-files', maxSize: 'max-size', minSize: 'min-size',
  uploadUrl: 'upload-url', uploadField: 'upload-field', uploadMethod: 'upload-method',
  withCredentials: 'with-credentials', previews: 'previews',
}; // prettier-ignore

/**
 * A field to add files: a zone where files are dropped, a button to choose them, and the list
 * of files with a thumbnail of images, their size and a button to remove them. Files are
 * checked against `accept`, `max-size` and `max-files`, and the ones refused say why.
 *
 * It takes part in `<form>` like `<input type="file">`: the files are submitted under
 * `name`. With `upload-url`, each file is sent as soon as it is added, with its progress, and
 * the form submits what the server answered (an `id` or a `url`) instead of the file.
 *
 * @element vt-upload
 * @since 0.13.0
 *
 * @attr {string} name - Name of the files in the submitted form.
 * @attr {string} label - Label of the field.
 * @attr {string} hint - Help written under the field.
 * @attr {boolean} required - A file must be added; the label shows it.
 * @attr {boolean} disabled - Files cannot be added and are not submitted.
 * @attr {string} accept - Types accepted, as on `<input type="file">`: `image/*,.pdf`.
 * @attr {boolean} multiple - Several files. Without it a new file replaces the one there.
 * @attr {number} max-files - Most files, with `multiple`.
 * @attr {string} max-size - Largest file: `5MB`, `500 KB`, `2 MiB`.
 * @attr {string} min-size - Smallest file.
 * @attr {string} upload-url - Sends each file there as it is added (same origin unless
 *   `allow-remote`).
 * @attr {string} upload-field - Name of the file in the upload request. Default: `file`.
 * @attr {"POST"|"PUT"} upload-method - Method of the upload request. Default: `POST`.
 * @attr {boolean} with-credentials - Sends cookies with uploads to another origin.
 * @attr {boolean} previews - Thumbnails of images (default on; `false` to hide them).
 *
 * @prop {File[]} files - The files added (read-only).
 * @prop {HTMLFormElement | null} form - The form of the field (read-only).
 * @prop {ValidityState} validity - Its validity (read-only).
 * @prop {string} validationMessage - Why it is invalid (read-only).
 *
 * @fires vt-file-add - A file is about to be added (cancelable). Detail: `{ file }`.
 * @fires vt-file-remove - A file was removed. Detail: `{ file }`.
 * @fires vt-change - The files changed. Detail: `{ files }`.
 * @fires vt-upload-start - A file is about to be sent (cancelable); headers can be added
 *   to `request`. Detail: `{ file, request }`.
 * @fires vt-upload-progress - Part of a file was sent. Detail: `{ file, loaded, total }`.
 * @fires vt-upload-done - A file was sent. Detail: `{ file, status, response }`.
 * @fires vt-upload-error - A file could not be sent. Detail: `{ file, status }`.
 * @fires invalid - The form was submitted with this field invalid.
 *
 * @csspart label - The label.
 * @csspart zone - The zone where files are dropped.
 * @csspart browse - The button that chooses files.
 * @csspart list - The list of files.
 * @csspart file - A file.
 * @csspart thumbnail - The thumbnail of an image.
 * @csspart progress - The progress bar of an upload.
 * @csspart hint - The help under the field.
 * @csspart error - The error message.
 *
 * @example
 * <vt-upload name="photos" label="Photos" accept="image/*" multiple max-files="5"
 *            max-size="10MB" hint="JPG or PNG."></vt-upload>
 */
export class VtUpload extends VtDataElement {
  static type = 'upload';

  static formAssociated = true;

  static allowEmpty = true;

  static componentAttributes = Object.freeze([
    'name', 'hint', 'required', 'disabled', 'accept', 'multiple', 'max-files', 'max-size',
    'min-size', 'upload-url', 'upload-field', 'upload-method', 'with-credentials', 'previews',
  ]); // prettier-ignore

  static dataAttributes = Object.freeze([...new Set(Object.values(DATA_KEYS))]);

  static presets = { simple: {}, full: {} };

  static styles = [dataCss, fieldCss, uploadCss];

  /**
   * Settings, as `{ label, accept, maxSize, … }`.
   *
   * @param {unknown} value
   * @returns {import('../../core/data-input.js').DataResult}
   */
  static fromData(value) {
    if (!isObject(value)) return { content: '' };
    /** @type {Record<string, unknown>} */
    const attributes = {};
    for (const [key, name] of Object.entries(DATA_KEYS)) {
      if (!Object.hasOwn(value, key)) continue;
      const v = value[key];
      attributes[name] = Array.isArray(v) ? v.join(',') : v;
    }
    return { content: '', attributes };
  }

  constructor() {
    super();
    this.internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
    this.ids = { label: uid('label'), input: uid('files'), hint: uid('hint'), error: uid('error'), rules: uid('rules'), browse: uid('browse') }; // prettier-ignore
    /** @type {Entry[]} */
    this.entries = [];
    /** @type {{ id: string, text: string }[]} Files refused, with why. */
    this.refused = [];
    this.dragging = 0;
    this.showErrors = false;
    this.formDisabled = false;
    this.customMessage = '';
    this.addEventListener('invalid', (event) => {
      event.preventDefault();
      this.showErrors = true;
      this.refreshState();
      if (this.form?.querySelector(':invalid') === this) this.focus();
    });
  }

  // ---------------------------------------------------------------- state

  /**
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return parseBoolean(this.getAttribute(name)) === true;
  }

  /** @returns {boolean} */
  get disabled() {
    return this.formDisabled || this.has('disabled');
  }

  /** @returns {boolean} */
  get multiple() {
    return this.has('multiple');
  }

  /** @returns {number} */
  get maxFiles() {
    if (!this.multiple) return 1;
    return parseInteger(this.getAttribute('max-files'), { min: 1, max: MAX_FILES, fallback: MAX_FILES }); // prettier-ignore
  }

  /** @returns {import('./files.js').FileRules} */
  get rules() {
    return {
      accept: parseAccept(this.getAttribute('accept')),
      maxSize: parseSize(this.getAttribute('max-size')),
      minSize: parseSize(this.getAttribute('min-size')),
    };
  }

  /** @returns {string} The upload address, when it may be used. */
  get uploadUrl() {
    const url = (this.getAttribute('upload-url') ?? '').trim();
    if (!url || !isSafeUrl(url)) return '';
    try {
      const resolved = new URL(url, document.baseURI);
      if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') return '';
      if (!isSameOrigin(resolved.href) && !this.has('allow-remote')) return '';
      return resolved.href;
    } catch {
      return '';
    }
  }

  /** @type {File[]} */
  get files() {
    return this.entries.map((entry) => entry.file);
  }

  /** @type {HTMLFormElement | null} */
  get form() {
    return this.internals?.form ?? null;
  }

  /** @type {ValidityState | undefined} */
  get validity() {
    return this.internals?.validity;
  }

  /** @type {string} */
  get validationMessage() {
    return this.internals?.validationMessage ?? '';
  }

  /** @returns {boolean} */
  checkValidity() {
    return this.internals?.checkValidity() ?? true;
  }

  /** @returns {boolean} */
  reportValidity() {
    this.showErrors = true;
    this.refreshState();
    return this.internals?.reportValidity() ?? true;
  }

  /** @param {string} message */
  setCustomValidity(message) {
    this.customMessage = String(message ?? '');
    if (this.customMessage) this.showErrors = true;
    this.refreshState();
  }

  /** @param {FocusOptions} [options] */
  focus(options) {
    /** @type {HTMLElement | null} */ (this.root.querySelector('[data-focus-key="browse"]'))?.focus(options); // prettier-ignore
  }

  formResetCallback() {
    for (const entry of this.entries) entry.request?.abort();
    this.entries = [];
    this.refused = [];
    this.showErrors = false;
    this.customMessage = '';
    this.render();
  }

  /** @param {boolean} disabled */
  formDisabledCallback(disabled) {
    this.formDisabled = disabled;
    this.requestRender();
  }

  // ---------------------------------------------------------------- validity

  /** @returns {{ flags: ValidityStateFlags, message: string }} */
  check() {
    const t = this.t;
    if (this.disabled) return { flags: {}, message: '' };
    if (this.customMessage) return { flags: { customError: true }, message: this.customMessage };
    if (this.has('required') && !this.entries.length) return { flags: { valueMissing: true }, message: t('uploadValueMissing') }; // prettier-ignore
    if (this.entries.some((e) => e.status === 'uploading' || e.status === 'waiting')) return { flags: { customError: true }, message: t('uploadPending') }; // prettier-ignore
    if (this.entries.some((e) => e.status === 'error')) return { flags: { customError: true }, message: t('uploadHasErrors') }; // prettier-ignore
    return { flags: {}, message: '' };
  }

  /** Updates the submitted files, the validity and the message, without a render. */
  refreshState() {
    const { flags, message } = this.check();
    if (this.internals) {
      const name = this.getAttribute('name') ?? '';
      /** @type {FormData | null} */
      let value = null;
      if (!this.disabled && this.entries.length) {
        value = new FormData();
        for (const entry of this.entries) {
          const answer = serverValue(entry.response);
          if (entry.status === 'done' && answer) value.append(name, answer);
          else value.append(name, entry.file, entry.file.name);
        }
      }
      this.internals.setFormValue(value);
      const anchor = /** @type {HTMLElement | null} */ (this.root.querySelector('[data-focus-key="browse"]')) ?? undefined; // prettier-ignore
      this.internals.setValidity(flags, message, Object.keys(flags).length ? anchor : undefined);
    }
    const invalid = Boolean(message) && this.showErrors;
    const error = this.root.getElementById(this.ids.error);
    if (error) error.textContent = invalid ? message : '';
    this.root.querySelector('.upload-zone')?.classList.toggle('invalid', invalid);
  }

  // ---------------------------------------------------------------- render

  /** @param {HTMLElement} frame */
  renderContent(frame) {
    const t = this.t;
    const required = this.has('required');
    const hint = this.getAttribute('hint');
    const label = (this.getAttribute('label') ?? '').trim().slice(0, 300);
    frame.append(
      h(
        'div',
        { class: `field upload${this.disabled ? ' disabled' : ''}`, part: 'body' },
        label || required
          ? h(
              'div',
              { class: 'field-top' },
              h(
                'span',
                { class: 'field-label', part: 'label', attrs: { id: this.ids.label } },
                label,
                required ? h('span', { class: 'field-required', text: '*', attrs: { 'aria-hidden': 'true' } }) : null, // prettier-ignore
                required ? h('span', { class: 'sr-only', text: ` (${t('uploadRequired')})` }) : null, // prettier-ignore
              ),
            )
          : null,
        this.zone(),
        hint ? h('p', { class: 'field-hint', part: 'hint', text: hint, attrs: { id: this.ids.hint } }) : null, // prettier-ignore
        h('p', { class: 'field-error', part: 'error', attrs: { id: this.ids.error, 'aria-live': 'polite' } }), // prettier-ignore
        this.refused.length ? this.refusedList() : null,
        this.entries.length ? this.fileList() : null,
      ),
    );
    this.refreshState();
    this.drawProgress();
  }

  /** @returns {HTMLElement} The drop zone, with the hidden file input and its button. */
  zone() {
    const t = this.t;
    const one = !this.multiple;
    const rules = this.rules;
    const facts = [
      rules.accept.length ? t('uploadTypes', { types: acceptNames(rules.accept).join(', ') }) : '', // prettier-ignore
      rules.maxSize ? t('uploadMaxSize', { size: formatSize(rules.maxSize, this.locale) }) : '',
      this.multiple && this.maxFiles < MAX_FILES ? t('uploadMaxFiles', { count: this.maxFiles }) : '', // prettier-ignore
    ].filter(Boolean);
    const input = h('input', {
      class: 'sr-only',
      attrs: {
        id: this.ids.input,
        type: 'file',
        tabindex: '-1',
        'aria-hidden': 'true',
        accept: rules.accept.join(',') || null,
        multiple: this.multiple,
        disabled: this.disabled,
      },
      on: {
        change: () => {
          this.addFiles([...(input.files ?? [])]);
          input.value = '';
        },
      },
    });
    const describedBy = [facts.length ? this.ids.rules : '', this.getAttribute('hint') ? this.ids.hint : '', this.ids.error].filter(Boolean).join(' '); // prettier-ignore
    return h(
      'div',
      {
        class: `upload-zone${this.dragging ? ' dragging' : ''}`,
        part: 'zone',
        on: {
          dragenter: (event) => this.dragEnter(/** @type {DragEvent} */ (event)),
          dragover: (event) => {
            if (!this.disabled && hasFiles(/** @type {DragEvent} */ (event)))
              event.preventDefault();
          },
          dragleave: () => this.dragLeave(),
          drop: (event) => this.dropped(/** @type {DragEvent} */ (event)),
          paste: (event) => {
            const clipboard = /** @type {ClipboardEvent} */ (event).clipboardData;
            const files = [...(clipboard?.files ?? [])];
            if (files.length && !this.disabled) {
              event.preventDefault();
              this.addFiles(files);
            }
          },
          // A click anywhere in the zone chooses files, as most drop zones do.
          click: (event) => {
            if (event.target === event.currentTarget || /** @type {Element} */ (event.target).closest('.upload-prompt, .upload-icon')) input.click(); // prettier-ignore
          },
        },
      },
      input,
      h('span', { class: 'upload-icon' }, icon('upload')),
      h(
        'p',
        { class: 'upload-prompt' },
        h('span', { text: this.dragging ? t('uploadDropNow') : `${t(one ? 'uploadDropOne' : 'uploadDrop')} ` }), // prettier-ignore
        this.dragging
          ? null
          : h('button', {
              class: 'upload-browse',
              part: 'browse',
              text: t(one ? 'uploadBrowseOne' : 'uploadBrowse'),
              attrs: {
                type: 'button',
                id: this.ids.browse,
                disabled: this.disabled,
                'aria-labelledby': this.getAttribute('label') ? `${this.ids.label} ${this.ids.browse}` : null, // prettier-ignore
                'aria-describedby': describedBy,
                'data-focus-key': 'browse',
              },
              on: {
                click: (event) => {
                  event.stopPropagation();
                  input.click();
                },
              },
            }),
      ),
      facts.length
        ? h('p', { class: 'upload-rules', text: facts.join(' · '), attrs: { id: this.ids.rules } }) // prettier-ignore
        : null,
    );
  }

  /** @returns {HTMLElement} */
  fileList() {
    const t = this.t;
    return h(
      'ul',
      {
        class: 'upload-list',
        part: 'list',
        attrs: { 'aria-label': this.entries.length === 1 ? this.entries[0].file.name : t('uploadFileCount', { count: this.entries.length }) }, // prettier-ignore
      },
      ...this.entries.map((entry) => this.fileView(entry)),
    );
  }

  /**
   * @param {Entry} entry
   * @returns {HTMLElement}
   */
  fileView(entry) {
    const t = this.t;
    const { file } = entry;
    const percent = file.size ? Math.min(100, Math.round((entry.loaded / file.size) * 100)) : 0;
    /** @type {Record<Entry['status'], string>} */
    const states = {
      ready: '',
      waiting: t('uploadWaiting'),
      uploading: t('uploadUploading', { percent }),
      done: t('uploadDone'),
      error: t('uploadFailed'),
    };
    const kind = fileKind(file);
    return h(
      'li',
      { class: `upload-file ${entry.status}`, part: 'file', attrs: { 'data-file': entry.id } },
      entry.preview
        ? h('img', { class: 'upload-thumb', part: 'thumbnail', attrs: { src: entry.preview, alt: '' } }) // prettier-ignore
        : h('span', { class: `upload-thumb kind-${kind}` }, icon(kind === 'image' ? 'file-image' : 'file')), // prettier-ignore
      h(
        'span',
        { class: 'upload-info' },
        h('span', { class: 'upload-name', text: file.name, attrs: { title: file.name } }),
        h(
          'span',
          { class: 'upload-meta' },
          formatSize(file.size, this.locale),
          states[entry.status] ? h('span', { class: 'upload-state', text: ` · ${states[entry.status]}` }) : null, // prettier-ignore
        ),
        entry.status === 'uploading' || entry.status === 'waiting'
          ? h(
              'span',
              {
                class: 'upload-progress',
                part: 'progress',
                attrs: { role: 'progressbar', 'aria-label': file.name, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent) }, // prettier-ignore
              },
              h('span', { class: 'upload-bar' }),
            )
          : null,
      ),
      entry.status === 'error' && !this.disabled
        ? h('button', {
            class: 'text-btn',
            text: t('uploadRetry'),
            attrs: { type: 'button', 'data-focus-key': `retry-${entry.id}` },
            on: { click: () => this.send(entry) },
          })
        : null,
      this.disabled
        ? null
        : h(
            'button',
            {
              class: 'field-icon-button',
              attrs: {
                type: 'button',
                'aria-label': t(entry.status === 'uploading' ? 'uploadCancel' : 'uploadRemove', { name: file.name }), // prettier-ignore
                'data-focus-key': `remove-${entry.id}`,
              },
              on: { click: () => this.removeFile(entry.id) },
            },
            icon('close'),
          ),
    );
  }

  /** @returns {HTMLElement} */
  refusedList() {
    return h(
      'ul',
      { class: 'upload-refused' },
      ...this.refused.map((item) =>
        h(
          'li',
          {},
          icon('alert'),
          h('span', { text: item.text }),
          h(
            'button',
            {
              class: 'field-icon-button',
              attrs: { type: 'button', 'aria-label': this.t('uploadDismiss'), 'data-focus-key': `dismiss-${item.id}` }, // prettier-ignore
              on: {
                click: () => {
                  this.refused = this.refused.filter((r) => r !== item);
                  this.render();
                  this.focus();
                },
              },
            },
            icon('close'),
          ),
        ),
      ),
    );
  }

  /** Draws the progress bars without a render, so the focus is not moved at each step. */
  drawProgress() {
    for (const entry of this.entries) {
      const node = this.root.querySelector(`[data-file="${entry.id}"]`);
      if (!node) continue;
      const percent = entry.file.size ? Math.min(100, Math.round((entry.loaded / entry.file.size) * 100)) : 0; // prettier-ignore
      node.querySelector('.upload-progress')?.setAttribute('aria-valuenow', String(percent));
      /** @type {HTMLElement | null} */ (node.querySelector('.upload-bar'))?.style.setProperty('width', `${percent}%`); // prettier-ignore
      const state = node.querySelector('.upload-state');
      if (state && entry.status === 'uploading') state.textContent = ` · ${this.t('uploadUploading', { percent })}`; // prettier-ignore
    }
  }

  // ---------------------------------------------------------------- adding and removing

  /** @param {DragEvent} event */
  dragEnter(event) {
    if (this.disabled || !hasFiles(event)) return;
    event.preventDefault();
    this.dragging += 1;
    if (this.dragging === 1) this.render();
  }

  dragLeave() {
    if (!this.dragging) return;
    this.dragging -= 1;
    if (!this.dragging) this.render();
  }

  /** @param {DragEvent} event */
  dropped(event) {
    if (this.disabled) return;
    event.preventDefault();
    this.dragging = 0;
    this.addFiles([...(event.dataTransfer?.files ?? [])]);
  }

  /**
   * Adds files: each one is checked, can be refused by a `vt-file-add` listener, gets a
   * thumbnail when it is an image, and is sent when there is an `upload-url`.
   *
   * @param {File[]} files
   */
  addFiles(files) {
    if (this.disabled || !files.length) return;
    const t = this.t;
    const rules = this.rules;
    /** @type {Entry[]} */
    const added = [];
    /** @type {string[]} */
    const messages = [];
    const refuse = (/** @type {File} */ file, /** @type {string} */ reason) => {
      const text = t('uploadRefused', { name: file.name, reason });
      this.refused = [...this.refused, { id: uid('refused'), text }].slice(-10);
      messages.push(text);
    };
    const wanted = this.multiple ? files : files.slice(0, 1);
    for (const file of wanted) {
      const why = checkFile(file, rules);
      if (why) {
        refuse(file, t(/** @type {StringKey} */ (`uploadReason_${why}`), { size: formatSize(why === 'tooSmall' ? rules.minSize : rules.maxSize, this.locale) })); // prettier-ignore
        continue;
      }
      const room = this.multiple ? this.maxFiles - this.entries.length - added.length : 1;
      if (room <= 0) {
        refuse(file, t('uploadReason_tooMany', { count: this.maxFiles }));
        continue;
      }
      if (!emit(this, EVENTS.FILE_ADD, { file })) {
        refuse(file, t('uploadReason_refused'));
        continue;
      }
      added.push({ id: uid('file'), file, status: 'ready', loaded: 0, preview: '', response: null, request: null }); // prettier-ignore
    }
    if (added.length) {
      if (!this.multiple) {
        for (const old of this.entries) {
          old.request?.abort();
          emit(this, EVENTS.FILE_REMOVE, { file: old.file });
        }
        this.entries = [];
      }
      this.entries = [...this.entries, ...added];
      messages.unshift(...added.map((entry) => t('uploadAdded', { name: entry.file.name })));
    }
    // Files being sent are not an error yet: the message shows if the form is submitted first.
    this.showErrors = false;
    this.render();
    this.announce(messages.join(' '));
    if (added.length) emit(this, EVENTS.CHANGE, { files: this.files });
    for (const entry of added) {
      this.preview(entry);
      if (this.uploadUrl) this.send(entry);
    }
  }

  /**
   * Removes a file, and stops its upload.
   *
   * @param {string} id
   */
  removeFile(id) {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const [entry] = this.entries.splice(index, 1);
    entry.request?.abort();
    entry.request = null;
    this.render();
    // The focus goes to the next file, else the previous one, else the button.
    const next = this.entries[index] ?? this.entries[index - 1];
    if (next)
      /** @type {HTMLElement | null} */ (this.root.querySelector(`[data-focus-key="remove-${next.id}"]`))?.focus(); // prettier-ignore
    else this.focus();
    this.announce(this.t('uploadRemoved', { name: entry.file.name }));
    emit(this, EVENTS.FILE_REMOVE, { file: entry.file });
    emit(this, EVENTS.CHANGE, { files: this.files });
  }

  /** Removes every file. */
  clear() {
    for (const entry of this.entries) entry.request?.abort();
    const had = this.entries.length;
    this.entries = [];
    this.refused = [];
    this.render();
    if (had) emit(this, EVENTS.CHANGE, { files: [] });
  }

  /** Sends again the files that failed, or that were not sent. */
  upload() {
    for (const entry of this.entries) if (entry.status === 'ready' || entry.status === 'error') this.send(entry); // prettier-ignore
  }

  /**
   * Reads an image into a `data:` URL, the scheme most Content Security Policies allow for
   * images, and shows it.
   *
   * @param {Entry} entry
   */
  preview(entry) {
    if (parseBoolean(this.getAttribute('previews')) === false) return;
    if (!PREVIEW_TYPES.includes(entry.file.type) || entry.file.size > PREVIEW_MAX) return;
    if (typeof FileReader === 'undefined') return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      if (!isSafeUrl(url, { allowDataImage: true }) || !url.startsWith('data:image/')) return;
      if (!this.entries.includes(entry)) return;
      entry.preview = url;
      const node = this.root.querySelector(`[data-file="${entry.id}"] .upload-thumb`);
      if (node) node.replaceWith(h('img', { class: 'upload-thumb', part: 'thumbnail', attrs: { src: url, alt: '' } })); // prettier-ignore
    });
    reader.readAsDataURL(entry.file);
  }

  /**
   * Sends a file to `upload-url`, with its progress.
   *
   * @param {Entry} entry
   */
  send(entry) {
    const url = this.uploadUrl;
    if (!url || this.disabled) return;
    entry.request?.abort();
    const request = new XMLHttpRequest();
    const method = (this.getAttribute('upload-method') ?? 'POST').toUpperCase() === 'PUT' ? 'PUT' : 'POST'; // prettier-ignore
    request.open(method, url);
    request.withCredentials = this.has('with-credentials');
    if (!emit(this, EVENTS.UPLOAD_START, { file: entry.file, request })) return;
    entry.request = request;
    entry.status = 'uploading';
    entry.loaded = 0;
    const done = (/** @type {'done' | 'error'} */ status) => {
      if (entry.request !== request) return;
      entry.request = null;
      entry.status = status;
      if (status === 'done') entry.loaded = entry.file.size;
      this.render();
      if (status === 'done')
        emit(this, EVENTS.UPLOAD_DONE, { file: entry.file, status: request.status, response: entry.response }); // prettier-ignore
      else {
        emit(this, EVENTS.UPLOAD_ERROR, { file: entry.file, status: request.status });
        this.announce(`${entry.file.name}: ${this.t('uploadFailed')}`);
      }
    };
    request.upload.addEventListener('progress', (event) => {
      entry.loaded = event.loaded;
      this.drawProgress();
      emit(this, EVENTS.UPLOAD_PROGRESS, { file: entry.file, loaded: event.loaded, total: event.total || entry.file.size }); // prettier-ignore
    });
    request.addEventListener('load', () => {
      entry.response = readResponse(request.responseText);
      done(request.status >= 200 && request.status < 300 ? 'done' : 'error');
    });
    request.addEventListener('error', () => done('error'));
    request.addEventListener('timeout', () => done('error'));
    const body = new FormData();
    body.append((this.getAttribute('upload-field') ?? '').trim() || 'file', entry.file, entry.file.name); // prettier-ignore
    request.send(method === 'PUT' ? entry.file : body);
    this.render();
  }
}

/**
 * @param {DragEvent} event
 * @returns {boolean} Whether files are dragged (not text or a link).
 */
function hasFiles(event) {
  return [...(event.dataTransfer?.types ?? [])].includes('Files');
}

/**
 * @param {string} text
 * @returns {unknown} JSON when the answer is JSON, else its text.
 */
function readResponse(text) {
  const trimmed = (text ?? '').trim().slice(0, 100_000);
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

/**
 * What the form submits for a file sent: the `id`, else the `url`, else `key`, of the answer.
 *
 * @param {unknown} response
 * @returns {string}
 */
export function serverValue(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return '';
  const record = /** @type {Record<string, unknown>} */ (response);
  for (const key of ['id', 'url', 'key', 'path']) {
    const value = record[key];
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) return String(value).slice(0, 2000); // prettier-ignore
  }
  return '';
}
