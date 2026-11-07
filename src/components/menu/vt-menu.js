// @ts-check
import dataCss from '../../styles/data.css?raw';
import menuCss from '../../styles/menu.css?raw';
import { parseEnum } from '../../core/attributes.js';
import { VtDataElement } from '../../core/data-element.js';
import { jsonText } from '../../core/data-input.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { hasIcon, icon } from '../../core/icons.js';
import { isSafeUrl } from '../../core/urls.js';
import { findItem, focusable, parseItems, placeMenu } from './items.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./items.js').MenuItem} MenuItem */

/** Delay before a submenu opens under the pointer, in milliseconds. */
const HOVER_DELAY = 180;

const TRIGGERS = /** @type {const} */ (['button', 'icon', 'context', 'inline']);

/**
 * A menu of actions: a button that opens a menu (or a "⋮" button), a menu that opens on a
 * right click on an element of the page, or a list of actions always shown. Items come from
 * JSON or from lines of text: actions, links, check boxes, radio groups, headings,
 * separators, shortcuts, icons and submenus.
 *
 * It follows the menu button pattern of WAI-ARIA: arrows, Home and End, letters to jump,
 * right and left for submenus, Escape to close, and the focus goes back where it was. The
 * menu stays inside the window, above or below its button.
 *
 * @element vt-menu
 * @since 0.13.0
 *
 * @attr {"button"|"icon"|"context"|"inline"} trigger - How the menu opens: a button with
 *   the label (default), a "⋮" button, a right click (or Shift+F10) on another element, or
 *   always shown.
 * @attr {string} label - Text of the button, and name of the menu.
 * @attr {string} for - With `trigger="context"`: id of the element that opens the menu.
 *   Default: the parent element.
 * @attr {"start"|"end"} align - Side of the button the menu lines up with.
 * @attr {boolean} disabled - The button cannot be used.
 *
 * @prop {MenuItem[]} items - The items read, with the state of check boxes and radio items
 *   (read-only).
 * @prop {boolean} open - Whether the menu is open.
 *
 * @fires vt-select - An item was chosen (cancelable: a link is then not followed). Detail:
 *   `{ id, label, value, checked, href }`.
 * @fires vt-toggle - The menu opened or closed. Detail: `{ expanded }`.
 *
 * @csspart trigger - The button.
 * @csspart menu - A menu or submenu.
 * @csspart item - An item.
 * @csspart shortcut - The shortcut of an item.
 * @csspart separator - A separator.
 * @csspart heading - A heading.
 *
 * @example
 * <vt-menu label="Export">
 *   <template data-json>
 *     ["Copy link", { "label": "Download", "items": ["PDF", "CSV"] }, "---",
 *      { "label": "Delete", "danger": true, "shortcut": "Del" }]
 *   </template>
 * </vt-menu>
 */
export class VtMenu extends VtDataElement {
  static type = 'menu';

  static allowEmpty = true;

  static componentAttributes = Object.freeze(['trigger', 'for', 'align', 'disabled']);

  static dataAttributes = Object.freeze(['label', 'trigger', 'align']);

  static presets = { simple: {}, full: {} };

  static styles = [dataCss, menuCss];

  /**
   * A list of items, or `{ label, trigger, items }`.
   *
   * @param {unknown} value
   * @returns {import('../../core/data-input.js').DataResult}
   */
  static fromData(value) {
    if (Array.isArray(value)) return { content: jsonText(value) };
    if (!value || typeof value !== 'object') return { content: typeof value === 'string' ? value : '' }; // prettier-ignore
    const record = /** @type {Record<string, unknown>} */ (value);
    /** @type {Record<string, unknown>} */
    const attributes = {};
    for (const key of ['label', 'trigger', 'align']) if (Object.hasOwn(record, key)) attributes[key] = record[key]; // prettier-ignore
    return { content: jsonText(Array.isArray(record.items) ? record.items : []), attributes };
  }

  constructor() {
    super();
    this.ids = { trigger: uid('menu-button'), menu: uid('menu') };
    this.isOpen = false;
    /** @type {string[]} Ids of the items whose submenu is open, from the top. */
    this.path = [];
    /** @type {string} Item with the focus. */
    this.focusId = '';
    /** @type {{ left: number, top: number, right: number, bottom: number } | null} */
    this.point = null;
    /** @type {Map<string, boolean>} Check boxes changed by the reader. */
    this.checks = new Map();
    /** @type {Map<string, string>} Radio group → value chosen by the reader. */
    this.radios = new Map();
    /** @type {{ text: string, items: MenuItem[] } | null} */
    this.cache = null;
    /** @type {HTMLElement | null} Element that had the focus before the menu opened. */
    this.returnTo = null;
    /** @type {Element | null} */
    this.target = null;
    this.typeahead = { text: '', at: 0 };
    /** Items of the list being drawn have room for an icon. */
    this.iconSlots = false;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.hoverTimer = undefined;
    this.onContext = (/** @type {MouseEvent} */ event) => {
      if (this.disabled) return;
      event.preventDefault();
      this.openAt({ left: event.clientX, top: event.clientY, right: event.clientX, bottom: event.clientY }); // prettier-ignore
    };
    this.onContextKey = (/** @type {KeyboardEvent} */ event) => {
      if (this.disabled || !(event.key === 'F10' && event.shiftKey)) return;
      event.preventDefault();
      const rect = /** @type {Element} */ (event.target).getBoundingClientRect();
      this.openAt({ left: rect.left, top: rect.top, right: rect.left, bottom: rect.bottom });
    };
    /** @param {Event} event */
    this.onOutside = (event) => {
      if (event.type === 'keydown') {
        const key = /** @type {KeyboardEvent} */ (event);
        if (key.key === 'Escape' && !key.defaultPrevented && !event.composedPath().includes(this)) this.close(); // prettier-ignore
        return;
      }
      if (event.type === 'scroll' && event.composedPath().includes(this)) return;
      if (event.type === 'pointerdown' && event.composedPath().includes(this)) return;
      this.close(event.type !== 'pointerdown');
    };
  }

  // ---------------------------------------------------------------- state

  /** @returns {(typeof TRIGGERS)[number]} */
  get trigger() {
    return parseEnum(this.getAttribute('trigger'), TRIGGERS, 'button');
  }

  /** @returns {boolean} */
  get disabled() {
    const value = this.getAttribute('disabled');
    return value !== null && value !== 'false';
  }

  /** @type {boolean} */
  get open() {
    return this.isOpen;
  }

  set open(value) {
    if (value && !this.isOpen) this.openAt(null);
    else if (!value && this.isOpen) this.close(false);
  }

  /** @returns {MenuItem[]} The items, with the reader's check boxes and radio choices. */
  get items() {
    const text = this.text ?? '';
    if (this.cache?.text !== text) {
      this.cache = { text, items: parseItems(text) };
      this.checks.clear();
      this.radios.clear();
    }
    return this.withState(this.cache.items);
  }

  /**
   * @param {MenuItem[]} items
   * @returns {MenuItem[]}
   */
  withState(items) {
    return items.map((item) => ({
      ...item,
      checked:
        item.type === 'checkbox'
          ? (this.checks.get(item.id) ?? item.checked)
          : item.type === 'radio'
            ? this.radios.has(item.group)
              ? this.radios.get(item.group) === item.value
              : item.checked
            : false,
      items: this.withState(item.items),
    }));
  }

  /** @returns {string} */
  get label() {
    return (this.getAttribute('label') ?? '').trim().slice(0, 200);
  }

  connectedCallback() {
    super.connectedCallback();
    this.attachTarget();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.detachTarget();
    this.stopWatching();
    clearTimeout(this.hoverTimer);
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if ((name === 'trigger' || name === 'for') && oldValue !== newValue && this.isConnected) {
      this.detachTarget();
      this.attachTarget();
    }
  }

  /** A context menu listens to its element. */
  attachTarget() {
    if (this.trigger !== 'context') return;
    const id = this.getAttribute('for');
    this.target = id ? (this.ownerDocument.getElementById(id) ?? null) : this.parentElement;
    this.target?.addEventListener('contextmenu', /** @type {EventListener} */ (this.onContext));
    this.target?.addEventListener('keydown', /** @type {EventListener} */ (this.onContextKey));
  }

  detachTarget() {
    this.target?.removeEventListener('contextmenu', /** @type {EventListener} */ (this.onContext));
    this.target?.removeEventListener('keydown', /** @type {EventListener} */ (this.onContextKey));
    this.target = null;
  }

  // ---------------------------------------------------------------- render

  /** @param {HTMLElement} frame */
  renderContent(frame) {
    const trigger = this.trigger;
    const items = this.items;
    const wrap = h('div', { class: `menu-wrap trigger-${trigger}`, part: 'body' });
    if (trigger === 'button' || trigger === 'icon') wrap.append(this.triggerButton());
    if (trigger === 'inline') {
      if (!this.focusId || !findItem(items, this.focusId)) this.focusId = focusable(items)[0]?.id ?? ''; // prettier-ignore
      wrap.append(this.menuList(items, 0));
    } else if (this.isOpen) {
      const layer = h('div', { class: 'menu-layer' });
      layer.append(this.menuList(items, 0));
      let level = items;
      this.path.forEach((id, depth) => {
        const parent = level.find((item) => item.id === id);
        if (!parent) return;
        layer.append(this.menuList(parent.items, depth + 1, parent));
        level = parent.items;
      });
      wrap.append(layer);
    }
    frame.append(wrap);
    if (this.isOpen && trigger !== 'inline') this.place();
  }

  /** @returns {HTMLElement} */
  triggerButton() {
    const t = this.t;
    const iconOnly = this.trigger === 'icon';
    return h(
      'button',
      {
        class: `menu-trigger${iconOnly ? ' icon-only' : ''}`,
        part: 'trigger',
        attrs: {
          type: 'button',
          id: this.ids.trigger,
          disabled: this.disabled,
          'aria-haspopup': 'menu',
          'aria-expanded': String(this.isOpen),
          'aria-controls': this.isOpen ? this.ids.menu : null,
          'aria-label': iconOnly ? this.label || t('menuMore') : null,
          title: iconOnly ? this.label || t('menuMore') : null,
          'data-focus-key': 'trigger',
        },
        on: {
          click: () => (this.isOpen ? this.close() : this.openAt(null)),
          keydown: (event) => {
            const key = /** @type {KeyboardEvent} */ (event).key;
            if (key === 'ArrowDown' || key === 'ArrowUp') {
              event.preventDefault();
              this.openAt(null, key === 'ArrowUp' ? 'last' : 'first');
            }
          },
        },
      },
      iconOnly ? icon('dots-vertical') : h('span', { text: this.label || t('menuActions') }),
      iconOnly ? null : icon('chevron-down'),
    );
  }

  /**
   * @param {MenuItem[]} items
   * @param {number} level
   * @param {MenuItem} [parent]
   * @returns {HTMLElement}
   */
  menuList(items, level, parent) {
    const t = this.t;
    const inline = this.trigger === 'inline';
    const list = h('div', {
      class: `menu-list${inline ? ' inline' : ''}`,
      part: 'menu',
      attrs: {
        id: level === 0 ? this.ids.menu : `${this.ids.menu}-${parent?.id}`,
        role: 'menu',
        'aria-label': level === 0 ? (this.trigger === 'button' ? null : this.label || t('menuActions')) : (parent?.label ?? null), // prettier-ignore
        'aria-labelledby': level === 0 && this.trigger === 'button' ? this.ids.trigger : null,
        'data-level': String(level),
      },
      on: { keydown: (event) => this.menuKey(/** @type {KeyboardEvent} */ (event), items, level) },
    });
    if (!focusable(items).length)
      list.append(h('p', { class: 'menu-empty', text: t('menuEmpty'), attrs: { role: 'presentation' } })); // prettier-ignore
    // When an item of the list has an icon or a mark, the others keep its place, so labels line up.
    this.iconSlots = items.some(
      (item) =>
        item.type === 'checkbox' || item.type === 'radio' || (item.icon && hasIcon(item.icon)),
    );
    /** @type {HTMLElement} */
    let into = list;
    for (const item of items) {
      if (item.type === 'separator') {
        into = list;
        list.append(h('div', { class: 'menu-separator', part: 'separator', attrs: { role: 'separator' } })); // prettier-ignore
      } else if (item.type === 'heading') {
        const id = `${this.ids.menu}-h-${item.id}`;
        list.append(h('div', { class: 'menu-heading', part: 'heading', text: item.label, attrs: { id, role: 'presentation' } })); // prettier-ignore
        // The items under a heading are a group named by it, up to the next separator.
        into = h('div', { class: 'menu-group', attrs: { role: 'group', 'aria-labelledby': id } });
        list.append(into);
      } else into.append(this.itemView(item, level));
    }
    return list;
  }

  /**
   * @param {MenuItem} item
   * @param {number} level
   * @returns {HTMLElement}
   */
  itemView(item, level) {
    const link = Boolean(item.href) && !item.disabled && isSafeUrl(item.href) && !item.items.length;
    const sub = item.items.length > 0;
    const expanded = sub && this.path[level] === item.id;
    const classes = ['menu-item'];
    if (item.danger) classes.push('danger');
    if (item.disabled) classes.push('disabled');
    const role = item.type === 'checkbox' ? 'menuitemcheckbox' : item.type === 'radio' ? 'menuitemradio' : 'menuitem'; // prettier-ignore
    const node = h(
      link ? 'a' : 'div',
      {
        class: classes.join(' '),
        part: 'item',
        attrs: {
          role,
          href: link ? item.href : null,
          target: link && item.target ? item.target : null,
          rel: link && item.target ? 'noopener noreferrer' : null,
          tabindex: this.trigger === 'inline' && item.id === this.focusId ? '0' : '-1',
          'aria-disabled': item.disabled ? 'true' : null,
          'aria-checked': item.type === 'item' ? null : String(item.checked),
          'aria-haspopup': sub ? 'menu' : null,
          'aria-expanded': sub ? String(expanded) : null,
          'aria-controls': expanded ? `${this.ids.menu}-${item.id}` : null,
          'data-id': item.id,
          'data-focus-key': `item-${item.id}`,
        },
        on: {
          click: (event) => {
            event.stopPropagation();
            if (!this.activate(item, level)) event.preventDefault();
          },
          pointerenter: () => this.hover(item, level),
          pointerleave: () => clearTimeout(this.hoverTimer),
        },
      },
      item.type === 'item'
        ? item.icon && hasIcon(item.icon)
          ? h('span', { class: 'menu-icon' }, icon(item.icon))
          : this.iconSlots
            ? h('span', { class: 'menu-icon' })
            : null
        : h('span', { class: `menu-mark ${item.type}` }, item.checked ? icon('check') : null),
      h(
        'span',
        { class: 'menu-text' },
        h('span', { class: 'menu-label', text: item.label }),
        item.description ? h('span', { class: 'menu-description', text: item.description }) : null, // prettier-ignore
        link && item.target ? h('span', { class: 'sr-only', text: ` ${this.t('menuOpensNewTab')}` }) : null, // prettier-ignore
      ),
      item.shortcut ? h('kbd', { class: 'menu-shortcut', part: 'shortcut', text: item.shortcut }) : null, // prettier-ignore
      sub ? icon('chevron-right') : null,
    );
    return node;
  }

  // ---------------------------------------------------------------- open, close

  /**
   * Opens the menu under its button, or at a point of the window.
   *
   * @param {{ left: number, top: number, right: number, bottom: number } | null} point
   * @param {'first' | 'last'} [focus]
   */
  openAt(point, focus = 'first') {
    if (this.trigger === 'inline' || this.disabled) return;
    const wasOpen = this.isOpen;
    if (!wasOpen) this.returnTo = deepActive();
    this.isOpen = true;
    this.point = point;
    this.path = [];
    const list = focusable(this.items).filter((item) => !item.disabled);
    this.focusId = (focus === 'last' ? list[list.length - 1] : list[0])?.id ?? '';
    this.render();
    this.focusItem(this.focusId);
    this.watch();
    if (!wasOpen) emit(this, EVENTS.TOGGLE, { expanded: true });
  }

  /** @param {boolean} [focus] - Gives the focus back to where it was. */
  close(focus = true) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.path = [];
    clearTimeout(this.hoverTimer);
    this.stopWatching();
    this.render();
    if (focus) {
      const back = this.trigger === 'context' ? this.returnTo : this.root.querySelector('[data-focus-key="trigger"]'); // prettier-ignore
      if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true });
    }
    this.returnTo = null;
    emit(this, EVENTS.TOGGLE, { expanded: false });
  }

  /** Places the open menus inside the window. */
  place() {
    const view = { width: document.documentElement.clientWidth || innerWidth, height: innerHeight }; // prettier-ignore
    const lists = /** @type {HTMLElement[]} */ ([...this.root.querySelectorAll('.menu-layer > .menu-list')]); // prettier-ignore
    const button = this.root.querySelector('[data-focus-key="trigger"]');
    lists.forEach((list, level) => {
      const size = list.getBoundingClientRect();
      /** @type {{ left: number, top: number, right: number, bottom: number }} */
      let anchor;
      let side = /** @type {'bottom' | 'right'} */ ('bottom');
      if (level === 0)
        anchor = this.point ?? button?.getBoundingClientRect() ?? { left: 0, top: 0, right: 0, bottom: 0 }; // prettier-ignore
      else {
        const parent = lists[level - 1].querySelector(`[data-id="${CSS.escape(this.path[level - 1])}"]`); // prettier-ignore
        anchor = parent?.getBoundingClientRect() ?? size;
        side = 'right';
      }
      const align = this.getAttribute('align') === 'end' && !this.point ? 'end' : 'start';
      const { left, top } = placeMenu(anchor, size, view, { side, align });
      list.style.setProperty('left', `${left}px`);
      list.style.setProperty('top', `${top}px`);
      list.style.setProperty('max-height', `${Math.max(120, view.height - top - 8)}px`);
    });
  }

  watch() {
    document.addEventListener('pointerdown', this.onOutside, true);
    document.addEventListener('keydown', this.onOutside);
    addEventListener('resize', this.onOutside);
    addEventListener('scroll', this.onOutside, true);
  }

  stopWatching() {
    document.removeEventListener('pointerdown', this.onOutside, true);
    document.removeEventListener('keydown', this.onOutside);
    removeEventListener('resize', this.onOutside);
    removeEventListener('scroll', this.onOutside, true);
  }

  // ---------------------------------------------------------------- items

  /**
   * Chooses an item.
   *
   * @param {MenuItem} item
   * @param {number} level
   * @returns {boolean} Whether a link may be followed.
   */
  activate(item, level) {
    if (item.disabled) return false;
    if (item.items.length) {
      this.openSub(item, level, true);
      return false;
    }
    if (item.type === 'checkbox') this.checks.set(item.id, !item.checked);
    if (item.type === 'radio') this.radios.set(item.group, item.value);
    const checked = item.type === 'checkbox' ? !item.checked : item.type === 'radio' ? true : null; // prettier-ignore
    const allowed = emit(this, EVENTS.SELECT, { id: item.id, label: item.label, value: item.value, checked, href: item.href || null }); // prettier-ignore
    if (!allowed && item.type === 'checkbox') this.checks.set(item.id, item.checked);
    if (item.type === 'checkbox' || item.type === 'radio') {
      // Check boxes and radio items keep the menu open, so several can be changed.
      this.focusId = item.id;
      this.render();
      this.focusItem(item.id);
      return false;
    }
    if (this.trigger === 'inline') return allowed;
    // A link is followed after the menu closes; the focus is not moved back then.
    const follows = allowed && Boolean(item.href) && isSafeUrl(item.href);
    this.close(!follows);
    return allowed;
  }

  /**
   * @param {MenuItem} item
   * @param {number} level
   * @param {boolean} focus - Focuses its first item.
   */
  openSub(item, level, focus) {
    this.path = [...this.path.slice(0, level), item.id];
    this.focusId = focus ? (focusable(item.items).find((i) => !i.disabled)?.id ?? item.id) : item.id; // prettier-ignore
    this.render();
    this.focusItem(this.focusId);
  }

  /**
   * @param {MenuItem} item
   * @param {number} level
   */
  hover(item, level) {
    clearTimeout(this.hoverTimer);
    this.focusItem(item.id);
    this.focusId = item.id;
    const opened = this.path[level];
    if (item.items.length && opened !== item.id)
      this.hoverTimer = setTimeout(() => this.openSub(item, level, false), HOVER_DELAY);
    else if (!item.items.length && this.path.length > level)
      this.hoverTimer = setTimeout(() => {
        this.path = this.path.slice(0, level);
        this.render();
        this.focusItem(item.id);
      }, HOVER_DELAY);
  }

  /** @param {string} id */
  focusItem(id) {
    if (!id) return;
    /** @type {HTMLElement | null} */ (
      this.root.querySelector(`[data-focus-key="item-${CSS.escape(id)}"]`)
    )?.focus({ preventScroll: false });
  }

  /**
   * @param {KeyboardEvent} event
   * @param {MenuItem[]} items
   * @param {number} level
   */
  menuKey(event, items, level) {
    const node = /** @type {HTMLElement} */ (event.target).closest?.('[data-id]');
    if (!(node instanceof HTMLElement) || Number(node.closest('.menu-list')?.getAttribute('data-level')) !== level) return; // prettier-ignore
    event.stopPropagation();
    const list = focusable(items);
    const index = list.findIndex((item) => item.id === node.dataset.id);
    const item = list[index];
    const move = (/** @type {number} */ to) => {
      const next = list[(to + list.length) % list.length];
      this.focusId = next.id;
      if (this.trigger === 'inline') this.render();
      this.focusItem(next.id);
    };
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(index - 1);
        break;
      case 'Home':
      case 'PageUp':
        event.preventDefault();
        move(0);
        break;
      case 'End':
      case 'PageDown':
        event.preventDefault();
        move(list.length - 1);
        break;
      case 'ArrowRight':
        if (item?.items.length && !item.disabled) {
          event.preventDefault();
          this.openSub(item, level, true);
        }
        break;
      case 'ArrowLeft':
        if (level > 0) {
          event.preventDefault();
          this.closeSub(level);
        }
        break;
      case 'Escape':
        if (this.trigger === 'inline') break;
        event.preventDefault();
        if (level > 0) this.closeSub(level);
        else this.close();
        break;
      case 'Tab':
        if (this.trigger !== 'inline') this.close(false);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (item) {
          // A link is followed as by a click, so the page sees a real navigation.
          if (node instanceof HTMLAnchorElement && event.key === 'Enter') node.click();
          else this.activate(item, level);
        }
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey)
          this.typeAhead(event.key, list, index);
    }
  }

  /** @param {number} level - Level of the submenu to close. */
  closeSub(level) {
    const parent = this.path[level - 1];
    this.path = this.path.slice(0, level - 1);
    this.focusId = parent;
    this.render();
    this.focusItem(parent);
  }

  /**
   * @param {string} key
   * @param {MenuItem[]} list
   * @param {number} index
   */
  typeAhead(key, list, index) {
    const now = Date.now();
    this.typeahead.text = now - this.typeahead.at < 600 ? this.typeahead.text + key : key;
    this.typeahead.at = now;
    const wanted = this.typeahead.text.toLocaleLowerCase();
    const start = this.typeahead.text.length > 1 ? index : index + 1;
    for (let step = 0; step < list.length; step += 1) {
      const item = list[(start + step) % list.length];
      if (item.label.toLocaleLowerCase().startsWith(wanted)) {
        this.focusId = item.id;
        if (this.trigger === 'inline') this.render();
        this.focusItem(item.id);
        return;
      }
    }
  }
}

/** @returns {HTMLElement | null} The element with the focus, inside shadow roots too. */
function deepActive() {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active instanceof HTMLElement ? active : null;
}
