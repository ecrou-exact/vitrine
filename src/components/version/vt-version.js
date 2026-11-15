// @ts-check
import fieldCss from '../../styles/field.css?raw';
import versionCss from '../../styles/version.css?raw';
import { cleanLabel, parseBoolean, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import {
  allowedChar,
  bump,
  cleanText,
  changeOf,
  compareVersions,
  formatVersion,
  parseFormat,
  parseVersion,
  segmentRanges,
  stepDecimal,
  stepSegment,
  today,
} from './versions.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./versions.js').Version} Version */
/** @typedef {import('./versions.js').Format} Format */
/** @typedef {import('./versions.js').Segment} Segment */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const DATE_NAMES = /** @type {Record<string, string>} */ ({ YYYY: 'YEAR', YY: 'YEAR', '0Y': 'YEAR', MM: 'MONTH', '0M': 'MONTH', WW: 'WEEK', '0W': 'WEEK', DD: 'DAY', '0D': 'DAY' }); // prettier-ignore
const POSITION_NAMES = ['MAJOR', 'MINOR', 'PATCH', 'BUILD'];

/**
 * A field for version numbers. It writes them as Semantic Versioning (`1.4.2-beta.1`),
 * dotted numbers of any length (`#.#`, `#.#.#.#`), calendar versions (`YYYY.0M.MICRO`,
 * `YY.0M`) or decimal numbers with a step (`1.0`, `1.1`…), and lets only those characters
 * be typed.
 *
 * The `simple` variant is a text field with − and + buttons, where the arrow keys step the
 * part under the caret. The `full` variant edits each part on its own, as a spin button that
 * can only hold a valid value, with the pre-release, the next versions (major, minor, patch,
 * pre-release, today) as buttons, and what kind of release it is from the `current` version.
 * Parts can have a largest value and carry into the part before (1.9 → 2.0).
 *
 * It takes part in `<form>` like a native field.
 *
 * @element vt-version
 * @since 0.16.0
 *
 * @attr {string} value - The first version.
 * @attr {string} name - Name of the value in the submitted form.
 * @attr {string} label - Label of the field (default "Version").
 * @attr {string} hint - Help under the field.
 * @attr {string} format - `semver` (default), `x.y`, `x.y.z`, `x.y.z.w`, `calver` (`YYYY.0M.MICRO`), `decimal`, or tokens such as `#.#`, `YY.0M`, `YYYY.MM.DD.MICRO`.
 * @attr {string} segment-max - Largest value of each part, separated by commas, such as `*,9,9`; a part past it carries into the one before.
 * @attr {string} step - Step of a decimal (default 0.1); its decimals set the precision.
 * @attr {number} precision - Decimals of a decimal, when not given by `step`.
 * @attr {string} min - Lowest version accepted.
 * @attr {string} max - Highest version accepted.
 * @attr {string} current - The version released now: says what kind of release the value is.
 * @attr {boolean} newer - The value must be higher than `current`.
 * @attr {string} prefix - Text before the version, such as `v`; not submitted.
 * @attr {boolean} strict - Leaving the field with an invalid version puts the last valid one back.
 * @attr {string} preids - Pre-release names offered (default `alpha,beta,rc`).
 * @attr {boolean} required - A version must be given.
 * @attr {boolean} disabled - The field cannot be used and is not submitted.
 * @attr {boolean} readonly - The value cannot be changed but is submitted.
 * @attr {string} placeholder - Placeholder of the text field.
 * @attr {string} now - The current date, for `today` with calendar versions.
 *
 * @prop {string} value - The version.
 * @prop {Version | null} version - The version read, or `null` when invalid (read-only).
 * @prop {HTMLFormElement | null} form - The form of the field (read-only).
 * @prop {ValidityState | undefined} validity - Its validity (read-only).
 *
 * @fires vt-input - The version changed. Detail: `{ value, valid }`.
 * @fires vt-change - The version was committed. Detail: `{ value, previous, change }`.
 *
 * @csspart label - The label.
 * @csspart control - The text field (`simple`).
 * @csspart editor - The parts (`full`).
 * @csspart segment - One part (`full`).
 * @csspart step-button - A − or + button.
 * @csspart bumps - The next versions (`full`).
 * @csspart change - The kind of release.
 * @csspart error - The error message.
 *
 * @example
 * <vt-version name="version" label="Release" current="1.4.2" newer variant="full"></vt-version>
 */
export class VtVersion extends VtBase {
  static type = 'version';

  static formAssociated = true;

  static allowEmpty = true;

  static componentAttributes = Object.freeze([
    'value', 'name', 'hint', 'format', 'segment-max', 'step', 'precision', 'min', 'max', 'current',
    'newer', 'prefix', 'strict', 'preids', 'required', 'disabled', 'readonly', 'placeholder', 'now',
  ]); // prettier-ignore

  static dataAttributes = Object.freeze(['value', 'format', 'current', 'min', 'max', 'segment-max']); // prettier-ignore

  static presets = { simple: {}, full: {} };

  static styles = [fieldCss, versionCss];

  /**
   * A string is the version; an object sets `value`, `format`, `current`, `min`, `max`, `segmentMax`.
   *
   * @param {unknown} value
   * @returns {import('../../core/data-input.js').DataResult}
   */
  static fromData(value) {
    if (typeof value === 'string' || typeof value === 'number') return { content: '', attributes: { value: String(value) } }; // prettier-ignore
    const item = value !== null && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : {}; // prettier-ignore
    return { content: '', attributes: { value: item.value, format: item.format, current: item.current, min: item.min, max: item.max, 'segment-max': Array.isArray(item.segmentMax) ? item.segmentMax.join(',') : item.segmentMax } }; // prettier-ignore
  }

  constructor() {
    super();
    this.internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
    this.ids = { label: uid('label'), control: uid('version'), hint: uid('hint'), error: uid('error'), change: uid('change'), prefix: uid('prefix') }; // prettier-ignore
    /** @type {string | null} Text typed; `null`: the `value` attribute. */
    this.textValue = null;
    /** @type {string} The value at the last `vt-change`. */
    this.committed = '';
    /** @type {string} The last valid value, for `strict`. */
    this.lastValid = '';
    /** @type {Record<number, string>} Digits of a part being typed in the full editor. */
    this.typing = {};
    this.showErrors = false;
    this.formDisabled = false;
    /** @type {{ key: string, format: Format } | null} */
    this.formatCache = null;
    this.addEventListener('invalid', (event) => {
      event.preventDefault();
      this.showErrors = true;
      this.update();
    });
  }

  // ---------------------------------------------------------------- settings

  /** @returns {Format} */
  get format() {
    const name = this.getAttribute('format') ?? 'semver';
    const max = this.getAttribute('segment-max') ?? '';
    const step = this.getAttribute('step') ?? '';
    const precision = this.getAttribute('precision') ?? '';
    const key = `${name}|${max}|${step}|${precision}`;
    if (this.formatCache?.key === key) return this.formatCache.format;
    const fromStep = /^\d*[.,](\d+)$/.exec(step.trim())?.[1].length;
    const format = parseFormat(name, {
      segmentMax: max.split(',').map((s) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null)),
      precision: fromStep ?? parseInteger(precision || null, { min: 0, max: 10, fallback: step && /^\d+$/.test(step.trim()) ? 0 : 1 }), // prettier-ignore
    });
    this.formatCache = { key, format };
    return format;
  }

  /** @returns {number} The step of a decimal, in units of 10^-precision. */
  get stepUnits() {
    const format = this.format;
    const parsed = parseVersion(this.getAttribute('step') ?? '', format);
    const units = parsed.ok ? Math.abs(parsed.version.parts[0]) : 1;
    return units || 1;
  }

  /** @returns {boolean} */
  get full() {
    return this.variant === 'full';
  }

  /** @returns {boolean} */
  get disabled() {
    return this.formDisabled || parseBoolean(this.getAttribute('disabled')) === true;
  }

  /** @returns {boolean} */
  get readOnly() {
    return parseBoolean(this.getAttribute('readonly')) === true;
  }

  /**
   * @param {string} name
   * @returns {Version | null} A version read from an attribute.
   */
  attrVersion(name) {
    const text = this.getAttribute(name);
    if (!text) return null;
    const parsed = parseVersion(text, this.format);
    return parsed.ok ? parsed.version : null;
  }

  /** @returns {string} An example of the format, for messages and placeholders. */
  get example() {
    const format = this.format;
    if (format.kind === 'decimal') return formatVersion({ parts: [10 ** format.precision], pre: [], build: [] }, format); // prettier-ignore
    if (format.calendar) return formatVersion(today(null, format, this.now), format);
    return formatVersion({ parts: format.segments.map((s, i) => Math.max(s.min, [1, 4, 2, 0][i] ?? 0)), pre: [], build: [] }, format); // prettier-ignore
  }

  /** @returns {Date} */
  get now() {
    const time = Date.parse(this.getAttribute('now') ?? '');
    return Number.isNaN(time) ? new Date() : new Date(time);
  }

  /**
   * @param {number} index
   * @returns {string} The name of a part.
   */
  segmentName(index) {
    const t = this.t;
    const format = this.format;
    const segment = format.segments[index];
    if (format.kind === 'decimal') return t('vrSeg_VALUE');
    if (segment.date) return t(/** @type {StringKey} */ (`vrSeg_${DATE_NAMES[segment.token]}`));
    if (segment.token !== '#') return t(/** @type {StringKey} */ (`vrSeg_${segment.token}`));
    return POSITION_NAMES[index] && format.segments.length <= 4 ? t(/** @type {StringKey} */ (`vrSeg_${POSITION_NAMES[index]}`)) : t('vrSeg_PART', { n: index + 1 }); // prettier-ignore
  }

  // ---------------------------------------------------------------- value

  /** @returns {string} */
  get value() {
    return this.textValue ?? (this.getAttribute('value') ?? '').trim();
  }

  set value(value) {
    this.textValue =
      value === null || value === undefined ? '' : String(value).trim().slice(0, 300);
    this.typing = {};
    if (this._connected) this.render();
  }

  /** @returns {Version | null} */
  get version() {
    const parsed = parseVersion(this.value, this.format);
    return parsed.ok ? parsed.version : null;
  }

  /**
   * The version the full editor shows: the value, or the lowest version when it is invalid.
   *
   * @returns {Version}
   */
  get editorVersion() {
    const format = this.format;
    const version = this.version ?? this.attrVersion('min');
    if (version) return version;
    if (format.calendar) return today(null, format, this.now);
    return { parts: format.segments.map((s) => (format.kind === 'decimal' ? 0 : Math.max(0, s.min))), pre: [], build: [] }; // prettier-ignore
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
    this.update();
    return this.internals?.reportValidity() ?? true;
  }

  /** @param {FocusOptions} [options] */
  focus(options) {
    /** @type {HTMLElement | null} */ (this.root.querySelector('[data-focus-key="control"], [data-focus-key="segment-0"]'))?.focus(options); // prettier-ignore
  }

  connectedCallback() {
    super.connectedCallback();
    this.committed = this.value;
    if (this.version) this.lastValid = this.value;
  }

  formResetCallback() {
    this.textValue = null;
    this.typing = {};
    this.showErrors = false;
    this.committed = this.value;
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

  // ---------------------------------------------------------------- validity

  /** @returns {{ flags: ValidityStateFlags, message: string }} */
  check() {
    const t = this.t;
    const format = this.format;
    const value = this.value;
    if (this.disabled) return { flags: {}, message: '' };
    if (!value) return parseBoolean(this.getAttribute('required')) === true ? { flags: { valueMissing: true }, message: t('vrMissing') } : { flags: {}, message: '' }; // prettier-ignore
    const parsed = parseVersion(value, format);
    if (!parsed.ok) {
      const segment = parsed.index === undefined ? null : format.segments[parsed.index];
      const name = parsed.index === undefined ? '' : this.segmentName(parsed.index);
      if (parsed.error === 'zero') return { flags: { badInput: true }, message: t('vrBadZero', { segment: name }) }; // prettier-ignore
      if (parsed.error === 'width' && segment) return { flags: { badInput: true }, message: t('vrBadWidth', { segment: name, width: segment.width }) }; // prettier-ignore
      if (parsed.error === 'range' && segment) return { flags: { badInput: true }, message: t('vrBadRange', { segment: name, min: segment.min, max: Number.isFinite(segment.max) ? segment.max : t('vrNoLimit') }) }; // prettier-ignore
      if (parsed.error === 'precision') return { flags: { stepMismatch: true }, message: t('vrBadPrecision', { count: format.precision }) }; // prettier-ignore
      return { flags: { badInput: true }, message: t('vrBadFormat', { example: this.example }) };
    }
    const version = parsed.version;
    const min = this.attrVersion('min');
    const max = this.attrVersion('max');
    if (min && compareVersions(version, min) < 0) return { flags: { rangeUnderflow: true }, message: t('vrTooLow', { min: formatVersion(min, format) }) }; // prettier-ignore
    if (max && compareVersions(version, max) > 0) return { flags: { rangeOverflow: true }, message: t('vrTooHigh', { max: formatVersion(max, format) }) }; // prettier-ignore
    const current = this.attrVersion('current');
    if (current && parseBoolean(this.getAttribute('newer')) === true && compareVersions(version, current) <= 0) return { flags: { rangeUnderflow: true }, message: t('vrNotNewer', { current: formatVersion(current, format) }) }; // prettier-ignore
    return { flags: {}, message: '' };
  }

  /** @returns {boolean} */
  get valid() {
    return !Object.keys(this.check().flags).length;
  }

  /** Updates the form value, the validity, the message and the kind of release. */
  /**
   * @param {{ bumps?: boolean }} [options] - `bumps: false` keeps the next versions as they
   *   are, while a press on one of them may be under way.
   */
  update(options = {}) {
    const { flags, message } = this.check();
    if (this.internals) {
      this.internals.setFormValue(this.disabled ? null : this.value, this.value);
      const anchor = /** @type {HTMLElement | null} */ (this.root.querySelector('[data-focus-key="control"], [data-focus-key="segment-0"]')) ?? undefined; // prettier-ignore
      this.internals.setValidity(flags, message, Object.keys(flags).length ? anchor : undefined);
    }
    const invalid = Boolean(message) && this.showErrors;
    const error = this.root.getElementById(this.ids.error);
    if (error) error.textContent = invalid ? message : '';
    for (const node of this.root.querySelectorAll('[data-focus-key="control"], .vr-seg-input'))
      if (invalid) node.setAttribute('aria-invalid', 'true');
      else node.removeAttribute('aria-invalid');
    this.root.querySelector('.field')?.classList.toggle('has-error', invalid);
    const change = this.root.getElementById(this.ids.change);
    if (change) change.replaceWith(this.changeView());
    const result = this.root.querySelector('.vr-result-value');
    if (result) result.textContent = this.value;
    const bumps = this.root.querySelector('.vr-bumps');
    if (bumps && options.bumps !== false && !bumps.contains(this.root.activeElement)) {
      const next = this.bumpsView();
      if (next) bumps.replaceWith(next);
      else bumps.remove();
    }
  }

  /**
   * Sets the value from code or a control, and tells listeners.
   *
   * @param {string} next
   * @param {{ commit?: boolean, render?: boolean }} [options]
   */
  set(next, options = {}) {
    this.textValue = next;
    if (this.version) this.lastValid = next;
    if (options.render !== false) this.render();
    else this.update();
    emit(this, EVENTS.INPUT, { value: next, valid: this.valid });
    if (options.commit) this.commit();
  }

  /** Emits `vt-change` when the value differs from the last one committed. */
  commit() {
    const value = this.value;
    if (value === this.committed) return;
    const previous = this.committed;
    this.committed = value;
    const from = parseVersion(previous, this.format);
    const to = this.version;
    emit(this, EVENTS.CHANGE, { value, previous, change: from.ok && to ? changeOf(from.version, to, this.format).change : null }); // prettier-ignore
  }

  // ---------------------------------------------------------------- rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const required = parseBoolean(this.getAttribute('required')) === true;
    const hint = cleanLabel(this.getAttribute('hint'), 300);
    const segmented = this.full && this.format.kind !== 'decimal';
    const field = h(
      'div',
      { class: `field version${this.disabled ? ' disabled' : ''}${this.full ? ' full' : ''}`, part: 'body' }, // prettier-ignore
      h(
        'div',
        { class: 'field-top' },
        h(
          segmented ? 'span' : 'label',
          { class: 'field-label', part: 'label', attrs: { id: this.ids.label, for: segmented ? null : this.ids.control } }, // prettier-ignore
          cleanLabel(this.getAttribute('label'), 300) || t('vrLabel'),
          required ? h('span', { class: 'field-required', text: '*', attrs: { 'aria-hidden': 'true' } }) : null, // prettier-ignore
          required ? h('span', { class: 'sr-only', text: ` (${t('vrRequired')})` }) : null,
        ),
      ),
      segmented ? this.editorView() : this.inputView(),
      hint ? h('p', { class: 'field-hint', part: 'hint', text: hint, attrs: { id: this.ids.hint } }) : null, // prettier-ignore
      segmented ? this.resultView() : this.changeView(),
      this.full ? this.bumpsView() : null,
      h('p', { class: 'field-error', part: 'error', attrs: { id: this.ids.error, 'aria-live': 'polite' } }), // prettier-ignore
    );
    frame.append(field);
    this.update();
  }

  /** @returns {string} */
  describedBy() {
    return [this.getAttribute('prefix') ? this.ids.prefix : '', this.getAttribute('hint') ? this.ids.hint : '', this.getAttribute('current') ? this.ids.change : '', this.ids.error].filter(Boolean).join(' '); // prettier-ignore
  }

  /** @returns {HTMLElement | null} */
  prefixView() {
    const prefix = cleanLabel(this.getAttribute('prefix'), 10);
    return prefix ? h('span', { class: 'field-prefix vr-prefix', text: prefix, attrs: { id: this.ids.prefix } }) : null; // prettier-ignore
  }

  /**
   * @param {1 | -1} direction
   * @param {string} label
   * @param {() => void} action
   * @param {string} key
   * @returns {HTMLElement}
   */
  stepButton(direction, label, action, key) {
    return h(
      'button',
      {
        class: 'vr-step',
        part: 'step-button',
        attrs: { type: 'button', 'aria-label': label, title: label, disabled: this.disabled || this.readOnly, 'data-focus-key': key }, // prettier-ignore
        on: { click: action },
      },
      icon(direction > 0 ? 'plus' : 'minus'),
    );
  }

  /** @returns {HTMLElement} The text field with − and +. */
  inputView() {
    const t = this.t;
    const format = this.format;
    const input = /** @type {HTMLInputElement} */ (
      h('input', {
        class: 'field-input vr-input',
        part: 'control',
        attrs: {
          id: this.ids.control,
          type: 'text',
          inputmode: format.kind === 'decimal' || !format.prerelease ? 'decimal' : 'text',
          autocomplete: 'off',
          autocapitalize: 'off',
          spellcheck: 'false',
          placeholder: this.getAttribute('placeholder') ?? this.example,
          required: parseBoolean(this.getAttribute('required')) === true,
          disabled: this.disabled,
          readonly: this.readOnly,
          'aria-describedby': this.describedBy(),
          'data-focus-key': 'control',
        },
      })
    );
    input.value = this.value;
    input.addEventListener('beforeinput', (event) => {
      const data = event.data ?? '';
      if ((event.inputType === 'insertText' || event.inputType === 'insertFromPaste') && data && ![...data].every((c) => allowedChar(c, format) || /\s/.test(c))) event.preventDefault(); // prettier-ignore
    });
    input.addEventListener('input', () => {
      // Pasted text keeps only the characters a version may have.
      const clean = cleanText(input.value, format);
      if (clean !== input.value) {
        const at = Math.max(0, (input.selectionStart ?? clean.length) - (input.value.length - clean.length)); // prettier-ignore
        input.value = clean;
        input.setSelectionRange(at, at);
      }
      if (this.getAttribute('validate') === 'input') this.showErrors = true;
      this.set(input.value, { render: false });
    });
    input.addEventListener('keydown', (event) => {
      const steps = /** @type {Record<string, number>} */ ({ ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 }); // prettier-ignore
      if (!(event.key in steps) || this.readOnly) return;
      event.preventDefault();
      this.stepAt(input.selectionStart ?? input.value.length, steps[event.key] * (event.shiftKey ? 10 : 1)); // prettier-ignore
    });
    input.addEventListener('blur', () => {
      this.showErrors = true;
      this.normalize();
    });
    input.addEventListener('change', () => this.commit());
    const target = this.defaultSegment();
    const name = this.segmentName(target);
    const decimal = format.kind === 'decimal';
    const step = decimal
      ? formatVersion({ parts: [this.stepUnits], pre: [], build: [] }, format)
      : '';
    return h(
      'div',
      { class: 'field-box vr-box' },
      this.stepButton(-1, decimal ? t('vrDecreaseBy', { step }) : t('vrDecrease', { segment: name }), () => this.stepAt(null, -1), 'down'), // prettier-ignore
      this.prefixView(),
      input,
      this.stepButton(1, decimal ? t('vrIncreaseBy', { step }) : t('vrIncrease', { segment: name }), () => this.stepAt(null, 1), 'up'), // prettier-ignore
    );
  }

  /** @returns {number} The part − and + change: the patch of a semantic version, else the last. */
  defaultSegment() {
    const format = this.format;
    return format.kind === 'semver' ? 2 : format.segments.length - 1;
  }

  /**
   * Steps the part at the caret, or the default part.
   *
   * @param {number | null} caret
   * @param {number} delta
   */
  stepAt(caret, delta) {
    if (this.disabled || this.readOnly) return;
    const format = this.format;
    const version = this.version ?? this.editorVersion;
    let index = this.defaultSegment();
    const ranges = caret === null ? null : segmentRanges(this.value, format);
    if (ranges && caret !== null) {
      const at = caret;
      const found = ranges.findIndex((r) => at >= r.start && at <= r.end);
      if (found >= 0) index = found;
    }
    const next = this.stepped(version, index, delta);
    const text = formatVersion(next, format);
    this.set(text, { commit: true });
    if (caret !== null) {
      const input = /** @type {HTMLInputElement | null} */ (this.root.getElementById(this.ids.control)); // prettier-ignore
      const range = segmentRanges(text, format)?.[index];
      if (input && range) input.setSelectionRange(range.start, range.end);
    }
  }

  /**
   * @param {Version} version
   * @param {number} index
   * @param {number} delta
   * @returns {Version}
   */
  stepped(version, index, delta) {
    const format = this.format;
    if (format.kind === 'decimal') {
      const min = this.attrVersion('min');
      const max = this.attrVersion('max');
      return stepDecimal(version, delta, this.stepUnits, { min: min?.parts[0] ?? null, max: max?.parts[0] ?? null }); // prettier-ignore
    }
    let next = stepSegment(version, format, index, delta);
    const min = this.attrVersion('min');
    const max = this.attrVersion('max');
    if ((min && compareVersions(next, min) < 0) || (max && compareVersions(next, max) > 0)) next = version; // prettier-ignore
    return next;
  }

  /** On leaving the field: writes a valid version in its usual form, or puts back the last valid one. */
  normalize() {
    const version = this.version;
    /** @type {string | null} */
    let text = null;
    if (version) text = formatVersion(version, this.format);
    else if (this.value && parseBoolean(this.getAttribute('strict')) === true && this.lastValid) {
      text = this.lastValid;
      this.announce(this.t('vrReverted', { value: text }));
    }
    if (text === null || text === this.value) {
      this.update({ bumps: false });
      return;
    }
    // Written in place: a render here would replace the − or + button being clicked.
    const input = /** @type {HTMLInputElement | null} */ (this.root.getElementById(this.ids.control)); // prettier-ignore
    if (input) input.value = text;
    this.textValue = text;
    this.lastValid = text;
    this.update({ bumps: false });
    emit(this, EVENTS.INPUT, { value: text, valid: this.valid });
  }

  /** @returns {HTMLElement} One spin button per part, with the pre-release. */
  editorView() {
    const format = this.format;
    const version = this.editorVersion;
    const editor = h('div', {
      class: 'vr-editor',
      part: 'editor',
      attrs: { role: 'group', 'aria-labelledby': this.ids.label, 'aria-describedby': this.describedBy() }, // prettier-ignore
    });
    const prefix = this.prefixView();
    if (prefix) editor.append(prefix);
    format.segments.forEach((segment, i) => {
      if (format.separators[i]) editor.append(h('span', { class: 'vr-sep', text: format.separators[i], attrs: { 'aria-hidden': 'true' } })); // prettier-ignore
      editor.append(this.segmentView(version, segment, i));
    });
    if (format.separators.at(-1)) editor.append(h('span', { class: 'vr-sep', text: format.separators.at(-1) ?? '', attrs: { 'aria-hidden': 'true' } })); // prettier-ignore
    if (format.prerelease) editor.append(this.preView(version));
    return editor;
  }

  /**
   * @param {Version} version
   * @param {Segment} segment
   * @param {number} index
   * @returns {HTMLElement}
   */
  segmentView(version, segment, index) {
    const t = this.t;
    const format = this.format;
    const name = this.segmentName(index);
    const value = version.parts[index] ?? segment.min;
    const text = this.typing[index] ?? String(value).padStart(segment.width, '0');
    const input = /** @type {HTMLInputElement} */ (
      h('input', {
        class: 'vr-seg-input',
        attrs: {
          type: 'text',
          role: 'spinbutton',
          inputmode: 'numeric',
          autocomplete: 'off',
          'aria-label': name,
          'aria-valuenow': String(value),
          'aria-valuemin': String(segment.min),
          'aria-valuemax': Number.isFinite(segment.max) ? String(segment.max) : null,
          'aria-valuetext': String(value).padStart(segment.width, '0'),
          size: String(Math.max(1, Math.min(9, text.length || 1))),
          disabled: this.disabled,
          readonly: this.readOnly,
          'data-focus-key': `segment-${index}`,
        },
      })
    );
    input.value = text;
    input.addEventListener('beforeinput', (event) => {
      const data = event.data ?? '';
      if (!data) return;
      // A separator moves to the next part, as in date fields.
      if (!/^\d+$/.test(data)) {
        event.preventDefault();
        if (format.separators.slice(index + 1).some((s) => s && s.includes(data))) this.focusSegment(index + 1); // prettier-ignore
        else if (data === '-' && format.prerelease) /** @type {HTMLElement | null} */ (this.root.querySelector('.vr-pre-id'))?.focus(); // prettier-ignore
      }
    });
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, segment.width || 15);
      input.value = digits;
      input.size = Math.max(1, Math.min(9, digits.length || 1));
      this.typing[index] = digits;
      if (!digits) return;
      const n = Math.min(Number(digits), Number.isFinite(segment.max) ? segment.max : Number.MAX_SAFE_INTEGER); // prettier-ignore
      const parts = [...this.editorVersion.parts];
      parts[index] = Math.max(segment.min, n);
      this.set(formatVersion({ ...this.editorVersion, parts }, format), { render: false });
      input.setAttribute('aria-valuenow', String(parts[index]));
      // A part full of digits moves on, as in date fields.
      if (segment.width && digits.length >= segment.width) this.focusSegment(index + 1);
    });
    input.addEventListener('keydown', (event) => this.segmentKey(event, index, input));
    input.addEventListener('blur', () => {
      if (this.typing[index] === undefined) return;
      delete this.typing[index];
      // Written in place: a render here would replace the button being clicked.
      const value = this.editorVersion.parts[index] ?? segment.min;
      input.value = String(value).padStart(segment.width, '0');
      input.size = Math.max(1, Math.min(9, input.value.length));
      this.showErrors = true;
      this.update({ bumps: false });
      this.commit();
    });
    const step = (/** @type {number} */ delta) => () => {
      delete this.typing[index];
      this.set(formatVersion(this.stepped(this.editorVersion, index, delta), format), { commit: true }); // prettier-ignore
    };
    return h(
      'span',
      { class: `vr-seg${segment.date ? ' date' : ''}`, part: 'segment' },
      h('button', { class: 'vr-seg-step up', attrs: { type: 'button', tabindex: '-1', 'aria-label': t('vrIncrease', { segment: name }), title: t('vrIncrease', { segment: name }), disabled: this.disabled || this.readOnly }, on: { click: step(1) } }, icon('chevron-up')), // prettier-ignore
      input,
      h('button', { class: 'vr-seg-step down', attrs: { type: 'button', tabindex: '-1', 'aria-label': t('vrDecrease', { segment: name }), title: t('vrDecrease', { segment: name }), disabled: this.disabled || this.readOnly }, on: { click: step(-1) } }, icon('chevron-down')), // prettier-ignore
      h('span', { class: 'vr-seg-name', text: name, attrs: { 'aria-hidden': 'true' } }),
    );
  }

  /**
   * Arrows step, Home and End go to the ends, Left and Right move between parts.
   *
   * @param {KeyboardEvent} event
   * @param {number} index
   * @param {HTMLInputElement} input
   */
  segmentKey(event, index, input) {
    const format = this.format;
    const segment = format.segments[index];
    const steps = /** @type {Record<string, number>} */ ({ ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 }); // prettier-ignore
    if (event.key in steps && !this.readOnly) {
      event.preventDefault();
      delete this.typing[index];
      this.set(formatVersion(this.stepped(this.editorVersion, index, steps[event.key] * (event.shiftKey ? 10 : 1)), format), { commit: true }); // prettier-ignore
    } else if ((event.key === 'Home' || event.key === 'End') && !this.readOnly) {
      const target = event.key === 'Home' ? segment.min : segment.max;
      if (!Number.isFinite(target)) return;
      event.preventDefault();
      delete this.typing[index];
      const parts = [...this.editorVersion.parts];
      parts[index] = target;
      this.set(formatVersion({ ...this.editorVersion, parts, pre: [], build: [] }, format), { commit: true }); // prettier-ignore
    } else if (
      event.key === 'ArrowLeft' &&
      input.selectionStart === 0 &&
      input.selectionEnd === 0 &&
      index > 0
    ) {
      event.preventDefault();
      this.focusSegment(index - 1);
    } else if (
      event.key === 'ArrowRight' &&
      input.selectionStart === input.value.length &&
      index < format.segments.length - 1
    ) {
      event.preventDefault();
      this.focusSegment(index + 1);
    } else if (event.key === 'Backspace' && !input.value && index > 0) {
      event.preventDefault();
      this.focusSegment(index - 1, 'end');
    } else if (event.key === 'Enter') this.commit();
  }

  /**
   * @param {number} index
   * @param {'start' | 'end' | 'all'} [caret]
   */
  focusSegment(index, caret = 'all') {
    const input = /** @type {HTMLInputElement | null} */ (this.root.querySelector(`[data-focus-key="segment-${index}"]`)); // prettier-ignore
    if (!input) return;
    input.focus();
    const end = input.value.length;
    if (caret === 'all') input.setSelectionRange(0, end);
    else input.setSelectionRange(caret === 'start' ? 0 : end, caret === 'start' ? 0 : end);
  }

  /** @returns {string[]} */
  get preids() {
    const list = (this.getAttribute('preids') ?? 'alpha,beta,rc').split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z][0-9A-Za-z-]*$/.test(s)); // prettier-ignore
    return [...new Set(list)].slice(0, 12);
  }

  /**
   * The pre-release: a name and a number.
   *
   * @param {Version} version
   * @returns {HTMLElement}
   */
  preView(version) {
    const t = this.t;
    const format = this.format;
    const [id = '', number] = version.pre;
    const ids = this.preids;
    if (id && !ids.includes(id) && !/^\d+$/.test(id)) ids.push(id);
    const select = h(
      'select',
      {
        class: 'vr-pre-id',
        attrs: { 'aria-label': t('vrPre'), disabled: this.disabled || this.readOnly, 'data-focus-key': 'pre' }, // prettier-ignore
        on: {
          change: (event) => {
            const chosen = /** @type {HTMLSelectElement} */ (event.target).value;
            const current = this.editorVersion;
            this.set(formatVersion({ ...current, pre: chosen ? [chosen, '0'] : [], build: [] }, format), { commit: true }); // prettier-ignore
          },
        },
      },
      h('option', { text: t('vrPreNone'), attrs: { value: '', selected: !id } }),
      ...ids.map((name) => h('option', { text: name, attrs: { value: name, selected: name === id } })), // prettier-ignore
    );
    const children = [h('span', { class: 'vr-sep', text: '-', attrs: { 'aria-hidden': 'true' } }), h('span', { class: 'vr-pre-box' }, select, h('span', { class: 'vr-seg-name', text: t('vrPre'), attrs: { 'aria-hidden': 'true' } }))]; // prettier-ignore
    if (id && number !== undefined && /^\d+$/.test(number)) {
      const n = Number(number);
      const setNumber = (/** @type {number} */ next) => {
        const current = this.editorVersion;
        const pre = [...current.pre];
        pre[1] = String(Math.max(0, next));
        this.set(formatVersion({ ...current, pre }, format), { commit: true });
      };
      const input = /** @type {HTMLInputElement} */ (
        h('input', {
          class: 'vr-seg-input vr-pre-number',
          attrs: { type: 'text', role: 'spinbutton', inputmode: 'numeric', autocomplete: 'off', 'aria-label': t('vrPreNumber'), 'aria-valuenow': String(n), 'aria-valuemin': '0', size: String(Math.max(1, String(n).length)), disabled: this.disabled, readonly: this.readOnly, 'data-focus-key': 'pre-number' }, // prettier-ignore
        })
      );
      input.value = String(n);
      input.addEventListener('beforeinput', (event) => {
        if (event.data && !/^\d+$/.test(event.data)) event.preventDefault();
      });
      input.addEventListener('input', () => {
        const digits = input.value
          .replace(/\D/g, '')
          .replace(/^0+(?=\d)/, '')
          .slice(0, 9);
        input.value = digits;
        if (digits) {
          const current = this.editorVersion;
          const pre = [...current.pre];
          pre[1] = digits;
          this.set(formatVersion({ ...current, pre }, format), { render: false });
        }
      });
      input.addEventListener('keydown', (event) => {
        const steps = /** @type {Record<string, number>} */ ({ ArrowUp: 1, ArrowDown: -1 });
        if (event.key in steps && !this.readOnly) {
          event.preventDefault();
          setNumber(n + steps[event.key]);
        }
      });
      input.addEventListener('blur', () => {
        if (!input.value) setNumber(0);
        this.commit();
      });
      children.push(
        h('span', { class: 'vr-sep', text: '.', attrs: { 'aria-hidden': 'true' } }),
        h(
          'span',
          { class: 'vr-seg' },
          h('button', { class: 'vr-seg-step up', attrs: { type: 'button', tabindex: '-1', 'aria-label': t('vrIncrease', { segment: t('vrPreNumber') }), disabled: this.disabled || this.readOnly }, on: { click: () => setNumber(n + 1) } }, icon('chevron-up')), // prettier-ignore
          input,
          h('button', { class: 'vr-seg-step down', attrs: { type: 'button', tabindex: '-1', 'aria-label': t('vrDecrease', { segment: t('vrPreNumber') }), disabled: this.disabled || this.readOnly }, on: { click: () => setNumber(n - 1) } }, icon('chevron-down')), // prettier-ignore
          h('span', { class: 'vr-seg-name', text: '#', attrs: { 'aria-hidden': 'true' } }),
        ),
      );
    }
    return h('span', { class: 'vr-pre' }, ...children);
  }

  /** @returns {HTMLElement} The version written out, and the kind of release. */
  resultView() {
    const t = this.t;
    return h(
      'div',
      { class: 'vr-result' },
      h('span', { class: 'vr-result-label', text: t('vrResult') }),
      h('code', { class: 'vr-result-value', text: this.value }),
      this.copyTextButton(() => this.value, t('vrCopy'), 'copy'),
      this.changeView(),
    );
  }

  /** @returns {HTMLElement} The kind of release from `current`. */
  changeView() {
    const t = this.t;
    const current = this.attrVersion('current');
    const version = this.version;
    const box = h('span', { class: 'vr-change', part: 'change', attrs: { id: this.ids.change } });
    if (!current || !version) return box;
    const format = this.format;
    const { change, index } = changeOf(current, version, format);
    box.classList.add(`change-${change}`);
    const words = change === 'segment' ? t('vrChange_segment', { segment: this.segmentName(index) }) : t(/** @type {StringKey} */ (`vrChange_${change}`)); // prettier-ignore
    const meaning = change === 'major' || change === 'minor' || change === 'patch' ? t(/** @type {StringKey} */ (`vrMeaning_${change}`)) : ''; // prettier-ignore
    box.append(
      icon(change === 'downgrade' ? 'alert' : change === 'same' ? 'status-circle' : 'arrow-up'),
      h('strong', { text: words }),
      h('span', { text: ` ${t('vrFrom', { current: formatVersion(current, format) })}${meaning ? ` · ${meaning}` : ''}` }), // prettier-ignore
    );
    return box;
  }

  /** @returns {HTMLElement | null} Buttons with the next versions. */
  bumpsView() {
    const t = this.t;
    const format = this.format;
    const base = this.version ?? this.attrVersion('current') ?? this.editorVersion;
    /** @type {[string, Version][]} */
    const options = [];
    if (format.kind === 'semver') {
      options.push([t('vrBump_patch'), bump(base, 'patch')], [t('vrBump_minor'), bump(base, 'minor')], [t('vrBump_major'), bump(base, 'major')]); // prettier-ignore
      options.push([t('vrBump_prerelease'), bump(base, 'prerelease', base.pre[0] && !/^\d+$/.test(base.pre[0]) ? base.pre[0] : (this.preids[0] ?? 'beta'))]); // prettier-ignore
      if (base.pre.length) options.unshift([t('vrBump_release'), bump(base, 'release')]);
    } else if (format.kind === 'decimal') {
      const step = this.stepUnits;
      for (const n of [-10, -1, 1, 10]) options.push([`${n > 0 ? '+' : '−'}${formatVersion({ parts: [Math.abs(n) * step], pre: [], build: [] }, format)}`, this.stepped(base, 0, n)]); // prettier-ignore
    } else {
      if (format.calendar) options.push([t('vrBump_today'), today(base, format, this.now)]);
      format.segments.forEach((segment, i) => {
        if (!segment.date) options.push([t('vrBump_segment', { segment: this.segmentName(i) }), this.stepped(base, i, 1)]); // prettier-ignore
      });
    }
    const seen = new Set();
    const buttons = options
      .map(([kind, version]) => [kind, formatVersion(version, format)])
      .filter(([, text]) => !seen.has(text) && seen.add(text) && text !== this.value)
      .map(([kind, text], i) =>
        h(
          'button',
          {
            class: 'vr-bump',
            attrs: {
              type: 'button',
              disabled: this.disabled || this.readOnly,
              'data-focus-key': `bump-${i}`,
            },
            on: { click: () => this.set(text, { commit: true }) },
          },
          h('span', { class: 'vr-bump-kind', text: kind }),
          // Read as "Patch: 1.4.3"; the colon is not shown.
          h('span', { class: 'sr-only', text: ': ' }),
          h('code', { class: 'vr-bump-version', text: text }),
        ),
      );
    if (!buttons.length) return null;
    return h(
      'div',
      { class: 'vr-bumps', part: 'bumps', attrs: { role: 'group', 'aria-label': t('vrBumps') } },
      ...buttons,
    );
  }
}
