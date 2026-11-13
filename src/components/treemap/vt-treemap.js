// @ts-check
import csvCss from '../../styles/csv.css?raw';
import treemapCss from '../../styles/treemap.css?raw';
import { parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h, uid } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { MAX_QUERY_LENGTH } from '../../core/search.js';
import { createTabs, noticeView } from '../../core/ui.js';
import { formatSize } from '../upload/files.js';
import { TreemapError, parseTree, pathOf, squarify, treeToCsv } from './treemap.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./treemap.js').Tree} Tree */
/** @typedef {import('./treemap.js').TreeNode} TreeNode */
/** @typedef {import('./treemap.js').Rect} Rect */

const TABS = /** @type {const} */ (['map', 'list']);
/** Size of the map in layout units: its aspect ratio is set by CSS to the same. */
const WIDTH = 1000;
const HEIGHT = 560;
/** Height of the name band of a group, in layout units. */
const BAND = 22;
/** Gap between a group and what it holds. */
const PAD = 3;
const COLORS = 8;
/** Rectangles drawn at most. */
const MAX_DRAWN = 3000;
/** Rows of the list. */
const MAX_LIST = 500;

/**
 * A treemap: the sizes of a hierarchy as nested rectangles, each as large as its share.
 * Choosing a rectangle opens it; the path at the top goes back. Reads JSON trees, esbuild
 * metafiles, webpack stats, lists of paths and sizes (JSON or CSV), CSV with a column per
 * level (`team,service,cost`) and the output of `du`.
 *
 * @element vt-treemap
 * @since 0.15.0
 *
 * @attr {number} depth - Levels drawn inside each other, 1 to 4 (default 2).
 * @attr {string} unit - Unit of the sizes; `bytes` writes them as kB and MB (default for bundles).
 * @attr {boolean} tabs - Map and List tabs. Full variant: on.
 * @attr {"map"|"list"} default-tab - Tab shown at first (default `map`).
 *
 * @prop {string} content - The sizes.
 * @prop {Tree | null} tree - The tree read (read-only).
 *
 * @fires vt-select - A rectangle was opened or chosen. Detail: `{ name, path, size, leaf }`.
 * @fires vt-tab-change - The tab changed. Detail: `{ tab }`.
 *
 * @csspart map - The rectangles.
 * @csspart item - A rectangle (also `item-match` during a search).
 * @csspart crumbs - The path of the group opened.
 * @csspart details - The rectangle under the pointer or the focus.
 * @csspart table - The list.
 *
 * @example
 * <vt-treemap variant="full" src="/dist/meta.json"></vt-treemap>
 */
export class VtTreemap extends VtBase {
  static type = 'treemap';

  static componentAttributes = Object.freeze(['depth', 'unit', 'tabs', 'default-tab']);

  static presets = {
    simple: {},
    full: { header: true, dot: true, copy: true, search: true, download: true, fullscreen: true, tabs: true }, // prettier-ignore
  };

  static styles = [csvCss, treemapCss];

  constructor() {
    super();
    /** @type {{ text: string, tree: Tree | null, error: Error | null } | null} */
    this.parsed = null;
    /** @type {TreeNode | null} */
    this.zoom = null;
    /** @type {TreeNode | null} */
    this.focused = null;
    /** @type {"map" | "list" | null} */
    this.tab = null;
    this.query = '';
    /** @type {TreeNode[]} */
    this.matchNodes = [];
    this.panelId = uid('panel');
    /** @type {HTMLElement | null} */
    this.mapHost = null;
    /** @type {HTMLElement | null} */
    this.details = null;
    /** @type {TreeNode[]} Rectangles of the keyboard, in order. */
    this.items = [];
    /** @type {Map<TreeNode, HTMLElement>} */
    this.elements = new Map();
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
    this.zoom = null;
    this.focused = null;
  }

  /** @returns {{ tree: Tree | null, error: Error | null }} */
  parse() {
    const text = this.text ?? '';
    if (this.parsed?.text === text) return this.parsed;
    try {
      this.parsed = { text, tree: parseTree(text), error: null };
    } catch (error) {
      this.parsed = { text, tree: null, error: error instanceof Error ? error : new Error(String(error)) }; // prettier-ignore
    }
    return this.parsed;
  }

  /** @returns {Tree | null} */
  get tree() {
    return this.parse().tree;
  }

  /** @returns {"map" | "list"} */
  get currentTab() {
    if (!this.feature('tabs')) return 'map';
    return this.tab ?? parseEnum(this.getAttribute('default-tab'), TABS, 'map');
  }

  /**
   * @param {number} value
   * @param {Tree} tree
   */
  size(value, tree) {
    const unit = this.getAttribute('unit')?.trim().slice(0, 30);
    if (unit === 'bytes' || (!unit && tree.bytes)) return formatSize(value, this.locale);
    const n = formatNumber(Math.round(value * 100) / 100, this.locale);
    return unit ? `${n} ${unit}` : n;
  }

  /**
   * @param {number} part
   * @param {number} whole
   */
  percent(part, whole) {
    return new Intl.NumberFormat(this.locale, { style: 'percent', maximumFractionDigits: 1 }).format(whole ? part / whole : 0); // prettier-ignore
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { tree, error } = this.parse();
    const tab = this.currentTab;
    const panel = h('div', { class: 'panel', attrs: { id: this.panelId } });
    const body = h('div', { class: `body tm-body tab-${tab}`, part: 'body' });
    this.mapHost = null;
    if (error || !tree) body.append(noticeView(this.errorText(error)));
    else {
      this.mapHost = h('div', { class: 'tm-host' });
      this.details = h('p', { class: 'tm-details', part: 'details', attrs: { 'aria-live': 'polite' } }); // prettier-ignore
      body.append(this.mapHost, this.details);
      this.renderView();
    }

    /** @type {HTMLButtonElement[]} */
    let history = [];
    if (this.editing) {
      const editor = this.createEditor();
      panel.classList.add('tm-edit');
      panel.append(h('div', { class: 'body editor-body', part: 'body source' }, editor.element), body); // prettier-ignore
      history = this.historyButtons(editor);
    } else panel.append(body);

    const tabs =
      this.feature('tabs') && tree && !this.editing
        ? createTabs({
            tabs: [
              { id: 'map', label: t('treemapMap'), icon: 'chart' },
              { id: 'list', label: t('treemapList'), icon: 'table' },
            ],
            selected: tab,
            label: t('tabs'),
            panelId: this.panelId,
            onSelect: (id) => {
              this.tab = /** @type {"map" | "list"} */ (id);
              this.render();
              /** @type {HTMLElement | null} */ (
                this.root.querySelector(`[data-tab="${id}"]`)
              )?.focus();
              emit(this, EVENTS.TAB_CHANGE, { tab: id });
            },
          })
        : null;
    if (tabs) panel.setAttribute('role', 'tabpanel');

    const target = {
      /** @param {string} query */
      run: (query) => {
        this.query = query.slice(0, MAX_QUERY_LENGTH).trim().toLowerCase();
        this.matchNodes = [];
        if (tree && this.query) {
          /** @type {TreeNode[]} */
          const stack = [tree.root];
          while (stack.length) {
            const n = /** @type {TreeNode} */ (stack.pop());
            if (n !== tree.root && n.name.toLowerCase().includes(this.query))
              this.matchNodes.push(n);
            stack.push(...n.children);
          }
        }
        this.renderView();
        return { total: this.matchNodes.length, capped: false };
      },
      /** @param {number} index */
      go: (index) => {
        const match = this.matchNodes[index];
        if (match) this.elements.get(match)?.scrollIntoView({ block: 'nearest' });
      },
      clear: () => {
        this.query = '';
        this.matchNodes = [];
        this.renderView();
      },
    };
    const name = tree?.format === 'esbuild' || tree?.format === 'webpack' || tree?.format === 'tree' || tree?.format === 'list' ? 'sizes.json' : tree?.format === 'du' ? 'sizes.txt' : 'sizes.csv'; // prettier-ignore
    const actions = [
      tree ? this.searchButton(target) : null,
      ...history,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download') ? this.downloadButton(() => this.text ?? '', this.downloadName(name), 'text/plain') : null, // prettier-ignore
      this.feature('copy') && tree ? this.copyButton(() => treeToCsv(this.zoom ?? tree.root), t('treemapCopyCsv')) : null, // prettier-ignore
    ];
    const badge = tree ? this.size(tree.root.total, tree) : '';
    frame.append(...this.chrome({ badge, tabs, actions }), panel);
    this.editor?.align();
  }

  /**
   * @param {Error | null} error
   * @returns {string}
   */
  errorText(error) {
    const t = this.t;
    if (error instanceof TreemapError) {
      if (error.message === 'empty') return t('treemapInvalidEmpty');
      if (error.message === 'noSizes') return t('treemapInvalidNoSizes');
      if (error.message.startsWith('json:')) return t('treemapInvalidJson', { message: error.message.slice(5) }); // prettier-ignore
    }
    return t('treemapInvalidFormat');
  }

  /** Draws the path, then the map or the list of the group opened. */
  renderView() {
    const host = this.mapHost;
    const tree = this.parse().tree;
    if (!host || !tree) return;
    const t = this.t;
    const zoom = this.zoom ?? tree.root;
    const crumbs = h('nav', { class: 'tm-crumbs', part: 'crumbs', attrs: { 'aria-label': t('treemapZoom') } }); // prettier-ignore
    for (const n of pathOf(zoom)) {
      crumbs.append(
        h('button', {
          class: 'text-btn',
          text: n === tree.root ? t('treemapAll') : n.name,
          attrs: { type: 'button', 'aria-current': n === zoom ? 'true' : null, 'data-focus-key': `crumb-${n.id}` }, // prettier-ignore
          on: { click: () => this.zoomTo(n === tree.root ? null : n) },
        }),
      );
    }
    /** @type {Node[]} */
    const parts = [crumbs, this.currentTab === 'list' ? this.listView(tree, zoom) : this.mapView(tree, zoom)]; // prettier-ignore
    if (this.query) {
      const outer = this.matchNodes.filter((n) => !this.matchNodes.some((m) => m !== n && pathOf(n).includes(m))); // prettier-ignore
      const share = outer.reduce((s, n) => s + n.total, 0);
      parts.push(h('p', { class: 'tm-match', text: this.matchNodes.length ? t('treemapMatches', { percent: this.percent(share, tree.root.total) }) : t('treemapNoMatch') })); // prettier-ignore
    }
    host.replaceChildren(...parts);
  }

  /**
   * @param {Tree} tree
   * @param {TreeNode} zoom
   * @returns {HTMLElement}
   */
  mapView(tree, zoom) {
    const t = this.t;
    const depth = parseInteger(this.getAttribute('depth'), { min: 1, max: 4, fallback: 2 });
    const all = tree.root.total || 1;
    const matches = new Set(this.matchNodes);
    this.elements = new Map();
    this.items = zoom.children.slice();
    if (!this.focused || !this.items.includes(this.focused)) this.focused = this.items[0] ?? null;
    const map = h('div', {
      class: 'tm-map',
      part: 'map',
      attrs: { role: 'tree', 'aria-label': zoom === tree.root ? t('treemapItems') : zoom.name },
      on: { keydown: (event) => this.onKey(/** @type {KeyboardEvent} */ (event)) },
    });
    let drawn = 0;
    /**
     * @param {TreeNode[]} nodes
     * @param {Rect} rect
     * @param {number} level - 1 for the children of the group opened.
     * @param {number} color
     */
    const draw = (nodes, rect, level, color) => {
      const rects = squarify(
        nodes.map((n) => n.total),
        rect,
      );
      nodes.forEach((node, i) => {
        const r = rects[i];
        if (r.w < 2 || r.h < 2 || drawn >= MAX_DRAWN) return;
        drawn += 1;
        const c = level === 1 ? i % COLORS : color;
        const group = node.children.length > 0;
        const nested = group && level < depth && r.w > 60 && r.h > BAND + 24;
        const match = matches.has(node);
        const label = t(group ? 'treemapGroup' : 'treemapItem', {
          name: node.name,
          size: this.size(node.total, tree),
          percent: this.percent(node.total, all),
          count: formatNumber(node.children.length, this.locale),
        });
        const el = h('div', {
          class: `tm-item c${c}${nested ? ' tm-group' : ''}${match ? ' match' : ''}${this.query && !match ? ' dim' : ''}`,
          part: match ? 'item item-match' : 'item',
          attrs:
            level === 1
              ? { role: 'treeitem', 'aria-level': 1, 'aria-label': label, tabindex: node === this.focused ? '0' : '-1', 'data-focus-key': `item-${node.id}`, title: label } // prettier-ignore
              : { 'aria-hidden': 'true', title: label },
          on: {
            click: (event) => {
              event.stopPropagation();
              this.open(level === 1 || group ? node : /** @type {TreeNode} */ (node.parent));
            },
            mouseenter: () => this.describe(node, tree),
            focus: () => this.describe(node, tree),
          },
        });
        el.style.left = `${(r.x / WIDTH) * 100}%`;
        el.style.top = `${(r.y / HEIGHT) * 100}%`;
        el.style.width = `${(r.w / WIDTH) * 100}%`;
        el.style.height = `${(r.h / HEIGHT) * 100}%`;
        el.style.setProperty('--_level', String(level));
        if (r.w > 44 && r.h > 16) {
          const name = h('span', { class: 'tm-name', text: node.name });
          el.append(name);
          if (!nested && r.h > 36 && r.w > 60) el.append(h('span', { class: 'tm-size', text: this.size(node.total, tree) })); // prettier-ignore
        }
        map.append(el);
        this.elements.set(node, el);
        if (nested)
          draw(node.children, { x: r.x + PAD, y: r.y + BAND, w: r.w - 2 * PAD, h: r.h - BAND - PAD }, level + 1, c); // prettier-ignore
      });
    };
    draw(zoom.children, { x: 0, y: 0, w: WIDTH, h: HEIGHT }, 1, 0);
    return h('div', { class: 'tm-scroll' }, map);
  }

  /**
   * @param {Tree} tree
   * @param {TreeNode} zoom
   * @returns {HTMLElement}
   */
  listView(tree, zoom) {
    const t = this.t;
    const all = tree.root.total || 1;
    const matches = new Set(this.matchNodes);
    this.elements = new Map();
    const head = h(
      'tr',
      {},
      h('th', { attrs: { scope: 'col' }, text: t('treemapName') }),
      h('th', { class: 'col-number', attrs: { scope: 'col' }, text: t('treemapSize') }),
      h('th', { class: 'col-number', attrs: { scope: 'col' }, text: t('treemapShare') }),
    );
    const body = h('tbody');
    zoom.children.slice(0, MAX_LIST).forEach((node, i) => {
      const name = node.children.length
        ? h('button', { class: 'text-btn', text: node.name, attrs: { type: 'button', 'data-focus-key': `row-${node.id}` }, on: { click: () => this.open(node) } }) // prettier-ignore
        : node.name;
      const tr = h(
        'tr',
        { class: matches.has(node) ? 'match' : '' },
        h('th', { class: 'tm-row-name', attrs: { scope: 'row' } }, h('span', { class: `tm-swatch c${i % COLORS}`, attrs: { 'aria-hidden': 'true' } }), name), // prettier-ignore
        h('td', { class: 'col-number', text: this.size(node.total, tree) }),
        h('td', { class: 'col-number', text: this.percent(node.total, all) }),
      );
      body.append(tr);
      this.elements.set(node, tr);
    });
    if (zoom.self > 0 && zoom.children.length)
      body.append(
        h(
          'tr',
          {},
          h('th', { class: 'tm-row-name', attrs: { scope: 'row' }, text: t('treemapOwn') }),
          h('td', { class: 'col-number', text: this.size(zoom.self, tree) }),
          h('td', { class: 'col-number', text: this.percent(zoom.self, all) }),
        ),
      );
    return h(
      'div',
      { class: 'tm-table', attrs: { tabindex: '0', role: 'region', 'aria-label': t('treemapList') } }, // prettier-ignore
      h('table', { class: 'grid', part: 'table' }, h('thead', {}, head), body),
    );
  }

  /**
   * @param {TreeNode} node
   * @param {Tree} tree
   */
  describe(node, tree) {
    if (!this.details) return;
    const path = pathOf(node).slice(1).map((n) => n.name).join(' / '); // prettier-ignore
    this.details.textContent = `${path} — ${this.size(node.total, tree)} (${this.percent(node.total, tree.root.total)})`; // prettier-ignore
  }

  /**
   * Opens a group, or chooses a rectangle without children.
   *
   * @param {TreeNode} node
   */
  open(node) {
    const tree = this.parse().tree;
    if (!tree) return;
    if (node.children.length) this.zoomTo(node === tree.root ? null : node);
    else {
      this.focused = node;
      this.select(node, true);
    }
  }

  /**
   * @param {TreeNode} node
   * @param {boolean} leaf
   */
  select(node, leaf) {
    emit(this, EVENTS.SELECT, {
      name: node.name,
      path: pathOf(node)
        .slice(1)
        .map((n) => n.name),
      size: node.total,
      leaf,
    });
  }

  /**
   * @param {TreeNode | null} node - `null` for the whole tree.
   */
  zoomTo(node) {
    const previous = this.zoom;
    this.zoom = node;
    // Going back, the group left keeps the focus.
    this.focused = previous && node && pathOf(previous).includes(node) ? (pathOf(previous)[node.depth + 1] ?? null) : null; // prettier-ignore
    if (!node && previous) this.focused = pathOf(previous)[1] ?? null;
    this.renderView();
    const el = this.focused ? this.elements.get(this.focused) : null;
    if (el && this.currentTab === 'map') el.focus();
    else /** @type {HTMLElement | null} */ (this.root.querySelector('.tm-crumbs [aria-current="true"]'))?.focus(); // prettier-ignore
    if (node) this.select(node, false);
  }

  /**
   * Arrows move between the rectangles of the group opened, Enter or Space opens one,
   * Escape or Backspace goes back.
   *
   * @param {KeyboardEvent} event
   */
  onKey(event) {
    const tree = this.parse().tree;
    const node = this.focused;
    if (!tree || !node) return;
    const index = this.items.indexOf(node);
    const visible = this.items.filter((n) => this.elements.has(n));
    const at = visible.indexOf(node);
    /** @type {TreeNode | undefined} */
    let next;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = visible[at + 1];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = visible[at - 1];
        break;
      case 'Home':
        next = visible[0];
        break;
      case 'End':
        next = visible[visible.length - 1];
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.open(node);
        return;
      case 'Escape':
      case 'Backspace':
        if (!this.zoom) return;
        event.preventDefault();
        event.stopPropagation();
        this.zoomTo(this.zoom.parent && this.zoom.parent !== tree.root ? this.zoom.parent : null);
        return;
      default:
        return;
    }
    event.preventDefault();
    if (!next || index < 0) return;
    this.elements.get(node)?.setAttribute('tabindex', '-1');
    this.focused = next;
    const el = this.elements.get(next);
    el?.setAttribute('tabindex', '0');
    el?.focus();
  }

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: /^\s*[[{]/.test(this.text ?? '') ? 'json' : 'plaintext',
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
    this.zoom = null;
    this.previewTimer = setTimeout(() => this.render(), 300);
  }
}
