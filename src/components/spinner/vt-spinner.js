// @ts-check
import spinnerCss from '../../styles/spinner.css?raw';
import { cleanLabel, parseEnum } from '../../core/attributes.js';
import { h } from '../../core/dom.js';
import { VtIndicator, compact } from '../loading/indicator.js';
import { SPINNER_TYPES, spinnerShape } from '../loading/shapes.js';

const TEXT_POSITIONS = /** @type {const} */ (['end', 'below']);

/**
 * A spinner for a wait of unknown length: seven shapes (ring, arc, dual ring, dots, bars,
 * pulse, orbit), any size, tone and speed, an optional visible text, and a delay so that
 * short waits never flash.
 *
 * @element vt-spinner
 * @since 0.15.0
 *
 * @attr {"ring"|"arc"|"dual-ring"|"dots"|"bars"|"pulse"|"orbit"} type - The shape. Default: `ring`.
 * @attr {string} text - Visible text next to the spinner (the accessible name too, unless `label` is set).
 * @attr {"end"|"below"} text-position - Text after the spinner (default) or under it.
 * @attr {string} label - Accessible name. Default: "Loading", in the reader's language.
 * @attr {string} size - `xs`, `sm`, `md` (default), `lg`, `xl` or a CSS length.
 * @attr {"accent"|"neutral"|"success"|"warning"|"danger"|"info"|"current"} tone - Color. Default: `accent`; `current` follows the text color.
 * @attr {string} speed - `slow`, `normal`, `fast`, or the length of one turn (`800ms`).
 * @attr {boolean} active - Shown or not. Default: on.
 * @attr {string} delay - Wait before appearing (`200ms`), so short waits show nothing.
 * @attr {string} min-duration - Once shown, stay at least this long (`400ms`), so it never flickers.
 * @attr {"auto"|"full"|"reduce"} motion - Animation: follows the reader's reduced-motion setting by default.
 *
 * @prop {boolean} active - Shown or not.
 *
 * @fires vt-loading-start - Shown (after `delay`). Detail: `{ type: "spinner" }`.
 * @fires vt-loading-end - Hidden. Detail: `{ type: "spinner", duration }`.
 *
 * @csspart indicator - The wrapper.
 * @csspart spinner - The shape.
 * @csspart text - The visible text.
 *
 * @cssprop --vt-indicator-color - Color of the shape.
 * @cssprop --vt-indicator-track - Color of the track (ring, orbit).
 * @cssprop --vt-indicator-size - Size of the shape.
 * @cssprop --vt-indicator-duration - Length of one cycle at normal speed (default `1s`).
 *
 * @example
 * <vt-spinner type="dots" text="Loading results…" delay="200ms"></vt-spinner>
 */
export class VtSpinner extends VtIndicator {
  static type = 'spinner';

  static componentAttributes = ['type', 'text', 'text-position'];

  static styles = [spinnerCss];

  /** @param {HTMLElement} frame */
  draw(frame) {
    frame.classList.toggle('below', parseEnum(this.getAttribute('text-position'), TEXT_POSITIONS, 'end') === 'below'); // prettier-ignore
    if (!this.shown) {
      frame.replaceChildren();
      frame.removeAttribute('role');
      frame.removeAttribute('aria-label');
      return;
    }
    const text = cleanLabel(this.getAttribute('text'));
    const type = parseEnum(this.getAttribute('type'), SPINNER_TYPES, 'ring');
    frame.setAttribute('role', 'status');
    frame.setAttribute(
      'aria-label',
      cleanLabel(this.getAttribute('label')) || text || this.labelText(),
    );
    frame.replaceChildren(
      ...compact([
        spinnerShape(type),
        text
          ? h('span', {
              class: 'indicator-text',
              part: 'text',
              text,
              attrs: { 'aria-hidden': 'true' },
            })
          : null, // prettier-ignore,
      ]),
    );
  }
}
