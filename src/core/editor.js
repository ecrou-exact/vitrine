// @ts-check
/**
 * Lightweight code editor: a native `<textarea>` laid exactly over the highlighted code.
 *
 * The textarea holds the text, the caret, the selection, undo history, IME input and
 * accessibility; its own text is transparent. Under it, the same text is drawn with
 * syntax highlighting by the regular code view. Both use the same font, line height,
 * padding, tab size and wrapping, so every character sits at the same place.
 *
 * Keyboard: Tab indents, Shift+Tab outdents, Enter keeps the indentation of the line.
 * Escape releases the Tab key, so the next Tab moves focus out (no keyboard trap).
 *
 * @module core/editor
 */
import { buildCodeView } from './code-view.js';
import { h } from './dom.js';

/** Above this length the highlighted layer is refreshed after a pause, not on every key. */
const LIVE_LIMIT = 60_000;
/** Pause before refreshing the layer for long text. */
const SLOW_DELAY = 250;
/** Indentation inserted by Tab. */
const INDENT = '  ';

/** @typedef {import('./attributes.js').Range} Range */

/**
 * @typedef {object} EditorOptions
 * @property {string} text
 * @property {string} language - Canonical language name.
 * @property {boolean} lineNumbers
 * @property {boolean} wrap
 * @property {Range[]} [highlightRanges]
 * @property {number} highlightLimit
 * @property {string} label - Accessible name of the text field.
 * @property {string} [placeholder]
 * @property {(text: string) => void} onInput - Called after every change.
 * @property {(text: string) => void} [onChange] - Called when the field loses focus after changes.
 */

export class CodeEditor {
  /**
   * @param {EditorOptions} options
   */
  constructor(options) {
    this.options = options;
    this.text = options.text;
    this.tabReleased = false;
    this.changedSinceFocus = false;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.timer = undefined;
    this.textarea = h('textarea', {
      class: 'editor-input',
      part: 'editor',
      attrs: {
        'aria-label': options.label,
        placeholder: options.placeholder ?? null,
        spellcheck: 'false',
        autocapitalize: 'off',
        autocomplete: 'off',
        autocorrect: 'off',
        wrap: options.wrap ? 'soft' : 'off',
        'data-focus-key': 'editor',
      },
    });
    this.textarea.value = options.text;
    this.layer = this.buildLayer(options.text);
    this.element = h(
      'div',
      { class: options.wrap ? 'editor wrap' : 'editor' },
      this.layer,
      this.textarea,
    );
    this.textarea.addEventListener('input', () => this.onInput());
    this.textarea.addEventListener('keydown', (event) => this.onKeyDown(event));
    this.textarea.addEventListener('focus', () => {
      this.changedSinceFocus = false;
    });
    this.textarea.addEventListener('blur', () => {
      if (this.changedSinceFocus) options.onChange?.(this.text);
    });
  }

  /**
   * Builds the highlighted layer under the textarea.
   *
   * @param {string} text
   * @returns {HTMLElement}
   */
  buildLayer(text) {
    const view = buildCodeView(text, {
      language: this.options.language,
      lineNumbers: this.options.lineNumbers,
      startLine: 1,
      highlightRanges: this.options.highlightRanges ?? [],
      diff: false,
      highlightLimit: this.options.highlightLimit,
      trailingNewline: true,
      chunk: false,
    });
    view.element.classList.add('editor-layer');
    view.element.setAttribute('aria-hidden', 'true');
    return view.element;
  }

  /** Re-draws the highlighted layer from the current text. */
  refresh() {
    clearTimeout(this.timer);
    const layer = this.buildLayer(this.text);
    this.layer.replaceWith(layer);
    this.layer = layer;
    this.element.classList.remove('pending');
    this.align();
  }

  /**
   * Places the textarea over the code column (after the line numbers). Call once the
   * editor is in the document, and whenever the gutter width may change.
   */
  align() {
    const gutter = this.layer.querySelector('.gutter');
    const width = gutter ? gutter.getBoundingClientRect().width : 0;
    this.element.style.setProperty('--_editor-gutter', `${width}px`);
  }

  /**
   * Updates the emphasized lines (e.g. the line of a JSON error).
   *
   * @param {Range[]} ranges
   */
  setHighlightRanges(ranges) {
    this.options.highlightRanges = ranges;
    this.refresh();
  }

  onInput() {
    this.text = this.textarea.value.replace(/\r\n?/g, '\n');
    this.changedSinceFocus = true;
    if (this.text.length <= LIVE_LIMIT) {
      this.refresh();
    } else {
      // Long text: show the plain textarea text while typing, highlight after a pause.
      this.element.classList.add('pending');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.refresh(), SLOW_DELAY);
    }
    this.options.onInput(this.text);
  }

  /**
   * @param {KeyboardEvent} event
   */
  onKeyDown(event) {
    if (event.key === 'Escape') {
      this.tabReleased = true;
      return;
    }
    if (
      event.key === 'Tab' &&
      !this.tabReleased &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      if (event.shiftKey) this.outdent();
      else this.indent();
      return;
    }
    if (event.key !== 'Tab') this.tabReleased = false;
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.isComposing
    ) {
      const { value, selectionStart } = this.textarea;
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const indent = /^[ \t]*/.exec(value.slice(lineStart, selectionStart))?.[0] ?? '';
      if (indent) {
        event.preventDefault();
        this.insert(`\n${indent}`);
      }
    }
  }

  /** Indents the selected lines, or inserts indentation at the caret. */
  indent() {
    const { value, selectionStart, selectionEnd } = this.textarea;
    if (
      selectionStart === selectionEnd ||
      !value.slice(selectionStart, selectionEnd).includes('\n')
    ) {
      this.insert(INDENT);
      return;
    }
    const start = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const block = value.slice(start, selectionEnd);
    const indented = block.replace(/^/gm, INDENT);
    this.replaceRange(start, selectionEnd, indented);
    this.textarea.setSelectionRange(
      selectionStart + INDENT.length,
      selectionEnd + (indented.length - block.length),
    );
  }

  /** Removes one level of indentation from the selected lines. */
  outdent() {
    const { value, selectionStart, selectionEnd } = this.textarea;
    const start = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const block = value.slice(start, selectionEnd);
    const pattern = new RegExp(`^(?:\\t| {1,${INDENT.length}})`, 'gm');
    const firstRemoved = (/^(?:\t| {1,2})/.exec(block)?.[0] ?? '').length;
    const outdented = block.replace(pattern, '');
    if (outdented === block) return;
    this.replaceRange(start, selectionEnd, outdented);
    this.textarea.setSelectionRange(
      Math.max(start, selectionStart - firstRemoved),
      selectionEnd - (block.length - outdented.length),
    );
  }

  /**
   * Inserts text at the caret, keeping the browser's undo history when possible.
   *
   * @param {string} text
   */
  insert(text) {
    this.textarea.focus();
    // execCommand keeps undo/redo working; it is deprecated but has no replacement yet.
    const done = document.execCommand?.('insertText', false, text);
    if (!done) {
      this.textarea.setRangeText(
        text,
        this.textarea.selectionStart,
        this.textarea.selectionEnd,
        'end',
      );
      this.onInput();
    }
  }

  /**
   * @param {number} start
   * @param {number} end
   * @param {string} text
   */
  replaceRange(start, end, text) {
    this.textarea.setSelectionRange(start, end);
    this.insert(text);
  }

  /** Stops pending work. */
  destroy() {
    clearTimeout(this.timer);
  }
}
