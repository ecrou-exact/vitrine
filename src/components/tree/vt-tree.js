// @ts-check
import syntaxCss from '../../styles/syntax.css?raw';
import codeCss from '../../styles/code.css?raw';
import treeCss from '../../styles/tree.css?raw';
import { parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h } from '../../core/dom.js';
import { CodeEditor } from '../../core/editor.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { MAX_MATCHES, MAX_QUERY_LENGTH } from '../../core/search.js';
import { iconButton, noticeView } from '../../core/ui.js';
import { isSafeUrl } from '../../core/urls.js';
import { fileType } from './file-types.js';
import { MAX_NODES, TreeError, parseTree, sortTree, toJson, toTreeText } from './parser.js';

/** @typedef {import('./parser.js').TreeNode} TreeNode */
/** @typedef {import('./parser.js').TreeResult} TreeResult */

const SORTS = /** @type {const} */ (['none', 'name']);
const TARGETS = /** @type {const} */ (['_self', '_blank']);

/**
 * Displays a file tree: folders that open and close, file icons by type, notes, and
 * change markers.
 *
 * Give it the output of the `tree` command, indented names, a list of paths, or JSON.
 * Folders open with the mouse or the keyboard (it is an ARIA tree), the search filters
 * the tree, and files can link to a repository with `href-template`.
 *
 * @element vt-tree
 * @since 0.7.0
 *
 * @attr {number} depth - Folder levels open at first, 0–64 (default: all).
 * @attr {"none"|"name"} sort - `name`: folders first, then by name. Default `none` keeps the given order.
 * @attr {string} href-template - Turns files into links: `{path}` and `{name}` are replaced (URL-encoded).
 * @attr {"_self"|"_blank"} link-target - Where links open (default `_self`).
 * @attr {boolean} icons - File and folder icons (default on).
 * @attr {boolean} guides - Indentation guides (default on).
 * @attr {boolean} expand-controls - Expand all / Collapse all buttons. Full variant: on.
 * @attr {boolean} path - Path bar with the selected path and a copy button. Full variant: on.
 *
 * @prop {string} content - The tree as text or JSON.
 * @prop {object[]} data - The tree as JSON: `{ name, type, note?, status?, children? }` (read and write).
 *
 * @fires vt-select - An entry was activated (click, Enter, Space). Detail: `{ path, name, type, note, status }`.
 * @fires vt-toggle - A folder was opened or closed. Detail: `{ path, expanded }`.
 *
 * @csspart tree - The tree (`role="tree"`).
 * @csspart item - An entry (`role="treeitem"`).
 * @csspart row - The visible row of an entry.
 * @csspart name - The name of an entry (a link with `href-template`).
 * @csspart note - The note of an entry.
 * @csspart folder - Rows of folders; files have `file` and their kind: `file-code`, `file-data`, `file-doc`, `file-image`.
 * @csspart path - The path bar.
 *
 * @example
 * <vt-tree variant="full" label="my-app">
 *   <template>
 *     src/
 *       app.js
 *       styles.css
 *     package.json  # dependencies
 *   </template>
 * </vt-tree>
 */
export class VtTree extends VtBase {
  static type = 'tree';

  static componentAttributes = Object.freeze([
    'depth', 'sort', 'href-template', 'link-target', 'icons', 'guides', 'expand-controls',
    'path',
  ]); // prettier-ignore

  static presets = {
    simple: { icons: true, guides: true },
    full: {
      header: true, dot: true, copy: true, search: true, download: true, fullscreen: true,
      icons: true, guides: true, 'expand-controls': true, path: true,
    },
  }; // prettier-ignore

  static styles = [syntaxCss, codeCss, treeCss];

  static upgradeProperties = ['content', 'data'];

  constructor() {
    super();
    /** @type {{ key: string, result: TreeResult | null, error: TreeError | null } | null} */
    this.parsed = null;
    /** @type {WeakMap<TreeNode, TreeNode | null>} */
    this.parents = new WeakMap();
    /** @type {WeakSet<TreeNode>} Folders open. */
    this.open = new WeakSet();
    /** @type {WeakSet<TreeNode>} Folders whose state the user (or depth) set. */
    this.known = new WeakSet();
    /** @type {WeakMap<HTMLElement, TreeNode>} */
    this.nodes = new WeakMap();
    /** @type {TreeNode | null} */
    this.selected = null;
    this.query = '';
    /** @type {HTMLElement[]} Items matching the search, in order. */
    this.matchItems = [];
    /** @type {HTMLElement | null} */
    this.treeHost = null;
    /** @type {HTMLElement | null} */
    this.pathText = null;
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
    this.selected = null;
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'sort') this.parsed = null;
    if (name === 'depth') this.known = new WeakSet();
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  // ------------------------------------------------------------------ model

  /** @returns {{ result: TreeResult | null, error: TreeError | null }} */
  parse() {
    const text = this.text ?? '';
    const sort = parseEnum(this.getAttribute('sort'), SORTS, 'none');
    const key = `${sort}\u0000${text}`;
    if (this.parsed?.key !== key) {
      /** @type {TreeResult | null} */
      let result = null;
      /** @type {TreeError | null} */
      let error = null;
      try {
        result = parseTree(text);
        if (sort === 'name') sortTree(result.roots);
      } catch (caught) {
        error = caught instanceof TreeError ? caught : new TreeError('invalidJson', String(caught));
      }
      this.parsed = { key, result, error };
      this.parents = new WeakMap();
      this.open = new WeakSet();
      this.known = new WeakSet();
      if (result) {
        /** @type {[TreeNode, TreeNode | null][]} */
        const stack = result.roots.map((node) => [node, null]);
        while (stack.length) {
          const [node, parent] = /** @type {[TreeNode, TreeNode | null]} */ (stack.pop());
          this.parents.set(node, parent);
          for (const child of node.children) stack.push([child, node]);
        }
      }
    }
    return this.parsed;
  }

  /** @returns {object[]} */
  get data() {
    return toJson(this.parse().result?.roots ?? []);
  }

  set data(value) {
    let json;
    try {
      json = JSON.stringify(value ?? []);
    } catch {
      json = '[]';
    }
    this.content = json;
  }

  /**
   * Path of an entry: the names from the top, joined with `/`. A top folder named `.`
   * (the first line of `tree`) is left out.
   *
   * @param {TreeNode} node
   * @returns {string}
   */
  pathOf(node) {
    /** @type {string[]} */
    const names = [];
    /** @type {TreeNode | null | undefined} */
    let current = node;
    while (current) {
      const parent = this.parents.get(current);
      if (!(parent === null && current.name === '.')) names.unshift(current.name);
      current = parent;
    }
    return names.join('/');
  }

  /**
   * @param {TreeNode} node
   * @param {number} level - 1-based.
   * @returns {boolean}
   */
  isOpen(node, level) {
    if (this.known.has(node)) return this.open.has(node);
    const depth = parseInteger(this.getAttribute('depth'), { min: 0, max: 64, fallback: 64 });
    return level <= depth;
  }

  /**
   * @param {TreeNode} node
   * @param {boolean} open
   */
  setOpen(node, open) {
    this.known.add(node);
    if (open) this.open.add(node);
    else this.open.delete(node);
  }

  // ------------------------------------------------------------------ rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const { result, error } = this.parse();
    const panel = h('div', { class: 'panel' });
    /** @type {HTMLElement[]} */
    let extra = [];

    if (this.editing) {
      const editor = this.createEditor();
      this.treeHost = h('div', { class: 'body tree-body tree-preview', part: 'body preview' });
      panel.classList.add('tree-edit');
      panel.append(
        h('div', { class: 'body editor-body', part: 'body source' }, editor.element),
        this.treeHost,
      );
      extra = this.historyButtons(editor);
    } else {
      this.treeHost = h('div', {
        class: 'body tree-body',
        part: 'body',
      });
      panel.append(this.treeHost);
    }
    this.renderTree();

    if (this.feature('path') && !this.editing) {
      this.pathText = h('code', {
        class: 'path-text',
        text: this.selected ? this.pathOf(this.selected) : '',
      });
      panel.append(
        h(
          'div',
          { class: 'pathbar', part: 'path' },
          this.pathText,
          h(
            'div',
            { class: 'toolbar' },
            this.copyTextButton(
              () => (this.selected ? this.pathOf(this.selected) : ''),
              t('copyPath'),
              'copy-path',
            ),
          ),
        ),
      );
    } else this.pathText = null;

    const target = {
      /** @param {string} query */
      run: (query) => this.filter(query),
      /** @param {number} index */
      go: (index) => this.goToMatch(index),
      clear: () => this.filter(''),
    };
    const actions = [
      this.searchButton(target),
      ...extra,
      this.feature('expand-controls') && !this.editing
        ? [
            iconButton({
              icon: 'expand-all',
              label: t('expandAll'),
              key: 'expand-all',
              onClick: () => this.expandAll(true),
            }),
            iconButton({
              icon: 'collapse-all',
              label: t('collapseAll'),
              key: 'collapse-all',
              onClick: () => this.expandAll(false),
            }),
          ]
        : null,
      this.editToggleButton(),
      this.fullscreenButton(),
      this.feature('download')
        ? this.downloadButton(() => this.treeText(), this.downloadName('tree.txt'), 'text/plain')
        : null,
      this.feature('copy') ? this.copyButton(() => this.treeText(), t('copyTree')) : null,
    ].flat();
    const badge =
      result && !error
        ? t('treeStats', {
            folders: formatNumber(result.folders, this.locale),
            files: formatNumber(result.files, this.locale),
          })
        : '';
    frame.append(...this.chrome({ badge, actions }), panel);
    this.editor?.align();
  }

  /** @returns {string} The tree drawn like the `tree` command. */
  treeText() {
    return toTreeText(this.parse().result?.roots ?? []);
  }

  /** Renders the tree (or its error) into its host, for the current search. */
  renderTree() {
    const host = this.treeHost;
    if (!host) return;
    const { result, error } = this.parse();
    this.matchItems = [];
    if (error || !result) {
      host.replaceChildren(
        noticeView(
          error?.code === 'tooDeep'
            ? this.t('tooComplex')
            : this.t('invalidTree', { message: error?.message ?? '' }),
        ),
      );
      return;
    }
    /** @type {HTMLElement[]} */
    const notices = [];
    if (result.truncated)
      notices.push(
        noticeView(this.t('treeTruncated', { limit: formatNumber(MAX_NODES, this.locale) })),
      );
    if (!result.roots.length) {
      host.replaceChildren(
        ...notices,
        h('div', { class: 'empty', part: 'empty', text: this.t('empty') }),
      );
      return;
    }
    const visible = this.query ? this.visibleForQuery(result.roots) : null;
    const tree = h('ul', {
      class: `tree${this.feature('guides') ? ' guides' : ''}`,
      part: 'tree',
      attrs: {
        role: 'tree',
        'aria-label': this.heading || this.t('files'),
        'aria-multiselectable': 'false',
      },
      on: {
        keydown: (event) => this.onKeyDown(/** @type {KeyboardEvent} */ (event)),
        click: (event) => this.onClick(/** @type {MouseEvent} */ (event)),
      },
    });
    this.appendItems(tree, result.roots, 1, visible);
    host.replaceChildren(...notices, tree);
    // Roving tabindex: the selected entry, else the first one.
    const current =
      (this.selected && this.itemOf(this.selected)) ||
      /** @type {HTMLElement | null} */ (tree.querySelector('[role="treeitem"]'));
    current?.setAttribute('tabindex', '0');
  }

  /**
   * Entries to show for the search: matches and their ancestors.
   *
   * @param {TreeNode[]} roots
   * @returns {Set<TreeNode>}
   */
  visibleForQuery(roots) {
    const q = this.query.toLowerCase();
    /** @type {Set<TreeNode>} */
    const visible = new Set();
    /** @type {TreeNode[]} */
    const stack = [...roots];
    while (stack.length) {
      const node = /** @type {TreeNode} */ (stack.pop());
      if (node.name.toLowerCase().includes(q) || node.note.toLowerCase().includes(q)) {
        /** @type {TreeNode | null | undefined} */
        let current = node;
        while (current && !visible.has(current)) {
          visible.add(current);
          current = this.parents.get(current);
        }
      }
      stack.push(...node.children);
    }
    return visible;
  }

  /**
   * @param {HTMLElement} list
   * @param {TreeNode[]} nodes
   * @param {number} level
   * @param {Set<TreeNode> | null} visible - Search results, or `null` for the whole tree.
   */
  appendItems(list, nodes, level, visible) {
    const shown = visible ? nodes.filter((node) => visible.has(node)) : nodes;
    shown.forEach((node, index) => {
      list.append(this.item(node, level, index + 1, shown.length, visible));
    });
  }

  /**
   * @param {TreeNode} node
   * @param {number} level
   * @param {number} position
   * @param {number} size
   * @param {Set<TreeNode> | null} visible
   * @returns {HTMLElement}
   */
  item(node, level, position, size, visible) {
    const folder = node.type === 'folder';
    // Searching opens every folder on the way to a match.
    const open = folder && (visible ? true : this.isOpen(node, level));
    const type = folder ? null : fileType(node.name);
    const li = h('li', {
      class: `item${folder ? ' folder' : ''}${node.status ? ` status-${node.status}` : ''}`,
      part: 'item',
      attrs: {
        role: 'treeitem',
        'aria-level': level,
        'aria-setsize': size,
        'aria-posinset': position,
        'aria-expanded': folder ? String(open) : null,
        'aria-selected': String(node === this.selected),
        tabindex: '-1',
      },
    });
    this.nodes.set(li, node);
    const row = h('div', {
      class: `row${type ? ` kind-${type.kind}` : ''}`,
      part: `row ${folder ? 'folder' : `file file-${type?.kind}`}`,
    });
    row.style.setProperty('--_level', String(level - 1));
    row.append(
      h(
        'span',
        { class: 'twisty', attrs: { 'aria-hidden': 'true' } },
        folder ? icon('chevron-right') : null,
      ),
    );
    if (this.feature('icons')) {
      const glyph = icon(
        folder ? (open ? 'folder-open' : 'folder') : /** @type {string} */ (type?.icon),
      );
      glyph.classList.add('glyph');
      row.append(glyph);
    }
    row.append(this.nameNode(node));
    if (node.status && node.status !== 'highlighted') {
      row.append(
        h('span', {
          class: 'status-mark',
          text: { added: '+', removed: '−', modified: '~' }[node.status],
          attrs: { 'aria-hidden': 'true' },
        }),
      );
    }
    if (node.status)
      row.append(h('span', { class: 'sr-only', text: `, ${this.t(`status_${node.status}`)}` }));
    if (node.note) row.append(h('span', { class: 'note', part: 'note', text: node.note }));
    li.append(row);
    if (folder && open) li.append(this.group(node, level, visible));
    if (visible && this.query) this.markMatches(row, li);
    return li;
  }

  /**
   * @param {TreeNode} node
   * @param {number} level
   * @param {Set<TreeNode> | null} visible
   * @returns {HTMLElement}
   */
  group(node, level, visible) {
    const group = h('ul', { class: 'group', attrs: { role: 'group' } });
    // The guide line sits under the parent's arrow.
    group.style.setProperty('--_level-guide', String(level - 1));
    this.appendItems(group, node.children, level + 1, visible);
    return group;
  }

  /**
   * Name of an entry: a link for files with `href-template`, else text.
   *
   * @param {TreeNode} node
   * @returns {HTMLElement}
   */
  nameNode(node) {
    const template = this.getAttribute('href-template');
    if (template && node.type === 'file') {
      const path = this.pathOf(node);
      const href = template
        .replace(/\{path\}/g, path.split('/').map(encodeURIComponent).join('/'))
        .replace(/\{name\}/g, encodeURIComponent(node.name));
      if (isSafeUrl(href)) {
        const target = parseEnum(this.getAttribute('link-target'), TARGETS, '_self');
        return h('a', {
          class: 'name',
          part: 'name',
          text: node.name,
          attrs: {
            href,
            tabindex: '-1',
            target: target === '_blank' ? '_blank' : null,
            rel: target === '_blank' ? 'noopener noreferrer' : null,
          },
        });
      }
    }
    return h('span', { class: 'name', part: 'name', text: node.name });
  }

  /**
   * Highlights the search in a row (name and note) and records the match.
   *
   * @param {HTMLElement} row
   * @param {HTMLElement} li
   */
  markMatches(row, li) {
    const q = this.query.toLowerCase();
    let found = false;
    for (const part of row.querySelectorAll('.name, .note')) {
      const text = part.textContent ?? '';
      const index = text.toLowerCase().indexOf(q);
      if (index < 0) continue;
      found = true;
      const mark = h('mark', {
        class: 'match',
        part: 'match',
        text: text.slice(index, index + q.length),
      });
      part.replaceChildren(text.slice(0, index), mark, text.slice(index + q.length));
    }
    if (found && this.matchItems.length < MAX_MATCHES) this.matchItems.push(li);
  }

  /**
   * @param {TreeNode} node
   * @returns {HTMLElement | null}
   */
  itemOf(node) {
    for (const li of this.treeHost?.querySelectorAll('[role="treeitem"]') ?? []) {
      if (this.nodes.get(/** @type {HTMLElement} */ (li)) === node)
        return /** @type {HTMLElement} */ (li);
    }
    return null;
  }

  // ------------------------------------------------------------------ search

  /**
   * Filters the tree to the entries matching `query` (and their folders).
   *
   * @param {string} query
   * @returns {{ total: number, capped: boolean }}
   */
  filter(query) {
    this.query = query.slice(0, MAX_QUERY_LENGTH).trim();
    this.renderTree();
    return { total: this.matchItems.length, capped: this.matchItems.length >= MAX_MATCHES };
  }

  /**
   * @param {number} index
   */
  goToMatch(index) {
    for (const mark of this.treeHost?.querySelectorAll('mark.current') ?? [])
      mark.classList.remove('current');
    const li = this.matchItems[index];
    if (!li) return;
    for (const mark of li.querySelector(':scope > .row')?.querySelectorAll('mark') ?? [])
      mark.classList.add('current');
    li.querySelector(':scope > .row')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // ------------------------------------------------------------------ interaction

  /**
   * Opens or closes a folder.
   *
   * @param {HTMLElement} li
   * @param {boolean} open
   */
  toggle(li, open) {
    const node = this.nodes.get(li);
    if (!node || node.type !== 'folder') return;
    if ((li.getAttribute('aria-expanded') === 'true') === open) return;
    this.setOpen(node, open);
    li.setAttribute('aria-expanded', String(open));
    const glyph = li.querySelector(':scope > .row > .glyph');
    if (glyph) {
      const next = icon(open ? 'folder-open' : 'folder');
      next.classList.add('glyph');
      glyph.replaceWith(next);
    }
    const existing = li.querySelector(':scope > .group');
    if (open && !existing) {
      const level = Number(li.getAttribute('aria-level'));
      li.append(
        this.group(
          node,
          level,
          this.query ? this.visibleForQuery(this.parse().result?.roots ?? []) : null,
        ),
      );
    } else if (!open) existing?.remove();
    emit(this, EVENTS.TOGGLE, { path: this.pathOf(node), expanded: open });
  }

  /**
   * Opens or closes every folder.
   *
   * @param {boolean} open
   */
  expandAll(open) {
    const roots = this.parse().result?.roots ?? [];
    /** @type {TreeNode[]} */
    const stack = [...roots];
    while (stack.length) {
      const node = /** @type {TreeNode} */ (stack.pop());
      if (node.type === 'folder') this.setOpen(node, open);
      stack.push(...node.children);
    }
    this.renderTree();
    this.announce(this.t(open ? 'expandAll' : 'collapseAll'));
  }

  /**
   * Moves focus (roving tabindex) and selects an entry.
   *
   * @param {HTMLElement} li
   */
  focusItem(li) {
    for (const item of this.treeHost?.querySelectorAll('[role="treeitem"][tabindex="0"]') ?? [])
      item.setAttribute('tabindex', '-1');
    li.setAttribute('tabindex', '0');
    li.focus();
    const node = this.nodes.get(li);
    if (!node) return;
    this.treeHost?.querySelector('[aria-selected="true"]')?.setAttribute('aria-selected', 'false');
    li.setAttribute('aria-selected', 'true');
    this.selected = node;
    if (this.pathText) this.pathText.textContent = this.pathOf(node);
  }

  /**
   * Activates an entry: selects it and fires `vt-select`.
   *
   * @param {HTMLElement} li
   */
  activate(li) {
    const node = this.nodes.get(li);
    if (!node) return;
    this.focusItem(li);
    emit(this, EVENTS.SELECT, {
      path: this.pathOf(node),
      name: node.name,
      type: node.type,
      note: node.note,
      status: node.status,
    });
  }

  /**
   * @param {MouseEvent} event
   */
  onClick(event) {
    const target = /** @type {Element} */ (event.target);
    const li = /** @type {HTMLElement | null} */ (target.closest?.('[role="treeitem"]'));
    if (!li || !target.closest('.row')) return;
    if (li.classList.contains('folder')) {
      this.toggle(li, li.getAttribute('aria-expanded') !== 'true');
    }
    this.activate(li);
  }

  /** @returns {HTMLElement[]} Entries currently shown, in order. */
  visibleItems() {
    return /** @type {HTMLElement[]} */ (
      Array.from(this.treeHost?.querySelectorAll('[role="treeitem"]') ?? [])
    );
  }

  /**
   * ARIA tree keyboard support.
   *
   * @param {KeyboardEvent} event
   */
  onKeyDown(event) {
    const li = /** @type {HTMLElement | null} */ (
      /** @type {Element} */ (event.target).closest?.('[role="treeitem"]')
    );
    if (!li || event.ctrlKey || event.metaKey || event.altKey) return;
    const items = this.visibleItems();
    const index = items.indexOf(li);
    const folder = li.classList.contains('folder');
    const expanded = li.getAttribute('aria-expanded') === 'true';
    /** @type {HTMLElement | undefined} */
    let next;
    switch (event.key) {
      case 'ArrowDown':
        next = items[index + 1];
        break;
      case 'ArrowUp':
        next = items[index - 1];
        break;
      case 'Home':
        next = items[0];
        break;
      case 'End':
        next = items[items.length - 1];
        break;
      case 'ArrowRight':
        if (folder && !expanded) this.toggle(li, true);
        else if (folder)
          next = /** @type {HTMLElement | undefined} */ (
            li.querySelector('[role="treeitem"]') ?? undefined
          );
        break;
      case 'ArrowLeft':
        if (folder && expanded) this.toggle(li, false);
        else
          next = /** @type {HTMLElement | undefined} */ (
            li.parentElement?.closest('[role="treeitem"]') ?? undefined
          );
        break;
      case 'Enter':
      case ' ': {
        const link = li.querySelector(':scope > .row > a.name');
        if (event.key === 'Enter' && link instanceof HTMLAnchorElement) {
          link.click();
          break;
        }
        if (folder) this.toggle(li, !expanded);
        this.activate(li);
        break;
      }
      case '*': {
        // Opens every folder at the same level, like file managers.
        const siblings = li.parentElement?.querySelectorAll(':scope > .folder') ?? [];
        for (const sibling of siblings) this.toggle(/** @type {HTMLElement} */ (sibling), true);
        break;
      }
      default:
        // Type-ahead: jump to the next entry starting with the typed character.
        if (event.key.length === 1 && /\S/.test(event.key)) {
          const char = event.key.toLowerCase();
          const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)];
          next = ordered.find((item) =>
            (this.nodes.get(item)?.name ?? '').toLowerCase().startsWith(char),
          );
          if (!next) return;
        } else return;
    }
    event.preventDefault();
    if (next) this.focusItem(next);
  }

  // ------------------------------------------------------------------ editing

  /** @returns {CodeEditor} */
  createEditor() {
    this.editor?.destroy();
    this.editor = new CodeEditor({
      text: this.text ?? '',
      language: 'plaintext',
      lineNumbers: false,
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
    this.previewTimer = setTimeout(() => {
      this.renderTree();
      const result = this.parse().result;
      const badge = this.root.querySelector('[part="badge"]');
      if (badge && result)
        badge.textContent = this.t('treeStats', {
          folders: formatNumber(result.folders, this.locale),
          files: formatNumber(result.files, this.locale),
        });
    }, 120);
  }
}
