// @ts-check
import codeCss from '../../styles/code.css?raw';
import syntaxCss from '../../styles/syntax.css?raw';
import diagramCss from '../../styles/diagram.css?raw';
import { parseEnum } from '../../core/attributes.js';
import { VtBase, sheet } from '../../core/base-element.js';
import { buildCodeView } from '../../core/code-view.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { cleanCss, sanitizeSvg } from '../../core/security.js';
import { getTheme, resolveTheme } from '../../core/themes.js';
import { createTabs, loadingView, noticeView } from '../../core/ui.js';
import { loadDiagramEngine, useDiagramEngine } from './mermaid-loader.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./mermaid-loader.js').DiagramEngine} DiagramEngine */

const TABS = /** @type {const} */ (['diagram', 'source']);
const LOOKS = /** @type {const} */ (['classic', 'handDrawn']);

/**
 * @typedef {object} Drawing
 * @property {string} key - Source, colors and options it was drawn with.
 * @property {SVGSVGElement | null} svg - Sanitized drawing.
 * @property {string} css - Its cleaned stylesheet.
 * @property {string} error
 */

/**
 * Shows a diagram written in Mermaid: flowcharts, sequence, class, state and entity
 * relationship diagrams, Gantt charts, pie charts, mind maps, timelines, Git graphs and the
 * other types Mermaid draws, in the colors of the theme.
 *
 * Mermaid is loaded on demand (`dist/vendor/mermaid.js`, then only the code of the types a
 * page uses). It runs in its strict mode: no click handlers, no HTML in labels. The SVG it
 * returns is sanitized again by Vitrine, its CSS goes in a constructable stylesheet without
 * external `url()`, and inline styles go through CSSOM, so diagrams work under a strict
 * Content Security Policy and Trusted Types.
 *
 * @element vt-diagram
 * @since 0.14.0
 *
 * @attr {boolean} tabs - Diagram / Source tabs. Full variant: on.
 * @attr {"diagram"|"source"} default-tab - Tab shown at first (default `diagram`).
 * @attr {"classic"|"handDrawn"} look - Mermaid's look (default `classic`).
 * @attr {boolean} line-numbers - Line numbers in the source.
 *
 * @prop {string} content - The Mermaid source.
 * @prop {SVGSVGElement | null} svg - The drawing (read-only copy), once drawn.
 *
 * @fires vt-tab-change - The tab changed. Detail: `{ tab }`: `"diagram"` or `"source"`.
 *
 * @csspart canvas - The area that holds the drawing.
 * @csspart diagram - The SVG.
 * @csspart source - The source view.
 * @csspart diagram-error - Source that could not be drawn, with the reason.
 *
 * @example
 * <vt-diagram variant="full">
 *   <template>
 *     flowchart LR
 *       A[Order] --> B{Paid?}
 *       B -- yes --> C[Ship]
 *       B -- no --> D[Remind]
 *   </template>
 * </vt-diagram>
 */
export class VtDiagram extends VtBase {
  static type = 'diagram';

  static componentAttributes = Object.freeze(['tabs', 'default-tab', 'look', 'line-numbers']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, download: true, fullscreen: true, tabs: true },
  };

  static styles = [syntaxCss, codeCss, diagramCss];

  /**
   * Draws diagrams with another renderer instead of loading `dist/vendor/mermaid.js`.
   *
   * @param {DiagramEngine} engine
   */
  static useEngine(engine) {
    useDiagramEngine(engine);
  }

  constructor() {
    super();
    /** @type {Drawing | null} */
    this.drawing = null;
    /** @type {string | null} Key of the drawing on its way. */
    this.drawingKey = null;
    /** @type {"diagram" | "source" | null} */
    this.tab = null;
    /** @type {CSSStyleSheet | null} */
    this.diagramSheet = null;
    /** @type {string | null} Colors of the last render, to redraw when the theme changes. */
    this.paletteKey = null;
    this.loadFailed = false;
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

  /** @returns {SVGSVGElement | null} */
  get svg() {
    return /** @type {SVGSVGElement | null} */ (this.drawing?.svg?.cloneNode(true) ?? null);
  }

  /**
   * @param {CSSStyleSheet | null} syntaxTheme
   */
  updateSheets(syntaxTheme) {
    super.updateSheets(syntaxTheme);
    if (this.diagramSheet)
      this.root.adoptedStyleSheets = [...this.root.adoptedStyleSheets, this.diagramSheet];
  }

  applyTheme() {
    super.applyTheme();
    // A new theme (or the system switching to dark) means new colors: draw again.
    if (this.paletteKey === null || !this.isConnected) return;
    const key = JSON.stringify(this.palette());
    if (key !== this.paletteKey) this.requestRender();
  }

  /** @returns {"diagram" | "source"} */
  get currentTab() {
    if (!this.feature('tabs')) return 'diagram';
    return this.tab ?? parseEnum(this.getAttribute('default-tab'), TABS, 'diagram');
  }

  // ------------------------------------------------------------------ colors

  /**
   * Mermaid's theme variables, from the design tokens of the element's theme.
   *
   * @returns {Record<string, unknown>}
   */
  palette() {
    const style = getComputedStyle(this.frame);
    const token = (/** @type {string} */ name) => resolveColor(style.getPropertyValue(name).trim());
    const surface = token('--_surface');
    const sunken = token('--_surface-sunken');
    const raised = token('--_surface-raised');
    const fg = token('--_fg');
    const muted = token('--_fg-muted');
    const border = token('--_border');
    const strong = token('--_border-strong');
    const accent = token('--_accent');
    const soft = over(token('--_accent-soft'), surface);
    const info = token('--_info');
    const warning = token('--_warning');
    const danger = token('--_danger');
    const success = token('--_success');
    const dark = getTheme(resolveTheme(this.getAttribute('theme')))?.colorScheme === 'dark';
    const series = [accent, info, warning, token('--_syntax-keyword'), danger, token('--_syntax-string'), token('--_syntax-number'), muted]; // prettier-ignore
    return {
      darkMode: dark,
      background: surface,
      fontFamily: style.getPropertyValue('--_font-ui').trim() || 'system-ui, sans-serif',
      fontSize: '14px',
      primaryColor: sunken,
      primaryTextColor: fg,
      primaryBorderColor: strong,
      secondaryColor: soft,
      secondaryTextColor: fg,
      secondaryBorderColor: accent,
      tertiaryColor: raised,
      tertiaryTextColor: fg,
      tertiaryBorderColor: border,
      lineColor: muted,
      textColor: fg,
      mainBkg: sunken,
      nodeBorder: strong,
      nodeTextColor: fg,
      clusterBkg: surface,
      clusterBorder: border,
      titleColor: fg,
      edgeLabelBackground: surface,
      noteBkgColor: raised,
      noteTextColor: fg,
      noteBorderColor: strong,
      actorBkg: sunken,
      actorBorder: strong,
      actorTextColor: fg,
      actorLineColor: muted,
      signalColor: fg,
      signalTextColor: fg,
      labelBoxBkgColor: sunken,
      labelBoxBorderColor: strong,
      labelTextColor: fg,
      loopTextColor: fg,
      activationBkgColor: soft,
      activationBorderColor: accent,
      sequenceNumberColor: surface,
      sectionBkgColor: soft,
      altSectionBkgColor: surface,
      sectionBkgColor2: sunken,
      taskBkgColor: accent,
      taskBorderColor: accent,
      taskTextColor: dark ? surface : fg,
      taskTextOutsideColor: fg,
      activeTaskBkgColor: info,
      activeTaskBorderColor: info,
      doneTaskBkgColor: muted,
      doneTaskBorderColor: muted,
      critBkgColor: danger,
      critBorderColor: danger,
      todayLineColor: warning,
      gridColor: border,
      errorBkgColor: danger,
      errorTextColor: surface,
      pieStrokeColor: surface,
      pieOuterStrokeColor: border,
      pieTitleTextColor: fg,
      pieSectionTextColor: surface,
      pieLegendTextColor: fg,
      git0: accent,
      git1: info,
      git2: warning,
      git3: series[3],
      git4: success,
      ...Object.fromEntries(series.map((color, i) => [`pie${i + 1}`, color])),
      ...Object.fromEntries(series.map((color, i) => [`cScale${i}`, color])),
    };
  }

  // ------------------------------------------------------------------ drawing

  /**
   * Starts drawing the content when it is not drawn yet with these colors.
   *
   * @param {string} text
   * @returns {Drawing | null} The drawing, when it is ready.
   */
  ensureDrawing(text) {
    const palette = this.palette();
    this.paletteKey = JSON.stringify(palette);
    const look = parseEnum(this.getAttribute('look'), LOOKS, 'classic');
    const key = JSON.stringify([text, this.paletteKey, look]);
    if (this.drawing?.key === key) return this.drawing;
    if (this.drawingKey === key) return null;
    const state = loadDiagramEngine();
    if (!state.ready) {
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
    const engine = /** @type {DiagramEngine} */ (state.engine);
    this.drawingKey = key;
    engine
      .render(text, { themeVariables: palette, look, fontFamily: palette.fontFamily })
      .then(
        (result) => {
          const drawn = typeof result === 'string' ? { svg: result, css: '' } : result;
          const { svg, css } = sanitizeSvg(drawn.svg);
          const sheetText = [cleanCss(drawn.css ?? ''), css].filter(Boolean).join('\n');
          return { key, svg, css: sheetText, error: svg ? '' : this.t('diagramUnsafe') };
        },
        (error) => ({ key, svg: null, css: '', error: errorMessage(error) }),
      )
      .then((drawing) => {
        if (this.drawingKey !== key) return;
        this.drawingKey = null;
        this.drawing = drawing;
        this.diagramSheet = drawing.css ? sheet(drawing.css) : null;
        this.applyTheme();
        this.requestRender();
      });
    return null;
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const text = (this.text ?? '').trim();
    const tab = this.currentTab;
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    const body = h('div', { class: `body dg-body tab-${tab}`, part: 'body' });

    if (tab === 'source') body.append(this.sourceView(text));
    else body.append(this.canvasView(text));

    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('dg-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const tabs =
      this.feature('tabs') && !this.editing
        ? createTabs({
            tabs: [
              { id: 'diagram', label: t('diagram'), icon: 'chart' },
              { id: 'source', label: t('diagramSource'), icon: 'code' },
            ],
            selected: tab,
            label: t('tabs'),
            panelId: this.panelId,
            onSelect: (id) => {
              this.tab = /** @type {"diagram" | "source"} */ (id);
              this.render();
              /** @type {HTMLElement | null} */ (
                this.root.querySelector(`[data-tab="${id}"]`)
              )?.focus();
              emit(this, EVENTS.TAB_CHANGE, { tab: id });
            },
          })
        : null;
    if (tabs) panel.setAttribute('role', 'tabpanel');
    const drawing = this.drawing;
    const actions = [
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download') && drawing?.svg
        ? this.downloadButton(() => svgFile(/** @type {SVGSVGElement} */ (drawing.svg), drawing.css), this.downloadName('diagram.svg'), 'image/svg+xml') // prettier-ignore
        : null,
      this.feature('copy') ? this.copyButton(() => this.text ?? '', t('diagramCopySource')) : null,
    ];
    frame.append(...this.chrome({ badge: 'Mermaid', tabs, actions }), panel);
    this.editor?.align();
  }

  /**
   * @param {string} text
   * @returns {HTMLElement}
   */
  canvasView(text) {
    const t = this.t;
    const canvas = h('div', {
      class: 'dg-canvas',
      part: 'canvas',
      attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || t('diagram') },
    });
    const drawing = this.ensureDrawing(text);
    if (this.loadFailed && !drawing) {
      canvas.append(noticeView(t('diagramLoadFailed')), this.sourceView(text));
      return canvas;
    }
    if (!drawing) {
      canvas.classList.add('pending');
      canvas.append(loadingView(t));
      return canvas;
    }
    if (drawing.error || !drawing.svg) {
      canvas.append(
        h(
          'div',
          { class: 'dg-error', part: 'diagram-error', attrs: { role: 'note' } },
          h('p', { text: t('diagramErrorTitle') }),
          h('pre', { class: 'dg-message', text: drawing.error }),
        ),
        this.sourceView(text),
      );
      return canvas;
    }
    const svg = /** @type {SVGSVGElement} */ (drawing.svg.cloneNode(true));
    svg.setAttribute('part', 'diagram');
    if (this.heading && !svg.hasAttribute('aria-labelledby')) svg.setAttribute('aria-label', this.heading); // prettier-ignore
    canvas.append(svg);
    return canvas;
  }

  /**
   * @param {string} text
   * @returns {HTMLElement}
   */
  sourceView(text) {
    const view = buildCodeView(text, {
      language: 'plaintext',
      lineNumbers: this.feature('line-numbers'),
      startLine: 1,
      highlightRanges: [],
      diff: false,
      highlightLimit: getConfig().highlightLimit,
    });
    return h('div', { class: 'dg-source', part: 'source' }, view.element);
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
    this.previewTimer = setTimeout(() => this.render(), 400);
  }
}

/** @type {CanvasRenderingContext2D | null | undefined} */
let colorContext;

/**
 * Any CSS color (`color-mix()` included) as `#rrggbb` or `rgba()`, which Mermaid reads.
 *
 * @param {string} value
 * @returns {string}
 */
function resolveColor(value) {
  if (colorContext === undefined) {
    try {
      colorContext = document.createElement('canvas').getContext('2d');
    } catch {
      colorContext = null;
    }
  }
  if (!colorContext || !value) return value || '#888888';
  colorContext.fillStyle = '#888888';
  colorContext.fillStyle = value;
  return String(colorContext.fillStyle);
}

/**
 * A translucent color laid over an opaque one, as an opaque color.
 *
 * @param {string} top
 * @param {string} bottom
 * @returns {string}
 */
function over(top, bottom) {
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(top);
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(bottom);
  if (!rgba || !hex) return top;
  const alpha = Number(rgba[4]);
  const mix = (/** @type {number} */ i) =>
    Math.round(Number(rgba[i]) * alpha + parseInt(hex[i], 16) * (1 - alpha))
      .toString(16)
      .padStart(2, '0');
  return `#${mix(1)}${mix(2)}${mix(3)}`;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorMessage(error) {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error); // prettier-ignore
  return text.slice(0, 2000);
}

/**
 * The drawing as an SVG file, with its stylesheet inside.
 *
 * @param {SVGSVGElement} svg
 * @param {string} css
 * @returns {string}
 */
function svgFile(svg, css) {
  const doc = document.implementation.createDocument('http://www.w3.org/2000/svg', 'svg', null);
  const copy = /** @type {SVGSVGElement} */ (doc.importNode(svg, true));
  copy.removeAttribute('part');
  if (css) {
    const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = css;
    copy.insertBefore(style, copy.firstChild);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(copy)}\n`;
}
