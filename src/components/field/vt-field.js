// @ts-check
import dataCss from '../../styles/data.css?raw';
import fieldCss from '../../styles/field.css?raw';
import { parseBoolean, parseInteger } from '../../core/attributes.js';
import { isObject } from '../../core/data.js';
import { jsonText } from '../../core/data-input.js';
import { VtDataElement } from '../../core/data-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import {
  INPUT_TYPES,
  LIST_TYPES,
  MULTIPLE_TYPES,
  TYPES,
  filterOptions,
  fold,
  parseOptions,
  readValues,
} from './options.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./options.js').FieldOption} FieldOption */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** Options from which a list gets a search field by itself. */
const SEARCH_FROM = 10;
/** Characters left from which the counter is read out. */
const COUNTER_WARNING = 0.1;

/** Attributes a JSON value may set, by their JSON names. */
const DATA_KEYS = {
  label: 'label', hint: 'hint', tip: 'tip', type: 'type', required: 'required',
  optional: 'optional', placeholder: 'placeholder', name: 'name', value: 'value',
  checked: 'checked', min: 'min', max: 'max', step: 'step', minLength: 'minlength',
  maxLength: 'maxlength', minlength: 'minlength', maxlength: 'maxlength', pattern: 'pattern',
  searchable: 'searchable', prefix: 'prefix', suffix: 'suffix', error: 'error',
  counter: 'counter', clearable: 'clearable', rows: 'rows', autocomplete: 'autocomplete',
  inputmode: 'inputmode', minSelected: 'min-selected', maxSelected: 'max-selected',
}; // prettier-ignore

/**
 * A form field with everything around it: a label that says when it is required, a "?"
 * button with help, a hint, a counter, a prefix and suffix, and clear error messages. It can
 * be a text input of any kind, a text area, a check box, a switch, radio buttons, check boxes,
 * or a list with search, groups and several choices.
 *
 * It takes part in `<form>` like a native field: its value is submitted under `name`, it
 * blocks submission while invalid, and it is reset and disabled with the form. Options and
 * settings can be given as JSON.
 *
 * @element vt-field
 * @since 0.12.0
 *
 * @attr {string} type - `text` (default), `email`, `url`, `tel`, `password`, `search`, `number`,
 *   `date`, `time`, `datetime-local`, `month`, `week`, `color`, `range`, `textarea`, `checkbox`,
 *   `switch`, `select`, `multiselect`, `radio` or `checkboxes`.
 * @attr {string} name - Name of the value in the submitted form.
 * @attr {string} label - Label of the field.
 * @attr {string} hint - Help written under the field.
 * @attr {string} tip - Help shown by the "?" button next to the label.
 * @attr {boolean} required - The field must be filled in; the label shows it.
 * @attr {boolean} optional - Writes "optional" next to the label.
 * @attr {string} value - First value. Several values: a JSON list or values separated by commas.
 * @attr {boolean} checked - A check box or switch checked at first.
 * @attr {boolean} disabled - The field cannot be used and is not submitted.
 * @attr {boolean} readonly - The value cannot be changed but is submitted.
 * @attr {string} min - Smallest number or date.
 * @attr {string} max - Largest number or date.
 * @attr {string} step - Step of numbers and dates.
 * @attr {number} minlength - Fewest characters.
 * @attr {number} maxlength - Most characters; shows a counter.
 * @attr {string} pattern - Regular expression the text must match.
 * @attr {number} min-selected - Fewest choices of a list with several choices.
 * @attr {number} max-selected - Most choices of a list with several choices.
 * @attr {boolean} searchable - A search in the list. Default: from ten options.
 * @attr {boolean} counter - The character counter. Default: on with `maxlength`.
 * @attr {boolean} clearable - A button that empties the field.
 * @attr {string} prefix - Text before the value, such as "€".
 * @attr {string} suffix - Text after the value, such as "kg".
 * @attr {string} error - Message shown instead of the usual ones when the value is invalid.
 * @attr {number} rows - Lines of a text area (default 4); it grows with its text.
 * @attr {string} autocomplete - Autofill hint, as on `<input>`.
 * @attr {string} inputmode - Virtual keyboard, as on `<input>`.
 * @attr {"blur"|"input"} validate - When errors show: after leaving the field (default) or while typing.
 *
 * @prop {string | string[] | boolean} value - The value: a string, a list for several choices,
 *   or a boolean for a check box or switch.
 * @prop {FieldOption[]} options - The options read (read-only).
 * @prop {HTMLFormElement | null} form - The form of the field (read-only).
 * @prop {ValidityState} validity - Its validity (read-only).
 * @prop {string} validationMessage - Why it is invalid (read-only).
 *
 * @fires vt-input - The value changed. Detail: `{ value }`.
 * @fires vt-change - The value was committed (on leaving the field, or on a choice). Detail: `{ value }`.
 * @fires invalid - The form was submitted with this field invalid.
 *
 * @csspart label - The label.
 * @csspart required - The required mark.
 * @csspart tip-button - The "?" button.
 * @csspart tip - The help it shows.
 * @csspart control - The input, text area, list button or group.
 * @csspart hint - The help under the field.
 * @csspart counter - The character counter.
 * @csspart error - The error message.
 * @csspart listbox - The list of options.
 * @csspart option - An option.
 * @csspart chip - A choice of a list with several choices.
 *
 * @example
 * <vt-field name="email" type="email" label="Email" required hint="We never share it."
 *           tip="Used to sign in and for receipts."></vt-field>
 */
export class VtField extends VtDataElement {
  static type = 'field';

  static formAssociated = true;

  static allowEmpty = true;

  static componentAttributes = Object.freeze([
    'type', 'name', 'hint', 'tip', 'required', 'optional', 'value', 'checked', 'disabled',
    'readonly', 'min', 'max', 'step', 'minlength', 'maxlength', 'pattern', 'min-selected',
    'max-selected', 'searchable', 'counter', 'clearable', 'prefix', 'suffix', 'error', 'rows',
    'autocomplete', 'inputmode', 'validate',
  ]); // prettier-ignore

  static dataAttributes = Object.freeze([...new Set(Object.values(DATA_KEYS))]);

  static presets = { simple: {}, full: {} };

  static styles = [dataCss, fieldCss];

  /**
   * Options, or a field described as `{ label, type, required, options, … }`.
   *
   * @param {unknown} value
   * @returns {import('../../core/data-input.js').DataResult}
   */
  static fromData(value) {
    if (Array.isArray(value)) return { content: jsonText(value) };
    if (!isObject(value)) return { content: typeof value === 'string' ? value : '' };
    /** @type {Record<string, unknown>} */
    const attributes = {};
    for (const [key, name] of Object.entries(DATA_KEYS)) {
      if (!Object.hasOwn(value, key)) continue;
      const v = value[key];
      attributes[name] = Array.isArray(v) ? JSON.stringify(v) : v;
    }
    return { content: Array.isArray(value.options) ? jsonText(value.options) : '', attributes };
  }

  constructor() {
    super();
    this.internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
    this.ids = { control: uid('field'), label: uid('label'), hint: uid('hint'), error: uid('error'), tip: uid('tip'), list: uid('list'), counter: uid('count'), prefix: uid('prefix'), suffix: uid('suffix') }; // prettier-ignore
    this.groupName = uid('choice');
    /** @type {string} Text of the input types. */
    this.textValue = '';
    /** @type {string[]} Choices of the list types. */
    this.values = [];
    this.checked = false;
    this.ready = false;
    this.showErrors = false;
    this.open = false;
    this.active = 0;
    this.filter = '';
    this.tipOpen = false;
    this.reveal = false;
    this.formDisabled = false;
    this.customMessage = '';
    /** @type {{ text: string, options: FieldOption[] } | null} */
    this.optionCache = null;
    /** @type {HTMLInputElement | HTMLTextAreaElement | null} */
    this.control = null;
    this.typeahead = { text: '', at: 0 };
    /** @type {((event: Event) => void) | null} */
    this.outside = null;
    /** @type {((event: KeyboardEvent) => void) | null} */
    this.tipEscape = null;
    this.addEventListener('invalid', (event) => {
      // The message is written under the field: the browser bubble would repeat it.
      event.preventDefault();
      this.showErrors = true;
      this.refreshState();
      // Like a native form, the first invalid field takes the focus.
      if (this.form?.querySelector(':invalid') === this) this.focus();
    });
  }

  // ---------------------------------------------------------------- state

  /** @returns {string} */
  get fieldType() {
    const type = (this.getAttribute('type') ?? 'text').trim().toLowerCase();
    return TYPES.includes(type) ? type : 'text';
  }

  /** @returns {boolean} */
  get isList() {
    return LIST_TYPES.has(this.fieldType);
  }

  /** @returns {boolean} */
  get isMultiple() {
    return MULTIPLE_TYPES.has(this.fieldType);
  }

  /** @returns {boolean} */
  get isCheck() {
    return this.fieldType === 'checkbox' || this.fieldType === 'switch';
  }

  /** @type {FieldOption[]} */
  get options() {
    const text = this.text ?? '';
    if (this.optionCache?.text !== text) this.optionCache = { text, options: parseOptions(text) };
    return this.optionCache.options;
  }

  /** @returns {boolean} */
  get disabled() {
    return this.formDisabled || this.has('disabled');
  }

  /**
   * @param {string} name
   * @returns {boolean} Whether a boolean attribute is set and not `false`.
   */
  has(name) {
    return parseBoolean(this.getAttribute(name)) === true;
  }

  /** @type {string | string[] | boolean} */
  get value() {
    this.readInitial();
    if (this.isCheck) return this.checked;
    if (this.isList) return this.isMultiple ? [...this.values] : (this.values[0] ?? '');
    return this.textValue;
  }

  set value(next) {
    this.readInitial();
    if (this.isCheck) this.checked = next === true || next === 'true' || next === 'on';
    else if (this.isList)
      this.values = Array.isArray(next) ? next.map(String) : next ? readValues(String(next)) : [];
    else this.textValue = next === null || next === undefined ? '' : String(next);
    if (this.isList && !this.isMultiple) this.values = this.values.slice(0, 1);
    this.render();
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

  /**
   * Marks the field invalid with a message of yours, such as an answer of your server. An
   * empty message makes it valid again.
   *
   * @param {string} message
   */
  setCustomValidity(message) {
    this.customMessage = String(message ?? '');
    if (this.customMessage) this.showErrors = true;
    this.refreshState();
  }

  /** @param {FocusOptions} [options] */
  focus(options) {
    /** @type {HTMLElement | null} */ (
      this.root.querySelector('[data-focus-key="control"], input, textarea, button')
    )?.focus(options);
  }

  /** Reads the first value from the attributes, once. */
  readInitial() {
    if (this.ready) return;
    this.ready = true;
    this.checked = this.has('checked');
    const value = this.getAttribute('value');
    this.values = readValues(value);
    if (!this.isMultiple) this.values = this.values.slice(0, 1);
    this.textValue = value ?? '';
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if ((name === 'value' || name === 'checked' || name === 'type') && oldValue !== newValue)
      this.ready = false;
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  formResetCallback() {
    this.ready = false;
    this.showErrors = false;
    this.customMessage = '';
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
    else if (state instanceof FormData) this.value = state.getAll(this.getAttribute('name') ?? '').map(String); // prettier-ignore
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopOutside();
    this.tipOpen = false;
    this.watchTipEscape();
  }

  // ---------------------------------------------------------------- validity

  /**
   * @returns {{ flags: ValidityStateFlags, message: string }} What is wrong, in the words of
   *   the interface.
   */
  check() {
    if (this.disabled) return { flags: {}, message: '' };
    if (this.customMessage) return { flags: { customError: true }, message: this.customMessage };
    const custom = this.getAttribute('error')?.trim();
    const result = this.isList
      ? this.checkList()
      : this.isCheck
        ? this.checkBox()
        : this.checkInput();
    if (!Object.keys(result.flags).length) return result;
    return custom ? { flags: result.flags, message: custom } : result;
  }

  /** @returns {{ flags: ValidityStateFlags, message: string }} */
  checkList() {
    const t = this.t;
    const count = this.values.length;
    if (this.has('required') && !count)
      return { flags: { valueMissing: true }, message: t(this.isMultiple ? 'fieldValueMissingMany' : 'fieldValueMissingList') }; // prettier-ignore
    const min = parseInteger(this.getAttribute('min-selected'), { min: 0, max: 1000, fallback: 0 });
    const max = parseInteger(this.getAttribute('max-selected'), { min: 0, max: 1000, fallback: 0 });
    if (count && min && count < min) return { flags: { rangeUnderflow: true }, message: t('fieldTooFew', { min }) }; // prettier-ignore
    if (max && count > max) return { flags: { rangeOverflow: true }, message: t('fieldTooMany', { max }) }; // prettier-ignore
    return { flags: {}, message: '' };
  }

  /** @returns {{ flags: ValidityStateFlags, message: string }} */
  checkBox() {
    if (this.has('required') && !this.checked)
      return { flags: { valueMissing: true }, message: this.t('fieldValueMissingCheck') };
    return { flags: {}, message: '' };
  }

  /** @returns {{ flags: ValidityStateFlags, message: string }} */
  checkInput() {
    const control = this.control;
    if (!control) return { flags: {}, message: '' };
    const v = control.validity;
    const t = this.t;
    const attr = (/** @type {string} */ name) => this.getAttribute(name) ?? '';
    /** @type {[keyof ValidityStateFlags, () => string][]} */
    const checks = [
      ['valueMissing', () => t('fieldValueMissing')],
      ['badInput', () => t('fieldBadInput')],
      ['typeMismatch', () => t(/** @type {StringKey} */ (this.fieldType === 'email' || this.fieldType === 'url' ? `fieldTypeMismatch_${this.fieldType}` : 'fieldTypeMismatch'))], // prettier-ignore
      ['patternMismatch', () => t('fieldPatternMismatch')],
      ['tooShort', () => t('fieldTooShort', { min: attr('minlength') })],
      ['tooLong', () => t('fieldTooLong', { max: attr('maxlength') })],
      ['rangeUnderflow', () => t('fieldRangeUnderflow', { min: attr('min') })],
      ['rangeOverflow', () => t('fieldRangeOverflow', { max: attr('max') })],
      ['stepMismatch', () => t('fieldStepMismatch', { step: attr('step') })],
    ];
    // Too short is only checked by browsers after typing: it is checked here from the start.
    const min = parseInteger(attr('minlength') || null, { min: 0, max: 100000, fallback: 0 });
    if (min && control.value.length && control.value.length < min)
      return { flags: { tooShort: true }, message: t('fieldTooShort', { min }) };
    for (const [flag, message] of checks) if (v[flag]) return { flags: { [flag]: true }, message: message() }; // prettier-ignore
    return { flags: {}, message: '' };
  }

  /** Updates the submitted value, the validity and the message, without a render. */
  refreshState() {
    this.readInitial();
    const { flags, message } = this.check();
    const name = this.getAttribute('name');
    if (this.internals) {
      /** @type {string | FormData | null} */
      let submitted = null;
      if (!this.disabled) {
        if (this.isCheck) submitted = this.checked ? (this.getAttribute('value') ?? 'on') : null;
        else if (this.isMultiple) {
          submitted = new FormData();
          for (const value of this.values) submitted.append(name ?? '', value);
        } else submitted = this.isList ? (this.values[0] ?? '') : this.textValue;
      }
      this.internals.setFormValue(
        submitted,
        this.isMultiple ? null : /** @type {string | null} */ (submitted),
      );
      const anchor = /** @type {HTMLElement | null} */ (this.root.querySelector('[data-focus-key="control"]')) ?? undefined; // prettier-ignore
      this.internals.setValidity(flags, message, Object.keys(flags).length ? anchor : undefined);
    }
    const invalid = Boolean(message) && this.showErrors;
    const error = this.root.getElementById(this.ids.error);
    if (error) error.textContent = invalid ? message : '';
    error?.parentElement?.classList.toggle('has-error', invalid);
    for (const node of this.root.querySelectorAll(
      '[data-focus-key="control"], .field-choice input',
    ))
      // prettier-ignore
      if (invalid) node.setAttribute('aria-invalid', 'true');
      else node.removeAttribute('aria-invalid');
    this.updateCounter();
  }

  /** Emits `vt-input`, and updates the field. */
  changed() {
    if (this.getAttribute('validate') === 'input') this.showErrors = true;
    this.refreshState();
    emit(this, EVENTS.INPUT, { value: this.value });
  }

  // ---------------------------------------------------------------- render

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    this.readInitial();
    this.control = null;
    const type = this.fieldType;
    const group = type === 'radio' || type === 'checkboxes';
    const field = h('div', {
      class: `field type-${type}${this.disabled ? ' disabled' : ''}`,
      part: 'body',
      attrs: group ? { role: type === 'radio' ? 'radiogroup' : 'group', 'aria-labelledby': this.ids.label, 'aria-describedby': this.describedBy() } : {}, // prettier-ignore
    });
    if (!this.isCheck) field.append(this.labelRow());
    if (this.tipOpen && !this.isCheck) field.append(this.tipPanel());
    field.append(this.controlView(type));
    if (this.isCheck && this.tipOpen) field.append(this.tipPanel());
    field.append(this.metaRow(), h('p', { class: 'field-error', part: 'error', attrs: { id: this.ids.error, 'aria-live': 'polite' } })); // prettier-ignore
    frame.append(field);
    this.refreshState();
    if (this.open) this.watchOutside();
    else this.stopOutside();
    this.watchTipEscape();
  }

  /**
   * Escape closes an open tip wherever the focus is: Safari does not focus a button on click,
   * so the key would not reach the "?" button.
   */
  watchTipEscape() {
    if (this.tipOpen && !this.tipEscape) {
      this.tipEscape = (event) => {
        if (event.key === 'Escape' && this.tipOpen && !event.defaultPrevented) {
          event.preventDefault();
          this.closeTip();
        }
      };
      document.addEventListener('keydown', this.tipEscape);
    } else if (!this.tipOpen && this.tipEscape) {
      document.removeEventListener('keydown', this.tipEscape);
      this.tipEscape = null;
    }
  }

  /** @returns {string} Ids that describe the control. */
  describedBy() {
    return [
      this.getAttribute('prefix') ? this.ids.prefix : '',
      this.getAttribute('suffix') ? this.ids.suffix : '',
      this.getAttribute('hint') ? this.ids.hint : '',
      this.ids.error,
    ]
      .filter(Boolean)
      .join(' ');
  }

  /** @returns {string} */
  get labelText() {
    return (this.getAttribute('label') ?? '').trim().slice(0, 300);
  }

  /** @returns {HTMLElement} The label, the required or optional mark and the "?" button. */
  labelRow() {
    const t = this.t;
    const plainLabel = this.isList && this.fieldType !== 'radio' && this.fieldType !== 'checkboxes';
    const label = h(
      plainLabel || this.fieldType === 'radio' || this.fieldType === 'checkboxes'
        ? 'span'
        : 'label',
      { class: 'field-label', part: 'label', attrs: { id: this.ids.label, for: plainLabel ? null : this.ids.control } }, // prettier-ignore
      this.labelText,
      this.has('required')
        ? h('span', { class: 'field-required', part: 'required', text: '*', attrs: { 'aria-hidden': 'true' } }) // prettier-ignore
        : null,
      this.has('required')
        ? h('span', { class: 'sr-only', text: ` (${t('fieldRequired')})` })
        : null,
      this.has('optional') && !this.has('required')
        ? h('span', { class: 'field-optional', text: ` ${t('fieldOptional')}` })
        : null,
    );
    return h('div', { class: 'field-top' }, label, this.tipButton());
  }

  /** @returns {HTMLElement | null} */
  tipButton() {
    if (!this.getAttribute('tip')) return null;
    return h(
      'button',
      {
        class: 'field-tip-button',
        part: 'tip-button',
        attrs: {
          type: 'button',
          'aria-label': this.t('fieldHelp', { label: this.labelText }),
          'aria-expanded': String(this.tipOpen),
          'aria-controls': this.tipOpen ? this.ids.tip : null,
          'data-focus-key': 'tip',
        },
        on: {
          click: () => {
            this.tipOpen = !this.tipOpen;
            this.render();
          },
          keydown: (event) => {
            if (/** @type {KeyboardEvent} */ (event).key === 'Escape' && this.tipOpen) {
              event.preventDefault();
              this.closeTip();
            }
          },
        },
      },
      icon('help'),
    );
  }

  /** @returns {HTMLElement} */
  tipPanel() {
    return h(
      'div',
      {
        class: 'field-tip',
        part: 'tip',
        attrs: { id: this.ids.tip, role: 'status' },
        on: {
          keydown: (event) => {
            if (/** @type {KeyboardEvent} */ (event).key === 'Escape') {
              event.preventDefault();
              this.closeTip();
            }
          },
        },
      },
      h('p', { text: this.getAttribute('tip') ?? '' }),
      h('button', {
        class: 'field-tip-close',
        text: '×',
        attrs: {
          type: 'button',
          'aria-label': this.t('fieldCloseHelp'),
          'data-focus-key': 'tip-close',
        },
        on: { click: () => this.closeTip() },
      }),
    );
  }

  closeTip() {
    this.tipOpen = false;
    this.render();
    /** @type {HTMLElement | null} */ (this.root.querySelector('[data-focus-key="tip"]'))?.focus();
  }

  /** @returns {HTMLElement} The hint and the counter. */
  metaRow() {
    const hint = this.getAttribute('hint');
    return h(
      'div',
      { class: 'field-meta' },
      hint ? h('p', { class: 'field-hint', part: 'hint', text: hint, attrs: { id: this.ids.hint } }) : h('span'), // prettier-ignore
      this.hasCounter ? h('span', { class: 'field-counter', part: 'counter', attrs: { id: this.ids.counter } }) : null, // prettier-ignore
    );
  }

  /** @returns {boolean} */
  get hasCounter() {
    const max = this.getAttribute('maxlength');
    const wanted = this.hasAttribute('counter') ? this.has('counter') : Boolean(max);
    return (
      wanted && Boolean(max) && (INPUT_TYPES.has(this.fieldType) || this.fieldType === 'textarea')
    );
  }

  updateCounter() {
    const counter = this.root.getElementById(this.ids.counter);
    if (!counter) return;
    const max = parseInteger(this.getAttribute('maxlength'), {
      min: 1,
      max: 1_000_000,
      fallback: 0,
    });
    const count = [...this.textValue].length;
    counter.textContent = this.t('fieldCounter', { count, max });
    const near = max - count <= Math.max(1, Math.round(max * COUNTER_WARNING));
    counter.classList.toggle('near', near);
    // Read out only near the limit: every key would be too much.
    if (near) counter.setAttribute('aria-live', 'polite');
    else counter.removeAttribute('aria-live');
  }

  /**
   * @param {string} type
   * @returns {HTMLElement}
   */
  controlView(type) {
    if (type === 'checkbox' || type === 'switch') return this.checkView(type);
    if (type === 'radio' || type === 'checkboxes') return this.choiceGroup(type);
    if (type === 'select' || type === 'multiselect') return this.listView();
    return this.inputView(type);
  }

  // ---------------------------------------------------------------- text inputs

  /**
   * @param {string} type
   * @returns {HTMLElement}
   */
  inputView(type) {
    const textarea = type === 'textarea';
    const attr = (/** @type {string} */ name) => this.getAttribute(name);
    const control = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (
      h(textarea ? 'textarea' : 'input', {
        class: 'field-input',
        part: 'control',
        attrs: {
          id: this.ids.control,
          type: textarea ? null : type === 'password' && this.reveal ? 'text' : type,
          name: null,
          placeholder: attr('placeholder'),
          required: this.has('required'),
          disabled: this.disabled,
          readonly: this.has('readonly'),
          min: attr('min'),
          max: attr('max'),
          step: attr('step'),
          minlength: attr('minlength'),
          maxlength: attr('maxlength'),
          pattern: textarea ? null : attr('pattern'),
          autocomplete: attr('autocomplete'),
          inputmode: attr('inputmode'),
          rows: textarea ? parseInteger(attr('rows'), { min: 1, max: 100, fallback: 4 }) : null,
          'aria-describedby': this.describedBy(),
          'aria-required': this.has('required') ? 'true' : null,
          'data-focus-key': 'control',
        },
      })
    );
    control.value = this.textValue;
    this.control = control;
    control.addEventListener('input', () => {
      this.textValue = control.value;
      if (textarea) grow(/** @type {HTMLTextAreaElement} */ (control));
      this.updateOutput();
      this.changed();
    });
    control.addEventListener('change', () => emit(this, EVENTS.CHANGE, { value: this.value }));
    control.addEventListener('blur', () => {
      this.showErrors = true;
      this.refreshState();
    });
    if (textarea) queueMicrotask(() => grow(/** @type {HTMLTextAreaElement} */ (control)));
    return h(
      'div',
      { class: 'field-box' },
      this.adornment('prefix'),
      control,
      type === 'range' ? h('output', { class: 'field-output', text: this.textValue, attrs: { for: this.ids.control } }) : null, // prettier-ignore
      this.adornment('suffix'),
      this.clearButton(() => this.textValue !== ''),
      type === 'password' ? this.revealButton() : null,
    );
  }

  updateOutput() {
    const output = this.root.querySelector('.field-output');
    if (output) output.textContent = this.textValue;
  }

  /**
   * @param {'prefix' | 'suffix'} side
   * @returns {HTMLElement | null}
   */
  adornment(side) {
    const value = this.getAttribute(side);
    return value ? h('span', { class: `field-${side}`, text: value.slice(0, 40), attrs: { id: this.ids[side] } }) : null; // prettier-ignore
  }

  /**
   * @param {() => boolean} filled
   * @returns {HTMLElement | null}
   */
  clearButton(filled) {
    if (!this.has('clearable') || this.disabled || this.has('readonly') || !filled()) return null;
    return h(
      'button',
      {
        class: 'field-icon-button',
        attrs: { type: 'button', 'aria-label': this.t('fieldClear'), 'data-focus-key': 'clear' },
        on: {
          click: () => {
            this.textValue = '';
            this.values = [];
            this.render();
            this.focus();
            this.changed();
            emit(this, EVENTS.CHANGE, { value: this.value });
          },
        },
      },
      icon('close'),
    );
  }

  /** @returns {HTMLElement} */
  revealButton() {
    return h(
      'button',
      {
        class: 'field-icon-button',
        attrs: {
          type: 'button',
          'aria-label': this.t(this.reveal ? 'fieldHidePassword' : 'fieldShowPassword'),
          'aria-pressed': String(this.reveal),
          'data-focus-key': 'reveal',
        },
        on: {
          click: () => {
            this.reveal = !this.reveal;
            this.render();
          },
        },
      },
      icon(this.reveal ? 'eye-off' : 'eye'),
    );
  }

  // ---------------------------------------------------------------- boxes and groups

  /**
   * @param {string} type
   * @returns {HTMLElement}
   */
  checkView(type) {
    const t = this.t;
    const input = h('input', {
      class: type === 'switch' ? 'field-switch-input' : 'field-check-input',
      part: 'control',
      attrs: {
        id: this.ids.control,
        type: 'checkbox',
        role: type === 'switch' ? 'switch' : null,
        checked: this.checked,
        disabled: this.disabled || this.has('readonly'),
        required: this.has('required'),
        'aria-describedby': this.describedBy(),
        'data-focus-key': 'control',
      },
      on: {
        change: () => {
          this.checked = input.checked;
          this.showErrors = true;
          this.changed();
          emit(this, EVENTS.CHANGE, { value: this.value });
          const state = this.root.querySelector('.field-switch-state');
          if (state) state.textContent = t(this.checked ? 'fieldOn' : 'fieldOff');
        },
      },
    });
    const row = h(
      'div',
      { class: 'field-check' },
      h(
        'label',
        { class: 'field-check-label', attrs: { for: this.ids.control } },
        input,
        type === 'switch' ? h('span', { class: 'field-switch', attrs: { 'aria-hidden': 'true' } }) : null, // prettier-ignore
        h(
          'span',
          { class: 'field-label', part: 'label', attrs: { id: this.ids.label } },
          this.labelText,
          this.has('required') ? h('span', { class: 'field-required', part: 'required', text: '*', attrs: { 'aria-hidden': 'true' } }) : null, // prettier-ignore
          this.has('required')
            ? h('span', { class: 'sr-only', text: ` (${t('fieldRequired')})` })
            : null,
        ),
        type === 'switch' ? h('span', { class: 'field-switch-state', text: t(this.checked ? 'fieldOn' : 'fieldOff'), attrs: { 'aria-hidden': 'true' } }) : null, // prettier-ignore
      ),
      this.tipButton(),
    );
    return row;
  }

  /**
   * Radio buttons or check boxes: native inputs, so arrows and Space work as everywhere.
   *
   * @param {string} type
   * @returns {HTMLElement}
   */
  choiceGroup(type) {
    const radio = type === 'radio';
    const list = h('div', { class: 'field-choices', part: 'control' });
    this.options.forEach((option, index) => {
      const id = `${this.ids.control}-${index}`;
      const input = h('input', {
        attrs: {
          id,
          type: radio ? 'radio' : 'checkbox',
          name: this.groupName,
          value: option.value,
          checked: this.values.includes(option.value),
          disabled: this.disabled || this.has('readonly') || option.disabled,
          required: radio && this.has('required') && index === 0,
          'data-focus-key': index === 0 ? 'control' : `choice-${index}`,
        },
        on: {
          change: () => {
            if (radio) this.values = [option.value];
            else if (input.checked) this.values = [...this.values, option.value];
            else this.values = this.values.filter((value) => value !== option.value);
            this.showErrors = true;
            this.changed();
            emit(this, EVENTS.CHANGE, { value: this.value });
          },
        },
      });
      list.append(
        h(
          'label',
          { class: `field-choice${option.disabled ? ' disabled' : ''}`, attrs: { for: id } },
          input,
          h(
            'span',
            { class: 'field-choice-text' },
            h('span', { text: option.label }),
            option.description ? h('span', { class: 'field-option-note', text: option.description }) : null, // prettier-ignore
          ),
        ),
      );
    });
    return list;
  }

  // ---------------------------------------------------------------- list

  /** @returns {boolean} */
  get searchable() {
    return this.hasAttribute('searchable')
      ? this.has('searchable')
      : this.options.length >= SEARCH_FROM;
  }

  /** @returns {FieldOption[]} The options the search lets through. */
  get shown() {
    return filterOptions(this.options, this.filter);
  }

  /** @returns {HTMLElement} */
  listView() {
    const t = this.t;
    const chosen = this.options.filter((option) => this.values.includes(option.value));
    const summary =
      !this.isMultiple
        ? (chosen[0]?.label ?? this.values[0] ?? '')
        : chosen.length === 1 ? chosen[0].label : chosen.length ? t('fieldSelected', { count: chosen.length }) : ''; // prettier-ignore
    const trigger = h(
      'button',
      {
        class: `field-trigger${summary ? '' : ' empty'}`,
        part: 'control',
        attrs: {
          type: 'button',
          id: this.ids.control,
          disabled: this.disabled,
          'aria-haspopup': 'listbox',
          'aria-expanded': String(this.open),
          'aria-controls': this.open ? this.ids.list : null,
          'aria-labelledby': `${this.ids.label} ${this.ids.control}`,
          'aria-describedby': this.describedBy(),
          'data-focus-key': 'control',
        },
        on: {
          click: () => (this.open ? this.close() : this.openList()),
          keydown: (event) => this.triggerKey(/** @type {KeyboardEvent} */ (event)),
        },
      },
      h('span', { class: 'field-trigger-text', text: summary || this.getAttribute('placeholder') || t('fieldChoose') }), // prettier-ignore
      icon(this.open ? 'chevron-up' : 'chevron-down'),
    );
    return h(
      'div',
      { class: 'field-list' },
      h('div', { class: 'field-box' }, this.adornment('prefix'), trigger, this.clearButton(() => this.values.length > 0)), // prettier-ignore
      this.isMultiple && chosen.length ? this.chips(chosen) : null,
      this.open ? this.popup() : null,
    );
  }

  /**
   * @param {FieldOption[]} chosen
   * @returns {HTMLElement}
   */
  chips(chosen) {
    return h(
      'ul',
      { class: 'field-chips' },
      ...chosen.map((option) =>
        h(
          'li',
          { class: 'field-chip', part: 'chip' },
          h('span', { text: option.label }),
          this.disabled || this.has('readonly')
            ? null
            : h(
                'button',
                {
                  attrs: { type: 'button', 'aria-label': this.t('fieldRemove', { label: option.label }), 'data-focus-key': `chip-${option.value}` }, // prettier-ignore
                  on: { click: () => this.toggle(option, false) },
                },
                icon('close'),
              ),
        ),
      ),
    );
  }

  /** @returns {HTMLElement} The search, the options and the actions of several choices. */
  popup() {
    const t = this.t;
    const shown = this.shown;
    this.active = Math.min(this.active, Math.max(0, shown.length - 1));
    const activeId = shown.length ? `${this.ids.list}-${this.active}` : null;
    const listbox = h('ul', {
      class: 'field-listbox',
      part: 'listbox',
      attrs: {
        id: this.ids.list,
        role: 'listbox',
        tabindex: this.searchable ? null : '-1',
        'aria-labelledby': this.ids.label,
        'aria-multiselectable': this.isMultiple ? 'true' : null,
        'aria-activedescendant': this.searchable ? null : activeId,
        'data-focus-key': this.searchable ? null : 'listbox',
      },
      on: { keydown: (event) => this.listKey(/** @type {KeyboardEvent} */ (event)) },
    });
    let group = '';
    shown.forEach((option, index) => {
      if (option.group && option.group !== group) {
        group = option.group;
        listbox.append(
          h('li', { class: 'field-group', text: group, attrs: { role: 'presentation' } }),
        );
      }
      listbox.append(this.optionView(option, index));
    });
    if (!shown.length) listbox.append(h('li', { class: 'field-empty', text: t('fieldNoOptions'), attrs: { role: 'presentation' } })); // prettier-ignore
    return h(
      'div',
      { class: 'field-popup' },
      this.searchable
        ? h('input', {
            class: 'data-input field-search',
            attrs: {
              type: 'search',
              value: this.filter,
              role: 'combobox',
              'aria-label': t('fieldSearch'),
              'aria-controls': this.ids.list,
              'aria-expanded': 'true',
              'aria-autocomplete': 'list',
              'aria-activedescendant': activeId,
              placeholder: t('fieldSearch'),
              'data-focus-key': 'search',
            },
            on: {
              input: (event) => {
                this.filter = /** @type {HTMLInputElement} */ (event.target).value.slice(0, 200);
                this.active = 0;
                this.render();
              },
              keydown: (event) => this.listKey(/** @type {KeyboardEvent} */ (event)),
            },
          })
        : null,
      listbox,
      this.isMultiple ? this.listActions() : null,
    );
  }

  /**
   * @param {FieldOption} option
   * @param {number} index
   * @returns {HTMLElement}
   */
  optionView(option, index) {
    const selected = this.values.includes(option.value);
    return h(
      'li',
      {
        class: `field-option${index === this.active ? ' active' : ''}${option.disabled ? ' disabled' : ''}`,
        part: 'option',
        attrs: { id: `${this.ids.list}-${index}`, role: 'option', 'aria-selected': String(selected), 'aria-disabled': option.disabled ? 'true' : null }, // prettier-ignore
        on: {
          // The focus stays in the search or the list.
          mousedown: (event) => event.preventDefault(),
          click: () => !option.disabled && this.choose(option),
          pointermove: () => {
            if (this.active === index) return;
            this.active = index;
            for (const node of this.root.querySelectorAll('.field-option'))
              node.classList.toggle('active', node.id === `${this.ids.list}-${index}`);
          },
        },
      },
      h('span', { class: 'field-check-mark' }, selected ? icon('check') : null),
      h(
        'span',
        { class: 'field-option-text' },
        h('span', { text: option.label }),
        option.description ? h('span', { class: 'field-option-note', text: option.description }) : null, // prettier-ignore
      ),
    );
  }

  /** @returns {HTMLElement} */
  listActions() {
    const t = this.t;
    return h(
      'div',
      { class: 'field-list-actions' },
      h('button', {
        class: 'text-btn',
        text: t('fieldSelectAll'),
        attrs: { type: 'button', 'data-focus-key': 'select-all' },
        on: {
          mousedown: (event) => event.preventDefault(),
          click: () => {
            const max = parseInteger(this.getAttribute('max-selected'), {
              min: 0,
              max: 1000,
              fallback: 0,
            });
            const all = this.shown.filter((o) => !o.disabled).map((o) => o.value);
            this.values = [...new Set([...this.values, ...all])].slice(0, max || undefined);
            this.render();
            this.changed();
          },
        },
      }),
      h('button', {
        class: 'text-btn',
        text: t('fieldClear'),
        attrs: { type: 'button', 'data-focus-key': 'clear-all' },
        on: {
          mousedown: (event) => event.preventDefault(),
          click: () => {
            this.values = [];
            this.render();
            this.changed();
          },
        },
      }),
    );
  }

  openList() {
    if (this.disabled || this.has('readonly')) return;
    this.open = true;
    this.filter = '';
    const selected = this.shown.findIndex((option) => this.values.includes(option.value));
    this.active = Math.max(0, selected);
    this.render();
    /** @type {HTMLElement | null} */ (
      this.root.querySelector('[data-focus-key="search"], [data-focus-key="listbox"]')
    )?.focus();
    this.scrollActive();
  }

  /** @param {boolean} [focus] */
  close(focus = true) {
    if (!this.open) return;
    this.open = false;
    this.filter = '';
    this.showErrors = true;
    this.render();
    if (focus) /** @type {HTMLElement | null} */ (this.root.querySelector('[data-focus-key="control"]'))?.focus(); // prettier-ignore
    emit(this, EVENTS.CHANGE, { value: this.value });
  }

  /**
   * @param {FieldOption} option
   */
  choose(option) {
    if (this.isMultiple) {
      this.toggle(option, !this.values.includes(option.value));
      return;
    }
    this.values = [option.value];
    this.changed();
    this.close();
  }

  /**
   * @param {FieldOption} option
   * @param {boolean} on
   */
  toggle(option, on) {
    const max = parseInteger(this.getAttribute('max-selected'), { min: 0, max: 1000, fallback: 0 });
    if (on && max && this.values.length >= max) return;
    this.values = on
      ? [...this.values, option.value]
      : this.values.filter((v) => v !== option.value);
    this.render();
    this.changed();
  }

  /** @param {KeyboardEvent} event */
  triggerKey(event) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key) && !this.open) {
      event.preventDefault();
      this.openList();
    } else if (
      event.key === 'Backspace' &&
      this.isMultiple &&
      this.values.length &&
      !this.disabled &&
      !this.has('readonly')
    ) {
      // Removes the last choice, as in most fields with chips.
      event.preventDefault();
      this.values = this.values.slice(0, -1);
      this.render();
      this.changed();
    }
  }

  /** @param {KeyboardEvent} event */
  listKey(event) {
    const shown = this.shown;
    const last = shown.length - 1;
    /** @type {Record<string, () => void>} */
    const keys = {
      ArrowDown: () => (this.active = Math.min(last, this.active + 1)),
      ArrowUp: () => (this.active = Math.max(0, this.active - 1)),
      Home: () => (this.active = 0),
      End: () => (this.active = Math.max(0, last)),
      PageDown: () => (this.active = Math.min(last, this.active + 10)),
      PageUp: () => (this.active = Math.max(0, this.active - 10)),
    };
    if (keys[event.key]) {
      event.preventDefault();
      keys[event.key]();
      this.render();
      this.scrollActive();
    } else if (event.key === 'Enter' || (event.key === ' ' && !this.searchable)) {
      event.preventDefault();
      const option = shown[this.active];
      if (option && !option.disabled) this.choose(option);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.key === 'Tab') {
      this.close(false);
    } else if (!this.searchable && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      this.typeAhead(event.key, shown);
    }
  }

  /**
   * Jumps to the next option that starts with the letters typed.
   *
   * @param {string} key
   * @param {FieldOption[]} shown
   */
  typeAhead(key, shown) {
    const now = Date.now();
    this.typeahead.text = now - this.typeahead.at < 600 ? this.typeahead.text + key : key;
    this.typeahead.at = now;
    const wanted = fold(this.typeahead.text);
    const start = this.typeahead.text.length > 1 ? this.active : this.active + 1;
    for (let step = 0; step < shown.length; step += 1) {
      const index = (start + step) % shown.length;
      if (fold(shown[index].label).startsWith(wanted)) {
        this.active = index;
        this.render();
        this.scrollActive();
        return;
      }
    }
  }

  scrollActive() {
    this.root
      .getElementById(`${this.ids.list}-${this.active}`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  /** Closes the list when a press lands outside the field. */
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

/**
 * A text area as tall as its text, up to a limit set in CSS.
 *
 * @param {HTMLTextAreaElement} area
 */
function grow(area) {
  area.style.setProperty('height', 'auto');
  area.style.setProperty('height', `${area.scrollHeight + 2}px`);
}
