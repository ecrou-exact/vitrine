// @ts-check
/**
 * Collapsible XML tree (WAI-ARIA tree pattern), drawn with the styles of the JSON tree.
 *
 * Children are rendered only when their element is expanded, {@link CHUNK} at a time,
 * and one render never creates more than {@link MAX_RENDERED_ROWS} rows. Every name,
 * attribute and text is inserted with DOM text APIs.
 *
 * @module components/xml/tree
 */
import { h } from '../../core/dom.js';
import { formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { MAX_MATCHES, TextSearch } from '../../core/search.js';

/** Children shown per "page". */
export const CHUNK = 100;
/** Visible rows budget for "expand all". */
export const EXPAND_ALL_BUDGET = 5000;
/** Hard cap of rows created by one render. */
export const MAX_RENDERED_ROWS = 20000;
/** Characters of a text shown before truncation. */
const TEXT_PREVIEW = 300;

/** @typedef {import('./parser.js').XmlNode} XmlNode */
/** @typedef {import('../../core/ui.js').Translate} Translate */
/** @typedef {{ node: XmlNode, level: number, pos: number, size: number }} ItemInfo */
/** @typedef {{ node: XmlNode, field: string }} Match */

/**
 * @typedef {object} TreeOptions
 * @property {Translate} t
 * @property {string} locale
 * @property {number} depth - Levels expanded initially (root element = 1).
 * @property {string} label - Accessible name of the tree.
 * @property {(node: XmlNode) => void} onSelect
 */

/**
 * Children shown in the tree: whitespace-only text is left out.
 *
 * @param {XmlNode} node
 * @returns {XmlNode[]}
 */
export function visibleChildren(node) {
  return node.children.filter((child) => child.type !== 'text' || child.value.trim() !== '');
}

/**
 * An element whose only content is a short text is shown on one row.
 *
 * @param {XmlNode} node
 * @returns {boolean}
 */
function isInline(node) {
  const children = visibleChildren(node);
  return (
    node.type === 'element' &&
    children.length === 1 &&
    children[0].type === 'text' &&
    children[0].value.length <= TEXT_PREVIEW &&
    !children[0].value.includes('\n')
  );
}

/**
 * @param {XmlNode} node
 * @returns {boolean}
 */
function isContainer(node) {
  return (
    (node.type === 'element' || node.type === 'document') &&
    visibleChildren(node).length > 0 &&
    !isInline(node)
  );
}

export class XmlTree {
  /**
   * @param {XmlNode} doc - The document node; its children are the top-level items.
   * @param {TreeOptions} options
   */
  constructor(doc, options) {
    this.doc = doc;
    this.options = options;
    /** @type {Map<number, boolean>} */
    this.expanded = new Map();
    this.defaultDepth = options.depth;
    /** @type {Map<number, number>} */
    this.shown = new Map();
    const first = visibleChildren(doc).find((child) => child.type === 'element');
    /** @type {XmlNode} */
    this.selected = first ?? doc;
    /** @type {Match[]} */
    this.matches = [];
    this.current = -1;
    this.query = '';
    /** @type {WeakMap<Element, ItemInfo>} */
    this.info = new WeakMap();
    /** @type {Map<number, HTMLElement>} */
    this.items = new Map();
    this.rendered = 0;
    this.element = h('ul', {
      class: 'tree xml-tree',
      part: 'tree',
      attrs: { role: 'tree', 'aria-label': options.label },
    });
    this.element.addEventListener('keydown', (event) => this.onKeyDown(event));
    this.element.addEventListener('click', (event) => this.onClick(event));
  }

  /**
   * @param {XmlNode} node
   * @param {number} level
   * @returns {boolean}
   */
  isExpanded(node, level) {
    if (!isContainer(node)) return false;
    return this.expanded.get(node.id) ?? level <= this.defaultDepth;
  }

  // ------------------------------------------------------------- rendering

  /** Renders the whole tree, keeping expanded state, pages and selection. */
  render() {
    this.items.clear();
    this.rendered = 0;
    const top = visibleChildren(this.doc);
    this.element.replaceChildren(
      ...top.map((node, i) => this.renderItem(node, 1, i + 1, top.length)),
    );
    const selected =
      this.items.get(this.selected.id) ?? this.element.querySelector('[role="treeitem"]');
    selected?.setAttribute('tabindex', '0');
  }

  /**
   * @param {XmlNode} node
   * @param {number} level
   * @param {number} pos
   * @param {number} size
   * @returns {HTMLElement}
   */
  renderItem(node, level, pos, size) {
    this.rendered += 1;
    const container = isContainer(node);
    const expanded = this.isExpanded(node, level);
    const li = h('li', {
      class: `item xml-${node.type}`,
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
    this.info.set(li, { node, level, pos, size });
    this.items.set(node.id, li);
    li.append(this.renderRow(node, level, container, expanded));
    if (container && expanded) li.append(this.renderGroup(node, level));
    return li;
  }

  /**
   * @param {XmlNode} node
   * @param {number} level
   * @param {boolean} container
   * @param {boolean} expanded
   * @returns {HTMLElement}
   */
  renderRow(node, level, container, expanded) {
    const row = h('div', { class: 'row', part: 'row' });
    row.style.setProperty('--_level', String(level - 1));
    const toggle = h('span', {
      class: container ? 'toggle' : 'toggle leaf',
      part: 'tree-toggle',
      attrs: { 'aria-hidden': 'true' },
    });
    if (container) toggle.append(icon('chevron-right'));
    row.append(toggle);
    if (node.type === 'element') this.renderElement(row, node, container, expanded);
    else row.append(...leafParts(node));
    this.decorate(row, node);
    return row;
  }

  /**
   * @param {HTMLElement} row
   * @param {XmlNode} node
   * @param {boolean} container
   * @param {boolean} expanded
   */
  renderElement(row, node, container, expanded) {
    const p = (/** @type {string} */ text) => h('span', { class: 'punct hljs-punctuation', text });
    row.append(p('<'), this.nameSpan(node.name, node.ns, 'name'));
    for (const attr of node.attrs) {
      row.append(
        p(' '),
        h('span', {
          class: 'key hljs-attr',
          part: 'key',
          text: attr.name,
          attrs: {
            'data-field': `attr:${attr.name}`,
            title: attr.ns ? this.options.t('xmlNamespace', { uri: attr.ns }) : null,
          },
        }),
        p('="'),
        h('span', {
          class: 'value string hljs-string',
          part: 'value',
          text: truncate(attr.value),
          attrs: { 'data-field': `value:${attr.name}` },
        }),
        p('"'),
      );
    }
    const children = visibleChildren(node);
    if (!children.length) {
      row.append(p('/>'));
      return;
    }
    if (!container) {
      row.append(
        p('>'),
        h('span', {
          class: 'value xml-text',
          part: 'value',
          text: children[0].value,
          attrs: { 'data-field': 'text' },
        }),
        p(`</${node.name}>`),
      );
      return;
    }
    row.append(p(expanded ? '>' : `>…</${node.name}>`));
    const count = children.length;
    row.append(
      h('span', {
        class: 'count',
        part: 'count',
        text:
          count === 1
            ? this.options.t('xmlChild')
            : this.options.t('xmlChildren', { count: formatNumber(count, this.options.locale) }),
      }),
    );
  }

  /**
   * An element name, with its prefix shown apart and the namespace as a title.
   *
   * @param {string} name
   * @param {string} ns
   * @param {string} field
   * @returns {HTMLElement}
   */
  nameSpan(name, ns, field) {
    const colon = name.indexOf(':');
    const span = h('span', {
      class: 'xml-name hljs-name',
      part: 'element',
      attrs: {
        'data-field': field,
        title: ns ? this.options.t('xmlNamespace', { uri: ns }) : null,
      },
    });
    if (colon > 0)
      span.append(
        h('span', { class: 'xml-prefix', part: 'prefix', text: name.slice(0, colon + 1) }),
        name.slice(colon + 1),
      );
    else span.textContent = name;
    return span;
  }

  /**
   * @param {XmlNode} node
   * @param {number} level
   * @returns {HTMLElement}
   */
  renderGroup(node, level) {
    const group = h('ul', { class: 'group', attrs: { role: 'group' } });
    const children = visibleChildren(node);
    const limit = Math.min(children.length, this.shown.get(node.id) ?? CHUNK);
    for (let i = 0; i < limit; i += 1) {
      if (this.rendered >= MAX_RENDERED_ROWS) break;
      group.append(this.renderItem(children[i], level + 1, i + 1, children.length));
    }
    const remaining = children.length - group.children.length;
    if (remaining > 0) {
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
            text: this.options.t('xmlShowMore', {
              count: formatNumber(Math.min(CHUNK, remaining), this.options.locale),
            }),
          }),
        ),
      );
      /** @type {HTMLElement} */ (more.firstElementChild).style.setProperty(
        '--_level',
        String(level),
      );
      this.info.set(more, { node, level: level + 1, pos: 0, size: 0 });
      group.append(more);
    }
    // The closing tag of an expanded element.
    const close = h(
      'li',
      { class: 'xml-close', attrs: { role: 'none' } },
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'toggle leaf' }),
        h('span', { class: 'punct hljs-punctuation', text: '</' }),
        h('span', { class: 'xml-name hljs-name', text: node.name }),
        h('span', { class: 'punct hljs-punctuation', text: '>' }),
      ),
    );
    /** @type {HTMLElement} */ (close.firstElementChild).style.setProperty(
      '--_level',
      String(level - 1),
    );
    group.append(close);
    return group;
  }

  /**
   * Highlights search matches in a row.
   *
   * @param {HTMLElement} row
   * @param {XmlNode} node
   */
  decorate(row, node) {
    if (!this.query) return;
    const current = this.matches[this.current];
    for (const match of this.matches) {
      if (match.node !== node) continue;
      const span = row.querySelector(`[data-field="${CSS.escape(match.field)}"]`);
      if (!span) continue;
      const search = new TextSearch(span);
      search.run(this.query);
      if (current === match)
        for (const group of search.matches) for (const mark of group) mark.classList.add('current');
    }
  }

  // ------------------------------------------------------------- actions

  /**
   * @param {HTMLElement} li
   * @param {boolean} [force]
   */
  toggle(li, force) {
    const info = this.info.get(li);
    if (!info || !isContainer(info.node)) return;
    this.expanded.set(info.node.id, force ?? !this.isExpanded(info.node, info.level));
    this.replaceItem(li, info);
  }

  /**
   * @param {HTMLElement} li
   * @param {ItemInfo} info
   * @returns {HTMLElement}
   */
  replaceItem(li, info) {
    this.rendered = 0;
    const fresh = this.renderItem(info.node, info.level, info.pos, info.size);
    li.replaceWith(fresh);
    this.focusItem(fresh);
    return fresh;
  }

  /**
   * @param {HTMLElement} moreItem
   */
  showMore(moreItem) {
    const info = this.info.get(moreItem);
    if (!info) return;
    const parent = info.node;
    const before = this.shown.get(parent.id) ?? CHUNK;
    this.shown.set(parent.id, before + CHUNK);
    const parentLi = /** @type {HTMLElement | null} */ (
      moreItem.closest('ul[role="group"]')?.parentElement ?? null
    );
    const parentInfo = parentLi ? this.info.get(parentLi) : null;
    if (!parentLi || !parentInfo) return;
    const fresh = this.replaceItem(parentLi, parentInfo);
    const target = fresh.querySelector(`:scope > ul > li:nth-child(${before + 1})`);
    if (target instanceof HTMLElement) this.focusItem(target);
  }

  /**
   * Expands every element, breadth first, until the visible rows budget is used.
   *
   * @returns {boolean} `false` when the budget was reached first.
   */
  expandAll() {
    this.expanded.clear();
    this.defaultDepth = 0;
    let budget = EXPAND_ALL_BUDGET;
    let queue = visibleChildren(this.doc);
    let complete = true;
    while (queue.length && complete) {
      /** @type {XmlNode[]} */
      const next = [];
      for (const node of queue) {
        if (!isContainer(node)) continue;
        if (budget <= 0) {
          complete = false;
          break;
        }
        this.expanded.set(node.id, true);
        const visible = visibleChildren(node).slice(0, this.shown.get(node.id) ?? CHUNK);
        budget -= visible.length;
        next.push(...visible);
      }
      queue = next;
    }
    this.render();
    return complete;
  }

  /** Collapses everything except the root element. */
  collapseAll() {
    this.expanded.clear();
    this.defaultDepth = 1;
    this.shown.clear();
    this.render();
  }

  // ------------------------------------------------------------- search

  /**
   * Searches element names, attribute names and values, text, comments and CDATA.
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
      const has = (/** @type {string} */ text) => text.toLowerCase().includes(q);
      /** @type {XmlNode[]} */
      const stack = [...visibleChildren(this.doc)].reverse();
      outer: while (stack.length) {
        const node = /** @type {XmlNode} */ (stack.pop());
        /** @type {string[]} */
        const fields = [];
        if (node.type === 'element') {
          if (has(node.name)) fields.push('name');
          for (const attr of node.attrs) {
            if (has(attr.name)) fields.push(`attr:${attr.name}`);
            if (has(attr.value)) fields.push(`value:${attr.name}`);
          }
          if (isInline(node) && has(visibleChildren(node)[0].value)) fields.push('text');
        } else if (has(leafText(node))) fields.push('leaf');
        for (const field of fields) {
          this.matches.push({ node, field });
          if (this.matches.length >= MAX_MATCHES) {
            capped = true;
            break outer;
          }
        }
        if (isContainer(node)) stack.push(...[...visibleChildren(node)].reverse());
      }
    }
    this.render();
    return { total: this.matches.length, capped };
  }

  /**
   * Reveals a match without moving the focus (it stays in the search field).
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
    this.items
      .get(match.node.id)
      ?.querySelector('mark.current')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.options.onSelect(match.node);
  }

  /**
   * @param {XmlNode} node
   */
  reveal(node) {
    let child = node;
    while (child.parent && child.parent.type !== 'document') {
      const parent = child.parent;
      this.expanded.set(parent.id, true);
      const index = visibleChildren(parent).indexOf(child);
      const needed = Math.ceil((index + 1) / CHUNK) * CHUNK;
      if (needed > (this.shown.get(parent.id) ?? CHUNK)) this.shown.set(parent.id, needed);
      child = parent;
    }
  }

  // ------------------------------------------------------------- interaction

  /** @returns {HTMLElement[]} */
  visibleItems() {
    return /** @type {HTMLElement[]} */ (
      Array.from(this.element.querySelectorAll('[role="treeitem"]'))
    );
  }

  /**
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
    const container = Boolean(info && li.dataset.action !== 'more' && isContainer(info.node));
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
        if (li.dataset.action === 'more') this.showMore(li);
        else this.toggle(li);
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
   * @param {MouseEvent} event
   */
  onClick(event) {
    const target = /** @type {Element} */ (event.target);
    const li = /** @type {HTMLElement | null} */ (target.closest?.('[role="treeitem"]'));
    if (!li) return;
    if (li.dataset.action === 'more') this.showMore(li);
    else if (target.closest('.toggle:not(.leaf)')) this.toggle(li);
    else this.focusItem(li);
  }
}

/**
 * Text searched in a leaf node.
 *
 * @param {XmlNode} node
 * @returns {string}
 */
function leafText(node) {
  if (node.type === 'entity') return `&${node.name};`;
  if (node.type === 'pi') return `${node.name} ${node.value}`;
  return node.value;
}

/**
 * Row content of a leaf: text, CDATA, comment, processing instruction, DOCTYPE, entity.
 *
 * @param {XmlNode} node
 * @returns {HTMLElement[]}
 */
function leafParts(node) {
  const p = (/** @type {string} */ text) => h('span', { class: 'punct hljs-punctuation', text });
  const value = (/** @type {string} */ cls, /** @type {string} */ text) =>
    h('span', { class: `value ${cls}`, part: 'value', text, attrs: { 'data-field': 'leaf' } });
  switch (node.type) {
    case 'cdata':
      return [p('<![CDATA['), value('xml-cdata hljs-string', truncate(node.value)), p(']]>')];
    case 'comment':
      return [value('xml-comment hljs-comment', `<!--${truncate(node.value)}-->`)];
    case 'pi':
      return [value('xml-pi hljs-meta', `<?${node.name} ${truncate(node.value)}?>`)];
    case 'doctype':
      return [value('xml-doctype hljs-meta', `<!DOCTYPE ${truncate(node.value)}>`)];
    case 'entity':
      return [value('xml-entity hljs-symbol', `&${node.name};`)];
    default:
      return [value('xml-text', truncate(node.value.trim()))];
  }
}

/**
 * @param {string} text
 * @returns {string}
 */
function truncate(text) {
  return text.length > TEXT_PREVIEW ? `${text.slice(0, TEXT_PREVIEW)}…` : text;
}
