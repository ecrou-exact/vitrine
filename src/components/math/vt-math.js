// @ts-check
import mathCss from '../../styles/math.css?raw';
import { parseBoolean } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { TextSearch } from '../../core/search.js';
import { noticeView } from '../../core/ui.js';
import { MAX_TEX, mathMarkup, parseMacros, scrubMath, splitEquations, splitMath } from './math.js';
import { loadMathEngine, useMathEngine } from './temml-loader.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./temml-loader.js').MathEngine} MathEngine */
/** @typedef {import('./math.js').Segment} Segment */

/**
 * Shows math written in TeX, drawn by the browser as MathML: one equation, several
 * (separated by blank lines, optionally numbered), or text with math between `$…$`,
 * `$$…$$`, `\(…\)` and `\[…\]`. With `inline`, the element sits inside a line of text.
 *
 * TeX is turned into MathML by Temml, loaded on demand (`dist/vendor/temml.js`). The MathML
 * is built with DOM methods, then checked against an allow-list of MathML elements,
 * attributes and styles; links, images and `\href` are never produced. Screen readers read
 * MathML natively, and the TeX is kept in an annotation.
 *
 * @element vt-math
 * @since 0.14.0
 *
 * @attr {boolean} inline - Inside a line of text: no frame, the math in text size.
 * @attr {boolean} delimiters - The content is text with math between `$…$`, `$$…$$`, `\(…\)` and `\[…\]`.
 * @attr {boolean} numbered - Numbers the equations: (1), (2)…
 * @attr {string} macros - Macros as JSON: `{"\\R": "\\mathbb{R}"}`.
 * @attr {boolean} copy-mathml - A button that copies the MathML. Full variant: on.
 *
 * @prop {string} content - The TeX, or the text with math.
 *
 * @csspart equation - A display equation.
 * @csspart number - The number of an equation.
 * @csspart math - A `<math>` element.
 * @csspart tex-error - TeX that could not be read, with the reason.
 *
 * @example
 * <vt-math>\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}</vt-math>
 * <p>Euler: <vt-math inline>e^{i\pi} + 1 = 0</vt-math>.</p>
 */
export class VtMath extends VtBase {
  static type = 'math';

  static componentAttributes = Object.freeze(['inline', 'delimiters', 'numbered', 'macros', 'copy-mathml']); // prettier-ignore

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, search: true, fullscreen: true, 'copy-mathml': true }, // prettier-ignore
  };

  static styles = [mathCss];

  /**
   * Uses a Temml that is already loaded instead of fetching `dist/vendor/temml.js`.
   *
   * @param {{ render: Function, ParseError?: Function }} engine
   */
  static useEngine(engine) {
    useMathEngine(engine);
  }

  constructor() {
    super();
    this.panelId = uid('panel');
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
    this.loadFailed = false;
  }

  disconnectedCallback() {
    clearTimeout(this.previewTimer);
    this.editor?.destroy();
    super.disconnectedCallback();
  }

  /** Whether the element sits in a line of text. */
  get inline() {
    return parseBoolean(this.getAttribute('inline')) === true;
  }

  /**
   * The math engine, once loaded; starts loading it otherwise.
   *
   * @returns {MathEngine | null}
   */
  engine() {
    const state = loadMathEngine();
    if (state.ready) return state.engine;
    if (!this.loadFailed) {
      state.promise.then(
        () => this.requestRender(),
        () => {
          this.loadFailed = true;
          this.requestRender();
        },
      );
    }
    return null;
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const text = this.text ?? '';
    const engine = this.engine();
    const inline = this.inline;
    frame.classList.toggle('inline-math', inline);
    const body = h(inline ? 'span' : 'div', { class: `body math-body${inline ? ' inline' : ''}`, part: 'body' }); // prettier-ignore
    if (this.loadFailed && !engine) body.append(noticeView(t('mathLoadFailed')));

    /** @type {string[]} */
    const sources = [];
    if (this.feature('delimiters')) {
      for (const segment of splitMath(text)) {
        if (segment.type === 'text') body.append(this.textView(segment.text));
        else {
          sources.push(segment.tex);
          body.append(this.mathView(segment.tex, segment.display, engine, null));
        }
      }
    } else if (inline) {
      sources.push(text.trim());
      body.append(this.mathView(text.trim(), false, engine, null));
    } else {
      const equations = splitEquations(text);
      const numbered = this.feature('numbered');
      equations.forEach((tex, index) => {
        sources.push(tex);
        body.append(this.mathView(tex, true, engine, numbered ? index + 1 : null));
      });
    }

    if (inline) {
      frame.append(body);
      return;
    }
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('math-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);
    const tex = this.feature('delimiters') ? text : sources.join('\n\n');
    const actions = [
      this.feature('delimiters') ? this.searchButton(new TextSearch(body)) : null,
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('copy-mathml') && engine
        ? this.copyTextButton(() => Array.from(body.querySelectorAll('math'), mathMarkup).join('\n'), t('mathCopyMathml'), 'copy-mathml') // prettier-ignore
        : null,
      this.feature('copy') ? this.copyButton(() => tex, t('mathCopyTex')) : null,
    ];
    const badge = sources.length > 1 && !this.feature('delimiters') ? t('mathEquations', { count: formatNumber(sources.length, this.locale) }) : 'TeX'; // prettier-ignore
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /**
   * Text between math, with paragraphs at blank lines.
   *
   * @param {string} text
   * @returns {DocumentFragment}
   */
  textView(text) {
    const fragment = document.createDocumentFragment();
    text.split(/\n[^\S\n]*\n/).forEach((part, index) => {
      if (index)
        fragment.append(h('span', { class: 'math-break', attrs: { 'aria-hidden': 'true' } }));
      fragment.append(part);
    });
    return fragment;
  }

  /**
   * An equation: MathML when the engine is loaded, its TeX meanwhile, or the TeX and the
   * reason when it cannot be read.
   *
   * @param {string} tex
   * @param {boolean} display
   * @param {MathEngine | null} engine
   * @param {number | null} number
   * @returns {HTMLElement}
   */
  mathView(tex, display, engine, number) {
    const holder = h(display ? 'div' : 'span', {
      class: display ? 'math-display' : 'math-inline',
      part: display ? 'equation' : undefined,
    });
    if (!engine || !tex) {
      holder.append(h('code', { class: 'math-tex', text: tex }));
      return holder;
    }
    const target = h('span', { class: 'math-target' });
    try {
      if (tex.length > MAX_TEX) throw new Error(`more than ${MAX_TEX} characters`);
      engine.render(tex, target, {
        displayMode: display,
        throwOnError: true,
        trust: false,
        annotate: true,
        maxExpand: 1000,
        maxSize: 50,
        macros: { ...parseMacros(this.getAttribute('macros')) },
        xml: false,
        wrap: display ? 'none' : 'tex',
      });
      scrubMath(target);
      for (const math of Array.from(target.querySelectorAll('math')))
        math.setAttribute('part', 'math');
      holder.append(...Array.from(target.childNodes));
    } catch (error) {
      const message = error instanceof Error ? error.message.replace(/^Temml parse error: /, '').slice(0, 500) : String(error); // prettier-ignore
      holder.classList.add('error');
      holder.setAttribute('part', 'tex-error');
      holder.append(
        h('code', { class: 'math-tex', text: tex }),
        h('span', { class: 'math-error', attrs: { role: 'note' }, text: this.t('mathError', { message }) }), // prettier-ignore
      );
      return holder;
    }
    if (number !== null) {
      holder.classList.add('numbered');
      holder.append(h('span', { class: 'math-number', part: 'number', text: `(${formatNumber(number, this.locale)})` })); // prettier-ignore
    }
    return holder;
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'latex',
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
    this.previewTimer = setTimeout(() => this.render(), 150);
  }
}
