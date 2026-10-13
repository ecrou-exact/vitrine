// @ts-check
import { defineStrings } from '../../core/i18n.js';
import { en as strings, fr as stringsFr } from './strings.js';
import yamlCss from '../../styles/yaml.css?raw';
import { getConfig } from '../../core/config.js';
import { h } from '../../core/dom.js';
import { errorView, loadingView } from '../../core/ui.js';
import { loadYaml } from '../../core/yaml-loader.js';
import { VtJson } from '../json/vt-json.js';
import { documentsToTree, findAnchors, yamlError } from './document.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('../json/parser.js').JsonNode} JsonNode */
/** @typedef {import('../json/parser.js').ParseResult} ParseResult */
/** @typedef {import('../json/parser.js').JsonSyntaxError} JsonSyntaxError */

/**
 * Displays YAML as a collapsible tree or as highlighted text, like `<vt-json>`.
 *
 * YAML is read by js-yaml with the core schema (strings, numbers, booleans, null, arrays
 * and objects only), loaded on demand from `dist/vendor/yaml.js`. A stream with several
 * documents (`---`) is shown as a list of documents. Anchors are listed under the tree;
 * aliases are shown resolved in the tree and as written in the Raw view.
 *
 * @element vt-yaml
 * @since 0.4.0
 *
 * @attr {"tree"|"raw"} view - Initial view. Default: `tree` in the full variant, `raw` otherwise.
 * @attr {boolean} tabs - Shows the Tree / Raw tabs. Full variant: on.
 * @attr {number} depth - Levels expanded initially in the tree (default 2, 0 = collapsed).
 * @attr {boolean} sort-keys - Sorts keys alphabetically in the tree.
 * @attr {boolean} show-types - Shows a type badge on each tree row. Full variant: on.
 * @attr {boolean} expand-controls - Shows "expand all" / "collapse all" buttons. Full variant: on.
 * @attr {boolean} path - Shows the path of the selected node with copy buttons. Full variant: on.
 * @attr {boolean} line-numbers - Line numbers in the raw view. Full variant: on.
 * @attr {"error"|"raw"} on-invalid - Invalid YAML: show an error (default) or the raw text with a notice.
 *
 * @prop {string} content - The YAML text.
 * @prop {unknown} data - The parsed value (read); setting it writes the value as JSON, which is valid YAML.
 *
 * @fires vt-ready - YAML rendered. Detail: `{ type: "yaml" }`.
 * @fires vt-tab-change - View changed. Detail: `{ tab }` (`"tree"` or `"raw"`).
 * @fires vt-copy - YAML, JSON, a value or a path copied. Detail: `{ text }`.
 * @fires vt-search - Search updated. Detail: `{ query, matches }`.
 * @fires vt-error - Invalid YAML, loading failure or content too large. Detail: `{ message, cause }`.
 *
 * @csspart tree - The tree (`role="tree"`).
 * @csspart row - The visible row of a tree item.
 * @csspart key - A key.
 * @csspart value - A scalar value.
 * @csspart path - Path bar of the selected node.
 * @csspart anchors - List of anchors under the tree.
 *
 * @example
 * <vt-yaml variant="full">
 *   <template>
 *     name: shop
 *     ports: [80, 443]
 *   </template>
 * </vt-yaml>
 */
export class VtYaml extends VtJson {
  static type = 'yaml';

  static source = Object.freeze({
    language: 'yaml',
    file: 'data.yaml',
    mime: 'application/yaml',
    badge: 'YAML',
  });

  static styles = [...VtJson.styles, yamlCss];

  constructor() {
    super();
    /** @type {{ text: string, documents: number, json: string } | null} */
    this.yamlInfo = null;
    /** @type {Error | null} */
    this.loadError = null;
    this.waiting = false;
  }

  /** @type {unknown} */
  get data() {
    const result = this.parse();
    return result?.ok && this.yamlInfo ? JSON.parse(this.yamlInfo.json) : undefined;
  }

  set data(value) {
    super.data = value;
  }

  /** @returns {ParseResult | null} */
  parse() {
    if (this.text === null) return null;
    const text = this.text;
    const maxDepth = getConfig().maxDepth;
    const cached = /** @type {VtJson} */ (this).parsed;
    if (cached && cached.text === text && cached.maxDepth === maxDepth) return cached.result;
    const reader = loadYaml();
    if (!reader.ready || !reader.parseAll) {
      if (!this.waiting) {
        this.waiting = true;
        reader.promise.then(
          () => {
            this.waiting = false;
            this.requestRender();
          },
          (error) => {
            this.waiting = false;
            this.loadError = error instanceof Error ? error : new Error(String(error));
            this.requestRender();
          },
        );
      }
      return null;
    }
    /** @type {ParseResult} */
    let result;
    try {
      const tree = documentsToTree(reader.parseAll(text), maxDepth);
      result = tree.result;
      this.yamlInfo = { text, documents: tree.documents, json: tree.json };
    } catch (error) {
      result = { ok: false, error: yamlError(error) };
      this.yamlInfo = null;
    }
    this.parsed = { text, maxDepth, result };
    return result;
  }

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    if (this.text !== null && !this.parse()) {
      const body = this.loadError
        ? errorView(
            this.t('errorTitle'),
            this.t('yamlLoadFailed', { message: this.loadError.message }),
          )
        : h('div', { class: 'body', part: 'body' }, loadingView(this.t));
      frame.append(...this.chrome(null), body);
      this._readyPending = false;
      return;
    }
    super.renderContent(frame);
    const info = this.yamlInfo;
    if (!info || this.editing || this.view !== 'tree') return;
    const panel = frame.querySelector('.panel');
    const notes = [];
    if (info.documents > 1)
      notes.push(
        h('span', { class: 'yaml-docs', text: this.t('yamlDocuments', { count: info.documents }) }),
      );
    const anchors = findAnchors(info.text);
    if (anchors.length) {
      notes.push(
        h('span', { class: 'yaml-anchors-label', text: this.t('yamlAnchors') }),
        ...anchors.slice(0, 50).map((anchor) =>
          h('code', {
            class: 'yaml-anchor',
            text: `&${anchor.name}${anchor.uses ? ` ×${anchor.uses}` : ''}`,
            attrs: { title: this.t('yamlAnchorUses', anchor) },
          }),
        ),
      );
    }
    if (notes.length && panel)
      panel.append(h('div', { class: 'yaml-anchors', part: 'anchors' }, ...notes));
  }

  /**
   * The raw view shows the YAML as written, with its comments, anchors and aliases.
   *
   * @param {JsonNode} _root
   * @returns {string}
   */
  // eslint-disable-next-line no-unused-vars
  rawText(_root) {
    return this.text ?? '';
  }

  /**
   * @param {JsonNode} _root
   * @returns {(HTMLButtonElement | null)[]}
   */
  // eslint-disable-next-line no-unused-vars
  extraActions(_root) {
    if (!this.feature('copy')) return [];
    return [this.copyButton(() => this.yamlInfo?.json ?? '', this.t('yamlCopyJson'), 'copy-json')];
  }

  validMessage() {
    return this.t('yamlValid');
  }

  /**
   * @param {JsonSyntaxError} error
   * @returns {string}
   */
  syntaxMessage(error) {
    return error.tooDeep
      ? this.t('tooDeep', { limit: getConfig().maxDepth })
      : this.t('yamlInvalid', { line: error.line, column: error.column, message: error.message });
  }

  /**
   * @param {JsonSyntaxError} error
   * @returns {string}
   */
  rawNotice(error) {
    return this.t('yamlInvalidRaw', { line: error.line, column: error.column });
  }
}
