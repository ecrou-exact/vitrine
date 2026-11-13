// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import ansiCss from '../../styles/ansi.css?raw';
import markdownCss from '../../styles/markdown.css?raw';
import notebookCss from '../../styles/notebook.css?raw';
import { parseBoolean, parseEnum } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { buildCodeView } from '../../core/code-view.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { isLanguageLoaded, loadLanguage, resolveLanguage } from '../../core/highlighter.js';
import { defineStrings } from '../../core/i18n.js';
import { TextSearch } from '../../core/search.js';
import { sanitizeHtml } from '../../core/security.js';
import { iconButton, noticeView } from '../../core/ui.js';
import { renderMarkdown } from '../markdown/render.js';
import { parseAnsi } from '../terminal/ansi.js';
import { segmentNode } from '../terminal/ansi-dom.js';
import { NotebookError, cleanBase64, parseNotebook, pickMime, toScript } from './notebook.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./notebook.js').Notebook} Notebook */
/** @typedef {import('./notebook.js').Cell} Cell */
/** @typedef {import('./notebook.js').Output} Output */

const IMAGE_POLICIES = /** @type {const} */ (['allow', 'block', 'same-origin']);
/** Image outputs shown, by MIME type. */
const RASTER = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/**
 * Shows a Jupyter notebook (`.ipynb`): Markdown cells rendered, code cells highlighted with
 * their execution counts, and their outputs: text and errors with their ANSI colors, images,
 * HTML tables (pandas DataFrames), Markdown and JSON.
 *
 * Nothing is ever run. HTML outputs and Markdown go through the same sanitizer as
 * `<vt-markdown>`; images are shown from the data the notebook holds; SVG outputs are shown
 * as images, where they cannot run scripts.
 *
 * @element vt-notebook
 * @since 0.9.0
 *
 * @attr {boolean} code - Code cells (default on); off shows only Markdown and outputs, like a report.
 * @attr {boolean} outputs - Outputs of the code cells (default on).
 * @attr {boolean} prompts - "In [3]:" and "Out [3]:" before cells and results (default on).
 * @attr {boolean} line-numbers - Line numbers in code cells.
 * @attr {boolean} code-toggle - A button that shows or hides every code cell. Full variant: on.
 * @attr {boolean} allow-html - Raw HTML in Markdown cells, sanitized (default on, as in Jupyter).
 * @attr {"allow"|"block"|"same-origin"} images - Policy for images loaded by Markdown and HTML (default `allow`). Image outputs held in the notebook are always shown.
 * @attr {string} language - Language of the code cells, when the notebook does not say.
 *
 * @prop {string} content - The notebook, as the JSON of an .ipynb file.
 * @prop {Notebook | null} notebook - The notebook read from the content (read-only copy).
 *
 * @csspart cell - A cell (also `cell-markdown`, `cell-code`, `cell-raw`).
 * @csspart prompt - "In [3]:" or "Out [3]:".
 * @csspart source - The code of a code cell.
 * @csspart output - An output (also `output-stream`, `output-error`, `output-image`, `output-html`).
 * @csspart markdown - A rendered Markdown cell.
 *
 * @example
 * <vt-notebook variant="full" src="/notebooks/analysis.ipynb"></vt-notebook>
 */
export class VtNotebook extends VtBase {
  static type = 'notebook';

  static componentAttributes = Object.freeze([
    'code', 'outputs', 'prompts', 'line-numbers', 'code-toggle', 'allow-html', 'images', 'language',
  ]); // prettier-ignore

  static presets = {
    simple: { code: true, outputs: true, prompts: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      code: true, outputs: true, prompts: true, 'code-toggle': true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, ansiCss, markdownCss, notebookCss];

  constructor() {
    super();
    /** @type {{ text: string, notebook: Notebook | null, error: Error | null } | null} */
    this.parsed = null;
    /** @type {boolean | null} Code shown or hidden with the button; `null` follows `code`. */
    this.codeChoice = null;
    /** @type {Set<number>} Hidden cells and outputs the reader opened. */
    this.revealed = new Set();
    this.panelId = uid('panel');
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.previewTimer = undefined;
  }

  disconnectedCallback() {
    clearTimeout(this.previewTimer);
    this.editor?.destroy();
    super.disconnectedCallback();
  }

  contentChanged() {
    this.parsed = null;
    this.revealed.clear();
  }

  /** @returns {{ notebook: Notebook | null, error: Error | null }} */
  parse() {
    const text = this.text ?? '';
    if (this.parsed?.text === text) return this.parsed;
    try {
      this.parsed = { text, notebook: parseNotebook(text), error: null };
    } catch (error) {
      this.parsed = { text, notebook: null, error: error instanceof Error ? error : new Error(String(error)) }; // prettier-ignore
    }
    return this.parsed;
  }

  /** @returns {Notebook | null} */
  get notebook() {
    const notebook = this.parse().notebook;
    return notebook ? structuredClone(notebook) : null;
  }

  /**
   * A feature on unless set to false.
   *
   * @param {string} name
   */
  flag(name) {
    return parseBoolean(this.getAttribute(name)) !== false;
  }

  /** Whether code cells are shown. */
  get showCode() {
    return this.codeChoice ?? this.flag('code');
  }

  /**
   * Canonical highlight.js language of the code cells, loaded on demand.
   *
   * @param {Notebook} notebook
   * @returns {string}
   */
  languageOf(notebook) {
    const requested = this.getAttribute('language')?.trim() || notebook.language;
    const name = resolveLanguage(requested) ?? 'plaintext';
    // Loaded once: a render after loading must not ask again, or it would render forever.
    if (name !== 'plaintext' && !isLanguageLoaded(name))
      loadLanguage(name).then((ok) => ok && this.requestRender());
    return name;
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { notebook, error } = this.parse();
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    const body = h('div', { class: 'body nb-body', part: 'body' });
    if (error || !notebook) body.append(noticeView(this.errorText(error)));
    else {
      const language = this.languageOf(notebook);
      notebook.cells.forEach((cell, index) => {
        const view = this.cellView(cell, index, language);
        if (view) body.append(view);
      });
    }

    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('nb-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const hasCode = Boolean(notebook?.cells.some((cell) => cell.type === 'code' && cell.source.trim())); // prettier-ignore
    const actions = [
      this.searchButton(new TextSearch(body)),
      ...history,
      this.feature('code-toggle') && hasCode && !this.editing
        ? iconButton({
            icon: this.showCode ? 'eye-off' : 'code',
            label: this.showCode ? t('nbHideCode') : t('nbShowCode'),
            key: 'code-toggle',
            part: 'code-button',
            pressed: !this.showCode,
            onClick: () => {
              this.codeChoice = !this.showCode;
              this.render();
            },
          })
        : null,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(() => this.text ?? '', this.downloadName('notebook.ipynb'), 'application/x-ipynb+json') // prettier-ignore
        : null,
      this.feature('copy') && notebook && hasCode
        ? this.copyButton(() => toScript(notebook), t('nbCopyScript'))
        : null,
    ];
    const badge = notebook ? notebook.kernel || notebook.language : '';
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /**
   * @param {Error | null} error
   * @returns {string}
   */
  errorText(error) {
    const t = this.t;
    if (error instanceof NotebookError) {
      if (error.message === 'empty') return t('nbInvalidEmpty');
      if (error.message.startsWith('json:')) return t('nbInvalidJson', { message: error.message.slice(5) }); // prettier-ignore
    }
    return t('nbInvalidFormat');
  }

  /**
   * @param {Cell} cell
   * @param {number} index
   * @param {string} language
   * @returns {HTMLElement | null}
   */
  cellView(cell, index, language) {
    const t = this.t;
    if (cell.type === 'markdown') {
      if (!cell.source.trim()) return null;
      return h(
        'section',
        { class: 'nb-cell nb-markdown', part: 'cell cell-markdown', attrs: { 'aria-label': t('nbCell', { index: index + 1 }) } }, // prettier-ignore
        this.markdownView(withAttachments(cell.source, cell.attachments)),
      );
    }
    if (cell.type === 'raw') {
      if (!cell.source.trim()) return null;
      return h(
        'section',
        { class: 'nb-cell nb-raw', part: 'cell cell-raw', attrs: { 'aria-label': t('nbCell', { index: index + 1 }) } }, // prettier-ignore
        h('pre', { class: 'nb-pre', text: cell.source }),
      );
    }
    const showSource = this.showCode && cell.source.trim() !== '';
    const showOutputs = this.flag('outputs') && cell.outputs.length > 0;
    if (!showSource && !showOutputs) return null;
    const section = h('section', {
      class: 'nb-cell nb-code',
      part: 'cell cell-code',
      attrs: { 'aria-label': t('nbCodeCell', { index: index + 1 }) },
    });
    const prompts = this.flag('prompts');
    if (showSource) {
      const input = h('div', { class: 'nb-input' });
      if (prompts) {
        input.append(
          h('span', {
            class: 'nb-prompt',
            part: 'prompt',
            text: cell.count === null ? t('nbInEmpty') : t('nbIn', { count: cell.count }),
          }),
        );
      }
      if (cell.hidden && !this.revealed.has(index)) {
        input.append(this.revealButton(index, t('nbShowCode'), t('nbCodeHidden')));
      } else {
        const view = buildCodeView(cell.source, {
          language,
          lineNumbers: this.feature('line-numbers'),
          startLine: 1,
          highlightRanges: [],
          diff: false,
          highlightLimit: getConfig().highlightLimit,
        });
        const source = h('div', { class: 'nb-source', part: 'source' }, view.element);
        if (this.feature('copy'))
          source.append(this.copyButton(() => cell.source, t('nbCopyCell'), `copy-cell-${index}`)); // prettier-ignore
        input.append(source);
      }
      section.append(input);
    }
    if (showOutputs) {
      const outputs = h('div', { class: 'nb-outputs', attrs: { 'aria-label': t('nbOutput') } });
      const key = -1 - index;
      if (cell.outputsHidden && !this.revealed.has(key)) {
        outputs.append(h('div', { class: 'nb-output' }, prompts ? h('span', { class: 'nb-prompt' }) : null, this.revealButton(key, t('nbShowOutput'), t('nbOutputHidden')))); // prettier-ignore
      } else {
        for (const output of cell.outputs) outputs.append(this.outputView(output, prompts));
      }
      section.append(outputs);
    }
    return section;
  }

  /**
   * @param {number} key
   * @param {string} label
   * @param {string} note
   * @returns {HTMLElement}
   */
  revealButton(key, label, note) {
    return h(
      'div',
      { class: 'nb-hidden' },
      h('span', { text: note }),
      h('button', {
        class: 'text-btn',
        text: label,
        attrs: { type: 'button', 'data-focus-key': `reveal-${key}` },
        on: {
          click: () => {
            this.revealed.add(key);
            this.render();
          },
        },
      }),
    );
  }

  /**
   * @param {Output} output
   * @param {boolean} prompts
   * @returns {HTMLElement}
   */
  outputView(output, prompts) {
    const t = this.t;
    const prompt = prompts
      ? h('span', {
          class: 'nb-prompt out',
          part: 'prompt',
          text: output.type === 'result' && output.count !== null ? t('nbOut', { count: output.count }) : '', // prettier-ignore
        })
      : null;
    /** @type {HTMLElement} */
    let content;
    let kind = output.type === 'stream' ? 'stream' : output.type === 'error' ? 'error' : 'data';
    if (output.type === 'stream') {
      content = this.ansiBlock(output.text.replace(/\n$/, ''));
      if (output.name === 'stderr') {
        content.classList.add('stderr');
        content.setAttribute('aria-label', t('nbStderr'));
      }
    } else if (output.type === 'error') {
      content = this.ansiBlock(output.text || `${output.ename}: ${output.evalue}`);
      content.setAttribute('role', 'note');
    } else {
      const view = this.dataView(output.data);
      content = view.element;
      kind = view.kind;
    }
    return h('div', { class: `nb-output nb-${kind}`, part: `output output-${kind}` }, prompt, content); // prettier-ignore
  }

  /**
   * The richest type of an output bundle that can be shown.
   *
   * @param {Record<string, string>} data
   * @returns {{ element: HTMLElement, kind: string }}
   */
  dataView(data) {
    const t = this.t;
    let type = pickMime(data);
    const alt = (data['text/plain'] ?? '').slice(0, 300) || t('nbImage');
    if (type && RASTER.includes(type)) {
      const base64 = cleanBase64(data[type]);
      if (base64) return { element: h('img', { class: 'nb-img', attrs: { src: `data:${type};base64,${base64}`, alt, loading: 'lazy', decoding: 'async' } }), kind: 'image' }; // prettier-ignore
      // Not base64: the plain text of the output stands in for the image.
      type = 'text/plain' in data ? 'text/plain' : null;
    }
    if (type === 'image/svg+xml') {
      // As an image, an SVG cannot run scripts or load anything.
      return { element: h('img', { class: 'nb-img', attrs: { src: `data:image/svg+xml;base64,${utf8Base64(data[type])}`, alt } }), kind: 'image' }; // prettier-ignore
    }
    if (type === 'text/html') {
      const element = h('div', { class: 'nb-html markdown' });
      element.append(sanitizeHtml(data[type], { images: this.imagePolicy, externalLinks: 'new-tab' })); // prettier-ignore
      for (const table of Array.from(element.querySelectorAll('table'))) {
        const wrap = h('div', { class: 'table-wrap', attrs: { tabindex: '0', role: 'region', 'aria-label': t('table') } }); // prettier-ignore
        table.replaceWith(wrap);
        wrap.append(table);
      }
      return { element, kind: 'html' };
    }
    if (type === 'text/markdown') return { element: this.markdownView(data[type]), kind: 'html' };
    if (type === 'application/json') {
      let text = data[type];
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // Shown as written.
      }
      return { element: h('pre', { class: 'nb-pre', text }), kind: 'json' };
    }
    if (type) {
      const element = this.ansiBlock(data[type].replace(/\n$/, ''));
      if ('application/vnd.jupyter.widget-view+json' in data) element.setAttribute('title', t('nbWidget')); // prettier-ignore
      return { element, kind: 'text' };
    }
    return { element: h('p', { class: 'nb-none', text: t('nbNoOutput') }), kind: 'text' };
  }

  /** @returns {"allow" | "block" | "same-origin"} */
  get imagePolicy() {
    return parseEnum(this.getAttribute('images'), IMAGE_POLICIES, 'allow');
  }

  /**
   * @param {string} source
   * @returns {HTMLElement}
   */
  markdownView(source) {
    const element = h('div', { class: 'markdown', part: 'markdown' });
    try {
      const { fragment } = renderMarkdown(source, {
        allowHtml: parseBoolean(this.getAttribute('allow-html')) !== false,
        images: this.imagePolicy,
        externalLinks: 'new-tab',
        anchors: false,
        anchorLabel: this.t('anchor'),
        tableLabel: this.t('table'),
        highlightLimit: getConfig().highlightLimit,
        onLanguageLoaded: () => this.requestRender(),
      });
      element.append(fragment);
    } catch {
      // Markdown nested too deeply for the parser: shown as text.
      element.append(h('pre', { class: 'nb-pre', text: source }));
    }
    return element;
  }

  /**
   * @param {string} text
   * @returns {HTMLElement}
   */
  ansiBlock(text) {
    const pre = h('pre', { class: 'nb-pre' });
    parseAnsi(text).forEach((segments, index) => {
      if (index) pre.append('\n');
      for (const segment of segments) pre.append(segmentNode(segment));
    });
    return pre;
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'json',
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
    this.parsed = null;
    this.previewTimer = setTimeout(() => this.render(), 300);
  }
}

/**
 * Replaces `attachment:name` in Markdown by the image the cell holds under that name.
 *
 * @param {string} source
 * @param {Record<string, Record<string, string>>} attachments
 * @returns {string}
 */
export function withAttachments(source, attachments) {
  if (!Object.keys(attachments).length) return source;
  return source.replace(/attachment:([^\s)"'<>]+)/g, (match, name) => {
    const bundle = attachments[decodeURIComponent(name)] ?? attachments[name];
    if (!bundle) return match;
    const type = RASTER.find((mime) => mime in bundle);
    const base64 = type ? cleanBase64(bundle[type]) : null;
    return type && base64 ? `data:${type};base64,${base64}` : match;
  });
}

/**
 * @param {string} text
 * @returns {string}
 */
function utf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
