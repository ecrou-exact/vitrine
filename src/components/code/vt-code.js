// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import { parseInteger, parseRanges } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { buildCodeView, revealMatch } from '../../core/code-view.js';
import { getConfig } from '../../core/config.js';
import { h } from '../../core/dom.js';
import {
  detectLanguage,
  isLanguageLoaded,
  loadLanguage,
  resolveLanguage,
} from '../../core/highlighter.js';
import { formatNumber } from '../../core/i18n.js';
import { TextSearch } from '../../core/search.js';
import { iconButton, noticeView } from '../../core/ui.js';
import hljs from 'highlight.js/lib/core';

/** File extensions used for default download names. */
const EXTENSIONS = /** @type {Record<string, string>} */ ({
  bash: 'sh', css: 'css', diff: 'diff', javascript: 'js', json: 'json', markdown: 'md',
  plaintext: 'txt', python: 'py', shell: 'sh', typescript: 'ts', xml: 'html', yaml: 'yml',
}); // prettier-ignore

/**
 * Displays a block of source code with syntax highlighting.
 *
 * Content sources, in priority order: the `content` property, the `src` attribute,
 * a child `<template>` or `<script type="text/plain">`, then the element's text.
 *
 * @element vt-code
 * @since 0.1.0
 *
 * @attr {string} language - Language name or alias (`python`, `js`, `html`…). `auto` detects it.
 *   Languages that are not bundled are loaded on demand.
 * @attr {boolean} line-numbers - Shows line numbers in the gutter. Full variant: on.
 * @attr {number} start-line - Number of the first line (default 1).
 * @attr {string} highlight-lines - Lines to emphasize, e.g. `"2,5-8"` (displayed numbers).
 * @attr {boolean} wrap - Soft-wraps long lines. The full variant adds a toggle button.
 * @attr {boolean|string} download - Download button; the value is the file name.
 * @attr {number} collapsible - Collapses the code after N lines with a "show all" button.
 * @attr {boolean} diff - Renders `+` / `-` lines as added / removed.
 * @attr {number} tab-size - Tab width in spaces (1–16, default 4).
 * @attr {boolean} wrap-toggle - Shows a button to toggle line wrapping. Full variant: on.
 *
 * @prop {string} content - The code. Setting it overrides `src` and inline content.
 *
 * @fires vt-ready - Code rendered. Detail: `{ type: "code" }`.
 * @fires vt-copy - Code copied. Detail: `{ text }`.
 * @fires vt-search - Search updated. Detail: `{ query, matches }`.
 * @fires vt-error - Loading failed or content too large. Detail: `{ message, cause }`.
 *
 * @cssprop --vt-tab-size - Tab width when the `tab-size` attribute is not set (default 4).
 *
 * @csspart code - The `<pre>` element.
 * @csspart line - One line of code.
 * @csspart line-highlighted - A line listed in `highlight-lines`.
 * @csspart gutter - Line number cell.
 * @csspart line-number - Line number cell (alias of `gutter`).
 * @csspart show-more - "Show all lines" button.
 *
 * @example
 * <vt-code language="python" line-numbers>
 *   def hello(name):
 *       return f"Hello {name}"
 * </vt-code>
 */
export class VtCode extends VtBase {
  static type = 'code';

  static componentAttributes = Object.freeze([
    'language', 'line-numbers', 'start-line', 'highlight-lines', 'wrap', 'wrap-toggle', 'collapsible', 'diff', 'tab-size',
  ]); // prettier-ignore

  static presets = {
    simple: {},
    full: {
      header: true,
      dot: true,
      copy: true,
      search: true,
      download: true,
      'line-numbers': true,
      'wrap-toggle': true,
    },
  };

  static styles = [syntaxCss, codeCss];

  constructor() {
    super();
    /** @type {boolean | null} Wrap state chosen with the toggle; `null` follows the attribute. */
    this.wrapState = null;
    this.expanded = false;
    /** @type {string | undefined} Language detected for `language="auto"`. */
    this._detected = undefined;
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'wrap') this.wrapState = null;
    if (name === 'collapsible') this.expanded = false;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  contentChanged() {
    this.expanded = false;
    this._detected = undefined;
  }

  /**
   * Resolves the language to render with, starting a lazy load when needed.
   *
   * @returns {{ name: string, label: string }}
   */
  language() {
    const requested = this.getAttribute('language')?.trim().toLowerCase() || '';
    const text = this.text ?? '';
    if (requested === 'auto') {
      this._detected ??=
        text.length <= getConfig().highlightLimit ? detectLanguage(text) : 'plaintext';
      return { name: this._detected, label: displayName(this._detected) };
    }
    if (this.feature('diff') && !requested) return { name: 'plaintext', label: 'diff' };
    const name = resolveLanguage(requested);
    if (!name) return { name: 'plaintext', label: requested ? requested.slice(0, 24) : '' };
    if (!isLanguageLoaded(name)) {
      loadLanguage(name).then((ok) => ok && this.requestRender());
      return { name: 'plaintext', label: displayName(name) };
    }
    return { name, label: displayName(name) };
  }

  /** @returns {boolean} */
  get wrapped() {
    return this.wrapState ?? this.feature('wrap');
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const text = this.text ?? '';
    const t = this.t;
    const lang = this.language();
    const view = buildCodeView(text, {
      language: lang.name,
      lineNumbers: this.feature('line-numbers'),
      startLine: parseInteger(this.getAttribute('start-line'), {
        min: -1e9,
        max: 1e9,
        fallback: 1,
      }),
      highlightRanges: parseRanges(this.getAttribute('highlight-lines')),
      diff: this.feature('diff'),
      highlightLimit: getConfig().highlightLimit,
      diffLabels: { added: t('added'), removed: t('removed') },
    });

    const tabSize = parseInteger(this.getAttribute('tab-size'), { min: 1, max: 16, fallback: 0 });
    if (tabSize) frame.style.setProperty('--_tab-size', String(tabSize));
    else frame.style.removeProperty('--_tab-size');

    const collapseAfter = parseInteger(this.getAttribute('collapsible'), {
      min: 1,
      max: 100_000,
      fallback: 0,
    });
    const collapsed = collapseAfter > 0 && view.lineCount > collapseAfter + 1 && !this.expanded;

    const search = new TextSearch(view.code, { skip: '.sign' });
    const target = {
      /** @param {string} query */
      run: (query) => {
        if (query) this.revealAll(frame);
        return search.run(query);
      },
      /** @param {number} index */
      go: (index) => revealMatch(search.go(index)),
      clear: () => search.clear(),
    };

    const actions = [
      this.searchButton(target),
      this.feature('wrap-toggle')
        ? iconButton({
            icon: 'wrap',
            label: t('wrap'),
            key: 'wrap',
            part: 'wrap-button',
            pressed: this.wrapped,
            onClick: () => {
              this.wrapState = !this.wrapped;
              this.render();
            },
          })
        : null,
      this.feature('download')
        ? this.downloadButton(
            () => this.text ?? '',
            this.downloadName(`code.${EXTENSIONS[lang.name] ?? 'txt'}`),
            'text/plain',
          )
        : null,
      this.feature('copy') ? this.copyButton(() => this.text ?? '', t('copyCode')) : null,
    ];

    const body = h(
      'div',
      {
        class: 'body',
        part: 'body',
        attrs: {
          tabindex: '0',
          role: 'region',
          'aria-label': this.heading || `${t('code')}${lang.label ? ` (${lang.label})` : ''}`,
        },
      },
      view.element,
    );

    frame.classList.toggle('wrap', this.wrapped);
    frame.classList.toggle('collapsed', collapsed);
    if (collapsed) frame.style.setProperty('--_collapse-lines', String(collapseAfter));

    frame.append(...this.chrome({ badge: lang.label, actions }));
    if (view.highlightSkipped) frame.append(noticeView(t('highlightSkipped')));
    frame.append(body);
    if (collapsed) {
      const more = h(
        'div',
        { class: 'more' },
        h('button', {
          class: 'text-btn',
          part: 'show-more',
          text: t('showMore', { count: formatNumber(view.lineCount, this.locale) }),
          attrs: { type: 'button', 'data-focus-key': 'show-more', 'aria-expanded': 'false' },
          on: {
            click: () => {
              this.expanded = true;
              this.render();
              /** @type {HTMLElement | null} */ (this.root.querySelector('.body'))?.focus({
                preventScroll: true,
              });
            },
          },
        }),
      );
      frame.append(more);
    }
  }

  /**
   * Expands collapsed code without re-rendering (keeps search marks).
   *
   * @param {HTMLElement} frame
   */
  revealAll(frame) {
    if (!frame.classList.contains('collapsed')) return;
    this.expanded = true;
    frame.classList.remove('collapsed');
    frame.querySelector('.more')?.remove();
  }
}

/**
 * Human-readable language name.
 *
 * @param {string} name
 * @returns {string}
 */
function displayName(name) {
  if (name === 'plaintext') return '';
  if (name === 'xml') return 'HTML';
  const label = hljs.getLanguage(name)?.name ?? name;
  return label.split(',')[0].trim();
}
