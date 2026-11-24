// @ts-check
/**
 * The spinner shapes, shared by `<vt-spinner>`, `<vt-loading-overlay>`,
 * `<vt-loading-button>` and `<vt-loading-message>`. Drawn with CSS only (spinner.css):
 * no image, no script animation.
 *
 * @module components/loading/shapes
 */
import { h } from '../../core/dom.js';

export const SPINNER_TYPES = /** @type {const} */ ([
  'ring', 'arc', 'dual-ring', 'dots', 'bars', 'pulse', 'orbit',
]); // prettier-ignore

/** @typedef {(typeof SPINNER_TYPES)[number]} SpinnerType */

/** Number of parts drawn by each shape. */
const PARTS = { ring: 0, arc: 0, 'dual-ring': 2, dots: 3, bars: 4, pulse: 2, orbit: 1 };

/**
 * @param {SpinnerType} type
 * @returns {HTMLElement}
 */
export function spinnerShape(type) {
  const count = PARTS[type];
  return h(
    'span',
    { class: `spinner ${type}`, part: 'spinner', attrs: { 'aria-hidden': 'true' } },
    ...Array.from({ length: count }, (_, i) => h('span', { class: `spinner-part p${i + 1}` })),
  );
}
