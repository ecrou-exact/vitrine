// @ts-check
import ringCss from '../../styles/progress-ring.css?raw';
import { cleanLabel, parseEnum, parseInteger } from '../../core/attributes.js';
import { h } from '../../core/dom.js';
import { compact } from '../loading/indicator.js';
import { VtValueIndicator } from '../loading/value.js';

const NS = 'http://www.w3.org/2000/svg';
const CAPS = /** @type {const} */ (['round', 'butt']);

/**
 * @param {string} tag
 * @param {Record<string, string>} attrs
 * @returns {SVGElement}
 */
function svg(tag, attrs) {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  return element;
}

/**
 * A circular progress gauge with the value in its center. With a `value`, the arc shows how
 * much is done; without, a short arc turns. Thickness, cap, status color, the value as a
 * percentage, a number or a fraction, and a text under the ring.
 *
 * @element vt-progress-ring
 * @since 0.15.0
 *
 * @attr {number} value - The value. Without it, the ring is indeterminate.
 * @attr {number} min - Start of the range. Default: `0`.
 * @attr {number} max - End of the range. Default: `100`.
 * @attr {"percent"|"value"|"fraction"|"none"} show-value - The value in the center. Default: `percent`.
 * @attr {string} unit - Unit after the value (`GB`).
 * @attr {number} decimals - Decimals of the value shown. Default: `0`.
 * @attr {string} value-text - The text in the center, instead of the value (`3/5`, `ETA 2 min`).
 * @attr {string} text - Visible text under the ring (the accessible name too, unless `label` is set).
 * @attr {"normal"|"success"|"warning"|"error"} status - Colors the arc, unless `tone` is set.
 * @attr {number} thickness - Width of the arc, in percent of the size (4 to 30). Default: `10`.
 * @attr {"round"|"butt"} cap - Ends of the arc. Default: `round`.
 * @attr {string} size - `xs`, `sm`, `md`, `lg` (default), `xl` or a CSS length.
 * @attr {string} label - Accessible name. Default: `text`, else "Loading".
 * @attr {"accent"|"neutral"|"success"|"warning"|"danger"|"info"|"current"} tone - Color. Default: `accent`.
 * @attr {string} speed - Speed of the indeterminate arc.
 * @attr {boolean} active - Shown or not. Default: on.
 * @attr {string} delay - Wait before appearing.
 * @attr {string} min-duration - Once shown, stay at least this long.
 * @attr {"auto"|"full"|"reduce"} motion - Animation: follows the reader's reduced-motion setting by default.
 *
 * @prop {number | null} value - The value (read and write); `null` for indeterminate.
 * @prop {number} max - The end of the range.
 * @prop {number | null} ratio - Share done, from 0 to 1 (read-only).
 *
 * @fires vt-progress - The value changed. Detail: `{ value, max, ratio }`.
 * @fires vt-complete - The value reached `max`. Detail: `{ status }`.
 *
 * @csspart indicator - The wrapper.
 * @csspart ring - The SVG (the role="progressbar" element).
 * @csspart track - The full circle behind the arc.
 * @csspart arc - The value arc.
 * @csspart value - The value in the center.
 * @csspart text - The text under the ring.
 *
 * @example
 * <vt-progress-ring value="72" text="Storage used" unit="GB" show-value="value" max="128"></vt-progress-ring>
 */
export class VtProgressRing extends VtValueIndicator {
  static type = 'progress-ring';

  static componentAttributes = [...VtValueIndicator.componentAttributes, 'thickness', 'cap'];

  static styles = [ringCss];

  static defaultSize = 'lg';

  get defaultShowValue() {
    return /** @type {const} */ ('percent');
  }

  /** @param {HTMLElement} frame */
  draw(frame) {
    if (!this.shown) {
      frame.replaceChildren();
      return;
    }
    this.applyStatusTone();
    const ratio = this.ratio;
    const thickness = parseInteger(this.getAttribute('thickness'), { min: 4, max: 30, fallback: 10 }); // prettier-ignore
    const radius = 50 - thickness / 2;
    const circumference = 2 * Math.PI * radius;
    const cap = parseEnum(this.getAttribute('cap'), CAPS, 'round');
    const ring = svg('svg', { viewBox: '0 0 100 100', class: `ring${ratio === null ? ' indeterminate' : ''}`, part: 'ring' }); // prettier-ignore
    ring.append(
      svg('circle', { cx: '50', cy: '50', r: String(radius), class: 'ring-track', part: 'track', 'stroke-width': String(thickness) }), // prettier-ignore
      svg('circle', {
        cx: '50',
        cy: '50',
        r: String(radius),
        class: 'ring-arc',
        part: 'arc',
        'stroke-width': String(thickness),
        'stroke-linecap': cap,
        'stroke-dasharray': `${circumference} ${circumference}`,
        'stroke-dashoffset': String(
          ratio === null ? circumference * 0.72 : circumference * (1 - ratio),
        ),
      }),
    );
    this.setProgressAria(/** @type {HTMLElement} */ (/** @type {unknown} */ (ring)));
    const value = this.valueLabel();
    const text = cleanLabel(this.getAttribute('text'));
    frame.classList.toggle('complete', ratio !== null && ratio >= 1);
    frame.replaceChildren(
      ...compact([
        h(
          'span',
          { class: 'ring-box' },
          ring,
          value ? h('span', { class: 'ring-value', part: 'value', text: value, attrs: { 'aria-hidden': 'true' } }) : null, // prettier-ignore
        ),
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
