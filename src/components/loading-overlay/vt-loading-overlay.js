// @ts-check
import spinnerCss from '../../styles/spinner.css?raw';
import overlayCss from '../../styles/loading-overlay.css?raw';
import { cleanLabel, parseBoolean, parseEnum } from '../../core/attributes.js';
import { h } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { formatNumber } from '../../core/i18n.js';
import { VtIndicator, parseNumber } from '../loading/indicator.js';
import { SPINNER_TYPES, spinnerShape } from '../loading/shapes.js';

const SCRIMS = /** @type {const} */ (['light', 'dark', 'blur', 'none']);

/**
 * Covers a part of the page while it loads: the content inside stays in place, dimmed or
 * blurred, and cannot be reached (it is made inert and marked busy), with a spinner, a
 * message, an optional progress bar and an optional Cancel button. `fullscreen` covers the
 * whole window instead.
 *
 * @element vt-loading-overlay
 * @since 0.15.0
 *
 * @attr {boolean} active - Overlay shown or not. Default: on.
 * @attr {string} text - Message under the spinner.
 * @attr {"ring"|"arc"|"dual-ring"|"dots"|"bars"|"pulse"|"orbit"|"none"} spinner - Spinner shape. Default: `ring`.
 * @attr {number} value - Shows a progress bar under the message (0 to `max`).
 * @attr {number} max - End of the progress range. Default: `100`.
 * @attr {"light"|"dark"|"blur"|"none"} scrim - How the content is covered. Default: `light`.
 * @attr {boolean} cancelable - A Cancel button that fires `vt-cancel`.
 * @attr {string} cancel-text - Text of the Cancel button. Default: "Cancel".
 * @attr {boolean} fullscreen - Cover the whole window, above the page.
 * @attr {string} size - Size of the spinner: `xs`…`xl` or a CSS length. Default: `lg`.
 * @attr {"accent"|"neutral"|"success"|"warning"|"danger"|"info"|"current"} tone - Color of the spinner.
 * @attr {string} delay - Wait before covering (`300ms`): fast loads show nothing.
 * @attr {string} min-duration - Once shown, stay at least this long.
 * @attr {string} label - Accessible name. Default: `text`, else "Loading".
 * @attr {string} speed - Speed of the spinner.
 * @attr {"auto"|"full"|"reduce"} motion - Animation: follows the reader's reduced-motion setting by default.
 *
 * @prop {boolean} active - Overlay shown or not.
 *
 * @fires vt-cancel - The Cancel button was pressed. Detail: `{}`.
 * @fires vt-loading-start - Overlay shown. Detail: `{ type: "loading-overlay" }`.
 * @fires vt-loading-end - Overlay removed. Detail: `{ type: "loading-overlay", duration }`.
 *
 * @slot - The content to cover.
 *
 * @csspart indicator - The wrapper of the content and the overlay.
 * @csspart overlay - The overlay.
 * @csspart panel - The box with the spinner, the message and the button.
 * @csspart spinner - The spinner.
 * @csspart text - The message.
 * @csspart progress - The progress bar.
 * @csspart cancel - The Cancel button.
 *
 * @cssprop --vt-overlay-scrim - Color of the scrim.
 *
 * @example
 * <vt-loading-overlay active text="Saving…" delay="300ms">
 *   <form>…</form>
 * </vt-loading-overlay>
 */
export class VtLoadingOverlay extends VtIndicator {
  static type = 'loading-overlay';

  static componentAttributes = ['text', 'spinner', 'value', 'max', 'scrim', 'cancelable', 'cancel-text', 'fullscreen']; // prettier-ignore

  static styles = [spinnerCss, overlayCss];

  static display = 'block';

  static defaultSize = 'lg';

  constructor() {
    super();
    this.contentBox = h('div', { class: 'content', part: 'content' }, h('slot', {}));
    /** @type {Map<Element, boolean>} Children made inert, with their previous state. */
    this.madeInert = new Map();
    /** Focus was inside the covered content when the overlay appeared. */
    this.focusPanel = false;
    /** @type {MutationObserver | null} */
    this.observer = null;
  }

  connectedCallback() {
    // Children parsed after the element was defined, or added later, are covered too.
    this.observer = new MutationObserver(() => {
      if (this.shown && !this.hasAttribute('fullscreen')) this.setInert(true);
    });
    this.observer.observe(this, { childList: true });
    super.connectedCallback();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    this.observer = null;
    super.disconnectedCallback();
  }

  started() {
    // Focus inside the content would be stranded: move it to the overlay.
    if (this.contains(document.activeElement) && !this.hasAttribute('fullscreen')) this.focusPanel = true; // prettier-ignore
  }

  stopped() {
    this.setInert(false);
  }

  /**
   * Makes the light DOM children inert (or restores them), so that keyboard and pointer
   * cannot reach covered content.
   *
   * @param {boolean} inert
   */
  setInert(inert) {
    if (inert) {
      for (const child of this.children) {
        if (this.madeInert.has(child)) continue;
        this.madeInert.set(child, child.hasAttribute('inert'));
        child.setAttribute('inert', '');
      }
      return;
    }
    for (const [child, was] of this.madeInert) if (!was) child.removeAttribute('inert');
    this.madeInert.clear();
  }

  /** @param {HTMLElement} frame */
  draw(frame) {
    const shown = this.shown;
    const fullscreen = parseBoolean(this.getAttribute('fullscreen')) ?? false;
    frame.classList.toggle('fullscreen', fullscreen);
    frame.dataset.scrim = parseEnum(this.getAttribute('scrim'), SCRIMS, 'light');
    this.toggleAttribute('aria-busy', shown);
    this.setInert(shown && !fullscreen);
    if (!shown) {
      frame.replaceChildren(this.contentBox);
      return;
    }
    const t = this.t;
    const text = cleanLabel(this.getAttribute('text'));
    const type = this.getAttribute('spinner') === 'none' ? null : parseEnum(this.getAttribute('spinner'), SPINNER_TYPES, 'ring'); // prettier-ignore
    const value = parseNumber(this.getAttribute('value'));
    const max = Math.max(1, parseNumber(this.getAttribute('max')) ?? 100);
    /** @type {HTMLElement | null} */
    let progress = null;
    if (value !== null) {
      const ratio = Math.min(1, Math.max(0, value / max));
      const percent = t('loadingPercent', { percent: formatNumber(Math.round(ratio * 100), this.locale) }); // prettier-ignore
      progress = h(
        'div',
        { class: 'overlay-progress', part: 'progress', attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(Math.min(max, Math.max(0, value))), 'aria-valuetext': percent, 'aria-label': text || this.labelText() } }, // prettier-ignore
        h('span', { class: 'overlay-bar' }),
      );
      progress.style.setProperty('--_ratio', String(ratio));
    }
    const cancel = parseBoolean(this.getAttribute('cancelable'))
      ? h('button', {
          class: 'overlay-cancel',
          part: 'cancel',
          text: cleanLabel(this.getAttribute('cancel-text'), 40) || t('loadingCancel'),
          attrs: { type: 'button' },
          on: { click: () => emit(this, EVENTS.CANCEL, {}) },
        })
      : null;
    const panel = h(
      'div',
      { class: 'panel', part: 'panel', attrs: { role: 'status', 'aria-label': cleanLabel(this.getAttribute('label')) || text || this.labelText(), tabindex: '-1' } }, // prettier-ignore
      type ? spinnerShape(type) : null,
      text ? h('p', { class: 'indicator-text', part: 'text', text }) : null,
      progress,
      cancel,
    );
    const overlay = h('div', { class: 'overlay', part: 'overlay' }, panel);
    frame.replaceChildren(this.contentBox, overlay);
    if (this.focusPanel) {
      this.focusPanel = false;
      (cancel ?? panel).focus();
    }
  }
}
