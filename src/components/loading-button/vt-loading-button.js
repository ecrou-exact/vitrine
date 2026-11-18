// @ts-check
import spinnerCss from '../../styles/spinner.css?raw';
import buttonCss from '../../styles/loading-button.css?raw';
import { cleanLabel, parseBoolean, parseEnum } from '../../core/attributes.js';
import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { VtIndicator, parseDuration } from '../loading/indicator.js';
import { SPINNER_TYPES, spinnerShape } from '../loading/shapes.js';

const VARIANTS = /** @type {const} */ (['primary', 'secondary', 'ghost', 'danger']);
const PLACES = /** @type {const} */ (['start', 'end', 'replace']);
const TYPES = /** @type {const} */ (['button', 'submit', 'reset']);

/**
 * A button that shows its own wait: while `loading` (or while the promise given to
 * `track()` runs) it shows a spinner, says what it does ("Saving…"), ignores clicks and is
 * marked busy, then can say "Saved" or "Failed" for a moment. Keeps its width so the
 * layout does not jump. Submits its form like a native button.
 *
 * @element vt-loading-button
 * @since 0.15.0
 *
 * @attr {boolean} loading - Waiting: spinner shown, clicks ignored.
 * @attr {string} loading-text - Text while loading (`Saving…`). Default: the button text.
 * @attr {string} success-text - Text after a tracked promise resolves (`Saved`).
 * @attr {string} error-text - Text after a tracked promise rejects (`Failed`).
 * @attr {string} reset-after - Time the success or error text stays. Default: `2s`.
 * @attr {"ring"|"arc"|"dual-ring"|"dots"|"bars"|"pulse"|"orbit"} spinner - Spinner shape. Default: `ring`.
 * @attr {"start"|"end"|"replace"} spinner-position - Before the text (default), after it, or instead of it.
 * @attr {"primary"|"secondary"|"ghost"|"danger"} variant - Look of the button. Default: `primary`.
 * @attr {"button"|"submit"|"reset"} type - What the button does in a form. Default: `button`.
 * @attr {boolean} disabled - Disabled.
 * @attr {boolean} block - Takes the full width.
 * @attr {string} size - Size of the spinner: `xs`…`xl` or a CSS length. Default: `sm`.
 * @attr {string} label - Accessible name of a button without visible text (an icon only).
 * @attr {"auto"|"full"|"reduce"} motion - Animation: follows the reader's reduced-motion setting by default.
 *
 * @prop {boolean} loading - Waiting or not.
 *
 * @fires vt-loading-start - Loading started. Detail: `{ type: "loading-button" }`.
 * @fires vt-loading-end - Loading ended. Detail: `{ type: "loading-button", duration }`.
 *
 * @slot - The button text (and icon).
 *
 * @csspart button - The native button.
 * @csspart spinner - The spinner.
 * @csspart text - The text shown while loading, or after it.
 *
 * @example
 * <vt-loading-button loading-text="Saving…" success-text="Saved" id="save">Save</vt-loading-button>
 * <script>save.addEventListener('click', () => save.track(fetch('/save', { method: 'POST' })));</script>
 */
export class VtLoadingButton extends VtIndicator {
  static type = 'loading-button';

  static componentAttributes = ['loading', 'loading-text', 'success-text', 'error-text', 'reset-after', 'spinner', 'spinner-position', 'variant', 'type', 'disabled', 'block']; // prettier-ignore

  static styles = [spinnerCss, buttonCss];

  static defaultSize = 'sm';

  constructor() {
    super();
    /** @type {"success" | "error" | null} Outcome shown after `track()`. */
    this.outcome = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.outcomeTimer = undefined;
    this.button = h('button', { class: 'button', part: 'button', attrs: { type: 'button' } });
    this.button.addEventListener('click', (event) => {
      if (this.active || this.isDisabled) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const type = parseEnum(this.getAttribute('type'), TYPES, 'button');
      const form = this.closest('form');
      if (form && type === 'submit') form.requestSubmit();
      else if (form && type === 'reset') form.reset();
    });
    // Clicks on the host while loading or disabled never reach page listeners.
    this.addEventListener('click', (event) => {
      if (this.active || this.isDisabled) event.stopImmediatePropagation();
    }, true); // prettier-ignore
  }

  get isDisabled() {
    return parseBoolean(this.getAttribute('disabled')) ?? false;
  }

  /** Loading follows `loading` (or `active`); off by default. */
  get active() {
    return this.activeState ?? parseBoolean(this.getAttribute('loading') ?? this.getAttribute('active')) ?? false; // prettier-ignore
  }

  set active(value) {
    super.active = value;
  }

  get loading() {
    return this.active;
  }

  set loading(value) {
    this.active = Boolean(value);
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback(name === 'loading' ? 'active' : name, oldValue, newValue);
  }

  /**
   * Shows the wait while `promise` runs, then the success or error text. Returns the
   * promise, so `await button.track(save())` works.
   *
   * @template T
   * @param {Promise<T>} promise
   * @returns {Promise<T>}
   */
  track(promise) {
    clearTimeout(this.outcomeTimer);
    this.outcome = null;
    this.loading = true;
    const settle = (/** @type {"success" | "error"} */ outcome) => {
      this.loading = false;
      const text = this.getAttribute(`${outcome}-text`);
      if (!text) return;
      this.outcome = outcome;
      this.render();
      this.outcomeTimer = setTimeout(
        () => {
          this.outcome = null;
          this.render();
        },
        parseDuration(this.getAttribute('reset-after'), 2000),
      );
    };
    promise.then(
      () => settle('success'),
      () => settle('error'),
    );
    return promise;
  }

  focus() {
    this.button.focus();
  }

  disconnectedCallback() {
    clearTimeout(this.outcomeTimer);
    super.disconnectedCallback();
  }

  /** @param {HTMLElement} frame */
  draw(frame) {
    const loading = this.active;
    const shown = this.shown;
    const variant = parseEnum(this.getAttribute('variant'), VARIANTS, 'primary');
    const place = parseEnum(this.getAttribute('spinner-position'), PLACES, 'start');
    frame.dataset.variant = variant;
    frame.dataset.place = place;
    frame.dataset.outcome = this.outcome ?? '';
    frame.classList.toggle('block', parseBoolean(this.getAttribute('block')) ?? false);
    frame.classList.toggle('loading', shown);
    const button = this.button;
    button.disabled = this.isDisabled;
    button.setAttribute('aria-busy', String(loading));
    // aria-disabled, not disabled: the button keeps focus while it waits.
    if (loading) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
    const label = cleanLabel(this.getAttribute('label'));

    const slot = h('slot', {});
    const loadingText = cleanLabel(this.getAttribute('loading-text'), 80);
    const outcomeText = this.outcome
      ? cleanLabel(this.getAttribute(`${this.outcome}-text`), 80)
      : '';
    const type = parseEnum(this.getAttribute('spinner'), SPINNER_TYPES, 'ring');
    /** @type {(Element | null)[]} */
    let parts;
    if (shown) {
      const spinner = spinnerShape(type);
      const text = place === 'replace' ? null : loadingText ? h('span', { class: 'text', part: 'text', text: loadingText }) : h('span', { class: 'text' }, slot); // prettier-ignore
      // With `replace`, the label stays in place (hidden) so the width does not change.
      const ghost = place === 'replace' ? h('span', { class: 'text ghost', attrs: { 'aria-hidden': 'true' } }, slot) : null; // prettier-ignore
      parts = place === 'end' ? [text, spinner] : [spinner, text, ghost];
    } else if (outcomeText) {
      parts = [icon(this.outcome === 'success' ? 'check' : 'alert'), h('span', { class: 'text', part: 'text', text: outcomeText })]; // prettier-ignore
    } else parts = [h('span', { class: 'text' }, slot)];
    button.replaceChildren(...parts.filter((p) => p !== null));
    // The visible text is the accessible name (WCAG 2.5.3). `label` only names a button
    // that shows no text: an icon, or the spinner alone with spinner-position="replace".
    const slotText = (this.textContent ?? '').trim();
    const visible = shown ? (place === 'replace' ? '' : loadingText || slotText) : outcomeText || slotText; // prettier-ignore
    if (visible) button.removeAttribute('aria-label');
    else button.setAttribute('aria-label', label || (shown ? loadingText : '') || slotText || this.t('loadingLabel')); // prettier-ignore
    if (!frame.contains(button)) frame.replaceChildren(button);
    // Announce the change of state for screen readers.
    if (shown && loadingText) this.announce(loadingText);
    else if (outcomeText) this.announce(outcomeText);
  }

  /** @param {string} message */
  announce(message) {
    let live = /** @type {HTMLElement | null} */ (this.root.querySelector('.sr-only'));
    if (!live) {
      live = h('span', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });
      this.root.append(live);
    }
    if (live.textContent !== message) live.textContent = message;
  }
}
