// @ts-check
import fieldCss from '../../styles/field.css?raw';
import secretCss from '../../styles/secret.css?raw';
import { copyText } from '../../core/actions.js';
import { cleanLabel, parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, formatNumber } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import {
  COPY_FORMATS,
  KINDS,
  alphabetOf,
  copyAs,
  detectSecret,
  entropyBits,
  expiryState,
  generateSecret,
  jwtTimes,
  maskSecret,
} from './secrets.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('../../core/i18n.js').StringKey} StringKey */
/** @typedef {typeof COPY_FORMATS[number]} CopyFormat */

const DAY = 86400000;

/**
 * @param {string | null} value
 * @returns {Date | null}
 */
function readDate(value) {
  if (!value?.trim()) return null;
  const time = Date.parse(value.trim());
  return Number.isNaN(time) ? null : new Date(time);
}

/**
 * A field for API keys, tokens and other secrets, shown or typed. The key stays hidden behind
 * a blur until revealed: what is blurred are fixed stand-in characters, never the key, so it
 * is not in the page until shown. It can be copied without being shown, as is or as a `.env`
 * line, a shell or PowerShell variable, an `Authorization` header or JSON, and the clipboard
 * can be cleared after a while.
 *
 * It recognizes keys of about thirty services from their documented prefix (GitHub, GitLab,
 * AWS, Stripe, OpenAI, Anthropic, Slack, Google Cloud, npm, PyPI, Docker Hub…), tells live
 * keys from test keys and secret keys from publishable ones, and shows when the key was
 * created, used and expires, its scopes and its randomness. It can show a key once, hide it
 * again after a delay, and regenerate it. Typed (`editable`), it is a form field that checks
 * the kind of key expected.
 *
 * Events never carry the key.
 *
 * @element vt-secret
 * @since 0.16.0
 *
 * @attr {string} value - The key (prefer the `value` property, which is not in the page).
 * @attr {string} name - Name of the value in a form.
 * @attr {string} label - Label of the field (default "API key").
 * @attr {string} hint - Help under the field.
 * @attr {boolean} editable - The key is typed or pasted, as a form field.
 * @attr {boolean} required - With `editable`, a key must be given.
 * @attr {boolean} disabled - The field cannot be used.
 * @attr {string} placeholder - Placeholder of the input, with `editable`.
 * @attr {"blur"|"dots"} mask - How the hidden part looks (default `blur`).
 * @attr {number} show-start - Characters shown at the start while hidden (default: the kind prefix).
 * @attr {number} show-end - Characters shown at the end while hidden (default 4 for long keys).
 * @attr {number} auto-hide - Hides the key again this many seconds after it is shown.
 * @attr {boolean} show-once - The key can be seen and copied until hidden, then it is forgotten.
 * @attr {string} copy-as - Copy formats offered, separated by commas: `raw`, `env`, `shell`, `powershell`, `header`, `json` (`full` variant: all).
 * @attr {string} env-name - Name of the variable in copied formats (default from the label).
 * @attr {number} clear-clipboard - Empties the clipboard this many seconds after a copy.
 * @attr {string} expect - Kinds accepted, separated by commas: ids such as `github-classic` or providers such as `stripe`.
 * @attr {string} pattern - Regular expression an `editable` key must match.
 * @attr {boolean} detect - Shows the kind of key (default on).
 * @attr {string} created - When the key was created.
 * @attr {string} expires - When it expires (a JWT gives its own).
 * @attr {string} last-used - When it was last used; `never` if never.
 * @attr {number} warn-days - Days before expiry from which it warns (default 7).
 * @attr {string} scopes - Permissions of the key, separated by commas.
 * @attr {boolean} rotate - A button that regenerates the key, after a confirmation.
 * @attr {boolean} generate - With `editable`, a button that fills in a random key.
 * @attr {string} generate-prefix - Prefix of generated keys.
 * @attr {number} generate-length - Random characters of generated keys (default: as the key, or 40).
 * @attr {"base62"|"hex"|"base64url"|"base32"} generate-alphabet - Characters of generated keys.
 * @attr {string} now - The current time, for tests and screenshots.
 *
 * @prop {string} value - The key.
 * @prop {boolean} visible - Whether the key is shown.
 * @prop {import('./secrets.js').Detected | null} kind - The kind of key recognized (read-only).
 *
 * @fires vt-toggle - The key was shown or hidden. Detail: `{ visible }`.
 * @fires vt-copy - The key was copied. Detail: `{ format }`, never the key.
 * @fires vt-rotate - Regenerate was confirmed (cancelable: cancel it to set the new key yourself). Detail: `{ provider }`.
 * @fires vt-generate - A key was generated. Detail: `{ length }`.
 * @fires vt-input - An `editable` key changed. Detail: `{ kind, valid }`.
 * @fires vt-change - An `editable` key was committed. Detail: `{ kind, valid }`.
 *
 * @csspart label - The label.
 * @csspart value - The key or its mask.
 * @csspart control - The input, with `editable`.
 * @csspart badge - A badge of kind, environment or state.
 * @csspart menu - The copy formats.
 * @csspart meta - Dates, scopes and randomness.
 * @csspart notice - Warnings and notices.
 *
 * @example
 * <vt-secret label="Stripe key" created="2026-09-01" scopes="charges:write,refunds:read"
 *            copy-as="env,shell" env-name="STRIPE_SECRET_KEY"></vt-secret>
 */
export class VtSecret extends VtBase {
  static type = 'secret';

  static formAssociated = true;

  static allowEmpty = true;

  static componentAttributes = Object.freeze([
    'value', 'name', 'hint', 'editable', 'required', 'disabled', 'placeholder', 'mask', 'show-start',
    'show-end', 'auto-hide', 'show-once', 'copy-as', 'env-name', 'clear-clipboard', 'expect', 'pattern',
    'detect', 'created', 'expires', 'last-used', 'warn-days', 'scopes', 'rotate', 'generate',
    'generate-prefix', 'generate-length', 'generate-alphabet', 'now',
  ]); // prettier-ignore

  static dataAttributes = Object.freeze(['created', 'expires', 'last-used', 'scopes', 'env-name', 'expect']); // prettier-ignore

  static presets = { simple: {}, full: { meta: true } };

  static styles = [fieldCss, secretCss];

  /**
   * Settings of the key: `{ created, expires, lastUsed, scopes, envName, expect }`. The key
   * itself is never read from JSON: set the `value` property.
   *
   * @param {unknown} value
   * @returns {import('../../core/data-input.js').DataResult}
   */
  static fromData(value) {
    const item = value !== null && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : {}; // prettier-ignore
    const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.join(',') : v);
    return { content: '', attributes: { created: item.created, expires: item.expires, 'last-used': item.lastUsed, scopes: list(item.scopes), 'env-name': item.envName, expect: list(item.expect) } }; // prettier-ignore
  }

  constructor() {
    super();
    this.internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
    this.ids = { label: uid('label'), value: uid('key'), hint: uid('hint'), error: uid('error'), menu: uid('menu'), status: uid('status') }; // prettier-ignore
    /** @type {string | null} `null`: the `value` attribute. */
    this.secret = null;
    this.shown = false;
    this.forgotten = false;
    /** @type {import('./secrets.js').Masked | null} What stays shown of a key forgotten. */
    this.forgottenMask = null;
    this.menuOpen = false;
    this.confirming = false;
    this.fresh = false;
    this.trimmed = false;
    this.showErrors = false;
    this.formDisabled = false;
    /** @type {ReturnType<typeof setInterval> | undefined} */
    this.hideTimer = undefined;
    this.hideAt = 0;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.confirmTimer = undefined;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.clipboardTimer = undefined;
    /** @type {((event: Event) => void) | null} */
    this.outside = null;
    this.addEventListener('invalid', (event) => {
      event.preventDefault();
      this.showErrors = true;
      this.update();
    });
  }

  // ---------------------------------------------------------------- state

  /** @returns {string} */
  get value() {
    return this.secret ?? this.getAttribute('value') ?? '';
  }

  set value(value) {
    this.secret = value === null || value === undefined ? '' : String(value);
    this.forgotten = false;
    if (this._connected) this.render();
  }

  /** @returns {boolean} */
  get visible() {
    return this.shown;
  }

  set visible(on) {
    this.toggle(Boolean(on));
  }

  /** @returns {import('./secrets.js').Detected | null} */
  get kind() {
    return detectSecret(this.value);
  }

  /** @returns {boolean} */
  get editable() {
    return parseBoolean(this.getAttribute('editable')) === true;
  }

  /** @returns {boolean} */
  get disabled() {
    return this.formDisabled || parseBoolean(this.getAttribute('disabled')) === true;
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  flag(name) {
    return parseBoolean(this.getAttribute(name)) === true;
  }

  /** @returns {Date} */
  get now() {
    return readDate(this.getAttribute('now')) ?? new Date();
  }

  /** @returns {CopyFormat[]} The copy formats offered besides the key alone. */
  get formats() {
    const asked = this.getAttribute('copy-as');
    const list = asked === null ? (this.variant === 'full' ? [...COPY_FORMATS] : []) : asked.split(',').map((s) => s.trim().toLowerCase()); // prettier-ignore
    return /** @type {CopyFormat[]} */ (
      list.filter((f) => COPY_FORMATS.includes(/** @type {any} */ (f)))
    );
  }

  /** @returns {string} */
  get variableName() {
    return this.getAttribute('env-name')?.trim() || cleanLabel(this.getAttribute('label'), 100) || 'API_KEY'; // prettier-ignore
  }

  /** @type {HTMLFormElement | null} */
  get form() {
    return this.internals?.form ?? null;
  }

  /** @type {ValidityState | undefined} */
  get validity() {
    return this.internals?.validity;
  }

  /** @returns {boolean} */
  checkValidity() {
    return this.internals?.checkValidity() ?? true;
  }

  /** @param {FocusOptions} [options] */
  focus(options) {
    /** @type {HTMLElement | null} */ (this.root.querySelector('[data-focus-key="control"], [data-focus-key="reveal"]'))?.focus(options); // prettier-ignore
  }

  formResetCallback() {
    this.secret = null;
    this.showErrors = false;
    this.toggle(false, false);
    this.render();
  }

  /** @param {boolean} disabled */
  formDisabledCallback(disabled) {
    this.formDisabled = disabled;
    this.requestRender();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.hideTimer);
    clearTimeout(this.confirmTimer);
    this.stopOutside();
    // A key shown stays hidden when the element comes back.
    this.shown = false;
  }

  /**
   * Shows or hides the key.
   *
   * @param {boolean} on
   * @param {boolean} [render]
   */
  toggle(on, render = true) {
    if (this.forgotten && on) return;
    const was = this.shown;
    this.shown = on;
    clearInterval(this.hideTimer);
    this.hideTimer = undefined;
    if (on) {
      const seconds = parseInteger(this.getAttribute('auto-hide'), { min: 0, max: 3600, fallback: 0 }); // prettier-ignore
      if (seconds) {
        this.hideAt = Date.now() + seconds * 1000;
        this.hideTimer = setInterval(() => {
          const left = Math.ceil((this.hideAt - Date.now()) / 1000);
          if (left <= 0) this.toggle(false);
          else {
            const node = this.root.querySelector('.sc-countdown');
            if (node) node.textContent = this.t('scHidesIn', { seconds: left });
          }
        }, 250);
      }
    } else if (was && this.flag('show-once') && !this.editable) {
      // Shown once: forgotten when hidden, as services do with new tokens.
      const masked = this.maskedParts();
      this.forgottenMask = masked;
      this.secret = '';
      this.forgotten = true;
      this.fresh = false;
    }
    if (render && this.isConnected) this.render();
    if (was !== on) emit(this, EVENTS.TOGGLE, { visible: on });
  }

  /** @returns {import('./secrets.js').Masked} */
  maskedParts() {
    const int = (/** @type {string} */ name) => {
      const value = this.getAttribute(name);
      return value === null ? undefined : parseInteger(value, { min: 0, max: 64, fallback: 0 });
    };
    return maskSecret(this.value, { start: int('show-start'), end: int('show-end') });
  }

  // ---------------------------------------------------------------- validity

  /** @returns {{ flags: ValidityStateFlags, message: string }} */
  check() {
    const t = this.t;
    const value = this.value;
    if (this.disabled || !this.editable) return { flags: {}, message: '' };
    if (!value) return this.flag('required') ? { flags: { valueMissing: true }, message: t('scMissing') } : { flags: {}, message: '' }; // prettier-ignore
    const expected = (this.getAttribute('expect') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean); // prettier-ignore
    if (expected.length) {
      const kind = this.kind;
      const ok = kind && expected.some((e) => e === kind.id || e === kind.provider.toLowerCase() || kind.id.startsWith(`${e}-`)); // prettier-ignore
      if (!ok) {
        const names = expected.map((e) => {
          const known = KINDS.find((k) => k.id === e || k.provider.toLowerCase() === e);
          return known ? `${known.provider} ${known.label}`.trim() : e;
        });
        return { flags: { typeMismatch: true }, message: t('scWrongKind', { expected: names.join(' / ') }) }; // prettier-ignore
      }
    }
    const pattern = this.getAttribute('pattern');
    if (pattern) {
      try {
        if (!new RegExp(`^(?:${pattern})$`, 'v').test(value)) return { flags: { patternMismatch: true }, message: t('scBadPattern') }; // prettier-ignore
      } catch {
        // An invalid pattern is ignored, as browsers do.
      }
    }
    return { flags: {}, message: '' };
  }

  /** @returns {boolean} */
  get valid() {
    return !Object.keys(this.check().flags).length;
  }

  /** Updates the form value, the validity and the message, without a render. */
  update() {
    const { flags, message } = this.check();
    if (this.internals) {
      this.internals.setFormValue(
        this.disabled || !this.getAttribute('name') ? null : this.value,
        '',
      );
      const anchor = /** @type {HTMLElement | null} */ (this.root.querySelector('[data-focus-key="control"]')) ?? undefined; // prettier-ignore
      this.internals.setValidity(flags, message, Object.keys(flags).length ? anchor : undefined);
    }
    const invalid = Boolean(message) && this.showErrors;
    const error = this.root.getElementById(this.ids.error);
    if (error) error.textContent = invalid ? message : '';
    const control = this.root.querySelector('[data-focus-key="control"]');
    if (invalid) control?.setAttribute('aria-invalid', 'true');
    else control?.removeAttribute('aria-invalid');
  }

  // ---------------------------------------------------------------- rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const t = this.t;
    const editable = this.editable;
    const required = editable && this.flag('required');
    const hint = cleanLabel(this.getAttribute('hint'), 300);
    const kind = this.forgotten ? null : this.kind;
    const label = cleanLabel(this.getAttribute('label'), 300) || t('scLabel');
    const top = h(
      'div',
      { class: 'field-top sc-top' },
      h(
        editable ? 'label' : 'span',
        { class: 'field-label', part: 'label', attrs: { id: this.ids.label, for: editable ? this.ids.value : null } }, // prettier-ignore
        label,
        required ? h('span', { class: 'field-required', text: '*', attrs: { 'aria-hidden': 'true' } }) : null, // prettier-ignore
        required ? h('span', { class: 'sr-only', text: ` (${t('scRequired')})` }) : null,
      ),
      this.badges(kind),
    );
    const field = h(
      'div',
      { class: `field secret${this.disabled ? ' disabled' : ''}${this.shown ? ' shown' : ''}`, part: 'body' }, // prettier-ignore
      top,
      editable ? this.inputView() : this.valueView(kind),
      this.hideTimer ? h('p', { class: 'sc-countdown', attrs: { 'aria-live': 'off' }, text: t('scHidesIn', { seconds: Math.max(1, Math.ceil((this.hideAt - Date.now()) / 1000)) }) }) : null, // prettier-ignore
      hint ? h('p', { class: 'field-hint', part: 'hint', text: hint, attrs: { id: this.ids.hint } }) : null, // prettier-ignore
      ...this.notices(kind),
      this.metaView(kind),
      h('p', { class: 'field-error', part: 'error', attrs: { id: this.ids.error, 'aria-live': 'polite' } }), // prettier-ignore
    );
    frame.append(field);
    this.update();
    if (this.menuOpen) this.watchOutside();
    else this.stopOutside();
  }

  /**
   * @param {import('./secrets.js').Detected | null} kind
   * @returns {HTMLElement | null}
   */
  badges(kind) {
    const t = this.t;
    if (!kind || parseBoolean(this.getAttribute('detect')) === false) return null;
    return h(
      'span',
      { class: 'sc-badges' },
      h('span', { class: 'sc-badge', part: 'badge', text: [kind.provider, kind.label].filter(Boolean).join(' · ') }), // prettier-ignore
      kind.env ? h('span', { class: `sc-badge env-${kind.env}`, part: 'badge', text: t(kind.env === 'live' ? 'scLive' : 'scTest') }) : null, // prettier-ignore
      kind.kind !== 'secret' && kind.kind !== 'token' ? h('span', { class: `sc-badge kind-${kind.kind}`, part: 'badge', text: t(/** @type {StringKey} */ (`scKind_${kind.kind}`)) }) : null, // prettier-ignore
    );
  }

  /**
   * The key shown, or masked.
   *
   * @param {import('./secrets.js').Detected | null} kind
   * @returns {HTMLElement}
   */
  valueView(kind) {
    const t = this.t;
    const value = this.value;
    const multiline = kind?.kind === 'private-key' || value.includes('\n');
    let shown;
    if (this.forgotten) {
      const mask = this.forgottenMask ?? { start: '', hidden: '', end: '', count: 0 };
      shown = this.maskView(mask, true);
    } else if (!value) shown = h('span', { class: 'sc-empty', text: t('scEmpty') });
    else if (this.shown)
      shown = h(multiline ? 'pre' : 'code', { class: 'sc-value revealed', part: 'value', text: value, attrs: { id: this.ids.value, tabindex: multiline ? '0' : null } }); // prettier-ignore
    else shown = this.maskView(this.maskedParts(), false);
    return h(
      'div',
      { class: `field-box sc-box${multiline && this.shown ? ' multiline' : ''}` },
      icon('key'),
      shown,
      h('span', { class: 'sc-actions' }, ...this.actions()),
    );
  }

  /**
   * @param {import('./secrets.js').Masked} mask
   * @param {boolean} gone
   * @returns {HTMLElement}
   */
  maskView(mask, gone) {
    const t = this.t;
    const words = [t('scHidden', { count: mask.count + [...mask.start].length + [...mask.end].length })]; // prettier-ignore
    if (mask.start) words.push(t('scStartsWith', { text: mask.start }));
    if (mask.end) words.push(t('scEndsWith', { text: mask.end }));
    const style = parseEnum(this.getAttribute('mask'), /** @type {const} */ (['blur', 'dots']), 'blur'); // prettier-ignore
    const hidden = style === 'dots' ? '•'.repeat(Math.min(24, mask.hidden.length)) : mask.hidden;
    return h(
      'code',
      { class: `sc-value masked mask-${style}${gone ? ' gone' : ''}`, part: 'value', attrs: { id: this.ids.value } }, // prettier-ignore
      h('span', { class: 'sr-only', text: words.join(', ') }),
      h(
        'span',
        { attrs: { 'aria-hidden': 'true' } },
        mask.start,
        h('span', { class: 'sc-blur', text: hidden }),
        mask.count > mask.hidden.length ? '…' : '',
        mask.end,
      ),
    );
  }

  /** @returns {(HTMLElement | null)[]} Reveal, copy, copy as and regenerate. */
  actions() {
    const t = this.t;
    const value = this.value;
    const usable = Boolean(value) && !this.forgotten && !this.disabled;
    const formats = this.formats.filter((f) => f !== 'raw');
    return [
      usable
        ? h('button', { class: 'field-icon-button', attrs: { type: 'button', 'aria-label': t(this.shown ? 'scHide' : 'scShow'), title: t(this.shown ? 'scHide' : 'scShow'), 'aria-pressed': String(this.shown), 'aria-controls': this.ids.value, 'data-focus-key': 'reveal' }, on: { click: () => this.toggle(!this.shown) } }, icon(this.shown ? 'eye-off' : 'eye')) // prettier-ignore
        : null,
      usable
        ? h('button', { class: 'field-icon-button sc-copy', attrs: { type: 'button', 'aria-label': t('scCopy'), title: t('scCopy'), 'data-focus-key': 'copy' }, on: { click: (event) => this.copy('raw', /** @type {HTMLElement} */ (event.currentTarget)) } }, icon('copy')) // prettier-ignore
        : null,
      usable && formats.length ? this.menuView(formats) : null,
      this.flag('rotate') && !this.disabled && !this.editable
        ? h('button', { class: `text-btn sc-rotate${this.confirming ? ' confirming' : ''}`, attrs: { type: 'button', 'data-focus-key': 'rotate' }, on: { click: () => this.rotate() } }, icon('refresh'), h('span', { text: t(this.confirming ? 'scConfirmRegenerate' : 'scRegenerate') })) // prettier-ignore
        : null,
    ];
  }

  /**
   * @param {CopyFormat[]} formats
   * @returns {HTMLElement}
   */
  menuView(formats) {
    const t = this.t;
    const toggle = h(
      'button',
      {
        class: 'field-icon-button sc-more',
        attrs: { type: 'button', 'aria-label': t('scCopyAs'), title: t('scCopyAs'), 'aria-haspopup': 'menu', 'aria-expanded': String(this.menuOpen), 'aria-controls': this.menuOpen ? this.ids.menu : null, 'data-focus-key': 'copy-as' }, // prettier-ignore
        on: {
          click: () => this.openMenu(!this.menuOpen),
          keydown: (event) => {
            if (/** @type {KeyboardEvent} */ (event).key === 'ArrowDown' && !this.menuOpen) {
              event.preventDefault();
              this.openMenu(true);
            }
          },
        },
      },
      icon('chevron-down'),
    );
    const menu = this.menuOpen
      ? h(
          'ul',
          {
            class: 'field-popup sc-menu',
            part: 'menu',
            attrs: { id: this.ids.menu, role: 'menu', 'aria-label': t('scMenu') },
            on: { keydown: (event) => this.menuKey(/** @type {KeyboardEvent} */ (event)) },
          },
          ...formats.map((format, i) =>
            h(
              'li',
              { attrs: { role: 'none' } },
              h(
                'button',
                {
                  class: 'sc-menu-item',
                  attrs: { type: 'button', role: 'menuitem', tabindex: i === 0 ? '0' : '-1', 'data-focus-key': `format-${format}` }, // prettier-ignore
                  on: {
                    click: () => {
                      this.openMenu(false);
                      this.copy(
                        format,
                        /** @type {HTMLElement} */ (this.root.querySelector('.sc-copy')),
                      );
                    },
                  },
                },
                h('span', { text: t(/** @type {StringKey} */ (`scFormat_${format}`)) }),
                h('code', { class: 'sc-sample', text: copyAs('…', format, this.variableName).slice(0, 48) }), // prettier-ignore
              ),
            ),
          ),
        )
      : null;
    return h('span', { class: 'sc-menu-anchor' }, toggle, menu);
  }

  /** @param {boolean} open */
  openMenu(open) {
    this.menuOpen = open;
    this.render();
    if (open) /** @type {HTMLElement | null} */ (this.root.querySelector('.sc-menu-item'))?.focus();
    else /** @type {HTMLElement | null} */ (this.root.querySelector('.sc-more'))?.focus();
  }

  /** @param {KeyboardEvent} event */
  menuKey(event) {
    const items = /** @type {HTMLElement[]} */ ([...this.root.querySelectorAll('.sc-menu-item')]);
    const index = items.indexOf(/** @type {HTMLElement} */ (this.root.activeElement));
    const moves = /** @type {Record<string, number>} */ ({ ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 }); // prettier-ignore
    if (event.key in moves) {
      event.preventDefault();
      const next = (moves[event.key] + items.length) % items.length;
      items.forEach((item, i) => item.setAttribute('tabindex', i === next ? '0' : '-1'));
      items[next]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.openMenu(false);
    } else if (event.key === 'Tab') {
      this.menuOpen = false;
      this.render();
    }
  }

  /** @returns {HTMLElement} The input of an `editable` key. */
  inputView() {
    const t = this.t;
    const input = /** @type {HTMLInputElement} */ (
      h('input', {
        class: 'field-input sc-input',
        part: 'control',
        attrs: {
          id: this.ids.value,
          type: this.shown ? 'text' : 'password',
          placeholder: this.getAttribute('placeholder'),
          required: this.flag('required'),
          disabled: this.disabled,
          autocomplete: 'off',
          autocapitalize: 'off',
          spellcheck: 'false',
          // Password managers would offer to save an API key as a password.
          'data-1p-ignore': '',
          'data-lpignore': 'true',
          'data-bwignore': '',
          'data-form-type': 'other',
          'aria-describedby': [this.getAttribute('hint') ? this.ids.hint : '', this.ids.status, this.ids.error].filter(Boolean).join(' '), // prettier-ignore
          'data-focus-key': 'control',
        },
      })
    );
    input.value = this.value;
    input.addEventListener('input', () => {
      // Keys pasted from a terminal or an email often carry spaces or a line break.
      const clean = input.value.startsWith('-----BEGIN')
        ? input.value
        : input.value.replace(/\s+/g, '');
      this.trimmed = clean !== input.value;
      if (this.trimmed) {
        const at = input.selectionStart ?? clean.length;
        input.value = clean;
        input.setSelectionRange(Math.min(at, clean.length), Math.min(at, clean.length));
      }
      this.secret = input.value;
      this.fresh = false;
      if (this.getAttribute('validate') === 'input') this.showErrors = true;
      this.refreshEditable();
      emit(this, EVENTS.INPUT, { kind: this.kind?.id ?? null, valid: this.valid });
    });
    input.addEventListener('change', () => emit(this, EVENTS.CHANGE, { kind: this.kind?.id ?? null, valid: this.valid })); // prettier-ignore
    input.addEventListener('blur', () => {
      this.showErrors = true;
      this.update();
    });
    return h(
      'div',
      { class: 'field-box sc-box' },
      icon('key'),
      input,
      h(
        'span',
        { class: 'sc-actions' },
        this.value && !this.disabled ? h('button', { class: 'field-icon-button sc-copy', attrs: { type: 'button', 'aria-label': t('scCopy'), title: t('scCopy'), 'data-focus-key': 'copy' }, on: { click: (event) => this.copy('raw', /** @type {HTMLElement} */ (event.currentTarget)) } }, icon('copy')) : null, // prettier-ignore
        this.flag('generate') && !this.disabled ? h('button', { class: 'field-icon-button', attrs: { type: 'button', 'aria-label': t('scGenerate'), title: t('scGenerate'), 'data-focus-key': 'generate' }, on: { click: () => this.generate() } }, icon('refresh')) : null, // prettier-ignore
        h('button', { class: 'field-icon-button', attrs: { type: 'button', 'aria-label': t(this.shown ? 'scHide' : 'scShow'), title: t(this.shown ? 'scHide' : 'scShow'), 'aria-pressed': String(this.shown), 'aria-controls': this.ids.value, disabled: this.disabled, 'data-focus-key': 'reveal' }, on: { click: () => this.toggle(!this.shown) } }, icon(this.shown ? 'eye-off' : 'eye')), // prettier-ignore
      ),
    );
  }

  /** After a key is typed: the badges, notices and messages, without a full render. */
  refreshEditable() {
    const top = this.root.querySelector('.sc-top');
    const badges = this.badges(this.kind);
    top?.querySelector('.sc-badges')?.remove();
    if (badges) top?.append(badges);
    const status = this.root.getElementById(this.ids.status);
    if (status) status.textContent = this.trimmed ? this.t('scWhitespace') : '';
    for (const node of this.root.querySelectorAll('.sc-notice:not(.sc-status)')) node.remove();
    const anchor = this.root.getElementById(this.ids.status);
    for (const notice of this.notices(this.kind).filter((n) => n && !n.classList.contains('sc-status'))) anchor?.before(/** @type {HTMLElement} */ (notice)); // prettier-ignore
    const actions = this.root.querySelector('.sc-actions');
    const copy = actions?.querySelector('.sc-copy');
    if (this.value && !copy && actions) {
      const t = this.t;
      actions.prepend(h('button', { class: 'field-icon-button sc-copy', attrs: { type: 'button', 'aria-label': t('scCopy'), title: t('scCopy'), 'data-focus-key': 'copy' }, on: { click: (event) => this.copy('raw', /** @type {HTMLElement} */ (event.currentTarget)) } }, icon('copy'))); // prettier-ignore
    } else if (!this.value) copy?.remove();
    this.update();
  }

  /**
   * Warnings about the kind of key, its expiry, and notices.
   *
   * @param {import('./secrets.js').Detected | null} kind
   * @returns {(HTMLElement | null)[]}
   */
  notices(kind) {
    const t = this.t;
    /** @type {[string, string][]} */
    const list = [];
    if (this.fresh && !this.forgotten) list.push(['ok', t(this.flag('show-once') ? 'scOnce' : 'scRegenerated')]); // prettier-ignore
    else if (this.flag('show-once') && !this.forgotten && this.value && !this.editable) list.push(['info', t('scOnce')]); // prettier-ignore
    if (this.forgotten) list.push(['info', t('scGone')]);
    if (kind?.env === 'live' && kind.kind !== 'publishable') list.push(['warn', t('scWarnLive')]);
    if (kind?.kind === 'publishable') list.push(['info', t('scWarnPublishable')]);
    if (kind?.kind === 'private-key') list.push(['warn', t('scWarnPrivateKey')]);
    const expiry = this.expiry(kind);
    if (expiry.state === 'expired') list.push(['danger', t('scWarnExpired')]);
    if (expiry.state === 'soon' && expiry.date) list.push(['warn', t('scWarnSoon', { when: this.relative(expiry.date) })]); // prettier-ignore
    return [
      ...list.map(
        ([tone, text]) =>
        h('p', { class: `sc-notice tone-${tone}`, part: 'notice' }, icon(tone === 'ok' ? 'status-success' : tone === 'info' ? 'help' : 'alert'), h('span', { text })), // prettier-ignore
      ),
      this.editable ? h('p', { class: 'sc-notice sc-status', attrs: { id: this.ids.status, 'aria-live': 'polite' } }) : null, // prettier-ignore
    ];
  }

  /**
   * @param {import('./secrets.js').Detected | null} kind
   * @returns {{ date: Date | null, state: 'expired' | 'soon' | 'ok' | null }}
   */
  expiry(kind) {
    let date = readDate(this.getAttribute('expires'));
    if (!date && kind?.id === 'jwt') date = jwtTimes(this.value)?.expires ?? null;
    const warn = parseInteger(this.getAttribute('warn-days'), { min: 0, max: 3650, fallback: 7 });
    return { date, state: expiryState(date, this.now, warn) };
  }

  /**
   * @param {Date} date
   * @returns {string} "in 3 days", "2 months ago"…
   */
  relative(date) {
    const diff = date.getTime() - this.now.getTime();
    const abs = Math.abs(diff);
    /** @type {[Intl.RelativeTimeFormatUnit, number][]} */
    const units = [['year', 365 * DAY], ['month', 30 * DAY], ['week', 7 * DAY], ['day', DAY], ['hour', 3600000], ['minute', 60000]]; // prettier-ignore
    const format = new Intl.RelativeTimeFormat(this.locale, { numeric: 'auto' });
    for (const [unit, size] of units) if (abs >= size || unit === 'minute') return format.format(Math.round(diff / size), unit); // prettier-ignore
    return '';
  }

  /**
   * @param {Date} date
   * @returns {string}
   */
  dateText(date) {
    return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date); // prettier-ignore
  }

  /**
   * Dates, scopes and randomness.
   *
   * @param {import('./secrets.js').Detected | null} kind
   * @returns {HTMLElement | null}
   */
  metaView(kind) {
    const t = this.t;
    const created = readDate(this.getAttribute('created')) ?? (kind?.id === 'jwt' ? (jwtTimes(this.value)?.issued ?? null) : null); // prettier-ignore
    const lastUsedText = this.getAttribute('last-used');
    const lastUsed = readDate(lastUsedText);
    const expiry = this.expiry(kind);
    const scopes = (this.getAttribute('scopes') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50); // prettier-ignore
    const full = this.feature('meta');
    /** @type {[string, (string | Node)[], string?][]} */
    const rows = [];
    if (created) rows.push([t('scCreated'), [h('time', { text: this.dateText(created), attrs: { datetime: created.toISOString() } })]]); // prettier-ignore
    if (expiry.date) rows.push([t(expiry.state === 'expired' ? 'scExpired' : 'scExpires'), [h('time', { text: `${this.dateText(expiry.date)} (${this.relative(expiry.date)})`, attrs: { datetime: expiry.date.toISOString() } })], `expiry-${expiry.state}`]); // prettier-ignore
    if (lastUsed) rows.push([t('scLastUsed'), [h('time', { text: this.relative(lastUsed), attrs: { datetime: lastUsed.toISOString(), title: this.dateText(lastUsed) } })]]); // prettier-ignore
    else if (lastUsedText?.trim().toLowerCase() === 'never') rows.push([t('scLastUsed'), [t('scNeverUsed')]]); // prettier-ignore
    if (scopes.length) rows.push([t('scScopes'), [h('span', { class: 'sc-scopes' }, ...scopes.map((s) => h('code', { class: 'sc-scope', text: s.slice(0, 80) })))]]); // prettier-ignore
    const value = this.value;
    if (full && value && !this.forgotten) {
      const bits = entropyBits(value);
      if (bits) rows.push([t('scEntropy'), [`${t('scBits', { bits: formatNumber(bits, this.locale) })} · ${alphabetOf(value.slice(kind?.prefix ?? 0)).name}`], bits < 64 ? 'weak' : 'strong']); // prettier-ignore
      rows.push([t('scLength'), [t('scChars', { count: formatNumber([...value].length, this.locale) })]]); // prettier-ignore
    }
    if (!rows.length) return null;
    return h(
      'dl',
      { class: 'sc-meta', part: 'meta' },
      ...rows.flatMap(([term, detail, tone]) => [h('dt', { text: term }), h('dd', { class: tone ?? '' }, ...detail)]), // prettier-ignore
    );
  }

  // ---------------------------------------------------------------- actions

  /**
   * Copies the key, or a line made with it, without showing it.
   *
   * @param {CopyFormat} format
   * @param {HTMLElement | null} button
   */
  async copy(format, button) {
    const t = this.t;
    const text = copyAs(this.value, format, this.variableName);
    const ok = await copyText(text, this.root);
    if (button) {
      button.replaceChildren(icon(ok ? 'check' : 'alert'));
      button.classList.toggle('done', ok);
      setTimeout(() => {
        button.replaceChildren(icon('copy'));
        button.classList.remove('done');
      }, 1500);
    }
    const seconds = parseInteger(this.getAttribute('clear-clipboard'), { min: 0, max: 3600, fallback: 0 }); // prettier-ignore
    const said = ok ? (format === 'raw' ? t('scCopied') : t('scCopiedAs', { format: t(/** @type {StringKey} */ (`scFormat_${format}`)) })) : t('scCopyFailed'); // prettier-ignore
    this.announce(ok && seconds ? `${said}. ${t('scClipboardIn', { seconds })}` : said);
    if (!ok) return;
    emit(this, EVENTS.COPY, { format });
    if (seconds) {
      clearTimeout(this.clipboardTimer);
      this.clipboardTimer = setTimeout(async () => {
        try {
          await navigator.clipboard.writeText('');
          this.announce(t('scClipboardCleared'));
        } catch {
          // The page is not focused: the clipboard is left as it is.
        }
      }, seconds * 1000);
    }
  }

  /** First press asks to confirm; the second regenerates, unless the event is cancelled. */
  rotate() {
    if (!this.confirming) {
      this.confirming = true;
      this.render();
      clearTimeout(this.confirmTimer);
      this.confirmTimer = setTimeout(() => {
        this.confirming = false;
        if (this.isConnected) this.render();
      }, 5000);
      return;
    }
    clearTimeout(this.confirmTimer);
    this.confirming = false;
    const kind = this.kind;
    if (!emit(this, EVENTS.ROTATE, { provider: kind?.id ?? null })) {
      this.render();
      return;
    }
    this.generate();
  }

  /** Fills in a random key like the current one, or as `generate-*` asks. */
  generate() {
    const old = this.forgotten ? '' : this.value;
    const kind = detectSecret(old);
    const prefix = this.getAttribute('generate-prefix') ?? (kind ? [...old].slice(0, kind.prefix).join('') : ''); // prettier-ignore
    const rest = kind ? [...old].slice(kind.prefix).join('') : old;
    const length = parseInteger(this.getAttribute('generate-length'), { min: 8, max: 512, fallback: rest.length >= 16 ? rest.length : 40 }); // prettier-ignore
    const known = alphabetOf(rest).name;
    const alphabet = this.getAttribute('generate-alphabet') ?? (rest && ['hex', 'base62', 'base64url', 'base32'].includes(known) ? known : 'base62'); // prettier-ignore
    this.secret = generateSecret({ prefix, length, alphabet });
    this.forgotten = false;
    this.fresh = true;
    this.shown = false;
    this.toggle(true, false);
    this.render();
    /** @type {HTMLElement | null} */ (this.root.querySelector('.sc-copy'))?.focus();
    this.announce(this.t('scRegenerated'));
    emit(this, EVENTS.GENERATE, { length: [...this.secret].length });
    if (this.editable)
      emit(this, EVENTS.CHANGE, { kind: this.kind?.id ?? null, valid: this.valid });
  }

  /** Closes the menu when a press lands outside the element. */
  watchOutside() {
    if (this.outside) return;
    this.outside = (event) => {
      if (!event.composedPath().includes(this)) {
        this.menuOpen = false;
        this.render();
      }
    };
    document.addEventListener('pointerdown', this.outside, true);
  }

  stopOutside() {
    if (!this.outside) return;
    document.removeEventListener('pointerdown', this.outside, true);
    this.outside = null;
  }
}
