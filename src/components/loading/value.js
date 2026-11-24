// @ts-check
/**
 * Value handling shared by `<vt-progress>` and `<vt-progress-ring>`: value and max from
 * attributes or properties, the text shown, the ARIA attributes and the progress events.
 *
 * @module components/loading/value
 */
import { cleanLabel, parseEnum } from '../../core/attributes.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { VtIndicator, parseNumber } from './indicator.js';

export const SHOW_VALUES = /** @type {const} */ (['percent', 'value', 'fraction', 'none']);
export const STATUSES = /** @type {const} */ (['normal', 'success', 'warning', 'error']);
/** Tone of each status, unless `tone` is set. */
const STATUS_TONES = { normal: null, success: 'success', warning: 'warning', error: 'danger' };

/** @typedef {(typeof STATUSES)[number]} Status */

export class VtValueIndicator extends VtIndicator {
  static componentAttributes = ['value', 'max', 'min', 'show-value', 'unit', 'decimals', 'status', 'text', 'value-text']; // prettier-ignore

  constructor() {
    super();
    /** @type {number | null} Value set through the property; `null` follows `value`. */
    this.valueState = null;
    /** @type {number | null} Last value announced with `vt-progress`. */
    this.lastValue = null;
    this.completed = false;
  }

  /** The current value, `null` when indeterminate. */
  get value() {
    const raw = this.valueState ?? parseNumber(this.getAttribute('value'));
    if (raw === null) return null;
    return Math.min(this.max, Math.max(this.min, raw));
  }

  set value(next) {
    this.valueState = next === null || next === undefined || !Number.isFinite(Number(next)) ? null : Number(next); // prettier-ignore
    this.valueChanged();
    this.requestRender();
  }

  get min() {
    return parseNumber(this.getAttribute('min')) ?? 0;
  }

  get max() {
    const max = parseNumber(this.getAttribute('max')) ?? 100;
    return max > this.min ? max : this.min + 1;
  }

  set max(next) {
    if (Number.isFinite(Number(next))) this.setAttribute('max', String(next));
  }

  /** Share done, from 0 to 1, `null` when indeterminate. */
  get ratio() {
    const value = this.value;
    return value === null ? null : (value - this.min) / (this.max - this.min);
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'value' && oldValue !== newValue) this.valueState = null;
    super.attributeChangedCallback(name, oldValue, newValue);
    if ((name === 'value' || name === 'max' || name === 'min') && oldValue !== newValue) this.valueChanged(); // prettier-ignore
  }

  /** Fires `vt-progress`, and `vt-complete` once the maximum is reached. */
  valueChanged() {
    const value = this.value;
    if (value === this.lastValue) return;
    this.lastValue = value;
    if (value === null) {
      this.completed = false;
      return;
    }
    emit(this, EVENTS.PROGRESS, { value, max: this.max, ratio: this.ratio });
    if (value >= this.max && !this.completed) {
      this.completed = true;
      emit(this, EVENTS.COMPLETE, { status: this.status });
    } else if (value < this.max) this.completed = false;
  }

  /** @returns {Status} */
  get status() {
    return parseEnum(this.getAttribute('status'), STATUSES, 'normal');
  }

  /** The tone: `tone` if set, else the status color. */
  applyStatusTone() {
    const tone = STATUS_TONES[this.status];
    if (tone && !this.hasAttribute('tone')) this.frame.dataset.tone = tone;
  }

  /** The value as text, as `show-value` asks (empty for `none` or when indeterminate). */
  valueLabel() {
    const value = this.value;
    const custom = cleanLabel(this.getAttribute('value-text'));
    if (custom) return custom;
    const show = parseEnum(this.getAttribute('show-value'), SHOW_VALUES, this.defaultShowValue);
    if (value === null || show === 'none') return '';
    const decimals = Math.min(4, Math.max(0, parseNumber(this.getAttribute('decimals')) ?? 0));
    const format = (/** @type {number} */ n) => new Intl.NumberFormat(this.locale, { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(n); // prettier-ignore
    const unit = cleanLabel(this.getAttribute('unit'), 20);
    const withUnit = (/** @type {string} */ text) => (unit ? `${text} ${unit}` : text);
    if (show === 'value') return withUnit(format(value));
    if (show === 'fraction') return withUnit(this.t('loadingFraction', { value: format(value), max: format(this.max) })); // prettier-ignore
    return this.t('loadingPercent', { percent: format(/** @type {number} */ (this.ratio) * 100) });
  }

  /** `show-value` when it is not set. */
  get defaultShowValue() {
    return /** @type {(typeof SHOW_VALUES)[number]} */ ('none');
  }

  /**
   * ARIA attributes of a progress bar on `element`.
   *
   * @param {HTMLElement} element
   */
  setProgressAria(element) {
    const value = this.value;
    element.setAttribute('role', 'progressbar');
    // `label`, else the visible text, else "Loading".
    element.setAttribute('aria-label', cleanLabel(this.getAttribute('label')) || cleanLabel(this.getAttribute('text')) || this.t('loadingLabel')); // prettier-ignore
    element.setAttribute('aria-valuemin', String(this.min));
    element.setAttribute('aria-valuemax', String(this.max));
    if (value === null) {
      element.removeAttribute('aria-valuenow');
      element.removeAttribute('aria-valuetext');
      element.setAttribute('aria-busy', 'true');
      return;
    }
    element.removeAttribute('aria-busy');
    element.setAttribute('aria-valuenow', String(value));
    const label = this.valueLabel();
    const percent = this.t('loadingPercent', { percent: formatNumber(Math.round(/** @type {number} */ (this.ratio) * 100), this.locale) }); // prettier-ignore
    element.setAttribute('aria-valuetext', label || percent);
  }
}
