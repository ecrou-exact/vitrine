// @ts-check
import fieldCss from '../../styles/field.css?raw';
import iconPickerCss from '../../styles/icon-picker.css?raw';
import { cleanLabel, parseBoolean, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { icon as uiIcon } from '../../core/icons.js';
import { loadingView, noticeView } from '../../core/ui.js';
import {
  BUILT_IN,
  drawIcon,
  iconCode,
  iconSet,
  iconSvg,
  loadIconSet,
  parseValue,
  searchIcons,
} from './icons.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

export { registerIconSet } from './icons.js';

/** @typedef {import('./icons.js').IconSet} IconSet */
/** @typedef {import('./icons.js').Icon} Icon */

const RECENT_KEY = 'vitrine-icons:recent';
const MAX_RECENT = 16;

/** @returns {string[]} */
function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(list)
      ? list.filter((v) => typeof v === 'string').slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

/** @param {string} value */
function remember(value) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([value, ...readRecent().filter((v) => v !== value)].slice(0, MAX_RECENT))); // prettier-ignore
  } catch {
    // Storage refused: no recent icons.
  }
}

/**
 * An icon picker for forms: thousands of free icons (Font Awesome Free solid, regular and
 * brands, Lucide, Bootstrap Icons, and the flags of every country), searched by name and
 * keyword, chosen with the mouse or the keyboard, and submitted as `set:name`
 * (`fa-solid:house`, `flags:fr`). Each set is loaded only when the picker shows it.
 *
 * Icons are drawn with DOM methods from an allow-list of SVG elements and attributes; the SVG
 * and the class names of the icon chosen can be copied. Pages add their own sets with
 * `registerIconSet()`.
 *
 * @element vt-icon-picker
 * @since 0.15.0
 *
 * @attr {string} value - The icon chosen at first: `set:name`.
 * @attr {string} name - Name of the field in a form.
 * @attr {string} sets - Sets offered, separated by commas (default: every built-in and registered set).
 * @attr {boolean} inline - Shows the icons in the page instead of in a popup.
 * @attr {string} label - Label of the field.
 * @attr {string} hint - Help under the field.
 * @attr {boolean} required - An icon must be chosen.
 * @attr {boolean} disabled - The field cannot be used.
 * @attr {number} page - Icons shown before "Show more" (default 300).
 *
 * @prop {string} value - The icon chosen: `set:name`, or an empty string.
 * @prop {{ set: string, name: string, label: string, svg: string, code: string } | null} icon - The icon chosen, once its set is loaded (read-only).
 *
 * @fires vt-change - An icon was chosen or removed. Detail: `{ value, set, name }`.
 * @fires vt-copy - The SVG, the code or the name was copied. Detail: `{ text }`.
 *
 * @csspart label - The label.
 * @csspart trigger - The button that opens the icons.
 * @csspart panel - The icons, their search and the set chosen.
 * @csspart option - An icon.
 * @csspart preview - The icon under the pointer or chosen, large, with its copy buttons.
 *
 * @example
 * <form><vt-icon-picker name="icon" label="Menu icon" value="fa-solid:house"></vt-icon-picker></form>
 */
export class VtIconPicker extends VtBase {
  static type = 'icon-picker';

  static formAssociated = true;

  static allowEmpty = true;

  static componentAttributes = Object.freeze(['value', 'name', 'sets', 'inline', 'required', 'disabled', 'hint', 'page']); // prettier-ignore

  static dataAttributes = Object.freeze(['value', 'sets']);

  static presets = { simple: {}, full: {} };

  static styles = [fieldCss, iconPickerCss];

  /**
   * A string is the icon chosen; an object sets `value` and `sets`.
   *
   * @param {unknown} value
   * @returns {import('../../core/data-input.js').DataResult}
   */
  static fromData(value) {
    if (typeof value === 'string') return { content: '', attributes: { value } };
    const item = value !== null && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {}; // prettier-ignore
    return { content: '', attributes: { value: item.value, sets: Array.isArray(item.sets) ? item.sets.join(',') : item.sets } }; // prettier-ignore
  }

  constructor() {
    super();
    this.internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
    this.ids = { label: uid('label'), trigger: uid('icon'), text: uid('text'), panel: uid('icons'), list: uid('list'), hint: uid('hint'), error: uid('error') }; // prettier-ignore
    /** @type {string | null} `null`: the `value` attribute. */
    this.current = null;
    this.open = false;
    /** @type {string | null} */
    this.setId = null;
    this.query = '';
    this.limit = 0;
    /** @type {string | null} Icon under the focus. */
    this.activeName = null;
    /** @type {Set<string>} */
    this.failed = new Set();
    this.showErrors = false;
    this.formDisabled = false;
    /** @type {((event: Event) => void) | null} */
    this.outside = null;
    this.addEventListener('invalid', (event) => {
      event.preventDefault();
      this.showErrors = true;
      this.render();
    });
  }

  // ---------------------------------------------------------------- value

  /** @returns {string} */
  get value() {
    return this.current ?? (this.getAttribute('value') ?? '').trim();
  }

  set value(value) {
    this.current = value === null || value === undefined ? '' : String(value).trim().slice(0, 200);
    if (this._connected) this.render();
  }

  /** @returns {{ set: string, name: string, label: string, svg: string, code: string } | null} */
  get icon() {
    const found = this.resolve(this.value);
    if (!found) return null;
    const { set, icon } = found;
    return { set: set.id, name: icon.name, label: icon.label, svg: iconSvg(set, icon), code: iconCode(set, icon) }; // prettier-ignore
  }

  /** @returns {boolean} */
  get disabled() {
    return this.formDisabled || parseBoolean(this.getAttribute('disabled')) === true;
  }

  /** @returns {boolean} */
  get inline() {
    return parseBoolean(this.getAttribute('inline')) === true;
  }

  /**
   * @param {string} value
   * @returns {{ set: IconSet, icon: Icon } | null}
   */
  resolve(value) {
    const parsed = parseValue(value);
    const set = parsed ? iconSet(parsed.set) : null;
    const icon = parsed && set ? set.byName.get(parsed.name) : null;
    return set && icon ? { set, icon } : null;
  }

  /** @returns {{ id: string, label: string }[]} The sets offered. */
  get sets() {
    const known = [...BUILT_IN];
    const asked = (this.getAttribute('sets') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!asked.length) return known;
    return asked.map((id) => known.find((s) => s.id === id) ?? (iconSet(id) ? { id, label: /** @type {IconSet} */ (iconSet(id)).label } : null)).filter((s) => s !== null); // prettier-ignore
  }

  /** @returns {string} The set shown. */
  get shownSet() {
    const sets = this.sets;
    const chosen = parseValue(this.value)?.set;
    const id = this.setId ?? (chosen && sets.some((s) => s.id === chosen) ? chosen : sets[0]?.id);
    return id ?? '';
  }

  /**
   * Loads a set if needed, then renders.
   *
   * @param {string} id
   */
  ensure(id) {
    if (!id || iconSet(id) || this.failed.has(id)) return;
    loadIconSet(id).then(
      () => this.isConnected && this.render(),
      () => {
        this.failed.add(id);
        if (this.isConnected) this.render();
      },
    );
  }

  connectedCallback() {
    super.connectedCallback();
    // The icon chosen is drawn once its set is there.
    const chosen = parseValue(this.value)?.set;
    if (chosen) this.ensure(chosen);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopOutside();
  }

  formResetCallback() {
    this.current = null;
    this.showErrors = false;
    this.render();
  }

  /** @param {boolean} disabled */
  formDisabledCallback(disabled) {
    this.formDisabled = disabled;
    this.requestRender();
  }

  /** @param {unknown} state */
  formStateRestoreCallback(state) {
    if (typeof state === 'string') this.value = state;
  }

  /** Updates the submitted value and the validity. */
  refreshState() {
    const t = this.t;
    const missing = parseBoolean(this.getAttribute('required')) === true && !this.value;
    if (this.internals) {
      this.internals.setFormValue(this.disabled ? null : this.value || null, this.value);
      const anchor = /** @type {HTMLElement | null} */ (this.root.getElementById(this.ids.trigger)) ?? undefined; // prettier-ignore
      this.internals.setValidity(missing ? { valueMissing: true } : {}, missing ? t('iconMissing') : '', missing ? anchor : undefined); // prettier-ignore
    }
    const error = this.root.getElementById(this.ids.error);
    if (error) error.textContent = missing && this.showErrors ? t('iconMissing') : '';
  }

  /**
   * Chooses an icon, or none.
   *
   * @param {string} value
   */
  choose(value) {
    this.current = value;
    if (value) remember(value);
    const parsed = parseValue(value);
    this.showErrors = true;
    if (!this.inline) this.open = false;
    this.render();
    if (!this.inline || !value) /** @type {HTMLElement | null} */ (this.root.getElementById(this.ids.trigger))?.focus(); // prettier-ignore
    emit(this, EVENTS.CHANGE, { value, set: parsed?.set ?? '', name: parsed?.name ?? '' });
  }

  /** @param {boolean} [focus] */
  close(focus = true) {
    if (!this.open) return;
    this.open = false;
    this.render();
    if (focus)
      /** @type {HTMLElement | null} */ (this.root.getElementById(this.ids.trigger))?.focus();
  }

  // ---------------------------------------------------------------- rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const required = parseBoolean(this.getAttribute('required')) === true;
    const hint = cleanLabel(this.getAttribute('hint'), 300);
    const showPanel = (this.open || this.inline) && !this.disabled;
    if (showPanel) this.ensure(this.shownSet);
    frame.append(
      h(
        'div',
        { class: `field icon-picker${this.disabled ? ' disabled' : ''}${this.inline ? ' inline' : ''}`, part: 'body' }, // prettier-ignore
        h(
          'div',
          { class: 'field-top' },
          h(
            'label',
            { class: 'field-label', part: 'label', attrs: { id: this.ids.label, for: this.ids.trigger } }, // prettier-ignore
            cleanLabel(this.getAttribute('label'), 300),
            required ? h('span', { class: 'field-required', text: '*', attrs: { 'aria-hidden': 'true' } }) : null, // prettier-ignore
            required ? h('span', { class: 'sr-only', text: ` (${t('iconRequired')})` }) : null,
          ),
        ),
        h('div', { class: 'ip-anchor' }, this.triggerView(), showPanel ? this.panelView() : null),
        hint ? h('p', { class: 'field-hint', part: 'hint', text: hint, attrs: { id: this.ids.hint } }) : null, // prettier-ignore
        h('p', { class: 'field-error', part: 'error', attrs: { id: this.ids.error, 'aria-live': 'polite' } }), // prettier-ignore
      ),
    );
    this.refreshState();
    if (this.open && !this.inline) this.watchOutside();
    else this.stopOutside();
  }

  /** @returns {HTMLElement} The button showing the icon chosen, and the one removing it. */
  triggerView() {
    const t = this.t;
    const value = this.value;
    const found = this.resolve(value);
    const parsed = parseValue(value);
    const name = found ? found.icon.label : (parsed?.name ?? '');
    const setLabel = found ? found.set.label : (parsed?.set ?? '');
    const trigger = h(
      'button',
      {
        class: 'field-trigger ip-trigger',
        part: 'trigger',
        attrs: {
          type: 'button',
          id: this.ids.trigger,
          disabled: this.disabled ? '' : null,
          'aria-labelledby': `${this.ids.label} ${this.ids.text}`,
          'aria-haspopup': this.inline ? null : 'dialog',
          'aria-expanded': this.inline ? null : String(this.open),
          'aria-describedby': [this.getAttribute('hint') ? this.ids.hint : '', this.ids.error].filter(Boolean).join(' '), // prettier-ignore
          'data-focus-key': 'trigger',
        },
        on: {
          click: () => {
            if (this.inline) return;
            this.open = !this.open;
            this.render();
            if (this.open)
              /** @type {HTMLElement | null} */ (this.root.querySelector('.ip-search'))?.focus();
          },
        },
      },
      h('span', { class: 'ip-preview' }, found ? drawIcon(found.set, found.icon) : null),
      h('span', { class: 'field-trigger-text', attrs: { id: this.ids.text }, text: value ? t('iconChosen', { name, set: setLabel }) : t('iconChoose') }), // prettier-ignore
      this.inline ? null : uiIcon('chevron-down'),
    );
    const clear =
      value && !this.disabled
        ? h('button', { class: 'field-icon-button', attrs: { type: 'button', 'aria-label': t('iconClear'), title: t('iconClear'), 'data-focus-key': 'clear' }, on: { click: () => this.choose('') } }, uiIcon('close')) // prettier-ignore
        : null;
    return h('div', { class: 'field-box ip-box' }, trigger, clear);
  }

  /** @returns {HTMLElement} The set, the search, the icons and the preview. */
  panelView() {
    const t = this.t;
    const setId = this.shownSet;
    const set = iconSet(setId);
    const panel = h('div', {
      class: this.inline ? 'ip-panel' : 'field-popup ip-panel',
      part: 'panel',
      attrs: { id: this.ids.panel, role: this.inline ? 'group' : 'dialog', 'aria-label': t('iconDialog') }, // prettier-ignore
      on: {
        keydown: (event) => {
          const e = /** @type {KeyboardEvent} */ (event);
          if (e.key === 'Escape' && !this.inline) {
            e.preventDefault();
            e.stopPropagation();
            this.close();
          }
        },
      },
    });
    const select = h(
      'select',
      {
        class: 'field-input ip-set',
        attrs: { 'aria-label': t('iconSet'), 'data-focus-key': 'set' },
        on: {
          change: (event) => {
            this.setId = /** @type {HTMLSelectElement} */ (event.target).value;
            this.limit = 0;
            this.activeName = null;
            this.render();
          },
        },
      },
      ...this.sets.map((s) => h('option', { text: s.label, attrs: { value: s.id, selected: s.id === setId ? '' : null } })), // prettier-ignore
    );
    const search = h('input', {
      class: 'field-input ip-search',
      attrs: { type: 'search', value: this.query, 'aria-label': t('iconSearch'), placeholder: t('iconSearchPlaceholder'), 'aria-controls': this.ids.list, autocomplete: 'off', spellcheck: 'false', 'data-focus-key': 'search' }, // prettier-ignore
      on: {
        input: (event) => {
          this.query = /** @type {HTMLInputElement} */ (event.target).value.slice(0, 100);
          this.limit = 0;
          this.activeName = null;
          this.render();
        },
        keydown: (event) => {
          if (/** @type {KeyboardEvent} */ (event).key !== 'ArrowDown') return;
          event.preventDefault();
          /** @type {HTMLElement | null} */ (
            this.root.querySelector('.ip-option[tabindex="0"]')
          )?.focus();
        },
      },
    });
    panel.append(h('div', { class: 'ip-controls' }, select, search));
    if (!set) {
      panel.append(this.failed.has(setId) ? noticeView(t('iconLoadFailed')) : loadingView(t));
      return panel;
    }
    const found = searchIcons(set, this.query);
    const page = parseInteger(this.getAttribute('page'), { min: 20, max: 5000, fallback: 300 });
    const limit = this.limit || page;
    const shown = found.slice(0, limit);
    panel.append(
      h('p', { class: 'ip-status', attrs: { 'aria-live': 'polite' }, text: this.query ? (found.length ? t('iconResults', { count: formatNumber(found.length, this.locale) }) : t('iconNone', { query: this.query })) : t('iconCount', { count: formatNumber(found.length, this.locale) }) }), // prettier-ignore
    );
    if (!this.query) {
      const recent = this.recentView(set);
      if (recent) panel.append(recent);
    }
    if (shown.length) panel.append(this.gridView(set, shown));
    if (found.length > shown.length)
      panel.append(
        h('button', {
          class: 'text-btn ip-more',
          text: t('iconMore', { count: formatNumber(Math.min(page, found.length - shown.length), this.locale) }), // prettier-ignore
          attrs: { type: 'button', 'data-focus-key': 'more' },
          on: {
            click: () => {
              this.limit = limit + page;
              this.render();
            },
          },
        }),
      );
    const previewed = set.byName.get(this.activeName ?? '') ?? this.resolve(this.value)?.icon;
    if (previewed) panel.append(this.previewView(set, previewed));
    return panel;
  }

  /**
   * The icons of this set chosen lately.
   *
   * @param {IconSet} set
   * @returns {HTMLElement | null}
   */
  recentView(set) {
    const t = this.t;
    const icons = readRecent()
      .map((v) => parseValue(v))
      .filter((p) => p && p.set === set.id)
      .map((p) => set.byName.get(/** @type {{ name: string }} */ (p).name))
      .filter((i) => i !== undefined);
    if (!icons.length) return null;
    return h(
      'div',
      { class: 'ip-recent' },
      h('span', { class: 'ip-recent-label', text: t('iconRecent') }),
      ...icons.map(
        (icon) =>
        h('button', { class: 'ip-recent-icon', attrs: { type: 'button', 'aria-label': icon.label, title: icon.label, 'data-focus-key': `recent-${icon.name}` }, on: { click: () => this.choose(`${set.id}:${icon.name}`) } }, drawIcon(set, icon)), // prettier-ignore
      ),
    );
  }

  /**
   * The icons, as a listbox moved through with the arrow keys.
   *
   * @param {IconSet} set
   * @param {Icon[]} icons
   * @returns {HTMLElement}
   */
  gridView(set, icons) {
    const t = this.t;
    const value = this.value;
    const active = icons.find((i) => i.name === this.activeName) ?? icons.find((i) => `${set.id}:${i.name}` === value) ?? icons[0]; // prettier-ignore
    const list = h('div', {
      class: `ip-grid${set.id === 'flags' ? ' flags' : ''}`,
      attrs: {
        id: this.ids.list,
        role: 'listbox',
        'aria-label': t('iconList', { set: set.label }),
      },
      on: { keydown: (event) => this.moveFocus(/** @type {KeyboardEvent} */ (event), set) },
    });
    for (const icon of icons) {
      const id = `${set.id}:${icon.name}`;
      list.append(
        h(
          'div',
          {
            class: 'ip-option',
            part: 'option',
            attrs: { role: 'option', tabindex: icon === active ? '0' : '-1', 'aria-selected': String(id === value), 'aria-label': icon.label, title: icon.label, 'data-name': icon.name, 'data-focus-key': `icon-${icon.name}` }, // prettier-ignore
            on: {
              click: () => this.choose(id),
              focus: () => {
                if (this.activeName === icon.name) return;
                this.activeName = icon.name;
                this.updatePreview(set, icon);
              },
            },
          },
          drawIcon(set, icon),
        ),
      );
    }
    return list;
  }

  /**
   * Arrow keys move by one icon or one row, Home and End to the ends; Enter or Space chooses.
   *
   * @param {KeyboardEvent} event
   * @param {IconSet} set
   */
  moveFocus(event, set) {
    const options = /** @type {HTMLElement[]} */ ([...this.root.querySelectorAll('.ip-option')]);
    const index = options.indexOf(/** @type {HTMLElement} */ (event.target));
    if (index < 0) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.choose(`${set.id}:${options[index].dataset.name}`);
      return;
    }
    const top = options[0].offsetTop;
    const columns = Math.max(1, options.filter((o) => o.offsetTop === top).length);
    const moves = /** @type {Record<string, number>} */ ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns, PageDown: columns * 4, PageUp: -columns * 4 }); // prettier-ignore
    let next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : index + (moves[event.key] ?? NaN); // prettier-ignore
    if (Number.isNaN(next)) return;
    event.preventDefault();
    if (next < 0 && event.key === 'ArrowUp') {
      /** @type {HTMLElement | null} */ (this.root.querySelector('.ip-search'))?.focus();
      return;
    }
    next = Math.max(0, Math.min(options.length - 1, next));
    options[index].setAttribute('tabindex', '-1');
    options[next].setAttribute('tabindex', '0');
    options[next].focus();
  }

  /**
   * The large view of an icon, with its name, code, license and copy buttons.
   *
   * @param {IconSet} set
   * @param {Icon} icon
   * @returns {HTMLElement}
   */
  previewView(set, icon) {
    const t = this.t;
    const code = iconCode(set, icon);
    return h(
      'div',
      { class: 'ip-detail', part: 'preview' },
      h('span', { class: `ip-large${set.id === 'flags' ? ' flag' : ''}` }, drawIcon(set, icon)),
      h(
        'span',
        { class: 'ip-about' },
        h('strong', { class: 'ip-name', text: icon.label }),
        h('code', { class: 'ip-code', text: code }),
        set.license
          ? set.licenseUrl
            ? h('a', { class: 'ip-license', text: t('iconLicense', { license: `${set.label}, ${set.license}` }), attrs: { href: set.licenseUrl, rel: 'noopener', target: '_blank' } }) // prettier-ignore
            : h('span', { class: 'ip-license', text: t('iconLicense', { license: `${set.label}, ${set.license}` }) }) // prettier-ignore
          : null,
      ),
      h(
        'span',
        { class: 'ip-copy' },
        this.copyTextButton(() => iconSvg(set, icon), t('iconCopySvg'), 'copy-svg'),
        this.copyTextButton(() => code, t('iconCopyCode'), 'copy-code'),
        this.copyTextButton(() => `${set.id}:${icon.name}`, t('iconCopyName'), 'copy-name'),
      ),
    );
  }

  /**
   * Shows another icon in the preview without drawing every icon again.
   *
   * @param {IconSet} set
   * @param {Icon} icon
   */
  updatePreview(set, icon) {
    const old = this.root.querySelector('.ip-detail');
    const next = this.previewView(set, icon);
    if (old) old.replaceWith(next);
    else this.root.querySelector('.ip-panel')?.append(next);
  }

  /** Closes the popup when a press lands outside the element. */
  watchOutside() {
    if (this.outside) return;
    this.outside = (event) => {
      if (!event.composedPath().includes(this)) this.close(false);
    };
    document.addEventListener('pointerdown', this.outside, true);
  }

  stopOutside() {
    if (!this.outside) return;
    document.removeEventListener('pointerdown', this.outside, true);
    this.outside = null;
  }
}
