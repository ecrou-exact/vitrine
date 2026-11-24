// @ts-check
import spinnerCss from '../../styles/spinner.css?raw';
import messageCss from '../../styles/loading-message.css?raw';
import { cleanLabel, parseBoolean, parseEnum } from '../../core/attributes.js';
import { h } from '../../core/dom.js';
import { VtIndicator, parseDuration } from '../loading/indicator.js';
import { SPINNER_TYPES, spinnerShape } from '../loading/shapes.js';

const MAX_MESSAGES = 50;
const LAYOUTS = /** @type {const} */ (['inline', 'stacked']);

/**
 * A wait that tells what happens: messages that follow one another ("Connecting…",
 * "Fetching your data…", "Almost there…"), the time elapsed, and, past a threshold, a
 * reassuring "This is taking longer than usual…". With a spinner of any shape, or none.
 *
 * @element vt-loading-message
 * @since 0.15.0
 *
 * @attr {string} messages - The messages, separated by `|`. Or write them one per line inside the element.
 * @attr {string} interval - Time each message stays. Default: `2.5s`.
 * @attr {boolean} loop - Start again after the last message. Default: off (the last one stays).
 * @attr {boolean} elapsed - Show the time elapsed.
 * @attr {string} slow-after - After this time, show the slow message (`10s`).
 * @attr {string} slow-text - The slow message. Default: "This is taking longer than usual…".
 * @attr {"ring"|"arc"|"dual-ring"|"dots"|"bars"|"pulse"|"orbit"|"none"} spinner - Spinner shape. Default: `ring`.
 * @attr {"inline"|"stacked"} layout - Spinner next to the message (default) or above it, centered.
 * @attr {string} label - Accessible name. Default: "Loading".
 * @attr {string} size - Size of the spinner: `xs`…`xl` or a CSS length. Default: `sm`.
 * @attr {"accent"|"neutral"|"success"|"warning"|"danger"|"info"|"current"} tone - Color of the spinner.
 * @attr {string} speed - Speed of the spinner.
 * @attr {boolean} active - Shown or not. Default: on.
 * @attr {string} delay - Wait before appearing.
 * @attr {string} min-duration - Once shown, stay at least this long.
 * @attr {"auto"|"full"|"reduce"} motion - Animation: follows the reader's reduced-motion setting by default.
 *
 * @prop {string[]} messages - The messages (read and write).
 * @prop {string} content - The messages as text, one per line (read and write).
 *
 * @fires vt-loading-start - Shown. Detail: `{ type: "loading-message" }`.
 * @fires vt-loading-end - Hidden. Detail: `{ type: "loading-message", duration }`.
 *
 * @csspart indicator - The wrapper.
 * @csspart spinner - The spinner.
 * @csspart message - The current message.
 * @csspart elapsed - The time elapsed.
 * @csspart slow - The slow message.
 *
 * @example
 * <vt-loading-message elapsed slow-after="10s">
 *   Connecting to the server…
 *   Fetching your invoices…
 *   Preparing the PDF…
 * </vt-loading-message>
 */
export class VtLoadingMessage extends VtIndicator {
  static type = 'loading-message';

  static componentAttributes = ['messages', 'interval', 'loop', 'elapsed', 'slow-after', 'slow-text', 'spinner', 'layout']; // prettier-ignore

  static styles = [spinnerCss, messageCss];

  static defaultSize = 'sm';

  constructor() {
    super();
    /** @type {string[] | null} Set through the property; `null` reads `messages` or the content. */
    this.messagesState = null;
    this.index = 0;
    this.startedAt = 0;
    /** @type {ReturnType<typeof setInterval> | undefined} */
    this.tick = undefined;
    this.lastSwitch = 0;
  }

  /** @type {string[]} */
  get messages() {
    if (this.messagesState) return [...this.messagesState];
    const attribute = this.getAttribute('messages');
    const raw = attribute !== null ? attribute.split('|') : (this.textContent ?? '').split(/\r\n|\n|\r/); // prettier-ignore
    return raw
      .map((m) => cleanLabel(m, 200))
      .filter(Boolean)
      .slice(0, MAX_MESSAGES);
  }

  set messages(value) {
    this.messagesState = Array.isArray(value) ? value.map((m) => cleanLabel(String(m), 200)).filter(Boolean).slice(0, MAX_MESSAGES) : null; // prettier-ignore
    this.index = 0;
    this.requestRender();
  }

  /** The messages as text, one per line (read and write). */
  get content() {
    return this.messages.join('\n');
  }

  set content(value) {
    this.messages =
      value === null || value === undefined
        ? /** @type {any} */ (null)
        : String(value).split(/\r\n|\n|\r/);
  }

  started() {
    this.index = 0;
    this.startedAt = performance.now();
    this.lastSwitch = this.startedAt;
    clearInterval(this.tick);
    // One timer for the messages, the elapsed time and the slow message.
    this.tick = setInterval(() => this.advance(), 250);
  }

  stopped() {
    clearInterval(this.tick);
  }

  advance() {
    const now = performance.now();
    const interval = Math.max(500, parseDuration(this.getAttribute('interval'), 2500));
    const count = this.messages.length;
    if (count > 1 && now - this.lastSwitch >= interval) {
      this.lastSwitch = now;
      const loop = parseBoolean(this.getAttribute('loop')) ?? false;
      this.index = loop ? (this.index + 1) % count : Math.min(this.index + 1, count - 1);
    }
    this.render();
  }

  /** @param {HTMLElement} frame */
  draw(frame) {
    if (!this.shown) {
      frame.replaceChildren();
      frame.removeAttribute('role');
      return;
    }
    const messages = this.messages;
    const message = messages[Math.min(this.index, messages.length - 1)] ?? this.t('loadingLabel');
    const elapsedMs = performance.now() - this.startedAt;
    const slowAfter = this.hasAttribute('slow-after') ? parseDuration(this.getAttribute('slow-after'), 0) : 0; // prettier-ignore
    const slow = slowAfter > 0 && elapsedMs >= slowAfter;
    const type = this.getAttribute('spinner') === 'none' ? null : parseEnum(this.getAttribute('spinner'), SPINNER_TYPES, 'ring'); // prettier-ignore
    frame.dataset.layout = parseEnum(this.getAttribute('layout'), LAYOUTS, 'inline');
    frame.setAttribute('role', 'status');
    frame.setAttribute('aria-label', this.labelText());

    // Keep the same nodes between ticks: screen readers then only hear what changed.
    let text = /** @type {HTMLElement | null} */ (frame.querySelector('.message-text'));
    if (!text || frame.dataset.spinner !== String(type)) {
      frame.dataset.spinner = String(type);
      text = h('span', { class: 'message-text', attrs: { 'aria-live': 'polite' } });
      frame.replaceChildren(type ? spinnerShape(type) : '', text);
    }
    const current = text.querySelector('.message');
    if (current?.textContent !== message) {
      const next = h('span', { class: 'message', part: 'message', text: message });
      if (current) current.replaceWith(next);
      else text.prepend(next);
    }
    const showElapsed = parseBoolean(this.getAttribute('elapsed')) ?? false;
    let elapsed = /** @type {HTMLElement | null} */ (text.querySelector('.elapsed'));
    if (showElapsed) {
      const value = this.t('loadingElapsed', { time: formatElapsed(elapsedMs) });
      if (!elapsed) {
        elapsed = h('span', {
          class: 'elapsed',
          part: 'elapsed',
          attrs: { 'aria-hidden': 'true' },
        });
        text.append(elapsed);
      }
      if (elapsed.textContent !== value) elapsed.textContent = value;
    } else elapsed?.remove();
    let slowNode = text.querySelector('.slow');
    if (slow && !slowNode) {
      slowNode = h('span', { class: 'slow', part: 'slow', text: cleanLabel(this.getAttribute('slow-text'), 200) || this.t('loadingSlow') }); // prettier-ignore
      text.append(slowNode);
    } else if (!slow) slowNode?.remove();
  }
}

/**
 * `0:07`, `1:24`, `1:02:03`.
 *
 * @param {number} ms
 * @returns {string}
 */
function formatElapsed(ms) {
  const total = Math.floor(ms / 1000);
  const s = String(total % 60).padStart(2, '0');
  const m = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours ? `${hours}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
