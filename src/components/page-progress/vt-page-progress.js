// @ts-check
import pageCss from '../../styles/page-progress.css?raw';
import { parseBoolean, parseCssLength, parseEnum } from '../../core/attributes.js';
import { h } from '../../core/dom.js';
import { EVENTS, emit } from '../../core/events.js';
import { VtIndicator, parseDuration, parseNumber, compact } from '../loading/indicator.js';

const POSITIONS = /** @type {const} */ (['top', 'bottom']);
const PLACEMENTS = /** @type {const} */ (['fixed', 'absolute']);

/**
 * A thin bar along the top of the page (or of a container) for navigations and long
 * requests. `start()` shows it and lets it creep forward on its own ("trickle") so the
 * reader sees that something happens; `set()` and `inc()` move it; `done()` fills it and
 * fades it out. Inactive until started.
 *
 * @element vt-page-progress
 * @since 0.15.0
 *
 * @attr {number} value - Progress from 0 to 1, when it is known.
 * @attr {boolean} trickle - Creep forward on its own while started. Default: on.
 * @attr {string} trickle-speed - Time between two steps of the trickle. Default: `300ms`.
 * @attr {number} minimum - Where the bar starts, from 0 to 1. Default: `0.08`.
 * @attr {"top"|"bottom"} position - Edge of the window or container. Default: `top`.
 * @attr {"fixed"|"absolute"} placement - `fixed` (default) follows the window; `absolute` stays in the nearest positioned container.
 * @attr {string} thickness - Height of the bar (CSS length). Default: `3px`.
 * @attr {boolean} glow - A soft glow at the head of the bar. Default: on.
 * @attr {boolean} spinner - A small spinner in the corner as well.
 * @attr {boolean} active - Started or not. Default: off.
 * @attr {string} delay - Wait before appearing: fast navigations show nothing.
 * @attr {string} min-duration - Once shown, stay at least this long.
 * @attr {string} label - Accessible name. Default: "Page loading".
 * @attr {"accent"|"neutral"|"success"|"warning"|"danger"|"info"|"current"} tone - Color. Default: `accent`.
 * @attr {"auto"|"full"|"reduce"} motion - Animation: follows the reader's reduced-motion setting by default.
 *
 * @prop {number} value - Progress from 0 to 1 (read and write).
 *
 * @fires vt-progress - The bar moved. Detail: `{ value, max: 1, ratio }`.
 * @fires vt-complete - `done()` filled the bar. Detail: `{ status: "done" }`.
 * @fires vt-loading-start - Started. Detail: `{ type: "page-progress" }`.
 * @fires vt-loading-end - Hidden. Detail: `{ type: "page-progress", duration }`.
 *
 * @csspart indicator - The wrapper.
 * @csspart bar - The bar.
 * @csspart spinner - The corner spinner.
 *
 * @example
 * <vt-page-progress id="nav"></vt-page-progress>
 * <script>
 *   nav.start();
 *   await fetch('/next');
 *   nav.done();
 * </script>
 */
export class VtPageProgress extends VtIndicator {
  static type = 'page-progress';

  static componentAttributes = ['value', 'trickle', 'trickle-speed', 'minimum', 'position', 'placement', 'thickness', 'glow', 'spinner']; // prettier-ignore

  static styles = [pageCss];

  constructor() {
    super();
    /** Current progress, 0 to 1. */
    this.progress = 0;
    /** @type {ReturnType<typeof setInterval> | undefined} */
    this.trickleTimer = undefined;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.doneTimer = undefined;
    this.finishing = false;
  }

  /** Inactive until started. */
  get active() {
    return this.activeState ?? parseBoolean(this.getAttribute('active')) ?? false;
  }

  set active(value) {
    super.active = value;
  }

  get value() {
    return this.progress;
  }

  set value(next) {
    this.set(Number(next));
  }

  get minimum() {
    return Math.min(0.5, Math.max(0, parseNumber(this.getAttribute('minimum')) ?? 0.08));
  }

  /** Starts (or restarts) the bar. */
  start() {
    clearTimeout(this.doneTimer);
    this.finishing = false;
    if (!this.active) this.progress = 0;
    super.start();
    this.set(Math.max(this.progress, this.minimum));
  }

  /**
   * Moves the bar to `ratio` (0 to 1). Starts it if needed.
   *
   * @param {number} ratio
   */
  set(ratio) {
    if (!Number.isFinite(ratio)) return;
    const next = Math.min(1, Math.max(0, ratio));
    if (!this.active && next < 1) super.start();
    this.progress = next;
    emit(this, EVENTS.PROGRESS, { value: next, max: 1, ratio: next });
    this.requestRender();
  }

  /**
   * Moves the bar forward: by `amount`, or by a step that shrinks as it nears the end.
   *
   * @param {number} [amount]
   */
  inc(amount) {
    const p = this.progress;
    if (p >= 1 || this.finishing) return;
    const step = amount ?? (p < 0.2 ? 0.1 : p < 0.5 ? 0.04 : p < 0.8 ? 0.02 : p < 0.99 ? 0.005 : 0);
    this.set(Math.min(0.994, p + step));
  }

  /**
   * Fills the bar, then hides it.
   *
   * @param {boolean} [force] - Show the completion even when the bar was not started.
   */
  done(force = false) {
    if (!this.active && !force) return;
    this.finishing = true;
    this.set(1);
    emit(this, EVENTS.COMPLETE, { status: 'done' });
    clearTimeout(this.doneTimer);
    this.doneTimer = setTimeout(
      () => {
        this.finishing = false;
        super.stop();
      },
      this.motion === 'reduce' ? 0 : 350,
    );
  }

  stop() {
    this.done();
  }

  started() {
    clearInterval(this.trickleTimer);
    if (parseBoolean(this.getAttribute('trickle')) === false) return;
    const every = parseDuration(this.getAttribute('trickle-speed'), 300, 10000);
    this.trickleTimer = setInterval(() => this.inc(), Math.max(50, every));
  }

  stopped() {
    clearInterval(this.trickleTimer);
    clearTimeout(this.doneTimer);
    this.progress = 0;
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'value' && oldValue !== newValue && newValue !== null && this.isConnected) {
      const value = parseNumber(newValue);
      if (value !== null) this.set(value);
      return;
    }
    if (name === 'active' && oldValue !== newValue && this.isConnected) {
      this.activeState = null;
      if (this.active) this.start();
      else this.done();
      return;
    }
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  connectedCallback() {
    super.connectedCallback();
    const value = parseNumber(this.getAttribute('value'));
    if (this.active || value !== null) this.set(Math.max(this.progress, value ?? this.minimum));
  }

  /** @param {HTMLElement} frame */
  draw(frame) {
    frame.dataset.position = parseEnum(this.getAttribute('position'), POSITIONS, 'top');
    frame.dataset.placement = parseEnum(this.getAttribute('placement'), PLACEMENTS, 'fixed');
    frame.style.setProperty('--_thickness', parseCssLength(this.getAttribute('thickness')) ?? '3px'); // prettier-ignore
    frame.classList.toggle('glow', parseBoolean(this.getAttribute('glow')) ?? true);
    if (!this.shown) {
      frame.replaceChildren();
      frame.removeAttribute('role');
      return;
    }
    frame.setAttribute('role', 'progressbar');
    frame.setAttribute('aria-label', this.labelText('loadingPageLabel'));
    frame.setAttribute('aria-valuemin', '0');
    frame.setAttribute('aria-valuemax', '100');
    frame.setAttribute('aria-valuenow', String(Math.round(this.progress * 100)));
    frame.classList.toggle('finishing', this.finishing);
    const bar = h('div', { class: 'page-bar', part: 'bar' });
    bar.style.setProperty('--_ratio', String(this.progress));
    frame.replaceChildren(
      ...compact([
        bar,
        parseBoolean(this.getAttribute('spinner'))
          ? h('span', { class: 'page-spinner', part: 'spinner', attrs: { 'aria-hidden': 'true' } })
          : null, // prettier-ignore,
      ]),
    );
  }
}
