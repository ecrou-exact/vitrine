// @ts-check
/**
 * Turns parsed ANSI segments into DOM nodes (shared by <vt-terminal> and <vt-log>).
 * Colors of the 16-color palette are classes (themed, see styles/ansi.css); 256-color
 * and 24-bit colors are set with CSSOM from validated numbers.
 *
 * @module components/terminal/ansi-dom
 */
import { h } from '../../core/dom.js';

/** @typedef {import('./ansi.js').Segment} Segment */

/**
 * A styled segment. Colors from the 16-color palette use classes (themed); 256-color
 * and 24-bit colors are set with CSSOM from validated numbers.
 *
 * @param {Segment} segment
 * @returns {Node}
 */
export function segmentNode(segment) {
  const style = segment.style;
  let fg = style.fg;
  let bg = style.bg;
  const plain =
    !fg && !bg && !style.bold && !style.dim && !style.italic && !style.underline &&
    !style.inverse && !style.strike && !style.link; // prettier-ignore
  if (plain) return document.createTextNode(segment.text);

  /** @type {string[]} */
  const classes = [];
  if (style.inverse) {
    [fg, bg] = [bg, fg];
    if (!fg) classes.push('fg-inverse');
    if (!bg) classes.push('bg-inverse');
  }
  // Bold text in one of the 8 base colors uses the bright variant, like most terminals.
  if (fg && 'index' in fg && style.bold && fg.index < 8) fg = { index: fg.index + 8 };
  if (style.bold) classes.push('bold');
  if (style.dim) classes.push('dim');
  if (style.italic) classes.push('italic');
  if (style.underline) classes.push('underline');
  if (style.strike) classes.push('strike');
  if (bg && !fg && !style.inverse) classes.push('on-bg');

  const node = style.link
    ? h('a', {
        attrs: { href: style.link, rel: 'noopener noreferrer nofollow', target: '_blank' },
      })
    : h('span');
  if (fg) {
    if ('index' in fg) classes.push(`fg-${fg.index}`);
    else node.style.color = rgb(fg.rgb);
  }
  if (bg) {
    if ('index' in bg) classes.push(`bg-${bg.index}`);
    else node.style.backgroundColor = rgb(bg.rgb);
  }
  node.className = classes.join(' ');
  node.textContent = segment.text;
  return node;
}

/**
 * @param {[number, number, number]} color
 * @returns {string}
 */
function rgb([r, g, b]) {
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}
