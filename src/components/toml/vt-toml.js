// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import jsonCss from '../../styles/json.css?raw';
import { parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { lineElement } from '../../core/chunks.js';
import { buildCodeView, revealMatch } from '../../core/code-view.js';
import { CodeEditor } from '../../core/editor.js';
import { icon } from '../../core/icons.js';
import { getConfig } from '../../core/config.js';
import { isLanguageLoaded, loadLanguage } from '../../core/highlighter.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { TextSearch } from '../../core/search.js';
import { createTabs, errorView, iconButton, noticeView } from '../../core/ui.js';
import { primitiveText } from '../json/parser.js';
import { JsonTree } from '../json/tree.js';
import { parseToml, tomlPath, toJson } from './parser.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

const VIEWS = /** @type {const} */ (['tree', 'raw']);

/** @typedef {typeof VIEWS[number]} View */
/** @typedef {import('../json/parser.js').JsonNode} JsonNode */
/** @typedef {import('./parser.js').TomlResult} TomlResult */
/** @typedef {import('./parser.js').TomlSyntaxError} TomlSyntaxError */
/** @typedef {{ run(query: string): { total: number, capped: boolean }, go(index: number): void, clear(): void }} SearchTarget */

/**
 * Displays TOML as a collapsible tree or as highlighted text.
 *
 * The TOML is read by a built-in TOML 1.0 parser: tables, arrays of tables, inline
 * tables, dotted keys, every string kind, integers in any base, floats, booleans,
 * dates and times. Duplicate keys and redefined tables are errors with line and
 * column. Values keep the text they were written with, and dates and times are shown
 * with their own type. Everything is rendered with DOM text APIs.
 *
 * @element vt-toml
 * @since 0.4.0
 *
 * @attr {"tree"|"raw"} view - Initial view. Default: `tree` in the full variant, `raw` otherwise.
 * @attr {boolean} tabs - Shows the Tree / Raw tabs. Full variant: on.
 * @attr {number} depth - Levels expanded initially in the tree (default 2, 0 = collapsed).
 * @attr {boolean} sort-keys - Sorts keys alphabetically in the tree.
 * @attr {boolean} show-types - Shows a type badge on each tree row (`integer`, `float`, `datetime`…). Full variant: on.
 * @attr {boolean} expand-controls - Shows "expand all" / "collapse all" buttons. Full variant: on.
 * @attr {boolean} path - Shows the TOML path of the selected node with copy buttons. Full variant: on.
 * @attr {boolean} line-numbers - Line numbers in the raw view. Full variant: on.
 * @attr {boolean} copy-json - Shows a "copy as JSON" button. Full variant: on.
 * @attr {"error"|"raw"} on-invalid - Invalid TOML: show an error (default) or the raw text with a notice.
 *
 * @prop {string} content - The TOML text.
 * @prop {unknown} data - The document as a plain JavaScript object (read-only; integers beyond 2^53 are rounded, dates are strings).
 *
 * @fires vt-ready - TOML rendered. Detail: `{ type: "toml" }`.
 * @fires vt-tab-change - View changed. Detail: `{ tab }` (`"tree"` or `"raw"`).
 * @fires vt-copy - TOML, JSON, a value or a path copied. Detail: `{ text }`.
 * @fires vt-search - Search updated. Detail: `{ query, matches }`.
 * @fires vt-error - Invalid TOML, loading failure or content too large. Detail: `{ message, cause }`.
 *
 * @csspart tree - The tree (`role="tree"`).
 * @csspart tree-item - A tree item.
 * @csspart row - The visible row of a tree item.
 * @csspart tree-toggle - Expand / collapse chevron.
 * @csspart key - A key.
 * @csspart index - An array index.
 * @csspart value - A value.
 * @csspart count - Item / key count of a table or array.
 * @csspart type-badge - Type badge.
 * @csspart more-item - "Show more" row of a large table or array.
 * @csspart path - Path bar of the selected node.
 *
 * @example
 * <vt-toml variant="full">
 *   <template>
 *     [package]
 *     name = "vitrine"
 *   </template>
 * </vt-toml>
 */
export class VtToml extends VtBase {
  static type = 'toml';

  static componentAttributes = Object.freeze([
    'view', 'tabs', 'depth', 'sort-keys', 'show-types', 'expand-controls', 'path', 'line-numbers', 'copy-json', 'on-invalid',
  ]); // prettier-ignore

  static presets = {
    simple: {},
    full: {
      header: true, dot: true, copy: true, search: true, download: true, tabs: true, 'copy-json': true,
      'show-types': true, 'expand-controls': true, path: true, 'line-numbers': true, fullscreen: true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, jsonCss];

  static upgradeProperties = ['content'];

  constructor() {
    super();
    /** @type {View | null} View chosen by the user; `null` follows the `view` attribute. */
    this.viewState = null;
    this.panelId = uid('panel');
    /** @type {{ text: string, maxDepth: number, result: TomlResult } | null} */
    this.parsed = null;
    /** @type {{ key: string, tree: JsonTree } | null} */
    this.treeCache = null;
    this.invalidReported = false;
    /** @type {HTMLElement | null} */
    this.pathText = null;
    /** @type {CodeEditor | null} */
    this.editor = null;
    /** @type {HTMLElement | null} */
    this.status = null;
    this.errorLine = 0;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.validateTimer = undefined;
  }

  /**
   * The document as a plain JavaScript object, or `undefined` when the TOML is invalid.
   *
   * @type {unknown}
   */
  get data() {
    const result = this.parse();
    return result?.ok ? JSON.parse(toJson(result.value, 0)) : undefined;
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'view') this.viewState = null;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  contentChanged() {
    this.parsed = null;
    this.treeCache = null;
    this.invalidReported = false;
  }

  /** @returns {TomlResult | null} */
  parse() {
    if (this.text === null) return null;
    const maxDepth = getConfig().maxDepth;
    if (!this.parsed || this.parsed.text !== this.text || this.parsed.maxDepth !== maxDepth) {
      this.parsed = { text: this.text, maxDepth, result: parseToml(this.text, { maxDepth }) };
    }
    return this.parsed.result;
  }

  /** @returns {View} */
  get view() {
    const fallback = this.editing || this.variant !== 'full' ? 'raw' : 'tree';
    return this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, fallback);
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const result = this.parse();
    if (!result) return;
    // The TOML grammar (highlight.js "ini") is loaded on demand for the raw view and editor.
    if (this.view === 'raw' && !isLanguageLoaded('ini'))
      loadLanguage('ini').then((ok) => ok && this.requestRender());
    if (this.editing && this.view === 'raw') {
      this.renderEditor(frame, result);
      return;
    }
    if (!result.ok) {
      this.renderInvalid(frame, result.error);
      return;
    }
    const root = result.value;
    const view = this.view;
    /** @type {SearchTarget} */
    let target;
    /** @type {HTMLElement[]} */
    let content;
    /** @type {JsonTree | null} */
    let tree = null;

    if (view === 'tree') {
      tree = this.treeFor(root);
      tree.render();
      content = [h('div', { class: 'body tree-body', part: 'body' }, tree.element)];
      if (this.feature('path')) content.push(this.pathBar(tree));
      const activeTree = tree;
      target = {
        run: (query) => activeTree.search(query),
        go: (index) => activeTree.goToMatch(index),
        clear: () => activeTree.search(''),
      };
    } else {
      const codeView = buildCodeView(this.text ?? '', {
        language: 'toml',
        lineNumbers: this.feature('line-numbers'),
        startLine: 1,
        highlightRanges: [],
        diff: false,
        highlightLimit: getConfig().highlightLimit,
      });
      const search = new TextSearch(codeView.code);
      target = {
        run: (query) => search.run(query),
        go: (index) => revealMatch(search.go(index)),
        clear: () => search.clear(),
      };
      content = [
        h(
          'div',
          {
            class: 'body',
            part: 'body',
            attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || 'TOML' },
          },
          codeView.element,
        ),
      ];
      if (codeView.highlightSkipped) content.unshift(noticeView(this.t('highlightSkipped')));
    }

    const actions = [
      this.searchButton(target),
      tree && this.feature('expand-controls') ? this.expandButtons(tree) : null,
      this.editToggleButton(),
      this.fullscreenButton(),
      ...this.fileButtons(() => toJson(root)),
    ].flat();
    const tabs = this.viewTabs(view);
    const panel = h(
      'div',
      { class: 'panel', attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null } },
      ...content,
    );
    frame.append(...this.chrome({ badge: tabs ? '' : 'TOML', tabs, actions }), panel);
  }

  /**
   * Download, copy as JSON and copy buttons.
   *
   * @param {(() => string) | null} json - JSON of the document, `null` when invalid.
   * @returns {(HTMLButtonElement | null)[]}
   */
  fileButtons(json) {
    return [
      this.feature('download')
        ? this.downloadButton(
            () => this.text ?? '',
            this.downloadName('data.toml'),
            'application/toml',
          )
        : null,
      json && this.feature('copy-json')
        ? this.copyTextButton(json, this.t('tomlCopyJson'), 'copy-json')
        : null,
      this.feature('copy') ? this.copyButton(() => this.text ?? '', this.t('copy')) : null,
    ];
  }

  /**
   * Tree / Raw tab list.
   *
   * @param {View} view
   * @returns {HTMLElement | null}
   */
  viewTabs(view) {
    return this.feature('tabs')
      ? createTabs({
          tabs: [
            { id: 'tree', label: this.t('tree'), icon: 'list' },
            { id: 'raw', label: this.t('raw'), icon: 'code' },
          ],
          selected: view,
          label: this.t('tabs'),
          panelId: this.panelId,
          onSelect: (id) => this.selectView(/** @type {View} */ (id)),
        })
      : null;
  }

  /**
   * Edit mode, raw view: a TOML editor with live validation.
   *
   * @param {HTMLElement} frame
   * @param {TomlResult} result
   */
  renderEditor(frame, result) {
    const error = result.ok ? null : result.error;
    this.editor?.destroy();
    const editor = new CodeEditor({
      text: this.text ?? '',
      language: 'toml',
      lineNumbers: this.feature('line-numbers'),
      wrap: false,
      highlightRanges: error ? [[error.line, error.line]] : [],
      highlightLimit: getConfig().highlightLimit,
      label: this.heading || `TOML ${this.t('editor').toLowerCase()}`,
      placeholder: this.getAttribute('placeholder') ?? undefined,
      onInput: (text) => this.edited(text),
      onChange: (text) => emit(this, EVENTS.CHANGE, { value: text }),
      history: this.editHistory ?? undefined,
    });
    this.editor = editor;
    this.errorLine = error?.line ?? 0;
    this.status = h('div', { class: 'edit-status', part: 'status', attrs: { role: 'status' } });
    this.showStatus(result);
    /** @type {TextSearch | null} */
    let search = null;
    /** @type {SearchTarget} */
    const target = {
      run: (query) => {
        search = new TextSearch(/** @type {Element} */ (editor.layer.querySelector('pre.code')));
        return search.run(query);
      },
      go: (index) => revealMatch(search?.go(index) ?? null),
      clear: () => search?.clear(),
    };
    const tabs = this.viewTabs('raw');
    const actions = [
      this.searchButton(target),
      ...this.historyButtons(editor),
      this.editToggleButton(),
      this.fullscreenButton(),
      ...this.fileButtons(null),
    ];
    const panel = h(
      'div',
      { class: 'panel', attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null } },
      h('div', { class: 'body editor-body', part: 'body' }, editor.element),
      parseBoolean(this.getAttribute('status')) === false ? null : this.status,
    );
    frame.append(...this.chrome({ badge: tabs ? '' : 'TOML', tabs, actions }), panel);
    editor.align();
  }

  /**
   * @param {TomlSyntaxError} error
   * @returns {string}
   */
  errorMessage(error) {
    return error.tooDeep
      ? this.t('tooDeep', { limit: getConfig().maxDepth })
      : this.t('tomlInvalid', { line: error.line, column: error.column, message: error.message });
  }

  /**
   * Shows whether the edited text is valid TOML.
   *
   * @param {TomlResult} result
   */
  showStatus(result) {
    if (!this.status) return;
    const message = result.ok ? this.t('tomlValid') : this.errorMessage(result.error);
    this.status.className = `edit-status ${result.ok ? 'ok' : 'bad'}`;
    this.status.replaceChildren(icon(result.ok ? 'check' : 'alert'), h('span', { text: message }));
  }

  /** The text was edited: validate shortly after typing stops. */
  contentEdited() {
    this.treeCache = null;
    this.invalidReported = false;
    clearTimeout(this.validateTimer);
    this.validateTimer = setTimeout(() => {
      const result = this.parse();
      if (!result) return;
      this.showStatus(result);
      const line = result.ok ? 0 : result.error.line;
      if (line !== this.errorLine) {
        this.errorLine = line;
        this.editor?.setHighlightRanges(line ? [[line, line]] : []);
      }
      if (this.searchOpen && this.searchQuery) this.searchBar?.run();
    }, 150);
  }

  /**
   * Returns the tree for the current document and options, keeping its state when possible.
   *
   * @param {JsonNode} root
   * @returns {JsonTree}
   */
  treeFor(root) {
    const options = {
      t: this.t,
      locale: this.locale,
      depth: parseInteger(this.getAttribute('depth'), { min: 0, max: 1000, fallback: 2 }),
      sortKeys: this.feature('sort-keys'),
      showTypes: this.feature('show-types'),
      label: this.heading || 'TOML',
      onSelect: (/** @type {JsonNode} */ node) => this.updatePath(node),
    };
    const key = JSON.stringify({ ...options, t: undefined, onSelect: undefined });
    if (!this.treeCache || this.treeCache.key !== key) {
      this.treeCache = { key, tree: new JsonTree(root, options) };
    } else {
      this.treeCache.tree.options = options;
    }
    return this.treeCache.tree;
  }

  /**
   * @param {JsonTree} tree
   * @returns {HTMLButtonElement[]}
   */
  expandButtons(tree) {
    return [
      iconButton({
        icon: 'expand-all',
        label: this.t('expandAll'),
        key: 'expand-all',
        onClick: () => {
          if (!tree.expandAll()) this.announce(this.t('truncated'));
        },
      }),
      iconButton({
        icon: 'collapse-all',
        label: this.t('collapseAll'),
        key: 'collapse-all',
        onClick: () => tree.collapseAll(),
      }),
    ];
  }

  /**
   * Path bar: TOML path of the selected node, copy path and copy value.
   *
   * @param {JsonTree} tree
   * @returns {HTMLElement}
   */
  pathBar(tree) {
    this.pathText = h('code', { class: 'path-text', text: tomlPath(tree.selected) });
    const copyPath = this.copyTextButton(
      () => tomlPath(tree.selected),
      this.t('copyPath'),
      'copy-path',
    );
    const copyValue = this.copyTextButton(
      () => valueText(tree.selected),
      this.t('copyValue'),
      'copy-value',
    );
    return h(
      'div',
      { class: 'pathbar', part: 'path' },
      this.pathText,
      h('div', { class: 'toolbar' }, copyPath, copyValue),
    );
  }

  /**
   * @param {JsonNode} node
   */
  updatePath(node) {
    if (this.pathText) this.pathText.textContent = tomlPath(node);
  }

  /**
   * Invalid TOML: error (default) or notice, then the raw text with the error line highlighted.
   *
   * @param {HTMLElement} frame
   * @param {TomlSyntaxError} error
   */
  renderInvalid(frame, error) {
    const mode = parseEnum(
      this.getAttribute('on-invalid'),
      /** @type {const} */ (['error', 'raw']),
      'error',
    );
    const message = this.errorMessage(error);
    const view = buildCodeView(this.text ?? '', {
      language: 'plaintext',
      lineNumbers: true,
      startLine: 1,
      highlightRanges: [[error.line, error.line]],
      diff: false,
      highlightLimit: 0,
    });
    const body = h(
      'div',
      {
        class: 'body',
        part: 'body',
        attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || 'TOML' },
      },
      view.element,
    );
    frame.append(
      ...this.chrome({
        badge: 'TOML',
        actions: [
          this.editToggleButton(),
          this.fullscreenButton(),
          this.feature('copy') ? this.copyButton(() => this.text ?? '') : null,
        ],
      }),
      mode === 'raw'
        ? noticeView(this.t('tomlInvalidRaw', { line: error.line, column: error.column }))
        : errorView(this.t('errorTitle'), message),
      body,
    );
    requestAnimationFrame(() => {
      const line = lineElement(body, error.line);
      if (line instanceof HTMLElement)
        body.scrollTop = Math.max(0, line.offsetTop - body.clientHeight / 2);
    });
    // Invalid content fires vt-error, never vt-ready.
    this._readyPending = false;
    if (!this.invalidReported) {
      this.invalidReported = true;
      emit(this, EVENTS.ERROR, { message, cause: error });
    }
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
}

/**
 * Text copied by "copy value": strings and dates as written, tables and arrays as JSON.
 *
 * @param {JsonNode} node
 * @returns {string}
 */
function valueText(node) {
  if (node.type === 'string') return node.value;
  if (node.type === 'object' || node.type === 'array') return toJson(node);
  return primitiveText(node);
}
