// @ts-check
import dataCss from '../../styles/data.css?raw';
import fieldCss from '../../styles/field.css?raw';
import datePickerCss from '../../styles/date-picker.css?raw';
import { parseBoolean, parseInteger } from '../../core/attributes.js';
import { isObject } from '../../core/data.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import {
  DAY_MS,
  FIRST_DAY,
  LAST_DAY,
  PRESETS,
  addMonths,
  dateOrder,
  dayNumber,
  firstDayOfWeek,
  fromDayNumber,
  isBlocked,
  monthGrid,
  monthStart,
  nearestFree,
  parseIso,
  parseRules,
  parseTyped,
  parseValue,
  presetRanges,
  toIso,
  weekdayOf,
} from './dates.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('../../core/i18n.js').StringKey} StringKey */
/** @typedef {'start' | 'end'} Side */

/** Attributes a JSON value may set, by their JSON names. */
const DATA_KEYS = {
  label: 'label', hint: 'hint', mode: 'mode', name: 'name', value: 'value', required: 'required',
  min: 'min', max: 'max', disabledDates: 'disabled-dates', disabled: 'disabled-dates',
  firstDay: 'first-day', months: 'months', presets: 'presets', inline: 'inline',
  clearable: 'clearable', minDays: 'min-days', maxDays: 'max-days', placeholder: 'placeholder',
}; // prettier-ignore

/**
 * A date picker for forms: a field where the date can be typed, and a calendar to choose it
 * with the mouse, a finger or the keyboard. In `range` mode it chooses a period, with usual
 * periods such as "Last 7 days" on the side. Days can be blocked (dates, periods, days of the
 * week), and the first day of the week and the date format follow the language.
 *
 * It takes part in `<form>` like a native field: its value is submitted under `name` as an
 * ISO 8601 date (`2026-11-22`) or period (`2026-11-22/2026-11-29`).
 *
 * @element vt-date-picker
 * @since 0.13.0
 *
 * @attr {"single"|"range"} mode - One date (default) or a period.
 * @attr {string} name - Name of the value in the submitted form.
 * @attr {string} label - Label of the field.
 * @attr {string} hint - Help written under the field.
 * @attr {string} value - `YYYY-MM-DD`, or `YYYY-MM-DD/YYYY-MM-DD` for a period.
 * @attr {boolean} required - A date must be chosen; the label shows it.
 * @attr {boolean} disabled - The field cannot be used and is not submitted.
 * @attr {boolean} readonly - The value cannot be changed but is submitted.
 * @attr {string} min - First day that can be chosen, `YYYY-MM-DD` or `today`.
 * @attr {string} max - Last day that can be chosen, `YYYY-MM-DD` or `today`.
 * @attr {string} disabled-dates - Days that cannot be chosen: dates, periods (`a/b`) and days
 *   of the week (`sat sun`), separated by spaces or commas, or a JSON list.
 * @attr {number} first-day - First day of the week, 0 (Sunday) to 6. Default: from the language.
 * @attr {number} months - Months shown side by side, 1 to 3. Default: 1, or 2 for a period.
 * @attr {string} presets - Usual periods next to the calendar of a period: `false` to hide
 *   them, or their keys (`today yesterday last7 last30 thisWeek lastWeek nextWeek next30
 *   thisMonth lastMonth thisYear`).
 * @attr {boolean} inline - The calendar is always shown, under the field.
 * @attr {boolean} clearable - A button that empties the field.
 * @attr {number} min-days - Fewest days in a period.
 * @attr {number} max-days - Most days in a period.
 * @attr {string} now - Date used as today (`YYYY-MM-DD`).
 *
 * @prop {string} value - The value, as submitted.
 * @prop {string} startDate - The date, or the first day of the period (`YYYY-MM-DD` or empty).
 * @prop {string} endDate - The last day of the period (`YYYY-MM-DD` or empty).
 * @prop {HTMLFormElement | null} form - The form of the field (read-only).
 * @prop {ValidityState} validity - Its validity (read-only).
 * @prop {string} validationMessage - Why it is invalid (read-only).
 *
 * @fires vt-input - The value changed. Detail: `{ value, start, end }`.
 * @fires vt-change - A date or a period was chosen. Detail: `{ value, start, end }`.
 * @fires vt-toggle - The calendar opened or closed. Detail: `{ expanded }`.
 * @fires invalid - The form was submitted with this field invalid.
 *
 * @csspart label - The label.
 * @csspart control - A text field.
 * @csspart toggle - The calendar button.
 * @csspart calendar - The calendar.
 * @csspart day - A day.
 * @csspart presets - The usual periods.
 * @csspart hint - The help under the field.
 * @csspart error - The error message.
 *
 * @example
 * <vt-date-picker name="stay" mode="range" label="Your stay" min="today" required
 *                 disabled-dates="2026-12-24/2026-12-26"></vt-date-picker>
 */
export class VtDatePicker extends VtDataElement {
  static type = 'date-picker';

  static formAssociated = true;

  static allowEmpty = true;

  static componentAttributes = Object.freeze([
    'mode', 'name', 'hint', 'value', 'required', 'disabled', 'readonly', 'min', 'max',
    'disabled-dates', 'first-day', 'months', 'presets', 'inline', 'clearable', 'min-days',
    'max-days', 'now',
  ]); // prettier-ignore

  static dataAttributes = Object.freeze([...new Set(Object.values(DATA_KEYS))]);

  static presets = { simple: {}, full: {} };

  static styles = [dataCss, fieldCss, datePickerCss];

  /**
   * A value (`"2026-11-22"`, `{ start, end }`) or settings (`{ label, mode, min, … }`).
   *
   * @param {unknown} value
   * @returns {import('../../core/data-input.js').DataResult}
   */
  static fromData(value) {
    if (typeof value === 'string') return { content: '', attributes: { value } };
    if (!isObject(value)) return { content: '' };
    /** @type {Record<string, unknown>} */
    const attributes = {};
    for (const [key, name] of Object.entries(DATA_KEYS)) {
      if (!Object.hasOwn(value, key)) continue;
      const v = value[key];
      attributes[name] = Array.isArray(v) ? JSON.stringify(v) : v;
    }
    const v = isObject(value.value) ? value.value : value;
    if (Object.hasOwn(v, 'start') || Object.hasOwn(v, 'end'))
      attributes.value = [v.start, v.end].filter((x) => typeof x === 'string').join('/');
    return { content: '', attributes };
  }

  constructor() {
    super();
    this.internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
    this.ids = { label: uid('label'), start: uid('date'), end: uid('date'), hint: uid('hint'), error: uid('error'), popup: uid('calendar'), status: uid('status') }; // prettier-ignore
    /** @type {number | null} */
    this.start = null;
    /** @type {number | null} */
    this.end = null;
    this.ready = false;
    this.open = false;
    /** The end of a period is still to be chosen. */
    this.pending = false;
    /** @type {number} First month shown. */
    this.view = 0;
    /** @type {number | null} Day with the focus in the calendar. */
    this.focusDay = null;
    /** @type {Record<Side, string | null>} Text typed that could not be read. */
    this.typed = { start: null, end: null };
    this.showErrors = false;
    this.formDisabled = false;
    this.customMessage = '';
    /** @type {{ text: string, rules: import('./dates.js').DayRules } | null} */
    this.rulesCache = null;
    /** @type {((event: Event) => void) | null} */
    this.outside = null;
    this.addEventListener('invalid', (event) => {
      event.preventDefault();
      this.showErrors = true;
      this.refreshState();
      if (this.form?.querySelector(':invalid') === this) this.focus();
    });
    this.addEventListener('focusout', (event) => {
      const next = /** @type {Node | null} */ (event.relatedTarget);
      // Tab out of the calendar closes it; a focus that moves inside the element does not.
      if (this.open && next && next !== this && !this.contains(next)) this.close(false);
    });
  }

  // ---------------------------------------------------------------- state

  /** @returns {boolean} */
  get isRange() {
    return (this.getAttribute('mode') ?? '').trim().toLowerCase() === 'range';
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return parseBoolean(this.getAttribute(name)) === true;
  }

  /** @returns {boolean} */
  get disabled() {
    return this.formDisabled || this.has('disabled');
  }

  /** @returns {boolean} */
  get locked() {
    return this.disabled || this.has('readonly');
  }

  /** @returns {boolean} */
  get inline() {
    return this.has('inline');
  }

  /** @returns {number} Today, in the time zone of the browser, or `now`. */
  get today() {
    const iso = parseIso(this.getAttribute('now'));
    if (iso !== null) return iso;
    const date = new Date(this.now);
    return dayNumber(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  /**
   * @param {'min' | 'max'} name
   * @returns {number}
   */
  limit(name) {
    const value = (this.getAttribute(name) ?? '').trim().toLowerCase();
    const day = value === 'today' ? this.today : parseIso(value);
    return day ?? (name === 'min' ? FIRST_DAY : LAST_DAY);
  }

  /** @returns {import('./dates.js').DayRules} */
  get rules() {
    const text = this.getAttribute('disabled-dates') ?? '';
    if (this.rulesCache?.text !== text) this.rulesCache = { text, rules: parseRules(text) };
    return this.rulesCache.rules;
  }

  /**
   * @param {number} day
   * @returns {boolean}
   */
  blocked(day) {
    return isBlocked(day, this.rules, this.limit('min'), this.limit('max'));
  }

  /** @returns {number} */
  get firstDay() {
    const attr = this.getAttribute('first-day');
    return attr === null
      ? firstDayOfWeek(this.locale)
      : parseInteger(attr, { min: 0, max: 6, fallback: 1 });
  }

  /** @returns {number} */
  get monthCount() {
    return parseInteger(this.getAttribute('months'), { min: 1, max: 3, fallback: this.isRange ? 2 : 1 }); // prettier-ignore
  }

  /** @returns {string[]} Keys of the usual periods offered. */
  get presetKeys() {
    if (!this.isRange) return [];
    const attr = this.getAttribute('presets');
    if (attr === null || attr.trim() === '' || parseBoolean(attr) === true) return PRESETS;
    if (parseBoolean(attr) === false) return [];
    return attr.split(/[\s,]+/).filter(Boolean);
  }

  /** @type {string} */
  get value() {
    this.readInitial();
    if (this.isRange) return this.start !== null && this.end !== null ? `${toIso(this.start)}/${toIso(this.end)}` : ''; // prettier-ignore
    return this.start === null ? '' : toIso(this.start);
  }

  set value(next) {
    this.readInitial();
    const { start, end } = parseValue(next, this.isRange);
    this.start = start;
    this.end = this.isRange ? end : null;
    this.pending = false;
    this.typed = { start: null, end: null };
    this.render();
  }

  /** @type {string} */
  get startDate() {
    this.readInitial();
    return this.start === null ? '' : toIso(this.start);
  }

  /** @type {string} */
  get endDate() {
    this.readInitial();
    return this.end === null ? '' : toIso(this.end);
  }

  /** @type {HTMLFormElement | null} */
  get form() {
    return this.internals?.form ?? null;
  }

  /** @type {ValidityState | undefined} */
  get validity() {
    return this.internals?.validity;
  }

  /** @type {string} */
  get validationMessage() {
    return this.internals?.validationMessage ?? '';
  }

  /** @returns {boolean} */
  checkValidity() {
    return this.internals?.checkValidity() ?? true;
  }

  /** @returns {boolean} */
  reportValidity() {
    this.showErrors = true;
    this.refreshState();
    return this.internals?.reportValidity() ?? true;
  }

  /** @param {string} message */
  setCustomValidity(message) {
    this.customMessage = String(message ?? '');
    if (this.customMessage) this.showErrors = true;
    this.refreshState();
  }

  /** @param {FocusOptions} [options] */
  focus(options) {
    /** @type {HTMLElement | null} */ (
      this.root.querySelector('[data-focus-key="start"], [data-focus-key="toggle"]')
    )?.focus(options);
  }

  /** Reads the first value from the attribute, once. */
  readInitial() {
    if (this.ready) return;
    this.ready = true;
    const { start, end } = parseValue(this.getAttribute('value'), this.isRange);
    this.start = start;
    this.end = this.isRange ? end : null;
    this.pending = false;
    this.typed = { start: null, end: null };
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if ((name === 'value' || name === 'mode') && oldValue !== newValue) this.ready = false;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  formResetCallback() {
    this.ready = false;
    this.showErrors = false;
    this.customMessage = '';
    this.open = false;
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

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopOutside();
  }

  // ---------------------------------------------------------------- formats

  /**
   * @param {number} day
   * @returns {string} The date as typed in the field: `22/11/2026`.
   */
  short(day) {
    return this.formatDate(day * DAY_MS, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }); // prettier-ignore
  }

  /**
   * @param {number} day
   * @returns {string} "Sunday, November 22, 2026".
   */
  long(day) {
    return this.formatDate(day * DAY_MS, { dateStyle: 'full', timeZone: 'UTC' });
  }

  /**
   * @param {number} day
   * @returns {string} "22 Nov 2026".
   */
  medium(day) {
    return this.formatDate(day * DAY_MS, { dateStyle: 'medium', timeZone: 'UTC' });
  }

  /** @returns {string} The format of a typed date: "dd/mm/yyyy". */
  get pattern() {
    const t = this.t;
    try {
      return new Intl.DateTimeFormat(this.locale, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }) // prettier-ignore
        .formatToParts(Date.UTC(2000, 10, 22))
        .map((part) =>
          part.type === 'day' || part.type === 'month' || part.type === 'year'
            ? t(/** @type {StringKey} */ (`dateFormat_${part.type}`))
            : part.value,
        )
        .join('');
    } catch {
      return 'yyyy-mm-dd';
    }
  }

  // ---------------------------------------------------------------- validity

  /** @returns {{ flags: ValidityStateFlags, message: string }} */
  check() {
    const t = this.t;
    if (this.disabled) return { flags: {}, message: '' };
    if (this.customMessage) return { flags: { customError: true }, message: this.customMessage };
    if (this.typed.start !== null || this.typed.end !== null)
      return { flags: { badInput: true }, message: t('dateBadInput', { example: this.short(this.today) }) }; // prettier-ignore
    const { start, end } = this;
    if (start === null)
      return this.has('required')
        ? { flags: { valueMissing: true }, message: t(this.isRange ? 'dateValueMissingRange' : 'dateValueMissing') } // prettier-ignore
        : { flags: {}, message: '' };
    if (this.isRange && end === null) return { flags: { valueMissing: true }, message: t('dateEndMissing') }; // prettier-ignore
    const min = this.limit('min');
    const max = this.limit('max');
    if (start < min) return { flags: { rangeUnderflow: true }, message: t('dateTooEarly', { min: this.medium(min) }) }; // prettier-ignore
    const last = end ?? start;
    if (last > max) return { flags: { rangeOverflow: true }, message: t('dateTooLate', { max: this.medium(max) }) }; // prettier-ignore
    if (isBlocked(start, this.rules) || (end !== null && isBlocked(end, this.rules)))
      return { flags: { customError: true }, message: t('dateBlocked') };
    if (this.isRange && end !== null) {
      const days = end - start + 1;
      const fewest = parseInteger(this.getAttribute('min-days'), { min: 0, max: 100000, fallback: 0 }); // prettier-ignore
      const most = parseInteger(this.getAttribute('max-days'), { min: 0, max: 100000, fallback: 0 }); // prettier-ignore
      if (fewest && days < fewest) return { flags: { rangeUnderflow: true }, message: t('dateRangeTooShort', { count: fewest }) }; // prettier-ignore
      if (most && days > most) return { flags: { rangeOverflow: true }, message: t('dateRangeTooLong', { count: most }) }; // prettier-ignore
    }
    return { flags: {}, message: '' };
  }

  /** Updates the submitted value, the validity and the message, without a render. */
  refreshState() {
    this.readInitial();
    const { flags, message } = this.check();
    if (this.internals) {
      const value = this.disabled ? null : this.value;
      this.internals.setFormValue(value, value);
      const anchor = /** @type {HTMLElement | null} */ (this.root.querySelector('[data-focus-key="start"]')) ?? undefined; // prettier-ignore
      this.internals.setValidity(flags, message, Object.keys(flags).length ? anchor : undefined);
    }
    const invalid = Boolean(message) && this.showErrors;
    const error = this.root.getElementById(this.ids.error);
    if (error) error.textContent = invalid ? message : '';
    error?.parentElement?.classList.toggle('has-error', invalid);
    for (const node of this.root.querySelectorAll('.date-input'))
      if (invalid) node.setAttribute('aria-invalid', 'true');
      else node.removeAttribute('aria-invalid');
  }

  /** @returns {{ value: string, start: string, end: string }} */
  get detail() {
    return { value: this.value, start: this.startDate, end: this.endDate };
  }

  /** The value changed: updates the field and tells the page. */
  commit() {
    this.showErrors = true;
    this.refreshState();
    emit(this, EVENTS.INPUT, this.detail);
    emit(this, EVENTS.CHANGE, this.detail);
  }

  // ---------------------------------------------------------------- render

  /** @param {HTMLElement} frame */
  renderContent(frame) {
    this.readInitial();
    const t = this.t;
    const required = this.has('required');
    const hint = this.getAttribute('hint');
    const field = h(
      'div',
      { class: `field date-picker${this.disabled ? ' disabled' : ''}${this.isRange ? ' range' : ''}`, part: 'body' }, // prettier-ignore
      h(
        'div',
        { class: 'field-top' },
        h(
          this.isRange ? 'span' : 'label',
          { class: 'field-label', part: 'label', attrs: { id: this.ids.label, for: this.isRange ? null : this.ids.start } }, // prettier-ignore
          (this.getAttribute('label') ?? '').trim().slice(0, 300),
          required ? h('span', { class: 'field-required', text: '*', attrs: { 'aria-hidden': 'true' } }) : null, // prettier-ignore
          required ? h('span', { class: 'sr-only', text: ` (${t('dateRequired')})` }) : null,
        ),
      ),
      h(
        'div',
        { class: 'date-anchor' },
        this.box(),
        this.open || this.inline ? this.calendar() : null,
      ),
      h(
        'div',
        { class: 'field-meta' },
        h('p', { class: 'field-hint', part: 'hint', text: hint ? `${hint} ` : '', attrs: { id: this.ids.hint } }, h('span', { class: 'date-format', text: t('dateFormatHint', { format: this.pattern }) })), // prettier-ignore
      ),
      h('p', { class: 'field-error', part: 'error', attrs: { id: this.ids.error, 'aria-live': 'polite' } }), // prettier-ignore
    );
    frame.append(field);
    this.refreshState();
    if (this.open && !this.inline) this.watchOutside();
    else this.stopOutside();
  }

  /** @returns {HTMLElement} The text fields and the buttons. */
  box() {
    const t = this.t;
    const filled = this.start !== null || this.typed.start !== null || this.typed.end !== null;
    return h(
      'div',
      { class: 'field-box date-box' },
      this.input('start'),
      this.isRange ? h('span', { class: 'date-dash', text: '–', attrs: { 'aria-hidden': 'true' } }) : null, // prettier-ignore
      this.isRange ? this.input('end') : null,
      this.has('clearable') && !this.locked && filled
        ? h(
            'button',
            {
              class: 'field-icon-button',
              attrs: { type: 'button', 'aria-label': t('dateClear'), 'data-focus-key': 'clear' },
              on: { click: () => this.clear() },
            },
            icon('close'),
          )
        : null,
      this.inline
        ? null
        : h(
            'button',
            {
              class: 'field-icon-button date-toggle',
              part: 'toggle',
              attrs: {
                type: 'button',
                disabled: this.locked,
                'aria-label': t(this.isRange ? 'dateChooseRange' : 'dateChoose'),
                'aria-haspopup': 'dialog',
                'aria-expanded': String(this.open),
                'aria-controls': this.open ? this.ids.popup : null,
                'data-focus-key': 'toggle',
              },
              on: { click: () => (this.open ? this.close() : this.openCalendar()) },
            },
            icon('calendar'),
          ),
    );
  }

  /**
   * @param {Side} side
   * @returns {HTMLElement} The field, with its name for a period.
   */
  input(side) {
    const t = this.t;
    const day = side === 'start' ? this.start : this.end;
    const typed = this.typed[side];
    const input = h('input', {
      class: 'field-input date-input',
      part: 'control',
      attrs: {
        id: this.ids[side],
        type: 'text',
        inputmode: 'numeric',
        autocomplete: 'off',
        placeholder: this.getAttribute('placeholder') || this.pattern,
        disabled: this.disabled,
        readonly: this.has('readonly'),
        required: this.has('required') && (side === 'start' || this.isRange),
        'aria-labelledby': this.isRange ? `${this.ids.label} ${this.ids[side]}-name` : null,
        'aria-describedby': `${this.ids.hint} ${this.ids.error}`,
        'data-focus-key': side,
      },
      on: {
        change: () => this.typedIn(side, input.value),
        keydown: (event) => {
          const key = /** @type {KeyboardEvent} */ (event);
          if (key.key === 'ArrowDown' && key.altKey && !this.inline) {
            key.preventDefault();
            this.openCalendar(side);
          } else if (key.key === 'Escape' && this.open) {
            key.preventDefault();
            this.close();
          }
        },
      },
    });
    input.value = typed ?? (day === null ? '' : this.short(day));
    if (!this.isRange) return input;
    return h(
      'span',
      { class: 'date-side' },
      h('span', { class: 'sr-only', text: t(side === 'start' ? 'dateStart' : 'dateEnd'), attrs: { id: `${this.ids[side]}-name` } }), // prettier-ignore
      input,
    );
  }

  /**
   * A date typed in a field.
   *
   * @param {Side} side
   * @param {string} text
   */
  typedIn(side, text) {
    const day = text.trim() ? parseTyped(text, dateOrder(this.locale), this.today) : null;
    this.typed[side] = text.trim() && day === null ? text : null;
    if (side === 'start') this.start = day;
    else this.end = day;
    if (this.start !== null && this.end !== null && this.end < this.start) [this.start, this.end] = [this.end, this.start]; // prettier-ignore
    this.pending = false;
    if (day !== null) this.view = monthStart(day);
    this.render();
    this.commit();
  }

  clear() {
    this.start = null;
    this.end = null;
    this.pending = false;
    this.typed = { start: null, end: null };
    this.render();
    this.focus();
    this.commit();
  }

  // ---------------------------------------------------------------- calendar

  /** @returns {HTMLElement} */
  calendar() {
    const t = this.t;
    const count = this.monthCount;
    if (!this.view) this.view = monthStart(this.start ?? this.today);
    const months = Array.from({ length: count }, (_, i) => addMonths(this.view, i));
    const focus = this.rovingDay(months);
    const presets = presetRanges(this.today, this.firstDay, this.presetKeys);
    const titleId = `${this.ids.popup}-title`;
    return h(
      'div',
      {
        class: `date-popup${this.inline ? ' inline' : ''}`,
        part: 'calendar',
        attrs: {
          id: this.ids.popup,
          role: this.inline ? 'group' : 'dialog',
          'aria-label': t(this.isRange ? 'dateChooseRange' : 'dateChoose'),
        },
        on: {
          keydown: (event) => {
            if (/** @type {KeyboardEvent} */ (event).key === 'Escape' && !this.inline) {
              event.preventDefault();
              event.stopPropagation();
              this.close();
            }
          },
        },
      },
      presets.length && !this.locked
        ? h(
            'ul',
            { class: 'date-presets', part: 'presets', attrs: { 'aria-label': t('datePresets') } },
            ...presets.map((preset) =>
              h(
                'li',
                {},
                h('button', {
                  class: 'date-preset',
                  text: t(/** @type {StringKey} */ (`datePreset_${preset.key}`)),
                  attrs: {
                    type: 'button',
                    'aria-pressed': String(this.start === preset.start && this.end === preset.end),
                    disabled: preset.start < this.limit('min') || preset.end > this.limit('max'),
                    'data-focus-key': `preset-${preset.key}`,
                  },
                  on: { click: () => this.choosePeriod(preset.start, preset.end) },
                }),
              ),
            ),
          )
        : null,
      h(
        'div',
        { class: 'date-main' },
        h(
          'div',
          { class: 'date-nav' },
          this.navButton(-1),
          h('p', { class: 'date-title', text: months.map((m) => this.monthName(m)).join(' – '), attrs: { id: titleId, 'aria-live': 'polite' } }), // prettier-ignore
          this.navButton(1),
        ),
        h('div', { class: 'date-months' }, ...months.map((m) => this.monthTable(m, focus))),
        h(
          'div',
          { class: 'date-foot' },
          this.isRange ? h('p', { class: 'date-status', text: this.pending ? t('dateChooseEnd') : '', attrs: { id: this.ids.status } }) : null, // prettier-ignore
          this.locked
            ? null
            : h('button', {
                class: 'text-btn',
                text: t('dateToday'),
                attrs: { type: 'button', 'data-focus-key': 'today', disabled: this.blocked(this.today) && !this.isRange }, // prettier-ignore
                on: { click: () => this.goToday() },
              }),
          this.locked || (this.start === null && !this.pending)
            ? null
            : h('button', {
                class: 'text-btn',
                text: t('dateClear'),
                attrs: { type: 'button', 'data-focus-key': 'clear-all' },
                on: { click: () => this.clear() },
              }),
          this.inline
            ? null
            : h('button', {
                class: 'text-btn',
                text: t('dateClose'),
                attrs: { type: 'button', 'data-focus-key': 'close' },
                on: { click: () => this.close() },
              }),
        ),
      ),
    );
  }

  /**
   * @param {number} step - -1 or 1.
   * @returns {HTMLElement}
   */
  navButton(step) {
    const view = addMonths(this.view, step);
    const min = monthStart(this.limit('min'));
    const max = monthStart(this.limit('max'));
    const outside = step < 0 ? view < min : addMonths(view, this.monthCount - 1) > max;
    return h(
      'button',
      {
        class: 'field-icon-button date-move',
        attrs: {
          type: 'button',
          disabled: outside,
          'aria-label': this.t(step < 0 ? 'datePrevMonth' : 'dateNextMonth'),
          'data-focus-key': step < 0 ? 'prev' : 'next',
        },
        on: {
          click: () => {
            this.view = view;
            if (this.focusDay !== null) this.focusDay = addMonths(this.focusDay, step);
            this.render();
            // At the first or last month the button is disabled: the focus goes to the days.
            const self = this.root.querySelector(
              `[data-focus-key="${step < 0 ? 'prev' : 'next'}"]`,
            );
            if (self instanceof HTMLButtonElement && self.disabled)
              /** @type {HTMLElement | null} */ (
                this.root.querySelector('.date-day[tabindex="0"]')
              )?.focus();
          },
        },
      },
      icon(step < 0 ? 'chevron-left' : 'chevron-right'),
    );
  }

  /**
   * @param {number} month
   * @returns {string} "November 2026".
   */
  monthName(month) {
    return this.formatDate(month * DAY_MS, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  /**
   * The day that takes the focus in the calendar: the focused one, else the chosen one, else
   * today, else the first day of the month that can be chosen.
   *
   * @param {number[]} months
   * @returns {number}
   */
  rovingDay(months) {
    const first = months[0];
    const last = addMonths(months[months.length - 1], 1) - 1;
    for (const day of [this.focusDay, this.start, this.today])
      if (day !== null && day >= first && day <= last) return day;
    return nearestFree(first, 1, this.rules, this.limit('min'), this.limit('max')) ?? first;
  }

  /**
   * @param {number} month - Its first day.
   * @param {number} focus
   * @returns {HTMLElement}
   */
  monthTable(month, focus) {
    const first = this.firstDay;
    const grid = monthGrid(month, first);
    const { month: m } = fromDayNumber(month);
    const nameId = `${this.ids.popup}-${month}`;
    const weekdays = Array.from({ length: 7 }, (_, i) => FIRST_SUNDAY + ((first + i) % 7));
    return h(
      'div',
      { class: 'date-month' },
      h('p', { class: 'date-month-name', text: this.monthName(month), attrs: { id: nameId } }),
      h(
        'table',
        {
          class: 'date-grid',
          attrs: { role: 'grid', 'aria-labelledby': nameId },
          on: { keydown: (event) => this.gridKey(/** @type {KeyboardEvent} */ (event)) },
        },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            ...weekdays.map((day) =>
              h('th', {
                text: this.formatDate(day * DAY_MS, { weekday: 'narrow', timeZone: 'UTC' }),
                attrs: { scope: 'col', abbr: this.formatDate(day * DAY_MS, { weekday: 'long', timeZone: 'UTC' }) }, // prettier-ignore
              }),
            ),
          ),
        ),
        h(
          'tbody',
          {},
          ...grid
            .filter((week) => week.some((day) => fromDayNumber(day).month === m))
            .map((week) =>
              h(
                'tr',
                {},
                ...week.map((day) =>
                  fromDayNumber(day).month === m
                    ? this.dayCell(day, focus)
                    : h('td', { class: 'date-empty', attrs: { role: 'gridcell' } }),
                ),
              ),
            ),
        ),
      ),
    );
  }

  /**
   * @param {number} day
   * @param {number} focus
   * @returns {HTMLElement}
   */
  dayCell(day, focus) {
    const { start, end } = this;
    const blocked = this.blocked(day);
    const selected = day === start || day === end || (start !== null && end !== null && day > start && day < end); // prettier-ignore
    const classes = ['date-day'];
    if (day === this.today) classes.push('today');
    if (blocked) classes.push('blocked');
    if (selected) classes.push('selected');
    if (day === start) classes.push('start');
    if (day === end || (day === start && end === null && !this.pending)) classes.push('end');
    if (start !== null && end !== null && day > start && day < end) classes.push('in-range');
    if (weekdayOf(day) === this.firstDay) classes.push('week-start');
    if (weekdayOf(day) === (this.firstDay + 6) % 7) classes.push('week-end');
    return h(
      'td',
      {
        class: classes.join(' '),
        part: 'day',
        attrs: {
          role: 'gridcell',
          tabindex: day === focus ? '0' : '-1',
          'aria-selected': String(selected),
          'aria-disabled': blocked || this.locked ? 'true' : null,
          'aria-current': day === this.today ? 'date' : null,
          'data-day': String(day),
          'data-focus-key': `day-${day}`,
        },
        on: {
          click: () => this.chooseDay(day),
          pointerenter: () => this.preview(day),
          focus: () => {
            this.focusDay = day;
            this.preview(day);
          },
        },
      },
      h('span', { class: 'date-number', text: String(fromDayNumber(day).day), attrs: { 'aria-hidden': 'true' } }), // prettier-ignore
      h('span', { class: 'sr-only', text: blocked ? `${this.long(day)}, ${this.t('dateUnavailable')}` : this.long(day) }), // prettier-ignore
    );
  }

  /**
   * Shows the period that a choice would make, while its end is being chosen.
   *
   * @param {number} day
   */
  preview(day) {
    if (!this.pending || this.start === null) return;
    const [a, b] = day < this.start ? [day, this.start] : [this.start, day];
    for (const cell of this.root.querySelectorAll('.date-day')) {
      const d = Number(/** @type {HTMLElement} */ (cell).dataset.day);
      cell.classList.toggle('preview', d >= a && d <= b);
    }
  }

  /** @param {number} day */
  chooseDay(day) {
    if (this.locked || this.blocked(day)) return;
    this.focusDay = day;
    if (!this.isRange) {
      this.start = day;
      this.typed = { start: null, end: null };
      this.announce(this.t('dateChosen', { date: this.long(day) }));
      this.finish();
      return;
    }
    if (!this.pending || this.start === null) {
      this.start = day;
      this.end = null;
      this.pending = true;
      this.typed = { start: null, end: null };
      this.render();
      this.announce(this.t('dateChooseEnd'));
      emit(this, EVENTS.INPUT, this.detail);
      return;
    }
    this.choosePeriod(Math.min(this.start, day), Math.max(this.start, day));
  }

  /**
   * @param {number} start
   * @param {number} end
   */
  choosePeriod(start, end) {
    this.start = start;
    this.end = end;
    this.pending = false;
    this.typed = { start: null, end: null };
    this.view = monthStart(start);
    this.focusDay = start;
    this.announce(this.t('dateRangeChosen', { start: this.long(start), end: this.long(end) }));
    this.finish();
  }

  /** A date or a period was chosen: closes the calendar and tells the page. */
  finish() {
    if (this.inline) this.render();
    else this.close();
    this.commit();
  }

  goToday() {
    const today = this.today;
    this.view = monthStart(today);
    this.focusDay = today;
    if (!this.isRange && !this.blocked(today)) {
      this.chooseDay(today);
      return;
    }
    this.render();
    this.focusCell(today);
  }

  /** @param {Side} [side] */
  openCalendar(side = 'start') {
    if (this.locked || this.inline) return;
    this.open = true;
    const from = (side === 'end' ? this.end : null) ?? this.start;
    const day = from ?? nearestFree(Math.max(this.today, this.limit('min')), 1, this.rules, this.limit('min'), this.limit('max')) ?? this.today; // prettier-ignore
    this.focusDay = day;
    this.view = side === 'end' && this.end !== null && this.monthCount > 1 ? addMonths(monthStart(day), 1 - this.monthCount) : monthStart(day); // prettier-ignore
    if (this.view < monthStart(this.limit('min'))) this.view = monthStart(this.limit('min'));
    this.render();
    this.focusCell(day);
    emit(this, EVENTS.TOGGLE, { expanded: true });
  }

  /** @param {boolean} [focus] */
  close(focus = true) {
    if (!this.open) return;
    this.open = false;
    // A period left without its end stays invalid until it gets one.
    this.pending = false;
    this.showErrors = true;
    this.render();
    if (focus) /** @type {HTMLElement | null} */ (this.root.querySelector('[data-focus-key="toggle"]'))?.focus(); // prettier-ignore
    emit(this, EVENTS.TOGGLE, { expanded: false });
  }

  /** @param {number} day */
  focusCell(day) {
    /** @type {HTMLElement | null} */ (this.root.querySelector(`[data-day="${day}"]`))?.focus();
  }

  /**
   * Moves in the calendar as in the date picker pattern of WAI-ARIA.
   *
   * @param {KeyboardEvent} event
   */
  gridKey(event) {
    const cell = /** @type {HTMLElement} */ (event.target).closest?.('[data-day]');
    if (!(cell instanceof HTMLElement)) return;
    const day = Number(cell.dataset.day);
    const week = (weekdayOf(day) - this.firstDay + 7) % 7;
    /** @type {Record<string, () => number>} */
    const moves = {
      ArrowLeft: () => day - 1,
      ArrowRight: () => day + 1,
      ArrowUp: () => day - 7,
      ArrowDown: () => day + 7,
      Home: () => day - week,
      End: () => day + 6 - week,
      PageUp: () => addMonths(day, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(day, event.shiftKey ? 12 : 1),
    };
    if (moves[event.key]) {
      event.preventDefault();
      const next = Math.min(LAST_DAY, Math.max(FIRST_DAY, moves[event.key]()));
      this.focusDay = next;
      const last = addMonths(this.view, this.monthCount) - 1;
      if (next < this.view) this.view = monthStart(next);
      else if (next > last) this.view = addMonths(monthStart(next), 1 - this.monthCount);
      this.render();
      this.focusCell(next);
      this.preview(next);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.chooseDay(day);
      if (this.pending || this.inline) this.focusCell(day);
    }
  }

  /** Closes the calendar when a press lands outside the element. */
  watchOutside() {
    if (this.outside) return;
    this.outside = (event) => {
      if (event.type === 'keydown') {
        // Escape closes the calendar even when the focus was lost to the page.
        if (/** @type {KeyboardEvent} */ (event).key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          this.close();
        }
      } else if (!event.composedPath().includes(this)) this.close(false);
    };
    document.addEventListener('pointerdown', this.outside, true);
    document.addEventListener('keydown', this.outside);
  }

  stopOutside() {
    if (!this.outside) return;
    document.removeEventListener('pointerdown', this.outside, true);
    document.removeEventListener('keydown', this.outside);
    this.outside = null;
  }
}

/** 1970-01-04, a Sunday: the weekday names are written from it. */
const FIRST_SUNDAY = 3;
