// @ts-check
/**
 * Shared UI building blocks: icon buttons, search bar, tabs, status views.
 *
 * @module core/ui
 */
import { h, debounce, uid } from './dom.js';
import { icon } from './icons.js';
import { MAX_QUERY_LENGTH } from './search.js';

/**
 * @typedef {(key: keyof import('./i18n.js').Strings, params?: Record<string, string | number>) => string} Translate
 */

/**
 * Creates an icon-only button with an accessible name and a tooltip.
 *
 * @param {object} options
 * @param {string} options.icon - Icon name.
 * @param {string} options.label - Accessible name (also the tooltip).
 * @param {(event: MouseEvent) => void} options.onClick
 * @param {string} [options.part] - Extra part names.
 * @param {string} [options.key] - Stable key used to restore focus after re-render.
 * @param {boolean} [options.pressed] - Toggle state (`aria-pressed`) for toggle buttons.
 * @returns {HTMLButtonElement}
 */
export function iconButton(options) {
  const button = h('button', {
    class: 'btn',
    part: `button${options.part ? ` ${options.part}` : ''}`,
    attrs: {
      type: 'button',
      'aria-label': options.label,
      title: options.label,
      'aria-pressed': options.pressed === undefined ? null : String(options.pressed),
      'data-focus-key': options.key,
    },
    on: { click: /** @type {EventListener} */ (options.onClick) },
  });
  button.append(icon(options.icon));
  return button;
}

/**
 * Shows a temporary "done" state on a button (icon swapped to a check mark).
 *
 * @param {HTMLButtonElement} button
 * @param {string} restoreIcon
 * @param {boolean} success
 */
export function flashButton(button, restoreIcon, success) {
  const svg = button.querySelector('svg');
  if (!svg) return;
  svg.replaceWith(icon(success ? 'check' : 'alert'));
  button.classList.toggle('done', success);
  setTimeout(() => {
    button.querySelector('svg')?.replaceWith(icon(restoreIcon));
    button.classList.remove('done');
  }, 1500);
}

/**
 * @typedef {object} SearchHandlers
 * @property {(query: string) => { total: number, capped: boolean }} run - Runs a search.
 * @property {(index: number) => void} go - Moves to a match (index already wrapped).
 * @property {(query: string, total: number, capped: boolean) => void} [onResult] - Notified after each run.
 * @property {() => void} onClose - Called when the bar is closed.
 */

/**
 * Search bar: input, match counter, previous / next and close buttons.
 *
 * Keyboard: Enter → next match, Shift+Enter → previous, Escape → clear, then close.
 */
export class SearchBar {
  /**
   * @param {Translate} t
   * @param {SearchHandlers} handlers
   * @param {string} [initialQuery]
   */
  constructor(t, handlers, initialQuery = '') {
    this.t = t;
    this.handlers = handlers;
    this.total = 0;
    this.capped = false;
    this.index = -1;
    const inputId = uid('search');
    this.input = h('input', {
      class: 'search-input',
      part: 'search-input',
      attrs: {
        id: inputId,
        type: 'search',
        placeholder: t('searchPlaceholder'),
        'aria-label': t('search'),
        maxlength: MAX_QUERY_LENGTH,
        autocomplete: 'off',
        spellcheck: 'false',
        enterkeyhint: 'search',
        'data-focus-key': 'search-input',
      },
    });
    this.input.value = initialQuery.slice(0, MAX_QUERY_LENGTH);
    this.count = h('span', {
      class: 'search-count',
      part: 'search-count',
      attrs: { 'aria-hidden': 'true' },
    });
    const prev = iconButton({
      icon: 'chevron-up',
      label: t('searchPrevious'),
      onClick: () => this.step(-1),
      key: 'search-prev',
    });
    const next = iconButton({
      icon: 'chevron-down',
      label: t('searchNext'),
      onClick: () => this.step(1),
      key: 'search-next',
    });
    const close = iconButton({
      icon: 'close',
      label: t('searchClose'),
      onClick: () => handlers.onClose(),
      key: 'search-close',
    });
    this.element = h(
      'div',
      { class: 'search', part: 'search', attrs: { role: 'search' } },
      this.input,
      this.count,
      prev,
      next,
      close,
    );

    const run = debounce(() => this.run(), 150);
    this.input.addEventListener('input', run);
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        run.cancel();
        if (this.input.value !== this.lastQuery) this.run();
        else this.step(event.shiftKey ? -1 : 1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (this.input.value) {
          this.input.value = '';
          this.run();
        } else {
          handlers.onClose();
        }
      }
    });
    /** @type {string | undefined} */
    this.lastQuery = undefined;
  }

  /** Runs the search for the current input value. */
  run() {
    const query = this.input.value;
    this.lastQuery = query;
    const { total, capped } = this.handlers.run(query);
    this.total = total;
    this.capped = capped;
    this.index = -1;
    if (total > 0) this.step(1);
    else this.updateCount();
    this.handlers.onResult?.(query, total, capped);
  }

  /**
   * Moves to the next (`1`) or previous (`-1`) match.
   *
   * @param {number} direction
   */
  step(direction) {
    if (!this.total) return;
    this.index = (((this.index + direction) % this.total) + this.total) % this.total;
    this.handlers.go(this.index);
    this.updateCount();
  }

  /** Updates the visible counter. */
  updateCount() {
    if (!this.input.value) this.count.textContent = '';
    else if (!this.total) this.count.textContent = this.t('searchNone');
    else {
      const key = this.capped ? 'searchCountCapped' : 'searchCount';
      this.count.textContent = this.t(key, { current: this.index + 1, total: this.total });
    }
  }

  /** Focuses the input and selects its content. */
  focus() {
    this.input.focus();
    this.input.select();
  }
}

/**
 * @typedef {object} TabDefinition
 * @property {string} id
 * @property {string} label
 * @property {string} [icon]
 */

/**
 * Creates a WAI-ARIA tab list with automatic activation.
 *
 * Keyboard: ←/→ move between tabs, Home/End jump to the first/last tab.
 *
 * @param {object} options
 * @param {TabDefinition[]} options.tabs
 * @param {string} options.selected
 * @param {string} options.label - Accessible name of the tab list.
 * @param {(id: string) => void} options.onSelect
 * @param {string} options.panelId - Id of the controlled panel.
 * @returns {HTMLElement}
 */
export function createTabs({ tabs, selected, label, onSelect, panelId }) {
  const list = h('div', {
    class: 'tabs',
    part: 'tabs',
    attrs: { role: 'tablist', 'aria-label': label },
  });
  /** @type {HTMLButtonElement[]} */
  const buttons = tabs.map((tab) => {
    const isSelected = tab.id === selected;
    const button = h(
      'button',
      {
        class: 'tab',
        part: isSelected ? 'tab tab-active' : 'tab',
        attrs: {
          type: 'button',
          role: 'tab',
          'aria-selected': String(isSelected),
          'aria-controls': panelId,
          tabindex: isSelected ? '0' : '-1',
          'data-tab': tab.id,
          'data-focus-key': `tab-${tab.id}`,
        },
        on: { click: () => onSelect(tab.id) },
      },
      tab.icon ? icon(tab.icon) : null,
      tab.label,
    );
    return button;
  });
  list.append(...buttons);
  list.addEventListener('keydown', (event) => {
    const current = buttons.findIndex((button) => button === event.target);
    if (current < 0) return;
    let next = -1;
    if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onSelect(tabs[next].id);
  });
  return list;
}

/**
 * Loading placeholder: three pulsing skeleton lines.
 *
 * @param {Translate} t
 * @returns {HTMLElement}
 */
export function loadingView(t) {
  return h(
    'div',
    { class: 'skeleton', part: 'loading', attrs: { role: 'status', 'aria-label': t('loading') } },
    h('span'),
    h('span'),
    h('span'),
  );
}

/**
 * Inline error message: alert icon, title, details. Never a modal.
 *
 * @param {string} title
 * @param {string} detail
 * @returns {HTMLElement}
 */
export function errorView(title, detail) {
  return h(
    'div',
    { class: 'message', part: 'error', attrs: { role: 'alert' } },
    icon('alert'),
    h(
      'div',
      {},
      h('p', { class: 'message-title', text: title }),
      detail ? h('p', { class: 'message-detail', text: detail }) : null,
    ),
  );
}

/**
 * Notice shown above the content (e.g. highlighting disabled for large content).
 *
 * @param {string} text
 * @returns {HTMLElement}
 */
export function noticeView(text) {
  return h(
    'div',
    { class: 'notice', part: 'notice', attrs: { role: 'note' } },
    icon('alert'),
    h('span', { text }),
  );
}

/**
 * "Nothing to display" placeholder.
 *
 * @param {Translate} t
 * @returns {HTMLElement}
 */
export function emptyView(t) {
  return h('div', { class: 'empty', part: 'empty', text: t('empty') });
}
