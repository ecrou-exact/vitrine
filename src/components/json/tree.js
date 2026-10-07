// @ts-check
/**
 * Collapsible JSON tree (WAI-ARIA tree pattern).
 *
 * Built for large and hostile documents:
 * - children are rendered only when their parent is expanded;
 * - large arrays and objects are paginated ({@link CHUNK} children at a time);
 * - long strings and keys are truncated, with an explicit "show full string" action;
 * - "expand all" stops after {@link EXPAND_ALL_BUDGET} visible rows;
 * - a render never creates more than {@link MAX_RENDERED_ROWS} rows.
 *
 * @module components/json/tree
 */
import { h } from '../../core/dom.js';
import { formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { MAX_MATCHES, TextSearch } from '../../core/search.js';
import { sortedEntries } from './parser.js';

/** Children shown per "page". */
export const CHUNK = 100;
/** Visible rows budget for "expand all". */
export const EXPAND_ALL_BUDGET = 5000;
/** Hard cap of rows created by one render. */
export const MAX_RENDERED_ROWS = 20000;
/** Characters of a string shown before truncation. */
const STRING_PREVIEW = 500;
/** Characters of a key shown before truncation. */
const KEY_PREVIEW = 120;

/** @typedef {import('./parser.js').JsonNode} JsonNode */
/** @typedef {import('./parser.js').JsonContainer} JsonContainer */
/** @typedef {import('../../core/ui.js').Translate} Translate */
/** @typedef {{ node: JsonNode, label: string | number | null }} Child */
/** @typedef {{ node: JsonNode, label: string | number | null, level: number, pos: number, size: number }} ItemInfo */

/**
 * @typedef {object} TreeOptions
 * @property {Translate} t
 * @property {string} locale
 * @property {number} depth - Levels expanded initially (root = 1).
 * @property {boolean} sortKeys
 * @property {boolean} showTypes
 * @property {string} label - Accessible name of the tree.
 * @property {(node: JsonNode) => void} onSelect
 */

export class JsonTree {
  /**
   * @param {JsonNode} root
   * @param {TreeOptions} options
   */
  constructor(root, options) {
    this.root = root;
    this.options = options;
    /** @type {Map<number, boolean>} Explicit expanded state by node id. */
    this.expanded = new Map();
    this.defaultDepth = options.depth;
    /** @type {Map<number, number>} Number of children shown, by container id. */
    this.shown = new Map();
    /** @type {Set<number>} Strings displayed in full. */
    this.fullStrings = new Set();
    /** @type {JsonNode} */
    this.selected = root;
    /** @type {{ node: JsonNode, field: "key" | "value" }[]} */
    this.matches = [];
    this.current = -1;
    this.query = '';
    /** @type {WeakMap<Element, ItemInfo>} */
    this.info = new WeakMap();
    /** @type {Map<number, HTMLElement>} */
    this.items = new Map();
    this.rendered = 0;
    this.element = h('ul', {
      class: 'tree',
      part: 'tree',
      attrs: { role: 'tree', 'aria-label': options.label },
    });
    this.element.addEventListener('keydown', (event) => this.onKeyDown(event));
    this.element.addEventListener('click', (event) => this.onClick(event));
  }

  // ------------------------------------------------------------- structure

  /**
   * Children in display order.
   *
   * @param {JsonNode} node
   * @returns {Child[]}
   */
  children(node) {
    if (node.type === 'object') {
      const entries = this.options.sortKeys ? sortedEntries(node) : node.entries;
      return entries.map((entry) => ({ node: entry.value, label: entry.key }));
    }
    if (node.type === 'array')
      return node.items.map((item, index) => ({ node: item, label: index }));
    return [];
  }

  /**
   * @param {JsonNode} node
   * @param {number} level
   * @returns {boolean}
   */
  isExpanded(node, level) {
    if (node.type !== 'object' && node.type !== 'array') return false;
    return this.expanded.get(node.id) ?? level <= this.defaultDepth;
  }

  // ------------------------------------------------------------- rendering

  /** Renders the whole tree, keeping expanded state, pages and selection. */
  render() {
    this.items.clear();
    this.rendered = 0;
    const item = this.renderItem({ node: this.root, label: null }, 1, 1, 1);
    this.element.replaceChildren(item);
    const selected = this.items.get(this.selected.id) ?? item;
    selected.setAttribute('tabindex', '0');
  }

  /**
   * @param {Child} child
   * @param {number} level
   * @param {number} pos
   * @param {number} size
   * @returns {HTMLElement}
   */
  renderItem(child, level, pos, size) {
    const { node, label } = child;
    this.rendered += 1;
    const container = node.type === 'object' || node.type === 'array';
    const expanded = this.isExpanded(node, level);
    const li = h('li', {
      class: `item ${node.type}`,
      part: 'tree-item',
      attrs: {
        role: 'treeitem',
        'aria-level': level,
        'aria-setsize': size,
        'aria-posinset': pos,
        'aria-expanded': container ? String(expanded) : null,
        'aria-selected': String(node === this.selected),
        tabindex: '-1',
      },
    });
    this.info.set(li, { node, label, level, pos, size });
    this.items.set(node.id, li);
    li.append(this.renderRow(node, label, level, container, expanded));
    if (container && expanded) li.append(this.renderGroup(node, level));
    return li;
  }

  /**
   * @param {JsonNode} node
   * @param {string | number | null} label
   * @param {number} level
   * @param {boolean} container
   * @param {boolean} expanded
   * @returns {HTMLElement}
   */
  renderRow(node, label, level, container, expanded) {
    const { locale } = this.options;
    const row = h('div', { class: 'row', part: 'row' });
    row.style.setProperty('--_level', String(level - 1));
    const toggle = h('span', {
      class: container ? 'toggle' : 'toggle leaf',
      part: 'tree-toggle',
      attrs: { 'aria-hidden': 'true' },
    });
    if (container) toggle.append(icon('chevron-right'));
    row.append(toggle);
    if (label !== null) {
      const isIndex = typeof label === 'number';
      const text = isIndex ? String(label) : truncate(displayKey(label), KEY_PREVIEW);
      row.append(
        h('span', { class: isIndex ? 'index' : 'key', part: isIndex ? 'index' : 'key', text }),
        h('span', { class: 'punct', text: ': ' }),
      );
    }
    if (container) {
      const containerNode = /** @type {JsonContainer} */ (node);
      const count =
        containerNode.type === 'object' ? containerNode.entries.length : containerNode.items.length;
      const [open, close] = node.type === 'object' ? ['{', '}'] : ['[', ']'];
      row.append(
        h('span', {
          class: 'punct',
          text: expanded || count === 0 ? `${open}${count ? '' : close}` : `${open}…${close}`,
        }),
      );
      const key =
        node.type === 'object' ? (count === 1 ? 'key' : 'keys') : count === 1 ? 'item' : 'items';
      row.append(
        h('span', {
          class: 'count',
          part: 'count',
          text: this.options.t(key, { count: formatNumber(count, locale) }),
        }),
      );
    } else {
      row.append(this.renderValue(node));
    }
    if (this.options.showTypes)
      row.append(h('span', { class: 'type', part: 'type-badge', text: node.type }));
    this.decorate(row, node);
    return row;
  }

  /**
   * @param {JsonNode} node
   * @returns {HTMLElement}
   */
  renderValue(node) {
    if (node.type === 'string') {
      const full = this.fullStrings.has(node.id) || node.value.length <= STRING_PREVIEW;
      const text = full
        ? JSON.stringify(node.value)
        : `${JSON.stringify(node.value.slice(0, STRING_PREVIEW)).slice(0, -1)}…"`;
      const span = h('span', { class: 'value string', part: 'value', text });
      if (!full) {
        const more = h('button', {
          class: 'inline-more',
          text: this.options.t('showFullString', {
            count: formatNumber(node.value.length, this.options.locale),
          }),
          attrs: { type: 'button', tabindex: '-1', 'data-action': 'full-string' },
        });
        return h('span', { class: 'value-wrap' }, span, more);
      }
      return span;
    }
    const text =
      node.type === 'number' ? node.raw : node.type === 'boolean' ? String(node.value) : 'null';
    const kind = node.type === 'number' ? 'number' : 'literal';
    return h('span', { class: `value ${kind}`, part: 'value', text });
  }

  /**
   * @param {JsonContainer} node
   * @param {number} level
   * @returns {HTMLElement}
   */
  renderGroup(node, level) {
    const group = h('ul', { class: 'group', attrs: { role: 'group' } });
    const children = this.children(node);
    const limit = Math.min(children.length, this.shown.get(node.id) ?? CHUNK);
    for (let i = 0; i < limit; i += 1) {
      if (this.rendered >= MAX_RENDERED_ROWS) break;
      group.append(this.renderItem(children[i], level + 1, i + 1, children.length));
    }
    const remaining = children.length - Math.min(limit, group.children.length);
    if (remaining > 0) {
      const count = Math.min(CHUNK, remaining);
      const more = h(
        'li',
        {
          class: 'item more-item',
          part: 'more-item',
          attrs: {
            role: 'treeitem',
            'aria-level': level + 1,
            tabindex: '-1',
            'data-action': 'more',
          },
        },
        h(
          'div',
          { class: 'row', part: 'row' },
          h('span', { class: 'toggle leaf' }),
          h('span', {
            class: 'more-label',
            text: this.options.t('showMoreItems', {
              count: formatNumber(count, this.options.locale),
            }),
          }),
        ),
      );
      /** @type {HTMLElement} */ (more.firstElementChild).style.setProperty(
        '--_level',
        String(level),
      );
      this.info.set(more, { node, label: null, level: level + 1, pos: 0, size: 0 });
      group.append(more);
    }
    return group;
  }

  /**
   * Highlights search matches in a row.
   *
   * @param {HTMLElement} row
   * @param {JsonNode} node
   */
  decorate(row, node) {
    if (!this.query) return;
    const current = this.matches[this.current];
    for (const match of this.matches) {
      if (match.node !== node) continue;
      const span = row.querySelector(match.field === 'key' ? '.key' : '.value');
      if (!span) continue;
      const search = new TextSearch(span);
      search.run(this.query);
      if (current === match)
        for (const group of search.matches) for (const mark of group) mark.classList.add('current');
    }
  }

  // ------------------------------------------------------------- actions

  /**
   * Expands or collapses a container and re-renders it in place.
   *
   * @param {HTMLElement} li
   * @param {boolean} [force]
   */
  toggle(li, force) {
    const info = this.info.get(li);
    if (!info || (info.node.type !== 'object' && info.node.type !== 'array')) return;
    const next = force ?? !this.isExpanded(info.node, info.level);
    this.expanded.set(info.node.id, next);
    this.replaceItem(li, info);
  }

  /**
   * @param {HTMLElement} li
   * @param {ItemInfo} info
   * @returns {HTMLElement}
   */
  replaceItem(li, info) {
    this.rendered = 0;
    const fresh = this.renderItem(
      { node: info.node, label: info.label },
      info.level,
      info.pos,
      info.size,
    );
    li.replaceWith(fresh);
    this.focusItem(fresh);
    return fresh;
  }

  /**
   * Shows the next page of children.
   *
   * @param {HTMLElement} moreItem
   */
  showMore(moreItem) {
    const info = this.info.get(moreItem);
    if (!info) return;
    const parent = info.node;
    this.shown.set(parent.id, (this.shown.get(parent.id) ?? CHUNK) + CHUNK);
    const parentLi = /** @type {HTMLElement | null} */ (
      moreItem.closest('ul[role="group"]')?.parentElement ?? null
    );
    const parentInfo = parentLi ? this.info.get(parentLi) : null;
    if (!parentLi || !parentInfo) return;
    const firstNew = (this.shown.get(parent.id) ?? CHUNK) - CHUNK;
    const fresh = this.replaceItem(parentLi, parentInfo);
    const target = fresh.querySelector(`:scope > ul > li:nth-child(${firstNew + 1})`);
    if (target instanceof HTMLElement) this.focusItem(target);
  }

  /**
   * Expands every container, breadth first, until the visible rows budget is used.
   *
   * @returns {boolean} `false` when the budget was reached before everything was expanded.
   */
  expandAll() {
    this.expanded.clear();
    this.defaultDepth = 0;
    let budget = EXPAND_ALL_BUDGET;
    /** @type {JsonNode[]} */
    let queue = [this.root];
    let complete = true;
    while (queue.length) {
      /** @type {JsonNode[]} */
      const next = [];
      for (const node of queue) {
        if (node.type !== 'object' && node.type !== 'array') continue;
        const children = this.children(node);
        if (budget <= 0) {
          complete = false;
          break;
        }
        this.expanded.set(node.id, true);
        const visible = children.slice(0, this.shown.get(node.id) ?? CHUNK);
        budget -= visible.length;
        for (const child of visible) next.push(child.node);
      }
      if (!complete) break;
      queue = next;
    }
    this.render();
    return complete;
  }

  /** Collapses everything except the root. */
  collapseAll() {
    this.expanded.clear();
    this.defaultDepth = 1;
    this.shown.clear();
    this.render();
  }

  // ------------------------------------------------------------- search

  /**
   * Searches keys and primitive values.
   *
   * @param {string} query
   * @returns {{ total: number, capped: boolean }}
   */
  search(query) {
    this.query = query;
    this.matches = [];
    this.current = -1;
    let capped = false;
    if (query) {
      const q = query.toLowerCase();
      /** @type {Child[]} */
      const stack = [{ node: this.root, label: null }];
      while (stack.length) {
        const { node, label } = /** @type {Child} */ (stack.pop());
        if (typeof label === 'string' && label.toLowerCase().includes(q))
          this.matches.push({ node, field: 'key' });
        if (
          node.type !== 'object' &&
          node.type !== 'array' &&
          primitiveSearchText(node).toLowerCase().includes(q)
        ) {
          this.matches.push({ node, field: 'value' });
        }
        if (this.matches.length >= MAX_MATCHES) {
          capped = true;
          this.matches.length = MAX_MATCHES;
          break;
        }
        const children = this.children(node);
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
      }
    }
    this.render();
    return { total: this.matches.length, capped };
  }

  /**
   * Reveals a match: expands its ancestors and pages, then scrolls to it.
   *
   * @param {number} index
   */
  goToMatch(index) {
    const match = this.matches[index];
    if (!match) return;
    this.current = index;
    this.reveal(match.node);
    this.selected = match.node;
    this.render();
    const li = this.items.get(match.node.id);
    li?.querySelector('mark.current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.options.onSelect(match.node);
  }

  /**
   * Expands every ancestor of a node and extends pagination so it is rendered.
   *
   * @param {JsonNode} node
   */
  reveal(node) {
    /** @type {JsonNode} */
    let child = node;
    while (child.parent) {
      const parent = child.parent;
      this.expanded.set(parent.id, true);
      const index = this.children(parent).findIndex((entry) => entry.node === child);
      const needed = Math.ceil((index + 1) / CHUNK) * CHUNK;
      if (needed > (this.shown.get(parent.id) ?? CHUNK)) this.shown.set(parent.id, needed);
      child = parent;
    }
  }

  // ------------------------------------------------------------- interaction

  /** @returns {HTMLElement[]} Rendered tree items in display order. */
  visibleItems() {
    return /** @type {HTMLElement[]} */ (
      Array.from(this.element.querySelectorAll('[role="treeitem"]'))
    );
  }

  /**
   * Moves the roving tabindex to an item, focuses and selects it.
   *
   * @param {HTMLElement} li
   */
  focusItem(li) {
    for (const item of this.element.querySelectorAll('[tabindex="0"]'))
      item.setAttribute('tabindex', '-1');
    li.setAttribute('tabindex', '0');
    li.focus({ preventScroll: true });
    li.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const info = this.info.get(li);
    if (info && li.dataset.action !== 'more') {
      this.element.querySelector('[aria-selected="true"]')?.setAttribute('aria-selected', 'false');
      li.setAttribute('aria-selected', 'true');
      this.selected = info.node;
      this.options.onSelect(info.node);
    }
  }

  /**
   * @param {KeyboardEvent} event
   */
  onKeyDown(event) {
    const li = /** @type {HTMLElement | null} */ (
      /** @type {Element} */ (event.target).closest?.('[role="treeitem"]')
    );
    if (!li) return;
    const items = this.visibleItems();
    const index = items.indexOf(li);
    const info = this.info.get(li);
    const container =
      info &&
      li.dataset.action !== 'more' &&
      (info.node.type === 'object' || info.node.type === 'array');
    const expanded = li.getAttribute('aria-expanded') === 'true';
    let handled = true;
    switch (event.key) {
      case 'ArrowDown':
        if (items[index + 1]) this.focusItem(items[index + 1]);
        break;
      case 'ArrowUp':
        if (items[index - 1]) this.focusItem(items[index - 1]);
        break;
      case 'Home':
        if (items[0]) this.focusItem(items[0]);
        break;
      case 'End':
        if (items.length) this.focusItem(items[items.length - 1]);
        break;
      case 'ArrowRight':
        if (container && !expanded) this.toggle(li, true);
        else if (container && items[index + 1]) this.focusItem(items[index + 1]);
        break;
      case 'ArrowLeft': {
        if (container && expanded) this.toggle(li, false);
        else {
          const parent = li.parentElement?.closest('[role="treeitem"]');
          if (parent instanceof HTMLElement) this.focusItem(parent);
        }
        break;
      }
      case 'Enter':
      case ' ':
        this.activate(li);
        break;
      default:
        handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /**
   * Default action of an item: load more, toggle a container, or show a full string.
   *
   * @param {HTMLElement} li
   */
  activate(li) {
    if (li.dataset.action === 'more') this.showMore(li);
    else if (li.querySelector(':scope > .row [data-action="full-string"]')) this.showFullString(li);
    else this.toggle(li);
  }

  /**
   * @param {HTMLElement} li
   */
  showFullString(li) {
    const info = this.info.get(li);
    if (!info) return;
    this.fullStrings.add(info.node.id);
    this.replaceItem(li, info);
  }

  /**
   * @param {MouseEvent} event
   */
  onClick(event) {
    const target = /** @type {Element} */ (event.target);
    const li = /** @type {HTMLElement | null} */ (target.closest?.('[role="treeitem"]'));
    if (!li) return;
    if (target.closest('[data-action="full-string"]')) this.showFullString(li);
    else if (li.dataset.action === 'more') this.showMore(li);
    else if (target.closest('.toggle:not(.leaf)')) this.toggle(li);
    else this.focusItem(li);
  }
}

/**
 * Text searched for a primitive (what the user sees, without quotes).
 *
 * @param {JsonNode} node
 * @returns {string}
 */
function primitiveSearchText(node) {
  if (node.type === 'string') return node.value;
  if (node.type === 'number') return node.raw;
  if (node.type === 'boolean') return String(node.value);
  return 'null';
}

/**
 * Keys are shown raw; empty keys and keys with control characters are shown quoted.
 *
 * @param {string} key
 * @returns {string}
 */
function displayKey(key) {
  // eslint-disable-next-line no-control-regex
  return key === '' || /[\u0000-\u001f\u007f]/.test(key) ? JSON.stringify(key) : key;
}

/**
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
