// @ts-check
import consentCss from '../../styles/consent.css?raw';
import { cleanLabel, parseBoolean, parseEnum, parseInteger } from '../../core/attributes.js';
import { VtBase } from '../../core/base-element.js';
import { isObject, safeLink } from '../../core/data.js';
import { jsonText } from '../../core/data-input.js';
import { h, uid } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import {
  activate,
  choose,
  consentModeOf,
  cookieValue,
  makeChoice,
  readChoice,
  readSettings,
} from './consent.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('./consent.js').Settings} Settings */
/** @typedef {import('./consent.js').Category} Category */
/** @typedef {import('./consent.js').Choice} Choice */
/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

const POSITIONS = /** @type {const} */ (['bottom', 'top', 'inline']);

/**
 * A cookie consent banner, as data protection authorities ask for it: refusing is as easy as
 * accepting (two buttons side by side, same look), nothing but necessary cookies before a
 * choice, categories to choose one by one, the choice kept with its date and version and asked
 * again when it expires or the settings change, and a way back to change it at any time.
 *
 * It holds back the page's scripts and frames until their category is accepted
 * (`<script type="text/plain" data-consent="analytics">`, `<iframe data-consent="marketing"
 * data-src="…">`), sends Google Consent Mode v2 updates, follows Global Privacy Control, can
 * write a cookie the server reads and send each choice to a log.
 *
 * @element vt-consent
 * @since 0.16.0
 *
 * @attr {string} categories - Built-in categories offered, separated by commas: `preferences`, `analytics`, `marketing` (default: all). JSON content gives your own.
 * @attr {string} policy - Address of the privacy policy.
 * @attr {string} version - Version of the settings: a new one asks again.
 * @attr {number} expires - Days after which the choice is asked again (default 180).
 * @attr {"bottom"|"top"|"inline"} position - Where the banner is; `inline` shows the settings in the page, for a privacy page.
 * @attr {string} storage-key - Key of `localStorage` (default `vitrine-consent`).
 * @attr {string} cookie - Name of a cookie that also holds the choice, for the server: accepted categories separated by dots.
 * @attr {boolean} consent-mode - Sends `gtag('consent', 'update', …)` with each choice.
 * @attr {boolean} gpc - Follows Global Privacy Control: refuses without asking (default on).
 * @attr {string} log-url - Address the choice is sent to (`sendBeacon`), as a record of consent.
 * @attr {boolean} reopen - A button to change the choice after it is made (default on).
 *
 * @prop {Record<string, boolean>} consent - The choice: on or off for each category; `{}` before a choice.
 * @prop {Choice | null} choice - The choice with its id, date, version and source (read-only).
 * @prop {Settings} settings - The categories and texts (read-only).
 *
 * @fires vt-consent - A choice was made, or read back on load. Detail: `{ categories, action, id }`, `action` being `accept`, `reject`, `save`, `gpc` or `restore`.
 *
 * @csspart banner - The banner.
 * @csspart dialog - The settings dialog.
 * @csspart category - A category.
 * @csspart button - A button.
 * @csspart reopen - The button that changes the choice.
 *
 * @example
 * <vt-consent policy="/privacy" version="2026-11" consent-mode></vt-consent>
 * <script type="text/plain" data-consent="analytics" src="https://stats.example.com/script.js"></script>
 */
export class VtConsent extends VtBase {
  static type = 'consent';

  static allowEmpty = true;

  static componentAttributes = Object.freeze([
    'categories', 'policy', 'version', 'expires', 'position', 'storage-key', 'cookie',
    'consent-mode', 'gpc', 'log-url', 'reopen',
  ]); // prettier-ignore

  static presets = { simple: {}, full: {} };

  static styles = [consentCss];

  /**
   * Settings: `{ categories: [{ id, label, description, required, consentMode, cookies }], title, text, policy, version }`.
   *
   * @param {unknown} value
   * @returns {import('../../core/data-input.js').DataResult}
   */
  static fromData(value) {
    return { content: isObject(value) || Array.isArray(value) ? jsonText(value) : '' };
  }

  constructor() {
    super();
    this.ids = { title: uid('consent'), text: uid('text'), dialog: uid('settings'), dialogTitle: uid('title') }; // prettier-ignore
    /** @type {Choice | null} */
    this.choice = null;
    this.ready = false;
    this.dialogOpen = false;
    /** @type {Record<string, boolean>} Switches of the dialog, before saving. */
    this.draft = {};
    this.justSaved = false;
    /** @type {((event: Event) => void) | null} */
    this.onDocumentClick = null;
    /** @type {((event: Event) => void) | null} */
    this.onSync = null;
    /** @type {((event: StorageEvent) => void) | null} */
    this.onStorage = null;
  }

  // ---------------------------------------------------------------- settings

  /** @returns {Settings} */
  get settings() {
    /** @type {unknown} */
    let value;
    try {
      value = this.text?.trim() ? JSON.parse(this.text) : null;
    } catch {
      value = null;
    }
    const ids = (this.getAttribute('categories') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean); // prettier-ignore
    return readSettings(value, ids.length ? ['necessary', ...ids] : []);
  }

  /** @returns {string} */
  get version() {
    return (this.getAttribute('version') ?? '').trim().slice(0, 40) || this.settings.version || '1';
  }

  /** @returns {string} */
  get storageKey() {
    const key = (this.getAttribute('storage-key') ?? '').trim();
    return /^[\w.:-]{1,80}$/.test(key) ? key : 'vitrine-consent';
  }

  /** @returns {'bottom' | 'top' | 'inline'} */
  get position() {
    return parseEnum(this.getAttribute('position'), POSITIONS, 'bottom');
  }

  /** @returns {boolean} Global Privacy Control is on and followed. */
  get gpc() {
    return parseBoolean(this.getAttribute('gpc')) !== false && /** @type {any} */ (navigator).globalPrivacyControl === true; // prettier-ignore
  }

  /** @returns {Record<string, boolean>} */
  get consent() {
    return this.choice ? { ...this.choice.categories } : {};
  }

  /**
   * @param {string} id
   * @returns {boolean} Whether a category is accepted.
   */
  has(id) {
    return this.choice?.categories[id] === true;
  }

  /**
   * @param {Category} category
   * @returns {string}
   */
  label(category) {
    return category.label || (this.knownCategory(category.id) ? this.t(/** @type {StringKey} */ (`csCat_${category.id}`)) : category.id); // prettier-ignore
  }

  /**
   * @param {Category} category
   * @returns {string}
   */
  description(category) {
    return category.description || (this.knownCategory(category.id) ? this.t(/** @type {StringKey} */ (`csCatText_${category.id}`)) : ''); // prettier-ignore
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  knownCategory(id) {
    return ['necessary', 'preferences', 'analytics', 'marketing'].includes(id);
  }

  // ---------------------------------------------------------------- lifecycle

  connectedCallback() {
    super.connectedCallback();
    this.onDocumentClick = (event) => {
      const opener = event.composedPath().find((node) => node instanceof Element && node.hasAttribute('data-consent-open')); // prettier-ignore
      if (!opener) return;
      event.preventDefault();
      this.show();
    };
    document.addEventListener('click', this.onDocumentClick);
    // Another <vt-consent> of the page, or another tab, made a choice.
    this.onSync = (event) => {
      if (event.target !== this && /** @type {CustomEvent} */ (event).detail?.action !== 'restore') this.restore(false); // prettier-ignore
    };
    document.addEventListener(EVENTS.CONSENT, this.onSync);
    this.onStorage = (event) => {
      if (event.key === this.storageKey) this.restore(false);
    };
    window.addEventListener('storage', this.onStorage);
    if (!this.ready) {
      this.ready = true;
      queueMicrotask(() => this.restore(true));
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.onDocumentClick) document.removeEventListener('click', this.onDocumentClick);
    if (this.onSync) document.removeEventListener(EVENTS.CONSENT, this.onSync);
    if (this.onStorage) window.removeEventListener('storage', this.onStorage);
  }

  /**
   * Reads the stored choice and applies it; with Global Privacy Control and no choice,
   * refuses without asking.
   *
   * @param {boolean} first - The first time: the choice is applied and announced.
   */
  restore(first) {
    const settings = this.settings;
    /** @type {string | null} */
    let raw;
    try {
      raw = localStorage.getItem(this.storageKey);
    } catch {
      raw = null;
    }
    const days = parseInteger(this.getAttribute('expires'), { min: 1, max: 3650, fallback: 180 });
    const choice = readChoice(raw, settings, { version: this.version, days, now: Date.now() });
    if (choice) {
      this.choice = choice;
      if (first) this.apply(choice, 'restore');
    } else if (first && this.gpc) {
      this.commit(choose(settings, false), 'gpc');
      return;
    } else this.choice = null;
    if (this.isConnected) this.render();
  }

  /**
   * Stores a new choice, applies it and tells the page.
   *
   * @param {Record<string, boolean>} categories
   * @param {Choice['source']} source
   */
  commit(categories, source) {
    const choice = makeChoice(categories, source, this.version, Date.now());
    this.choice = choice;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(choice));
    } catch {
      // Storage refused: the choice holds for this page only.
    }
    this.writeCookie(choice);
    this.sendLog(choice);
    this.dialogOpen = false;
    this.justSaved = true;
    this.apply(choice, source);
    if (this.isConnected) this.render();
    this.announce(this.t('csSaved'));
    // The focus goes back where it can stay: the button to change the choice.
    /** @type {HTMLElement | null} */ (this.root.querySelector('[data-focus-key="reopen"], [data-focus-key="save"]'))?.focus({ preventScroll: true }); // prettier-ignore
  }

  /**
   * @param {Choice} choice
   * @param {Choice['source'] | 'restore'} action
   */
  apply(choice, action) {
    activate(document, choice.categories);
    if (parseBoolean(this.getAttribute('consent-mode')) === true) {
      const update = consentModeOf(this.settings, choice.categories);
      const w = /** @type {any} */ (window);
      if (typeof w.gtag === 'function') w.gtag('consent', 'update', update);
      else {
        w.dataLayer = w.dataLayer || [];
        // gtag.js reads the arguments object of its own function, not an array.
        /** @param {...unknown} _args */
        // eslint-disable-next-line no-unused-vars -- the arguments object is what is pushed
        const gtag = function (..._args) {
          w.dataLayer.push(arguments);
        };
        gtag('consent', 'update', update);
      }
    }
    emit(this, EVENTS.CONSENT, { categories: { ...choice.categories }, action, id: choice.id });
  }

  /** @param {Choice} choice */
  writeCookie(choice) {
    const name = (this.getAttribute('cookie') ?? '').trim();
    if (!/^[\w-]{1,64}$/.test(name)) return;
    const days = parseInteger(this.getAttribute('expires'), { min: 1, max: 3650, fallback: 180 });
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(cookieValue(choice.categories))}; Max-Age=${days * 86400}; Path=/; SameSite=Lax${secure}`; // prettier-ignore
  }

  /** @param {Choice} choice */
  sendLog(choice) {
    const url = safeLink(this.getAttribute('log-url'));
    if (!url || !/^(https:|\/)/.test(url)) return;
    const body = JSON.stringify({ ...choice, page: location.origin + location.pathname, userAgent: navigator.userAgent }); // prettier-ignore
    try {
      if (!navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' })))
        fetch(url, { method: 'POST', body, keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }).catch(() => {}); // prettier-ignore
    } catch {
      // A log that cannot be sent does not change the choice.
    }
  }

  // ---------------------------------------------------------------- API

  /** Opens the settings. */
  show() {
    this.draft = this.choice ? { ...this.choice.categories } : choose(this.settings, false);
    this.dialogOpen = true;
    this.justSaved = false;
    this.render();
  }

  /** @param {string[]} [ids] - Categories to accept; default: all. */
  accept(ids) {
    const settings = this.settings;
    this.commit(
      choose(settings, (c) => !ids || ids.includes(c.id)),
      ids ? 'save' : 'accept',
    );
  }

  reject() {
    this.commit(choose(this.settings, false), 'reject');
  }

  /** Forgets the choice and asks again. Scripts already run stay run: reload the page. */
  reset() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Nothing stored.
    }
    const name = (this.getAttribute('cookie') ?? '').trim();
    if (/^[\w-]{1,64}$/.test(name)) document.cookie = `${name}=; Max-Age=0; Path=/`;
    this.choice = null;
    this.render();
  }

  // ---------------------------------------------------------------- rendering

  /**
   * @param {HTMLElement} frame
   */
  renderContent(frame) {
    const inline = this.position === 'inline';
    frame.classList.toggle('cs-inline', inline);
    if (inline) {
      if (!this.dialogOpen) this.draft = this.choice ? { ...this.choice.categories } : choose(this.settings, false); // prettier-ignore
      frame.append(this.settingsView(false));
      return;
    }
    if (!this.ready) return;
    if (!this.choice) frame.append(this.bannerView());
    else if (parseBoolean(this.getAttribute('reopen')) !== false) frame.append(this.reopenView());
    if (this.dialogOpen) {
      const dialog = /** @type {HTMLDialogElement} */ (h('dialog', { class: 'cs-dialog', part: 'dialog', attrs: { 'aria-labelledby': this.ids.dialogTitle } }, this.settingsView(true))); // prettier-ignore
      dialog.addEventListener('close', () => {
        if (!this.dialogOpen) return;
        this.dialogOpen = false;
        this.render();
        /** @type {HTMLElement | null} */ (this.root.querySelector('[data-focus-key="reopen"], [data-focus-key="customize"]'))?.focus(); // prettier-ignore
      });
      frame.append(dialog);
      try {
        if (!dialog.open) dialog.showModal();
      } catch {
        dialog.setAttribute('open', '');
      }
    }
  }

  /**
   * @param {string} key
   * @param {string} label
   * @param {() => void} action
   * @param {string} [kind]
   * @returns {HTMLElement}
   */
  button(key, label, action, kind = '') {
    return h('button', { class: `cs-button ${kind}`, part: 'button', text: label, attrs: { type: 'button', 'data-focus-key': key }, on: { click: action } }); // prettier-ignore
  }

  /** @returns {HTMLElement} Title, text, policy and the three buttons. */
  bannerView() {
    const t = this.t;
    const settings = this.settings;
    const policy = safeLink(this.getAttribute('policy')) ?? settings.policy;
    return h(
      'section',
      { class: `cs-banner ${this.position}`, part: 'banner', attrs: { 'aria-labelledby': this.ids.title, 'aria-describedby': this.ids.text } }, // prettier-ignore
      h('h2', { class: 'cs-title', text: settings.title || cleanLabel(this.getAttribute('label'), 200) || t('csTitle'), attrs: { id: this.ids.title } }), // prettier-ignore
      h(
        'p',
        { class: 'cs-text', attrs: { id: this.ids.text } },
        settings.text || t('csText'),
        policy ? ' ' : null,
        policy
          ? h('a', { class: 'cs-policy', text: t('csPolicy'), attrs: { href: policy } })
          : null,
      ),
      // Refusing is as easy as accepting: same buttons, side by side.
      h(
        'div',
        { class: 'cs-actions' },
        this.button('customize', t('csCustomize'), () => this.show(), 'quiet'),
        this.button('reject', t('csReject'), () => this.reject()),
        this.button('accept', t('csAccept'), () => this.accept()),
      ),
    );
  }

  /** @returns {HTMLElement} */
  reopenView() {
    const label = this.t('csSettings');
    return h('button', { class: `cs-reopen ${this.position}`, part: 'reopen', attrs: { type: 'button', 'aria-label': label, title: label, 'data-focus-key': 'reopen' }, on: { click: () => this.show() } }, icon('shield-check')); // prettier-ignore
  }

  /**
   * The categories with their switches, and the buttons.
   *
   * @param {boolean} inDialog
   * @returns {HTMLElement}
   */
  settingsView(inDialog) {
    const t = this.t;
    const settings = this.settings;
    const policy = safeLink(this.getAttribute('policy')) ?? settings.policy;
    const status = this.choice
      ? t('csLastChanged', { date: new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(this.choice.date)) }) // prettier-ignore
      : t('csNoChoice');
    return h(
      'div',
      { class: 'cs-settings' },
      h(
        'div',
        { class: 'cs-settings-head' },
        h('h2', { class: 'cs-title', text: t('csSettings'), attrs: { id: this.ids.dialogTitle } }),
        inDialog
          ? h('button', { class: 'cs-close', attrs: { type: 'button', 'aria-label': t('csClose'), title: t('csClose'), 'data-focus-key': 'close' }, on: { click: () => /** @type {HTMLDialogElement | null} */ (this.root.querySelector('dialog'))?.close() } }, icon('close')) // prettier-ignore
          : null,
      ),
      h('p', { class: 'cs-status', attrs: { 'aria-live': 'polite' }, text: this.justSaved && !inDialog ? t('csSaved') : status }), // prettier-ignore
      this.gpc ? h('p', { class: 'cs-gpc' }, icon('shield-check'), h('span', { text: t('csGpc') })) : null, // prettier-ignore
      h('ul', { class: 'cs-categories' }, ...settings.categories.map((c) => this.categoryView(c))),
      policy ? h('a', { class: 'cs-policy', text: t('csPolicy'), attrs: { href: policy } }) : null,
      h(
        'div',
        { class: 'cs-actions' },
        this.button('reject-all', t('csReject'), () => this.reject()),
        this.button('save', t('csSave'), () => this.commit(choose(settings, (c) => this.draft[c.id] === true), 'save'), 'quiet'), // prettier-ignore
        this.button('accept-all', t('csAccept'), () => this.accept()),
      ),
    );
  }

  /**
   * @param {Category} category
   * @returns {HTMLElement}
   */
  categoryView(category) {
    const t = this.t;
    const id = `${this.ids.dialog}-${category.id}`;
    const describe = `${id}-text`;
    const input = h('input', {
      class: 'cs-switch-input',
      attrs: {
        id,
        type: 'checkbox',
        role: 'switch',
        checked: category.required || this.draft[category.id] === true,
        disabled: category.required,
        'aria-describedby': describe,
        'data-focus-key': `category-${category.id}`,
      },
      on: {
        change: (event) => {
          this.draft = { ...this.draft, [category.id]: /** @type {HTMLInputElement} */ (event.target).checked }; // prettier-ignore
        },
      },
    });
    return h(
      'li',
      { class: 'cs-category', part: 'category' },
      h(
        'div',
        { class: 'cs-category-head' },
        h('label', { class: 'cs-category-label', attrs: { for: id } }, h('span', { text: this.label(category) })), // prettier-ignore
        category.required ? h('span', { class: 'cs-always', text: t('csAlwaysOn') }) : null,
        h('span', { class: 'cs-switch' }, input, h('span', { class: 'cs-switch-track', attrs: { 'aria-hidden': 'true' } })), // prettier-ignore
      ),
      h('p', { class: 'cs-category-text', text: this.description(category), attrs: { id: describe } }), // prettier-ignore
      category.cookies.length ? this.cookiesView(category) : null,
    );
  }

  /**
   * @param {Category} category
   * @returns {HTMLElement}
   */
  cookiesView(category) {
    const t = this.t;
    return h(
      'details',
      { class: 'cs-cookies' },
      h('summary', { text: t('csCookies', { count: category.cookies.length }), attrs: { 'data-focus-key': `cookies-${category.id}` } }), // prettier-ignore
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, ...['csCookieName', 'csCookieProvider', 'csCookiePurpose', 'csCookieDuration'].map((k) => h('th', { text: t(/** @type {StringKey} */ (k)), attrs: { scope: 'col' } })))), // prettier-ignore
        h('tbody', {}, ...category.cookies.map((c) => h('tr', {}, h('td', {}, h('code', { text: c.name })), h('td', { text: c.provider }), h('td', { text: c.purpose }), h('td', { text: c.duration })))), // prettier-ignore
      ),
    );
  }
}
