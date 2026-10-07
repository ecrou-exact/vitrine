// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import jsonCss from '../../styles/json.css?raw';
import { parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { buildCodeView, revealMatch } from '../../core/code-view.js';
import { CodeEditor } from '../../core/editor.js';
import { icon } from '../../core/icons.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { TextSearch } from '../../core/search.js';
import { createTabs, errorView, iconButton, noticeView } from '../../core/ui.js';
import { parseJson, pathOf, stringify } from './parser.js';
import { JsonTree } from './tree.js';

const VIEWS = /** @type {const} */ (['tree', 'raw']);

/** @typedef {typeof VIEWS[number]} View */
/** @typedef {import('./parser.js').JsonNode} JsonNode */
/** @typedef {import('./parser.js').ParseResult} ParseResult */

/**
 * Displays JSON as highlighted text or as a collapsible tree.
 *
 * The JSON is parsed by a built-in parser that keeps numbers exactly as written,
 * keeps duplicate keys, limits nesting depth and reports errors with line and column.
 * Everything is rendered with DOM text APIs: no HTML parsing is involved.
 *
 * @element vt-json
 * @since 0.3.0
 *
 * @attr {"tree"|"raw"} view - Initial view. Default: `tree` in the full variant, `raw` otherwise.
 * @attr {boolean} tabs - Shows the Tree / Raw tabs. Full variant: on.
 * @attr {number} depth - Levels expanded initially in the tree (default 2, 0 = collapsed).
 * @attr {number} indent - Raw view indentation, 0–8 spaces (default 2).
 * @attr {boolean} sort-keys - Sorts object keys alphabetically.
 * @attr {boolean} show-types - Shows a type badge on each tree row. Full variant: on.
 * @attr {boolean} expand-controls - Shows "expand all" / "collapse all" buttons. Full variant: on.
 * @attr {boolean} path - Shows the JSON path of the selected node with copy buttons. Full variant: on.
 * @attr {boolean} line-numbers - Line numbers in the raw view. Full variant: on.
 * @attr {"error"|"raw"} on-invalid - Invalid JSON: show an error (default) or the raw text with a notice.
 *
 * @prop {string} content - The JSON text.
 * @prop {unknown} data - A JavaScript value, serialized with `JSON.stringify`.
 *
 * @fires vt-ready - JSON rendered. Detail: `{ type: "json" }`.
 * @fires vt-tab-change - View changed. Detail: `{ tab }` (`"tree"` or `"raw"`).
 * @fires vt-copy - JSON, a value or a path copied. Detail: `{ text }`.
 * @fires vt-search - Search updated. Detail: `{ query, matches }`.
 * @fires vt-error - Invalid JSON, loading failure or content too large. Detail: `{ message, cause }`.
 *
 * @csspart tree - The tree (`role="tree"`).
 * @csspart tree-item - A tree item.
 * @csspart row - The visible row of a tree item.
 * @csspart tree-toggle - Expand / collapse chevron.
 * @csspart key - An object key.
 * @csspart index - An array index.
 * @csspart value - A primitive value.
 * @csspart count - Item / key count of a container.
 * @csspart type-badge - Type badge.
 * @csspart more-item - "Show more" row of a large container.
 * @csspart path - Path bar of the selected node.
 *
 * @example
 * <vt-json variant="full">{"users": [{"name": "Ada"}]}</vt-json>
 */
export class VtJson extends VtBase {
  static type = 'json';

  static componentAttributes = Object.freeze([
    'view', 'tabs', 'depth', 'indent', 'sort-keys', 'show-types', 'expand-controls', 'path', 'line-numbers', 'on-invalid',
  ]); // prettier-ignore

  static presets = {
    simple: {},
    full: {
      header: true, dot: true, copy: true, search: true, download: true, tabs: true,
      'show-types': true, 'expand-controls': true, path: true, 'line-numbers': true, fullscreen: true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, jsonCss];

  static upgradeProperties = ['content', 'data'];

  constructor() {
    super();
    /** @type {View | null} View chosen by the user; `null` follows the `view` attribute. */
    this.viewState = null;
    this.panelId = uid('panel');
    /** @type {{ text: string, maxDepth: number, result: ParseResult } | null} */
    this.parsed = null;
    /** @type {{ key: string, tree: JsonTree } | null} */
    this.treeCache = null;
    /** @type {{ key: string, text: string } | null} */
    this.rawCache = null;
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
   * A JavaScript value to display. It is serialized with `JSON.stringify`; values that
   * cannot be serialized (circular structures, BigInt) show an error.
   *
   * Reading it returns `JSON.parse()` of the content: like any JavaScript value, numbers
   * beyond 2^53 are rounded and duplicate keys keep the last value. The display itself
   * always shows the exact text.
   *
   * @type {unknown}
   */
  get data() {
    const result = this.parse();
    return result?.ok ? JSON.parse(this.text ?? 'null') : undefined;
  }

  set data(value) {
    /** @type {string | undefined} */
    let text;
    try {
      text = JSON.stringify(value, null, 2);
    } catch (error) {
      this._content = '';
      this.setError(new Error(this.t('unserializable'), { cause: error }));
      return;
    }
    this.content = text === undefined ? '' : text;
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
    this.rawCache = null;
    this.invalidReported = false;
  }

  /** @returns {ParseResult | null} */
  parse() {
    if (this.text === null) return null;
    const maxDepth = getConfig().maxDepth;
    if (!this.parsed || this.parsed.text !== this.text || this.parsed.maxDepth !== maxDepth) {
      this.parsed = { text: this.text, maxDepth, result: parseJson(this.text, { maxDepth }) };
    }
    return this.parsed.result;
  }

  /** @returns {View} */
  get view() {
    const fallback = this.editing || this.variant !== 'full' ? 'raw' : 'tree';
    return this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, fallback);
  }

  /** @returns {{ indent: number, sortKeys: boolean }} */
  get format() {
    return {
      indent: parseInteger(this.getAttribute('indent'), { min: 0, max: 8, fallback: 2 }),
      sortKeys: this.feature('sort-keys'),
    };
  }

  /**
   * Pretty-printed JSON (cached).
   *
   * @param {JsonNode} root
   * @returns {string}
   */
  prettyText(root) {
    const key = JSON.stringify(this.format);
    if (!this.rawCache || this.rawCache.key !== key)
      this.rawCache = { key, text: stringify(root, this.format) };
    return this.rawCache.text;
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const result = this.parse();
    if (!result) return;
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
    /** @type {{ run(query: string): { total: number, capped: boolean }, go(index: number): void, clear(): void }} */
    let target;
    /** @type {HTMLElement[]} */
    let content;
    /** @type {JsonTree | null} */
    let tree = null;

    if (view === 'tree') {
      tree = this.treeFor(root);
      tree.render();
      const body = h('div', { class: 'body tree-body', part: 'body' }, tree.element);
      content = [body];
      if (this.feature('path')) content.push(this.pathBar(tree));
      const activeTree = tree;
      target = {
        run: (query) => activeTree.search(query),
        go: (index) => activeTree.goToMatch(index),
        clear: () => activeTree.search(''),
      };
    } else {
      const text = this.prettyText(root);
      const codeView = buildCodeView(text, {
        language: 'json',
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
            attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || 'JSON' },
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
      this.feature('download')
        ? this.downloadButton(
            () => this.prettyText(root),
            this.downloadName('data.json'),
            'application/json',
          )
        : null,
      this.feature('copy') ? this.copyButton(() => this.prettyText(root), this.t('copy')) : null,
    ].flat();
    const tabs = this.viewTabs(view);
    const panel = h(
      'div',
      { class: 'panel', attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null } },
      ...content,
    );
    frame.append(...this.chrome({ badge: tabs ? '' : 'JSON', tabs, actions }), panel);
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
   * Edit mode, raw view: a JSON editor with live validation.
   *
   * @param {HTMLElement} frame
   * @param {ParseResult} result
   */
  renderEditor(frame, result) {
    const t = this.t;
    const error = result.ok ? null : result.error;
    this.editor?.destroy();
    const editor = new CodeEditor({
      text: this.text ?? '',
      language: 'json',
      lineNumbers: this.feature('line-numbers'),
      wrap: false,
      highlightRanges: error ? [[error.line, error.line]] : [],
      highlightLimit: getConfig().highlightLimit,
      label: this.heading || `JSON ${t('editor').toLowerCase()}`,
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
    const target = {
      /** @param {string} query */
      run: (query) => {
        search = new TextSearch(/** @type {Element} */ (editor.layer.querySelector('pre.code')));
        return search.run(query);
      },
      /** @param {number} index */
      go: (index) => revealMatch(search?.go(index) ?? null),
      clear: () => search?.clear(),
    };
    const tabs = this.viewTabs('raw');
    const actions = [
      this.searchButton(target),
      ...this.historyButtons(editor),
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(
            () => this.text ?? '',
            this.downloadName('data.json'),
            'application/json',
          )
        : null,
      this.feature('copy') ? this.copyButton(() => this.text ?? '', t('copy')) : null,
    ];
    const panel = h(
      'div',
      { class: 'panel', attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null } },
      h('div', { class: 'body editor-body', part: 'body' }, editor.element),
      parseBoolean(this.getAttribute('status')) === false ? null : this.status,
    );
    frame.append(...this.chrome({ badge: tabs ? '' : 'JSON', tabs, actions }), panel);
    editor.align();
  }

  /**
   * Shows whether the edited text is valid JSON.
   *
   * @param {ParseResult} result
   */
  showStatus(result) {
    if (!this.status) return;
    const t = this.t;
    let message = t('validJson');
    if (!result.ok) {
      const { error } = result;
      message = error.tooDeep
        ? t('tooDeep', { limit: getConfig().maxDepth })
        : t('invalidJson', { line: error.line, column: error.column, message: error.message });
    }
    this.status.className = `edit-status ${result.ok ? 'ok' : 'bad'}`;
    this.status.replaceChildren(icon(result.ok ? 'check' : 'alert'), h('span', { text: message }));
  }

  /**
   * The text was edited: validate shortly after typing stops.
   */
  contentEdited() {
    this.treeCache = null;
    this.rawCache = null;
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
      label: this.heading || 'JSON',
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
          const complete = tree.expandAll();
          if (!complete) this.announce(this.t('truncated'));
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
   * Path bar: JSONPath of the selected node, copy path and copy value.
   *
   * @param {JsonTree} tree
   * @returns {HTMLElement}
   */
  pathBar(tree) {
    this.pathText = h('code', { class: 'path-text', text: pathOf(tree.selected) });
    const copyPath = this.copyTextButton(
      () => pathOf(tree.selected),
      this.t('copyPath'),
      'copy-path',
    );
    const copyValue = this.copyTextButton(
      () => valueText(tree.selected, this.format),
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
    if (this.pathText) this.pathText.textContent = pathOf(node);
  }

  /**
   * Invalid JSON: error (default) or notice, then the raw text with the error line highlighted.
   *
   * @param {HTMLElement} frame
   * @param {import('./parser.js').JsonSyntaxError} error
   */
  renderInvalid(frame, error) {
    const t = this.t;
    const mode = parseEnum(
      this.getAttribute('on-invalid'),
      /** @type {const} */ (['error', 'raw']),
      'error',
    );
    const message = error.tooDeep
      ? t('tooDeep', { limit: getConfig().maxDepth })
      : t('invalidJson', { line: error.line, column: error.column, message: error.message });
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
        attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || 'JSON' },
      },
      view.element,
    );
    frame.append(
      ...this.chrome({
        badge: 'JSON',
        actions: [
          this.editToggleButton(),
          this.fullscreenButton(),
          this.feature('copy') ? this.copyButton(() => this.text ?? '') : null,
        ],
      }),
      mode === 'raw'
        ? noticeView(t('invalidJsonRaw', { line: error.line, column: error.column }))
        : errorView(t('errorTitle'), message),
      body,
    );
    requestAnimationFrame(() => {
      const line = body.querySelector(`[data-line="${error.line}"]`);
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
 * Text copied by "copy value": the raw string for strings, JSON for everything else.
 *
 * @param {JsonNode} node
 * @param {{ indent: number, sortKeys: boolean }} format
 * @returns {string}
 */
function valueText(node, format) {
  return node.type === 'string' ? node.value : stringify(node, format);
}
