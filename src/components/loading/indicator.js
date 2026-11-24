// @ts-check
/**
 * Base class of the loading indicators (`<vt-spinner>`, `<vt-progress>`, `<vt-skeleton>`…).
 *
 * Lighter than `VtBase`: no frame, header or content loading. It brings what every indicator
 * shares, so that each one only draws itself:
 *
 * - themes (`theme`) and the interface language (`lang-ui`), like every Vitrine element;
 * - `size` (`xs`…`xl` or a CSS length), `tone` (accent, neutral, success, warning, danger,
 *   info or the text color) and `speed` (`slow`, `normal`, `fast` or a duration);
 * - `active` with `delay` and `min-duration`: an indicator shown for a short wait only
 *   flashes, so it can wait before appearing and, once shown, stay a minimum time;
 * - `motion`: animations follow `prefers-reduced-motion` unless set to `full` or `reduce`;
 * - `label`: the accessible name, "Loading" in the reader's language by default;
 * - `start()`, `stop()` and the `vt-loading-start` / `vt-loading-end` events.
 *
 * @module components/loading/indicator
 */
import tokensCss from '../../styles/tokens.css?raw';
import indicatorCss from '../../styles/indicator.css?raw';
import { cleanLabel, parseBoolean, parseCssLength, parseEnum } from '../../core/attributes.js';
import { sheet } from '../../core/base-element.js';
import { getConfig } from '../../core/config.js';
import { h } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { defineStrings, onLocaleChange, translator } from '../../core/i18n.js';
import { onThemeChange, resolveTheme, themeSheet } from '../../core/themes.js';
import { en as strings, fr as stringsFr } from './strings.js';

defineStrings({ en: strings, fr: stringsFr });

/** @typedef {import('../../core/i18n.js').StringKey} StringKey */

export const SIZES = Object.freeze({ xs: '12px', sm: '16px', md: '24px', lg: '36px', xl: '56px' });
export const TONES = /** @type {const} */ ([
  'accent', 'neutral', 'success', 'warning', 'danger', 'info', 'current',
]); // prettier-ignore
export const SPEEDS = Object.freeze({ slow: 1.6, normal: 1, fast: 0.6 });
const MOTIONS = /** @type {const} */ (['auto', 'full', 'reduce']);

/** Attributes every indicator observes. */
export const INDICATOR_ATTRIBUTES = Object.freeze([
  'theme', 'lang-ui', 'label', 'size', 'tone', 'speed', 'motion', 'active', 'delay',
  'min-duration',
]); // prettier-ignore

/**
 * A duration attribute: milliseconds (`300`), or with a unit (`300ms`, `1.5s`).
 *
 * @param {string | null} value
 * @param {number} fallback
 * @param {number} [max=600000]
 * @returns {number}
 */
export function parseDuration(value, fallback, max = 600000) {
  const match = /^\s*(\d{1,7}(?:\.\d{1,3})?)\s*(ms|s)?\s*$/i.exec(value ?? '');
  if (!match) return fallback;
  const ms = Number(match[1]) * (match[2]?.toLowerCase() === 's' ? 1000 : 1);
  return Math.min(ms, max);
}

/**
 * The nodes given, without the `null` ones: for `replaceChildren()`.
 *
 * @param {(Node | string | null | undefined | false)[]} items
 * @returns {(Node | string)[]}
 */
export function compact(items) {
  return /** @type {(Node | string)[]} */ (items.filter((item) => item !== null && item !== undefined && item !== false)); // prettier-ignore
}

/**
 * A number attribute, or `null` when it is missing or not a finite number.
 *
 * @param {string | null} value
 * @returns {number | null}
 */
export function parseNumber(value) {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export class VtIndicator extends HTMLElement {
  /** Name given in `vt-ready`-like events. */
  static type = 'indicator';

  /** @type {string[]} Attributes of the indicator, besides the shared ones. */
  static componentAttributes = [];

  /** @type {string[]} Stylesheets of the indicator. */
  static styles = [];

  /** Default `size` when none is set. */
  static defaultSize = 'md';

  /** `display` of the host: `inline-block` for small indicators, `block` for wide ones. */
  static display = 'inline-block';

  static get observedAttributes() {
    return [...INDICATOR_ATTRIBUTES, ...this.componentAttributes];
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const ctor = /** @type {typeof VtIndicator} */ (this.constructor);
    this.root.adoptedStyleSheets = [sheet(tokensCss), themeSheet, sheet(indicatorCss), ...ctor.styles.map(sheet)]; // prettier-ignore
    this.frame = h('div', { class: `vt indicator ${ctor.display}`, part: 'indicator' });
    this.root.append(this.frame);
    this.t = translator('en');
    /** Shown on screen right now (after `delay`, until `min-duration` has passed). */
    this.shown = false;
    /** @type {boolean | null} Set by `start()` / `stop()`; `null` follows `active`. */
    this.activeState = null;
    this.shownAt = 0;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.showTimer = undefined;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.hideTimer = undefined;
    /** @type {(() => void)[]} */
    this.cleanups = [];
    this.renderQueued = false;
    /** `vt-ready` was fired (once, at the first connection). */
    this.readyFired = false;
  }

  connectedCallback() {
    for (const name of ['active', 'value', 'max', 'steps', 'messages', 'content']) this.upgradeProperty(name); // prettier-ignore
    this.cleanups.push(
      onThemeChange(() => this.applyTheme()),
      onLocaleChange(() => this.requestRender()),
    );
    this.render();
    this.syncActive(true);
    if (!this.readyFired) {
      this.readyFired = true;
      emit(this, EVENTS.READY, { type: /** @type {typeof VtIndicator} */ (this.constructor).type });
    }
  }

  disconnectedCallback() {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.stopped();
  }

  /**
   * A property set before the element was defined shadows the class accessor: move it.
   *
   * @param {string} name
   */
  upgradeProperty(name) {
    if (Object.prototype.hasOwnProperty.call(this, name)) {
      const value = /** @type {any} */ (this)[name];
      delete (/** @type {any} */ (this)[name]);
      /** @type {any} */ (this)[name] = value;
    }
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.isConnected) return;
    if (name === 'active') {
      this.activeState = null;
      this.syncActive(false);
    } else if (name === 'theme') this.applyTheme();
    else this.requestRender();
  }

  // ---------------------------------------------------------------- state

  /** Whether the indicator is active (asked to show), shown or still waiting for its delay. */
  get active() {
    return this.activeState ?? parseBoolean(this.getAttribute('active')) ?? true;
  }

  set active(value) {
    this.activeState = Boolean(value);
    this.syncActive(false);
  }

  /** Shows the indicator (after `delay`). */
  start() {
    this.active = true;
  }

  /** Hides the indicator (once `min-duration` has passed). */
  stop() {
    this.active = false;
  }

  /**
   * Shows or hides the indicator to match `active`, honoring `delay` and `min-duration`.
   *
   * @param {boolean} first - Connection: an indicator active from the start shows at once
   *   unless it has a delay.
   */
  syncActive(first) {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    if (this.active) {
      if (this.shown) return;
      const delay = parseDuration(this.getAttribute('delay'), 0);
      if (delay > 0) this.showTimer = setTimeout(() => this.setShown(true), delay);
      else this.setShown(true, first);
      if (delay > 0) this.render();
      return;
    }
    if (!this.shown) {
      this.render();
      return;
    }
    const min = parseDuration(this.getAttribute('min-duration'), 0);
    const left = this.shownAt + min - performance.now();
    if (left > 0) this.hideTimer = setTimeout(() => this.setShown(false), left);
    else this.setShown(false);
  }

  /**
   * @param {boolean} shown
   * @param {boolean} [quiet] - No event (an indicator shown as it connects).
   */
  setShown(shown, quiet = false) {
    if (this.shown === shown) return;
    this.shown = shown;
    const ctor = /** @type {typeof VtIndicator} */ (this.constructor);
    if (shown) {
      this.shownAt = performance.now();
      this.started();
      if (!quiet) emit(this, EVENTS.LOADING_START, { type: ctor.type });
    } else {
      this.stopped();
      emit(this, EVENTS.LOADING_END, { type: ctor.type, duration: Math.round(performance.now() - this.shownAt) }); // prettier-ignore
    }
    this.render();
  }

  /** Called when the indicator appears (timers of subclasses). */
  started() {}

  /** Called when the indicator disappears or is removed. */
  stopped() {}

  // ---------------------------------------------------------------- rendering

  get locale() {
    const value = this.getAttribute('lang-ui')?.trim();
    return value && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value) ? value : getConfig().lang;
  }

  /** The accessible name: `label`, or the given default in the reader's language. */
  labelText(fallback = /** @type {StringKey} */ ('loadingLabel')) {
    return cleanLabel(this.getAttribute('label')) || this.t(fallback);
  }

  /** Whether animations should run. */
  get motion() {
    const value = parseEnum(this.getAttribute('motion'), MOTIONS, 'auto');
    if (value !== 'auto') return value;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; // prettier-ignore
    return reduce ? 'reduce' : 'full';
  }

  requestRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      if (this.isConnected) this.render();
    });
  }

  applyTheme() {
    this.frame.dataset.theme = resolveTheme(this.getAttribute('theme'));
  }

  /** Sets the shared custom properties, then lets the indicator draw itself. */
  render() {
    const ctor = /** @type {typeof VtIndicator} */ (this.constructor);
    this.t = translator(this.locale);
    this.applyTheme();
    const style = this.frame.style;
    const sizeName = this.getAttribute('size')?.trim().toLowerCase() ?? '';
    const size = /** @type {Record<string, string>} */ (SIZES)[sizeName] ?? parseCssLength(this.getAttribute('size')) ?? SIZES[/** @type {keyof typeof SIZES} */ (ctor.defaultSize)]; // prettier-ignore
    style.setProperty('--_size', size);
    const speedName = this.getAttribute('speed')?.trim().toLowerCase() ?? '';
    const factor = /** @type {Record<string, number>} */ (SPEEDS)[speedName];
    const speed = factor ?? (this.hasAttribute('speed') ? parseDuration(this.getAttribute('speed'), 1000, 60000) / 1000 : 1); // prettier-ignore
    style.setProperty('--_speed', String(speed));
    this.frame.dataset.tone = parseEnum(this.getAttribute('tone'), TONES, 'accent');
    this.frame.dataset.motion = this.motion;
    this.frame.dataset.shown = String(this.shown);
    this.toggleAttribute('data-shown', this.shown);
    this.draw(this.frame);
  }

  /**
   * Draws the indicator. Implemented by subclasses.
   *
   * @param {HTMLElement} frame
   */
  // eslint-disable-next-line no-unused-vars
  draw(frame) {}
}
