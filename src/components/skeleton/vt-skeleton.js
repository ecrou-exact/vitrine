// @ts-check
import skeletonCss from '../../styles/skeleton.css?raw';
import { parseBoolean, parseCssLength, parseEnum, parseInteger } from '../../core/attributes.js';
import { h } from '../../core/dom.js';
import { VtIndicator } from '../loading/indicator.js';

export const SHAPES = /** @type {const} */ ([
  'text', 'paragraph', 'heading', 'avatar', 'button', 'media', 'card', 'list', 'table', 'form',
  'article', 'block',
]); // prettier-ignore
const ANIMATIONS = /** @type {const} */ (['shimmer', 'pulse', 'none']);

/** Line widths, varied but stable from one render to the next. */
const WIDTHS = ['100%', '94%', '97%', '88%', '92%', '85%', '96%', '90%'];
/** Widths of short texts: list titles, table cells. */
const SHORT_WIDTHS = ['70%', '55%', '82%', '62%', '76%', '48%'];

/**
 * Placeholders in the shape of the content to come: text lines, a heading, an avatar, a
 * picture, a card, a list, a table, a form or an article, with a shimmer, a pulse or no
 * animation. Put the real content inside: it is hidden (and marked busy) while the
 * skeleton is active, and shown when it stops.
 *
 * @element vt-skeleton
 * @since 0.15.0
 *
 * @attr {"text"|"paragraph"|"heading"|"avatar"|"button"|"media"|"card"|"list"|"table"|"form"|"article"|"block"} shape - What the placeholder looks like. Default: `paragraph`.
 * @attr {number} lines - Text lines (`text`, `paragraph`, `card`, `article`): 1 to 20. Default: 3.
 * @attr {number} rows - Rows (`list`, `table`, `form`): 1 to 50. Default: 3.
 * @attr {number} columns - Columns (`table`): 1 to 12. Default: 4.
 * @attr {boolean} avatar - An avatar before each item (`list`, `card`, `article`).
 * @attr {boolean} media - A picture on top (`card`).
 * @attr {"shimmer"|"pulse"|"none"} animation - Default: `shimmer`.
 * @attr {string} width - Width of the placeholder (CSS length). Default: the available width.
 * @attr {string} height - Height (`block`, `media`): CSS length.
 * @attr {string} radius - Corner radius (CSS length).
 * @attr {boolean} active - Placeholder shown (on, default) or real content shown (off).
 * @attr {string} delay - Wait before showing the placeholder.
 * @attr {string} min-duration - Once shown, keep the placeholder at least this long.
 * @attr {string} label - Accessible name of the busy region. Default: "Loading".
 * @attr {string} speed - Speed of the animation.
 * @attr {"auto"|"full"|"reduce"} motion - Animation: follows the reader's reduced-motion setting by default.
 *
 * @prop {boolean} active - Placeholder shown or not.
 *
 * @fires vt-loading-start - Placeholder shown. Detail: `{ type: "skeleton" }`.
 * @fires vt-loading-end - Real content shown. Detail: `{ type: "skeleton", duration }`.
 *
 * @slot - The real content, shown when the skeleton is not active.
 *
 * @csspart indicator - The wrapper.
 * @csspart skeleton - The placeholder.
 * @csspart bone - Each shape of the placeholder.
 *
 * @cssprop --vt-skeleton-color - Color of the shapes.
 * @cssprop --vt-skeleton-highlight - Color of the shimmer.
 *
 * @example
 * <vt-skeleton shape="card" media avatar>
 *   <article>…the real card…</article>
 * </vt-skeleton>
 */
export class VtSkeleton extends VtIndicator {
  static type = 'skeleton';

  static componentAttributes = ['shape', 'lines', 'rows', 'columns', 'avatar', 'media', 'animation', 'width', 'height', 'radius']; // prettier-ignore

  static styles = [skeletonCss];

  static display = 'block';

  constructor() {
    super();
    this.slotElement = h('slot', {});
    this.contentBox = h('div', { class: 'content', part: 'content' }, this.slotElement);
  }

  /** @param {HTMLElement} frame */
  draw(frame) {
    const shown = this.shown;
    this.contentBox.hidden = shown;
    this.toggleAttribute('aria-busy', shown);
    if (!shown) {
      frame.replaceChildren(this.contentBox);
      frame.removeAttribute('role');
      frame.removeAttribute('aria-label');
      return;
    }
    const shape = parseEnum(this.getAttribute('shape'), SHAPES, 'paragraph');
    frame.dataset.animation = parseEnum(this.getAttribute('animation'), ANIMATIONS, 'shimmer');
    const style = frame.style;
    for (const name of ['width', 'height', 'radius']) {
      const value = parseCssLength(this.getAttribute(name));
      if (value) style.setProperty(`--_sk-${name}`, value);
      else style.removeProperty(`--_sk-${name}`);
    }
    frame.setAttribute('role', 'status');
    frame.setAttribute('aria-label', this.labelText());
    frame.replaceChildren(
      h('div', { class: `skeleton ${shape}`, part: 'skeleton', attrs: { 'aria-hidden': 'true' } }, ...this.bones(shape)), // prettier-ignore
      this.contentBox,
    );
  }

  /**
   * @param {(typeof SHAPES)[number]} shape
   * @returns {HTMLElement[]}
   */
  bones(shape) {
    const lines = parseInteger(this.getAttribute('lines'), { min: 1, max: 20, fallback: 3 });
    const rows = parseInteger(this.getAttribute('rows'), { min: 1, max: 50, fallback: 3 });
    const columns = parseInteger(this.getAttribute('columns'), { min: 1, max: 12, fallback: 4 });
    const avatar = parseBoolean(this.getAttribute('avatar')) ?? false;
    const media = parseBoolean(this.getAttribute('media')) ?? false;
    // Widths go through the CSSOM: a style attribute would break under a strict CSP.
    const bone = (/** @type {string} */ kind, /** @type {string | null} */ width = null) => {
      const element = h('span', { class: `bone ${kind}`, part: 'bone' });
      if (width) element.style.setProperty('--_w', width);
      return element;
    };
    /** @param {number} count @param {number} [offset] */
    const text = (count, offset = 0) =>
      Array.from({ length: count }, (_, i) =>
        bone('line', count > 1 && i === count - 1 ? '62%' : WIDTHS[(i + offset) % WIDTHS.length]),
      );
    const person = () => h('span', { class: 'row-head' }, bone('avatar'), h('span', { class: 'stack' }, bone('line', '45%'), bone('line small', '28%'))); // prettier-ignore
    switch (shape) {
      case 'text':
        return text(lines);
      case 'heading':
        return [bone('heading', '55%')];
      case 'avatar':
        return [bone('avatar')];
      case 'button':
        return [bone('button')];
      case 'media':
        return [bone('media')];
      case 'block':
        return [bone('block')];
      case 'card':
        return [
          media ? bone('media') : null,
          h('div', { class: 'card-body' }, avatar ? person() : bone('heading', '60%'), ...text(lines, 1)), // prettier-ignore
        ].filter((x) => x !== null);
      case 'list':
        return Array.from(
          { length: rows },
          (_, i) =>
          h('div', { class: 'list-row' }, avatar ? bone('avatar') : null, h('span', { class: 'stack' }, bone('line', SHORT_WIDTHS[i % SHORT_WIDTHS.length]), bone('line small', '40%'))), // prettier-ignore
        );
      case 'table':
        return [
          h('div', { class: 'table-row head' }, ...Array.from({ length: columns }, () => bone('cell', '60%'))), // prettier-ignore
          ...Array.from(
            { length: rows },
            (_, r) =>
            h('div', { class: 'table-row' }, ...Array.from({ length: columns }, (_, c) => bone('cell', SHORT_WIDTHS[(r + c * 2) % SHORT_WIDTHS.length]))), // prettier-ignore
          ),
        ].map((row) => {
          row.style.setProperty('--_columns', String(columns));
          return row;
        });
      case 'form':
        return [
          ...Array.from({ length: rows }, () => h('div', { class: 'field' }, bone('line small', '30%'), bone('input'))), // prettier-ignore
          bone('button'),
        ];
      case 'article':
        return [
          bone('heading', '70%'),
          avatar ? person() : bone('line small', '35%'),
          bone('media'),
          ...text(lines),
          ...text(Math.max(2, lines - 1), 3),
        ];
      default:
        return [bone('heading', '45%'), ...text(lines)];
    }
  }
}
