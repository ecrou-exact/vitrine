// @ts-check
import fieldCss from '../../styles/field.css?raw';
import passwordCss from '../../styles/password.css?raw';
import { copyText } from '../../core/actions.js';
import { cleanLabel, parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import {
  ATTACKS,
  BREACH_URL,
  RULES,
  breachCount,
  checkRules,
  estimate,
  generatePassword,
  sha1Hex,
  userWords,
} from './strength.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./strength.js').Strength} Strength */
/** @typedef {import('./strength.js').RuleResult} RuleResult */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

/** Wait after the last key before asking about breaches. */
const BREACH_DELAY = 700;

/**
 * @param {number} seconds
 * @param {(key: StringKey, params?: Record<string, string | number>) => string} t
 * @param {string} locale
 * @returns {string} A rough duration, in words.
 */
export function humanTime(seconds, t, locale) {
  const n = (/** @type {number} */ value) => formatNumber(Math.round(value), locale);
  if (!(seconds >= 1)) return t('pwInstant');
  /** @type {[number, StringKey][]} */
  const units = [[60, 'pwSeconds'], [3600, 'pwMinutes'], [86400, 'pwHours'], [86400 * 31, 'pwDays'], [86400 * 365, 'pwMonths'], [86400 * 365 * 100, 'pwYears']]; // prettier-ignore
  const sizes = [1, 60, 3600, 86400, 86400 * 30.4, 86400 * 365];
  for (let i = 0; i < units.length; i += 1)
    if (seconds < units[i][0]) return t(units[i][1], { count: n(seconds / sizes[i]) });
  return t('pwCenturies');
}

/**
 * A password field for signing in and for choosing a new password. To choose one, it shows
 * a strength meter that guesses as an attacker would (common passwords, words, leet,
 * keyboard runs, sequences, repeats, dates and the user's own name), the time an attack
 * would take, advice, the requirements met as you type, a generator, a confirmation field and,
 * if asked, a check against known data breaches that sends only five characters of a hash.
 *
 * It takes part in `<form>` like a native field and is never written back to an attribute;
 * its events carry the score, never the password.
 *
 * @element vt-password
 * @since 0.16.0
 *
 * @attr {"new"|"current"} mode - `new` (default): choose a password, with the meter and rules. `current`: sign in.
 * @attr {string} name - Name of the value in the submitted form.
 * @attr {string} label - Label of the field.
 * @attr {string} hint - Help under the field.
 * @attr {string} placeholder - Placeholder of the input.
 * @attr {string} value - First value (prefer the `value` property).
 * @attr {boolean} required - A password must be given.
 * @attr {boolean} disabled - The field cannot be used and is not submitted.
 * @attr {number} minlength - Fewest characters (default 8 in `new` mode).
 * @attr {number} maxlength - Most characters (default 128).
 * @attr {string} require - Classes needed, separated by commas: `lower`, `upper`, `digit`, `symbol`.
 * @attr {number} min-classes - At least this many of the four classes.
 * @attr {number} min-score - Lowest strength accepted, 0 to 4 (default 2, "fair", in `new` mode).
 * @attr {string} user-inputs - The user's name, email or site name, which make a password weaker.
 * @attr {string} user-fields - Names of other fields of the form to read as user inputs, separated by commas.
 * @attr {boolean} confirm - Adds a field to type the password again.
 * @attr {boolean} generate - A button that fills in a strong random password (default in `new` mode).
 * @attr {number} generate-length - Length of generated passwords (default 20).
 * @attr {string} breach-check - Checks Have I Been Pwned with k-anonymity; a value is another `https:` range URL.
 * @attr {boolean} strength - The strength meter (default in `new` mode).
 * @attr {boolean} rules - The list of requirements (default when there are any).
 * @attr {boolean} details - Times of four attacks and how the password would be guessed (`full` variant).
 * @attr {"blur"|"input"} validate - When errors show: after leaving the field (default) or while typing.
 *
 * @prop {string} value - The password.
 * @prop {Strength} strength - Its strength (read-only).
 * @prop {number | null} breaches - Times found in breaches, once checked (read-only).
 * @prop {HTMLFormElement | null} form - The form of the field (read-only).
 * @prop {ValidityState | undefined} validity - Its validity (read-only).
 *
 * @fires vt-input - The password changed. Detail: `{ score, valid, length }`.
 * @fires vt-change - The password was committed. Detail: `{ score, valid }`.
 * @fires vt-generate - A password was generated. Detail: `{ length }`.
 * @fires vt-breach - Breaches were checked. Detail: `{ count }`.
 *
 * @csspart label - The label.
 * @csspart control - The input.
 * @csspart meter - The strength meter.
 * @csspart rules - The requirements.
 * @csspart feedback - The warning and advice.
 * @csspart confirm - The confirmation field.
 * @csspart details - The attack times.
 * @csspart error - The error message.
 *
 * @example
 * <vt-password name="password" label="New password" confirm require="lower,upper,digit"
 *              user-fields="email"></vt-password>
 */
export class VtPassword extends VtBase {
  static type = 'password';

  static formAssociated = true;

  static allowEmpty = true;

  static componentAttributes = Object.freeze([
    'mode', 'name', 'hint', 'placeholder', 'value', 'required', 'disabled', 'minlength',
    'maxlength', 'require', 'min-classes', 'min-score', 'user-inputs', 'user-fields', 'confirm',
    'generate', 'generate-length', 'breach-check', 'strength', 'rules', 'details', 'validate',
  ]); // prettier-ignore

  static dataAttributes = Object.freeze(['mode', 'require', 'min-score', 'minlength', 'user-inputs', 'confirm']); // prettier-ignore

  static presets = { simple: {}, full: { details: true } };

  static styles = [fieldCss, passwordCss];

  /**
   * An object of settings: `{ mode, require, minScore, minLength, userInputs, confirm }`.
   *
   * @param {unknown} value
   * @returns {import('../../core/data-input.js').DataResult}
   */
  static fromData(value) {
    const item = value !== null && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : {}; // prettier-ignore
    const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.join(',') : v);
    return {
      content: '',
      attributes: { mode: item.mode, require: list(item.require), 'min-score': item.minScore, minlength: item.minLength, 'user-inputs': list(item.userInputs), confirm: item.confirm }, // prettier-ignore
    };
  }

  constructor() {
    super();
    this.internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
    this.ids = { control: uid('pw'), label: uid('label'), hint: uid('hint'), error: uid('error'), meter: uid('meter'), rules: uid('rules'), feedback: uid('advice'), confirm: uid('confirm'), confirmLabel: uid('label'), confirmStatus: uid('match'), caps: uid('caps') }; // prettier-ignore
    /** @type {string | null} `null`: the `value` attribute. */
    this.password = null;
    this.confirmation = '';
    this.reveal = false;
    this.revealConfirm = false;
    this.showErrors = false;
    this.confirmTouched = false;
    this.caps = false;
    this.formDisabled = false;
    this.generated = false;
    /** @type {{ hash: string, count: number | null, state: 'checking' | 'done' | 'failed' } | null} */
    this.breach = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.breachTimer = undefined;
    /** @type {AbortController | null} */
    this.breachAbort = null;
    /** @type {{ text: string, user: string, result: Strength } | null} */
    this.cache = null;
    this.lastScore = -1;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.announceTimer = undefined;
    this.addEventListener('invalid', (event) => {
      event.preventDefault();
      this.showErrors = true;
      this.confirmTouched = true;
      this.update();
      if (this.form?.querySelector(':invalid') === this) this.focus();
    });
  }

  // ---------------------------------------------------------------- settings

  /** @returns {'new' | 'current'} */
  get mode() {
    return parseEnum(this.getAttribute('mode'), /** @type {const} */ (['new', 'current']), 'new');
  }

  /** @returns {boolean} */
  get isNew() {
    return this.mode === 'new';
  }

  /**
   * @param {string} name
   * @param {boolean} fallback
   * @returns {boolean}
   */
  flag(name, fallback) {
    const value = parseBoolean(this.getAttribute(name));
    return value === null ? fallback || this.feature(name) : value;
  }

  /** @returns {boolean} */
  get disabled() {
    return this.formDisabled || parseBoolean(this.getAttribute('disabled')) === true;
  }

  /** @returns {import('./strength.js').Rules} */
  get rulesSet() {
    const isNew = this.isNew;
    const int = (/** @type {string} */ name, /** @type {number} */ min, /** @type {number} */ max, /** @type {number} */ fallback) => parseInteger(this.getAttribute(name), { min, max, fallback }); // prettier-ignore
    return {
      minLength: int('minlength', 0, 1024, isNew ? 8 : 0),
      maxLength: int('maxlength', 1, 4096, 128),
      require: isNew ? (this.getAttribute('require') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => RULES.includes(/** @type {any} */ (s))) : [], // prettier-ignore
      minClasses: isNew ? int('min-classes', 0, 4, 0) : 0,
      minScore: isNew ? int('min-score', 0, 4, 2) : 0,
      noUser: isNew,
    };
  }

  /** @returns {string[]} Words of the user's name, email or site. */
  get userInputs() {
    const words = userWords(this.getAttribute('user-inputs') ?? '');
    const form = this.form;
    for (const name of (this.getAttribute('user-fields') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      // prettier-ignore
      const field = /** @type {any} */ (form?.elements.namedItem(name));
      const value = field && typeof field.value === 'string' ? field.value : '';
      words.push(...userWords(value));
    }
    return [...new Set(words)];
  }

  // ---------------------------------------------------------------- value

  /** @returns {string} */
  get value() {
    return this.password ?? this.getAttribute('value') ?? '';
  }

  set value(value) {
    this.password = value === null || value === undefined ? '' : String(value);
    this.generated = false;
    if (this._connected) this.render();
  }

  /** @returns {Strength} */
  get strength() {
    const text = this.value;
    const user = this.userInputs;
    const key = user.join(' ');
    if (this.cache?.text !== text || this.cache.user !== key)
      this.cache = { text, user: key, result: estimate(text, user) };
    return this.cache.result;
  }

  /** @returns {number | null} */
  get breaches() {
    return this.breach?.state === 'done' ? this.breach.count : null;
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
    /** @type {HTMLElement | null} */ (this.root.getElementById(this.ids.control))?.focus(options);
  }

  formResetCallback() {
    this.password = null;
    this.confirmation = '';
    this.showErrors = false;
    this.confirmTouched = false;
    this.breach = null;
    this.generated = false;
    this.render();
  }

  /** @param {boolean} disabled */
  formDisabledCallback(disabled) {
    this.formDisabled = disabled;
    this.requestRender();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.breachTimer);
    clearTimeout(this.announceTimer);
    this.breachAbort?.abort();
  }

  // ---------------------------------------------------------------- validity

  /** @returns {RuleResult[]} */
  get ruleResults() {
    return checkRules(this.value, this.rulesSet, this.strength, this.userInputs);
  }

  /**
   * @returns {{ flags: ValidityStateFlags, message: string, confirm: boolean }} What is wrong;
   *   `confirm` when the confirmation is.
   */
  check() {
    const t = this.t;
    const value = this.value;
    const rules = this.rulesSet;
    const length = [...value].length;
    const no = { flags: {}, message: '', confirm: false };
    if (this.disabled) return no;
    if (!value) return parseBoolean(this.getAttribute('required')) === true ? { flags: { valueMissing: true }, message: t('pwMissing'), confirm: false } : no; // prettier-ignore
    if (rules.minLength && length < rules.minLength) return { flags: { tooShort: true }, message: t('pwTooShort', { min: rules.minLength }), confirm: false }; // prettier-ignore
    if (length > rules.maxLength) return { flags: { tooLong: true }, message: t('pwTooLong', { max: rules.maxLength }), confirm: false }; // prettier-ignore
    if (this.isNew) {
      const failed = this.ruleResults.filter((r) => !r.ok);
      if (failed.some((r) => r.id === 'user')) return { flags: { customError: true }, message: t('pwHasUser'), confirm: false }; // prettier-ignore
      if (failed.some((r) => RULES.includes(/** @type {any} */ (r.id)) || r.id === 'classes')) return { flags: { patternMismatch: true }, message: t('pwMissingRule'), confirm: false }; // prettier-ignore
      if (failed.some((r) => r.id === 'score')) return { flags: { customError: true }, message: t('pwTooWeak'), confirm: false }; // prettier-ignore
      if (this.breach?.state === 'done' && this.breach.count) return { flags: { customError: true }, message: t('pwBreached'), confirm: false }; // prettier-ignore
    }
    if (this.hasConfirm) {
      if (!this.confirmation) return { flags: { customError: true }, message: t('pwConfirmMissing'), confirm: true }; // prettier-ignore
      if (this.confirmation !== value) return { flags: { customError: true }, message: t('pwConfirmWrong'), confirm: true }; // prettier-ignore
    }
    return no;
  }

  /** @returns {boolean} */
  get hasConfirm() {
    return this.isNew && parseBoolean(this.getAttribute('confirm')) === true;
  }

  /** @returns {boolean} */
  get valid() {
    return !Object.keys(this.check().flags).length;
  }

  // ---------------------------------------------------------------- rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const isNew = this.isNew;
    const required = parseBoolean(this.getAttribute('required')) === true;
    const hint = cleanLabel(this.getAttribute('hint'), 300);
    const label = cleanLabel(this.getAttribute('label'), 300) || t(isNew ? 'pwLabelNew' : 'pwLabelCurrent'); // prettier-ignore
    const showStrength = isNew && this.flag('strength', true);
    const showRules =
      isNew &&
      this.flag(
        'rules',
        this.ruleResults.some((r) => r.id !== 'max'),
      );
    const field = h(
      'div',
      { class: `field password${this.disabled ? ' disabled' : ''}`, part: 'body' },
      h(
        'div',
        { class: 'field-top' },
        h(
          'label',
          { class: 'field-label', part: 'label', attrs: { id: this.ids.label, for: this.ids.control } }, // prettier-ignore
          label,
          required ? h('span', { class: 'field-required', text: '*', attrs: { 'aria-hidden': 'true' } }) : null, // prettier-ignore
          required ? h('span', { class: 'sr-only', text: ` (${t('pwRequired')})` }) : null,
        ),
      ),
      this.inputBox(),
      h('p', { class: 'pw-caps', attrs: { id: this.ids.caps, 'aria-live': 'polite' } }),
      hint ? h('p', { class: 'field-hint', part: 'hint', text: hint, attrs: { id: this.ids.hint } }) : null, // prettier-ignore
      showStrength ? this.meterView() : null,
      showStrength ? h('div', { class: 'pw-feedback', part: 'feedback', attrs: { id: this.ids.feedback } }) : null, // prettier-ignore
      showRules ? h('ul', { class: 'pw-rules', part: 'rules', attrs: { id: this.ids.rules, 'aria-label': t('pwRules') } }) : null, // prettier-ignore
      isNew && this.getAttribute('breach-check') !== null ? h('p', { class: 'pw-breach', attrs: { 'aria-live': 'polite' } }) : null, // prettier-ignore
      this.generated ? h('p', { class: 'pw-generated', text: t('pwGenerated') }) : null,
      showStrength && this.flag('details', false) ? this.detailsView() : null,
      this.hasConfirm ? this.confirmView() : null,
      h('p', { class: 'field-error', part: 'error', attrs: { id: this.ids.error, 'aria-live': 'polite' } }), // prettier-ignore
    );
    frame.append(field);
    this.update();
  }

  /** @returns {string} */
  describedBy() {
    return [this.getAttribute('hint') ? this.ids.hint : '', this.isNew && this.flag('rules', this.ruleResults.some((r) => r.id !== 'max')) ? this.ids.rules : '', this.ids.caps, this.ids.error].filter(Boolean).join(' '); // prettier-ignore
  }

  /** @returns {HTMLElement} */
  inputBox() {
    const t = this.t;
    const rules = this.rulesSet;
    const input = /** @type {HTMLInputElement} */ (
      h('input', {
        class: 'field-input pw-input',
        part: 'control',
        attrs: {
          id: this.ids.control,
          type: this.reveal ? 'text' : 'password',
          placeholder: this.getAttribute('placeholder'),
          required: parseBoolean(this.getAttribute('required')) === true,
          disabled: this.disabled,
          autocomplete: this.isNew ? 'new-password' : 'current-password',
          autocapitalize: 'off',
          spellcheck: 'false',
          minlength: rules.minLength || null,
          maxlength: rules.maxLength,
          passwordrules: this.isNew ? passwordRules(rules) : null,
          'aria-describedby': this.describedBy(),
          'data-focus-key': 'control',
        },
      })
    );
    input.value = this.value;
    input.addEventListener('input', () => {
      this.password = input.value;
      this.generated = false;
      this.root.querySelector('.pw-generated')?.remove();
      this.typed();
    });
    input.addEventListener('change', () => emit(this, EVENTS.CHANGE, { score: this.strength.score, valid: this.valid })); // prettier-ignore
    input.addEventListener('blur', () => {
      this.showErrors = true;
      this.setCaps(false);
      this.update();
    });
    for (const type of ['keydown', 'keyup'])
      input.addEventListener(type, (event) => {
        const e = /** @type {KeyboardEvent} */ (event);
        if (typeof e.getModifierState === 'function') this.setCaps(e.getModifierState('CapsLock'));
      });
    const generate = this.isNew && this.flag('generate', true) && !this.disabled;
    return h(
      'div',
      { class: 'field-box' },
      icon('lock'),
      input,
      this.reveal && this.value ? this.copyPasswordButton() : null,
      generate
        ? h('button', { class: 'field-icon-button', attrs: { type: 'button', 'aria-label': t('pwGenerate'), title: t('pwGenerate'), 'data-focus-key': 'generate' }, on: { click: () => this.fill() } }, icon('refresh')) // prettier-ignore
        : null,
      h(
        'button',
        {
          class: 'field-icon-button',
          attrs: { type: 'button', 'aria-label': t(this.reveal ? 'pwHide' : 'pwShow'), title: t(this.reveal ? 'pwHide' : 'pwShow'), 'aria-pressed': String(this.reveal), 'aria-controls': this.ids.control, disabled: this.disabled, 'data-focus-key': 'reveal' }, // prettier-ignore
          on: {
            click: () => {
              this.reveal = !this.reveal;
              this.render();
            },
          },
        },
        icon(this.reveal ? 'eye-off' : 'eye'),
      ),
    );
  }

  /** @returns {HTMLElement} */
  copyPasswordButton() {
    const t = this.t;
    const button = h(
      'button',
      {
        class: 'field-icon-button',
        attrs: { type: 'button', 'aria-label': t('pwCopy'), title: t('pwCopy'), 'data-focus-key': 'copy' }, // prettier-ignore
        on: {
          click: async () => {
            const ok = await copyText(this.value, this.root);
            button.replaceChildren(icon(ok ? 'check' : 'alert'));
            button.classList.toggle('done', ok);
            setTimeout(() => {
              button.replaceChildren(icon('copy'));
              button.classList.remove('done');
            }, 1500);
            this.announce(t(ok ? 'copied' : 'copyFailed'));
            // The text copied is not in the event: it is a password.
            if (ok) emit(this, EVENTS.COPY, {});
          },
        },
      },
      icon('copy'),
    );
    return button;
  }

  /** @returns {HTMLElement} */
  meterView() {
    const t = this.t;
    return h(
      'div',
      { class: 'pw-meter', part: 'meter' },
      h(
        'div',
        { class: 'pw-bars', attrs: { id: this.ids.meter, role: 'meter', 'aria-label': t('pwStrength'), 'aria-valuemin': '0', 'aria-valuemax': '4', 'aria-valuenow': '0' } }, // prettier-ignore
        ...[0, 1, 2, 3].map(() => h('span', { class: 'pw-bar' })),
      ),
      h('span', { class: 'pw-label' }),
      h('span', { class: 'pw-time' }),
    );
  }

  /** @returns {HTMLElement} */
  detailsView() {
    const t = this.t;
    return h(
      'details',
      { class: 'pw-details', part: 'details' },
      h('summary', { text: t('pwDetails'), attrs: { 'data-focus-key': 'details' } }),
      h('p', { class: 'pw-entropy' }),
      h('table', { class: 'pw-attacks' },
        h('thead', {}, h('tr', {}, h('th', { text: t('pwAttack'), attrs: { scope: 'col' } }), h('th', { text: t('pwTime'), attrs: { scope: 'col' } }))), // prettier-ignore
        h('tbody', {}, ...Object.keys(ATTACKS).map((name) => h('tr', { attrs: { 'data-attack': name } }, h('th', { text: t(/** @type {StringKey} */ (`pwAttack_${name}`)), attrs: { scope: 'row' } }), h('td')))), // prettier-ignore
      ), // prettier-ignore
      h('p', { class: 'pw-patterns-title', text: t('pwPatterns') }),
      h('ol', { class: 'pw-patterns' }),
    );
  }

  /** @returns {HTMLElement} */
  confirmView() {
    const t = this.t;
    const input = /** @type {HTMLInputElement} */ (
      h('input', {
        class: 'field-input',
        attrs: {
          id: this.ids.confirm,
          type: this.revealConfirm ? 'text' : 'password',
          autocomplete: 'new-password',
          autocapitalize: 'off',
          spellcheck: 'false',
          disabled: this.disabled,
          'aria-describedby': `${this.ids.confirmStatus} ${this.ids.error}`,
          'data-focus-key': 'confirm',
        },
      })
    );
    input.value = this.confirmation;
    input.addEventListener('input', () => {
      this.confirmation = input.value;
      if (this.confirmation.length >= this.value.length) this.confirmTouched = true;
      this.typed();
    });
    input.addEventListener('blur', () => {
      this.confirmTouched = true;
      this.showErrors = true;
      this.update();
    });
    return h(
      'div',
      { class: 'pw-confirm', part: 'confirm' },
      h('label', { class: 'field-label', text: t('pwConfirmLabel'), attrs: { id: this.ids.confirmLabel, for: this.ids.confirm } }), // prettier-ignore
      h(
        'div',
        { class: 'field-box' },
        icon('lock'),
        input,
        h(
          'button',
          {
            class: 'field-icon-button',
            attrs: { type: 'button', 'aria-label': t(this.revealConfirm ? 'pwHideConfirm' : 'pwShowConfirm'), title: t(this.revealConfirm ? 'pwHideConfirm' : 'pwShowConfirm'), 'aria-pressed': String(this.revealConfirm), disabled: this.disabled, 'data-focus-key': 'reveal-confirm' }, // prettier-ignore
            on: {
              click: () => {
                this.revealConfirm = !this.revealConfirm;
                this.render();
              },
            },
          },
          icon(this.revealConfirm ? 'eye-off' : 'eye'),
        ),
      ),
      h('p', { class: 'pw-match', attrs: { id: this.ids.confirmStatus } }),
    );
  }

  // ---------------------------------------------------------------- updates

  /** A key was typed in one of the inputs. */
  typed() {
    if (this.getAttribute('validate') === 'input') this.showErrors = true;
    this.scheduleBreach();
    this.update();
    const strength = this.strength;
    emit(this, EVENTS.INPUT, { score: strength.score, valid: this.valid, length: strength.length });
    // The level is read out when it settles, not on every key.
    clearTimeout(this.announceTimer);
    if (this.isNew && this.value && strength.score !== this.lastScore) {
      this.announceTimer = setTimeout(() => {
        this.lastScore = this.strength.score;
        if (this.value) this.announce(this.t('pwStrengthIs', { label: this.t(/** @type {StringKey} */ (`pwScore${this.lastScore}`)) })); // prettier-ignore
      }, 900);
    }
  }

  /**
   * @param {boolean} on
   */
  setCaps(on) {
    if (on === this.caps) return;
    this.caps = on;
    const node = this.root.getElementById(this.ids.caps);
    if (node) node.replaceChildren(...(on ? [icon('alert'), h('span', { text: this.t('pwCaps') })] : [])); // prettier-ignore
  }

  /** Updates the meter, rules, messages and form value, without a render. */
  update() {
    const t = this.t;
    const value = this.value;
    const strength = this.strength;
    const filled = value.length > 0;
    const { flags, message, confirm } = this.check();
    if (this.internals) {
      // The state is empty: browsers must not restore a password.
      this.internals.setFormValue(this.disabled ? null : value, '');
      const anchor = /** @type {HTMLElement | null} */ (this.root.getElementById(confirm ? this.ids.confirm : this.ids.control)) ?? undefined; // prettier-ignore
      this.internals.setValidity(flags, message, Object.keys(flags).length ? anchor : undefined);
    }
    const meter = this.root.getElementById(this.ids.meter);
    if (meter) {
      const score = filled ? strength.score : 0;
      meter.setAttribute('aria-valuenow', String(score));
      meter.setAttribute('aria-valuetext', filled ? t(/** @type {StringKey} */ (`pwScore${score}`)) : '—'); // prettier-ignore
      const box = /** @type {HTMLElement} */ (meter.parentElement);
      box.className = `pw-meter score-${filled ? score : 'none'}`;
      meter.querySelectorAll('.pw-bar').forEach((bar, i) => bar.classList.toggle('on', filled && i <= Math.max(0, score - 1) && (score > 0 || i === 0))); // prettier-ignore
      const label = box.querySelector('.pw-label');
      if (label) label.textContent = filled ? t(/** @type {StringKey} */ (`pwScore${score}`)) : '';
      const time = box.querySelector('.pw-time');
      if (time) time.textContent = filled ? t('pwCrack', { time: humanTime(strength.seconds.offlineSlow, t, this.locale) }) : ''; // prettier-ignore
    }
    const advice = this.root.getElementById(this.ids.feedback);
    if (advice) {
      advice.replaceChildren();
      if (filled && strength.warning) advice.append(h('p', { class: 'pw-warning' }, icon('alert'), h('span', { text: t(/** @type {StringKey} */ (strength.warning)) }))); // prettier-ignore
      if (filled && strength.suggestions.length) advice.append(h('ul', { class: 'pw-suggestions' }, ...strength.suggestions.map((key) => h('li', { text: t(/** @type {StringKey} */ (key)) })))); // prettier-ignore
    }
    const rules = this.root.getElementById(this.ids.rules);
    if (rules) {
      rules.replaceChildren(
        ...this.ruleResults.map((rule) => {
          const params = rule.id === 'score' ? { label: t(/** @type {StringKey} */ (`pwScore${rule.params?.min}`)) } : rule.params; // prettier-ignore
          return h(
            'li',
            { class: `pw-rule${rule.ok ? ' ok' : ''}`, attrs: { 'data-rule': rule.id } },
            icon(rule.ok ? 'status-success' : 'status-circle'),
            h('span', { text: t(/** @type {StringKey} */ (`pwRule_${rule.id}`), params) }),
            h('span', { class: 'sr-only', text: ` (${t(rule.ok ? 'pwMet' : 'pwNotMet')})` }),
          );
        }),
      );
    }
    const breach = this.root.querySelector('.pw-breach');
    if (breach) {
      const state = this.breach;
      breach.className = `pw-breach${state?.state === 'done' ? (state.count ? ' found' : ' clean') : ''}`;
      breach.replaceChildren();
      if (state && filled) {
        const text =
          state.state === 'checking'
            ? t('pwBreachChecking')
            : state.state === 'failed'
              ? t('pwBreachFailed')
              : state.count
                ? t('pwBreachFound', { count: formatNumber(state.count, this.locale) })
                : t('pwBreachClean');
        breach.append(icon(state.state === 'done' ? (state.count ? 'shield-alert' : 'shield-check') : 'status-running'), h('span', { text })); // prettier-ignore
      }
    }
    const details = this.root.querySelector('.pw-details');
    if (details) {
      const entropy = details.querySelector('.pw-entropy');
      if (entropy) entropy.textContent = filled ? `${t('pwEntropy', { bits: formatNumber(Math.round(strength.bits), this.locale) })} · ${t('pwLength', { count: strength.length })}` : ''; // prettier-ignore
      for (const row of details.querySelectorAll('tr[data-attack]')) {
        const name = /** @type {keyof typeof ATTACKS} */ (/** @type {HTMLElement} */ (row).dataset.attack); // prettier-ignore
        const cell = row.querySelector('td');
        if (cell)
          cell.textContent = filled ? humanTime(strength.seconds[name], t, this.locale) : '—';
      }
      const patterns = details.querySelector('.pw-patterns');
      patterns?.replaceChildren(
        ...(filled ? strength.sequence : []).map(
          (m) =>
          h('li', { class: `pw-pattern kind-${m.kind}` }, h('code', { text: m.kind === 'brute' ? '•'.repeat([...m.token].length) : m.token }), h('span', { text: t(/** @type {StringKey} */ (`pwPattern_${m.kind}`)) })), // prettier-ignore
        ),
      );
    }
    const match = this.root.querySelector('.pw-match');
    if (match) {
      const show = this.confirmation.length > 0 && (this.confirmTouched || this.confirmation === value); // prettier-ignore
      const same = this.confirmation === value && value.length > 0;
      match.className = `pw-match${show ? (same ? ' ok' : ' bad') : ''}`;
      match.replaceChildren(...(show ? [icon(same ? 'status-success' : 'status-failure'), h('span', { text: t(same ? 'pwMatch' : 'pwNoMatch') })] : [])); // prettier-ignore
    }
    const invalid = Boolean(message) && this.showErrors && (!confirm || this.confirmTouched);
    const error = this.root.getElementById(this.ids.error);
    if (error) error.textContent = invalid ? message : '';
    const control = this.root.getElementById(confirm ? this.ids.confirm : this.ids.control);
    for (const id of [this.ids.control, this.ids.confirm]) this.root.getElementById(id)?.removeAttribute('aria-invalid'); // prettier-ignore
    if (invalid) control?.setAttribute('aria-invalid', 'true');
    this.root.querySelector('.field')?.classList.toggle('has-error', invalid);
  }

  /** Fills in a generated password, shown so it can be saved. */
  fill() {
    const rules = this.rulesSet;
    const length = Math.min(rules.maxLength, Math.max(rules.minLength, parseInteger(this.getAttribute('generate-length'), { min: 8, max: 128, fallback: 20 }))); // prettier-ignore
    this.password = generatePassword({ length, classes: ['lower', 'upper', 'digit', 'symbol'], avoidAmbiguous: true }); // prettier-ignore
    if (this.hasConfirm) this.confirmation = this.password;
    this.generated = true;
    this.reveal = true;
    this.showErrors = true;
    this.render();
    this.typed();
    emit(this, EVENTS.GENERATE, { length });
    emit(this, EVENTS.CHANGE, { score: this.strength.score, valid: this.valid });
  }

  // ---------------------------------------------------------------- breaches

  /** @returns {string | null} The range URL to ask, or `null` when not asked. */
  get breachUrl() {
    const value = this.getAttribute('breach-check');
    if (value === null || !this.isNew || parseBoolean(value) === false) return null;
    const trimmed = value.trim();
    if (!trimmed || parseBoolean(trimmed) === true) return BREACH_URL;
    try {
      const url = new URL(trimmed, document.baseURI);
      return url.protocol === 'https:' || url.origin === location.origin ? url.href : null;
    } catch {
      return null;
    }
  }

  scheduleBreach() {
    clearTimeout(this.breachTimer);
    this.breachAbort?.abort();
    const url = this.breachUrl;
    const value = this.value;
    if (!url || [...value].length < Math.max(4, this.rulesSet.minLength)) {
      this.breach = null;
      return;
    }
    this.breach = { hash: '', count: null, state: 'checking' };
    this.breachTimer = setTimeout(() => this.runBreach(url, value), BREACH_DELAY);
  }

  /**
   * @param {string} url
   * @param {string} value
   */
  async runBreach(url, value) {
    const abort = new AbortController();
    this.breachAbort = abort;
    try {
      const count = await breachCount(value, { url, signal: abort.signal });
      if (abort.signal.aborted || value !== this.value) return;
      this.breach = { hash: await sha1Hex(value), count, state: 'done' };
      emit(this, EVENTS.BREACH, { count });
    } catch {
      if (abort.signal.aborted) return;
      this.breach = { hash: '', count: null, state: 'failed' };
    }
    this.update();
  }
}

/**
 * The `passwordrules` hint that Safari and some password managers read to generate one.
 *
 * @param {import('./strength.js').Rules} rules
 * @returns {string}
 */
function passwordRules(rules) {
  const names = /** @type {Record<string, string>} */ ({ lower: 'lower', upper: 'upper', digit: 'digit', symbol: 'special' }); // prettier-ignore
  const parts = [`minlength: ${Math.max(rules.minLength, 8)}`, `maxlength: ${rules.maxLength}`];
  for (const name of rules.require) parts.push(`required: ${names[name]}`);
  parts.push('allowed: ascii-printable');
  return `${parts.join('; ')};`;
}
