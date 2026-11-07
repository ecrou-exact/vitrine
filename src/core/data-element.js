// @ts-check
/**
 * Base class of the elements that render a preview from a text source (JSON, iCalendar):
 * an optional editor above the preview, a fixed "now" for tests and documentation, and
 * dates in the language of the interface.
 *
 * @module core/data-element
 */
import { parseBoolean } from './attributes.js';
import { VtBase } from './base-element.js';
import { getConfig } from './config.js';
import { h } from './dom.js';
import { CodeEditor } from './editor.js';
import { EVENTS, emit } from './events.js';
import { noticeView } from './ui.js';

/** Delay before an edited text updates the preview, in milliseconds. */
const PREVIEW_DELAY = 200;

/** @type {[Intl.RelativeTimeFormatUnit, number][]} */
const UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

/**
 * Abstract element rendering a preview of its text.
 */
export class VtDataElement extends VtBase {
  /** Language of the editor. */
  static editorLanguage = 'json';

  constructor() {
    super();
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  /** @returns {number} The `now` attribute (ISO 8601 or seconds), else the current time. */
  get now() {
    const value = this.getAttribute('now')?.trim();
    if (value) {
      const time = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value);
      if (Math.abs(time) <= 8.64e15) return time;
    }
    return Date.now();
  }

  /**
   * A boolean attribute that is on unless set to false.
   *
   * @param {string} name
   * @returns {boolean}
   */
  flag(name) {
    return parseBoolean(this.getAttribute(name)) !== false;
  }

  /**
   * "in 3 hours", "2 days ago", relative to `now`.
   *
   * @param {number} time
   * @returns {string}
   */
  relativeTime(time) {
    const seconds = Math.round((time - this.now) / 1000);
    const [unit, size] = UNITS.find(([, size]) => Math.abs(seconds) >= size) ?? ['second', 1];
    const value = Math.round(seconds / size);
    try {
      return new Intl.RelativeTimeFormat(this.locale, { numeric: 'auto' }).format(value, unit);
    } catch {
      return `${value} ${unit}`;
    }
  }

  /**
   * @param {number} time
   * @param {Intl.DateTimeFormatOptions} [options]
   * @returns {string}
   */
  formatDate(time, options = { dateStyle: 'medium', timeStyle: 'short' }) {
    try {
      return new Intl.DateTimeFormat(this.locale, options).format(time);
    } catch {
      return new Date(time).toISOString();
    }
  }

  /**
   * The panel holding the preview, under an editor in edit mode.
   *
   * @param {HTMLElement} body - The preview.
   * @param {string} panelId
   * @returns {{ panel: HTMLElement, history: HTMLButtonElement[] }}
   */
  previewPanel(body, panelId) {
    const panel = h('div', { class: 'panel', attrs: { id: panelId } });
    if (!this.editing) {
      panel.append(body);
      return { panel, history: [] };
    }
    const editor = this.createEditor();
    panel.classList.add('data-edit');
    panel.append(
      h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
      body,
    );
    return { panel, history: this.historyButtons(editor) };
  }

  /**
   * Puts the header and the preview in the frame, with the usual actions.
   *
   * @param {HTMLElement} frame
   * @param {HTMLElement} body
   * @param {string} panelId
   * @param {{ file: string, download?: boolean, badge?: string }} options
   */
  frameWith(frame, body, panelId, { file, download = true, badge = 'JSON' }) {
    const { panel, history } = this.previewPanel(body, panelId);
    frame.append(
      ...this.chrome({
        badge,
        actions: [
          ...history,
          this.editToggleButton(),
          this.fullscreenButton(),
          download && this.feature('download')
            ? this.downloadButton(
                () => this.text ?? '',
                this.downloadName(file),
                'application/json',
              )
            : null,
          this.feature('copy') ? this.copyButton(() => this.text ?? '') : null,
        ],
      }),
      panel,
    );
    this.editor?.align();
  }

  /**
   * Why JSON could not be read.
   *
   * @param {{ error: 'json' | 'shape', message: string }} result
   * @returns {HTMLElement}
   */
  dataNotice(result) {
    return noticeView(
      result.error === 'json'
        ? this.t('jsonInvalid', { message: result.message })
        : this.t('dataNoList', { keys: result.message }),
    );
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    const ctor = /** @type {typeof VtDataElement} */ (this.constructor);
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: ctor.editorLanguage,
      lineNumbers: false,
      wrap: true,
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
    this.previewTimer = setTimeout(() => this.render(), PREVIEW_DELAY);
  }
}
