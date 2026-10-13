// @ts-check
import { defineStrings } from '../../core/i18n.js';
import { en as strings, fr as stringsFr } from './strings.js';
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import jsonCss from '../../styles/json.css?raw';
import xmlCss from '../../styles/xml.css?raw';
import { parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { lineElement } from '../../core/chunks.js';
import { buildCodeView, revealMatch } from '../../core/code-view.js';
import { CodeEditor } from '../../core/editor.js';
import { icon } from '../../core/icons.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { TextSearch } from '../../core/search.js';
import { createTabs, errorView, iconButton, noticeView } from '../../core/ui.js';
import { parseXml, serialize, textContent, xpathOf } from './parser.js';
import { XmlTree } from './tree.js';

defineStrings({ en: strings, fr: stringsFr });

const VIEWS = /** @type {const} */ (['tree', 'raw']);

/** @typedef {typeof VIEWS[number]} View */
/** @typedef {import('./parser.js').XmlNode} XmlNode */
/** @typedef {import('./parser.js').XmlResult} XmlResult */
/** @typedef {{ run(query: string): { total: number, capped: boolean }, go(index: number): void, clear(): void }} SearchTarget */

/**
 * Displays XML as a collapsible tree or as highlighted text.
 *
 * The XML is read by a built-in parser as data only: nothing becomes a DOM node of the
 * page and nothing is fetched. The DOCTYPE is shown but never processed, so external
 * entities are never resolved and declared entities are never expanded. Nesting depth
 * and node count are limited, and errors are reported with line and column.
 *
 * @element vt-xml
 * @since 0.9.0
 *
 * @attr {"tree"|"raw"} view - Initial view. Default: `tree` in the full variant, `raw` otherwise.
 * @attr {boolean} tabs - Shows the Tree / Raw tabs. Full variant: on.
 * @attr {number} depth - Levels expanded initially in the tree (default 2, 0 = collapsed).
 * @attr {number} indent - Raw view indentation when indented, 0–8 spaces (default 2).
 * @attr {boolean} pretty - Raw view indented (on) or as written (off). Default off.
 * @attr {boolean} expand-controls - "Expand all" / "collapse all" buttons. Full variant: on.
 * @attr {boolean} path - XPath of the selected node with copy buttons. Full variant: on.
 * @attr {boolean} line-numbers - Line numbers in the raw view. Full variant: on.
 * @attr {"error"|"raw"} on-invalid - Invalid XML: show an error (default) or the text with a notice.
 *
 * @prop {string} content - The XML text.
 * @prop {XmlNode | null} document - The parsed document (read-only), `null` when invalid.
 *
 * @fires vt-ready - XML rendered. Detail: `{ type: "xml" }`.
 * @fires vt-tab-change - View changed. Detail: `{ tab }`.
 * @fires vt-select - A node was selected in the tree. Detail: `{ xpath, type, name }`.
 * @fires vt-error - Invalid XML, loading failure or content too large. Detail: `{ message, cause }`.
 *
 * @csspart tree - The tree (`role="tree"`).
 * @csspart tree-item - A tree item.
 * @csspart row - The visible row of a tree item.
 * @csspart tree-toggle - Expand / collapse chevron.
 * @csspart element - An element name.
 * @csspart prefix - A namespace prefix.
 * @csspart key - An attribute name.
 * @csspart value - An attribute value or a text.
 * @csspart count - Child count of a collapsed element.
 * @csspart more-item - "Show more" row of a large element.
 * @csspart path - XPath bar of the selected node.
 * @csspart pretty-button - Indent / as written toggle of the raw view.
 *
 * @example
 * <vt-xml variant="full" src="/feeds/news.xml"></vt-xml>
 */
export class VtXml extends VtBase {
  static type = 'xml';

  static componentAttributes = Object.freeze([
    'view', 'tabs', 'depth', 'indent', 'pretty', 'expand-controls', 'path', 'line-numbers', 'on-invalid',
  ]); // prettier-ignore

  static presets = {
    simple: {},
    full: {
      header: true, dot: true, copy: true, search: true, download: true, tabs: true,
      'expand-controls': true, path: true, 'line-numbers': true, fullscreen: true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, jsonCss, xmlCss];

  constructor() {
    super();
    /** @type {View | null} */
    this.viewState = null;
    /** @type {boolean | null} Indentation chosen with the button; `null` follows `pretty`. */
    this.prettyState = null;
    this.panelId = uid('panel');
    /** @type {{ text: string, maxDepth: number, result: XmlResult } | null} */
    this.parsed = null;
    /** @type {{ key: string, tree: XmlTree } | null} */
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

  /** @type {XmlNode | null} */
  get document() {
    const result = this.parse();
    return result?.ok ? result.value : null;
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'view') this.viewState = null;
    if (name === 'pretty') this.prettyState = null;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  contentChanged() {
    this.parsed = null;
    this.treeCache = null;
    this.invalidReported = false;
  }

  /** @returns {XmlResult | null} */
  parse() {
    if (this.text === null) return null;
    const maxDepth = getConfig().maxDepth;
    if (!this.parsed || this.parsed.text !== this.text || this.parsed.maxDepth !== maxDepth)
      this.parsed = { text: this.text, maxDepth, result: parseXml(this.text, { maxDepth }) };
    return this.parsed.result;
  }

  /** @returns {View} */
  get view() {
    const fallback = this.editing || this.variant !== 'full' ? 'raw' : 'tree';
    return this.viewState ?? parseEnum(this.getAttribute('view'), VIEWS, fallback);
  }

  /** @returns {boolean} */
  get pretty() {
    return this.prettyState ?? this.feature('pretty');
  }

  /**
   * Raw view text: indented, or as written.
   *
   * @param {XmlResult & { ok: true }} result
   * @returns {string}
   */
  rawText(result) {
    if (!this.pretty) return this.text ?? '';
    const indent = parseInteger(this.getAttribute('indent'), { min: 0, max: 8, fallback: 2 });
    return serialize(result.value, { indent, declaration: result.declaration });
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
    const view = this.view;
    /** @type {SearchTarget} */
    let target;
    /** @type {(HTMLElement | null)[]} */
    let content;
    /** @type {XmlTree | null} */
    let tree = null;

    if (view === 'tree') {
      const activeTree = this.treeFor(result.value);
      tree = activeTree;
      activeTree.render();
      content = [
        h('div', { class: 'body tree-body', part: 'body' }, activeTree.element),
        this.feature('path') ? this.pathBar(activeTree) : null,
      ];
      target = {
        run: (query) => activeTree.search(query),
        go: (index) => activeTree.goToMatch(index),
        clear: () => activeTree.search(''),
      };
    } else {
      const codeView = buildCodeView(this.rawText(result), {
        language: 'xml',
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
        codeView.highlightSkipped ? noticeView(this.t('highlightSkipped')) : null,
        h(
          'div',
          {
            class: 'body',
            part: 'body',
            attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || 'XML' },
          },
          codeView.element,
        ),
      ];
    }
    if (result.entities.length)
      content.unshift(
        noticeView(this.t('xmlEntities', { names: result.entities.slice(0, 10).join(', ') })),
      );

    const actions = [
      this.searchButton(target),
      tree && this.feature('expand-controls') ? this.expandButtons(tree) : null,
      view === 'raw' ? this.prettyButton() : null,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(
            () => this.rawText(result),
            this.downloadName('data.xml'),
            'application/xml',
          )
        : null,
      this.feature('copy') ? this.copyButton(() => this.rawText(result), this.t('copy')) : null,
    ].flat();
    const tabs = this.viewTabs(view);
    const panel = h(
      'div',
      { class: 'panel', attrs: { id: this.panelId, role: tabs ? 'tabpanel' : null } },
      ...content,
    );
    frame.append(...this.chrome({ badge: tabs ? '' : 'XML', tabs, actions }), panel);
  }

  /** @returns {HTMLButtonElement} */
  prettyButton() {
    const pretty = this.pretty;
    return iconButton({
      icon: 'wrap',
      label: this.t('xmlPretty'),
      key: 'pretty',
      part: 'pretty-button',
      pressed: pretty,
      onClick: () => {
        this.prettyState = !pretty;
        this.render();
      },
    });
  }

  /**
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
   * Edit mode, raw view: an XML editor with live validation.
   *
   * @param {HTMLElement} frame
   * @param {XmlResult} result
   */
  renderEditor(frame, result) {
    const t = this.t;
    const error = result.ok ? null : result.error;
    this.editor?.destroy();
    const editor = new CodeEditor({
      text: this.text ?? '',
      language: 'xml',
      lineNumbers: this.feature('line-numbers'),
      wrap: false,
      highlightRanges: error ? [[error.line, error.line]] : [],
      highlightLimit: getConfig().highlightLimit,
      label: this.heading || `XML ${t('editor').toLowerCase()}`,
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
      this.feature('download')
        ? this.downloadButton(
            () => this.text ?? '',
            this.downloadName('data.xml'),
            'application/xml',
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
    frame.append(...this.chrome({ badge: tabs ? '' : 'XML', tabs, actions }), panel);
    editor.align();
  }

  /**
   * @param {import('./parser.js').XmlSyntaxError} error
   * @returns {string}
   */
  errorMessage(error) {
    return error.tooDeep
      ? this.t('xmlTooDeep', { limit: getConfig().maxDepth })
      : this.t('xmlInvalid', { line: error.line, column: error.column, message: error.message });
  }

  /**
   * @param {XmlResult} result
   */
  showStatus(result) {
    if (!this.status) return;
    const message = result.ok ? this.t('xmlValid') : this.errorMessage(result.error);
    this.status.className = `edit-status ${result.ok ? 'ok' : 'bad'}`;
    this.status.replaceChildren(icon(result.ok ? 'check' : 'alert'), h('span', { text: message }));
  }

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
   * @param {XmlNode} doc
   * @returns {XmlTree}
   */
  treeFor(doc) {
    const options = {
      t: this.t,
      locale: this.locale,
      depth: parseInteger(this.getAttribute('depth'), { min: 0, max: 1000, fallback: 2 }),
      label: this.heading || 'XML',
      onSelect: (/** @type {XmlNode} */ node) => this.selectNode(node),
    };
    const key = JSON.stringify({
      depth: options.depth,
      locale: options.locale,
      label: options.label,
    });
    if (!this.treeCache || this.treeCache.key !== key)
      this.treeCache = { key, tree: new XmlTree(doc, options) };
    else this.treeCache.tree.options = options;
    return this.treeCache.tree;
  }

  /**
   * @param {XmlTree} tree
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
   * XPath bar: path of the selected node, copy path and copy node.
   *
   * @param {XmlTree} tree
   * @returns {HTMLElement}
   */
  pathBar(tree) {
    this.pathText = h('code', { class: 'path-text', text: xpathOf(tree.selected) });
    return h(
      'div',
      { class: 'pathbar', part: 'path' },
      this.pathText,
      h(
        'div',
        { class: 'toolbar' },
        this.copyTextButton(() => xpathOf(tree.selected), this.t('xmlCopyXpath'), 'copy-path'),
        this.copyTextButton(() => nodeText(tree.selected), this.t('xmlCopyNode'), 'copy-value'),
      ),
    );
  }

  /**
   * @param {XmlNode} node
   */
  selectNode(node) {
    const xpath = xpathOf(node);
    if (this.pathText) this.pathText.textContent = xpath;
    emit(this, EVENTS.SELECT, { xpath, type: node.type, name: node.name });
  }

  /**
   * @param {HTMLElement} frame
   * @param {import('./parser.js').XmlSyntaxError} error
   */
  renderInvalid(frame, error) {
    const t = this.t;
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
        attrs: { tabindex: '0', role: 'region', 'aria-label': this.heading || 'XML' },
      },
      view.element,
    );
    frame.append(
      ...this.chrome({
        badge: 'XML',
        actions: [
          this.editToggleButton(),
          this.fullscreenButton(),
          this.feature('copy') ? this.copyButton(() => this.text ?? '') : null,
        ],
      }),
      mode === 'raw'
        ? noticeView(t('xmlInvalidRaw', { line: error.line, column: error.column }))
        : errorView(t('errorTitle'), message),
      body,
    );
    requestAnimationFrame(() => {
      const line = lineElement(body, error.line);
      if (line instanceof HTMLElement)
        body.scrollTop = Math.max(0, line.offsetTop - body.clientHeight / 2);
    });
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
 * Text copied by "copy node": the XML of an element, the text of anything else.
 *
 * @param {XmlNode} node
 * @returns {string}
 */
function nodeText(node) {
  if (node.type !== 'element') return textContent(node);
  return serialize(/** @type {XmlNode} */ ({ ...node, type: 'document', children: [node] }));
}
