// @ts-check
/**
 * Builds the line-based code view shared by `<vt-code>`, the Markdown source tab and
 * the JSON raw view.
 *
 * @module core/code-view
 */
import { inRanges } from './attributes.js';
import { h } from './dom.js';
import { highlight } from './highlighter.js';
import { plainLines, splitLines } from './lines.js';

/** @typedef {import('./attributes.js').Range} Range */

/**
 * @typedef {object} CodeViewOptions
 * @property {string} language - Canonical language name (`"plaintext"` for none).
 * @property {boolean} lineNumbers
 * @property {number} startLine
 * @property {Range[]} highlightRanges - Line numbers (as displayed) to emphasize.
 * @property {boolean} diff - Treat `+` / `-` prefixed lines as a diff.
 * @property {number} highlightLimit - Above this length, syntax highlighting is skipped.
 * @property {{ added: string, removed: string }} [diffLabels] - Words read by screen readers on diff lines.
 */

/**
 * @typedef {object} CodeView
 * @property {HTMLElement} element - The `.code-view` wrapper.
 * @property {HTMLElement} code - The `<pre>` element (search root).
 * @property {number} lineCount
 * @property {boolean} highlightSkipped - `true` when the text was too large to highlight.
 */

/** @typedef {"added"|"removed"|"hunk"|"meta"|"context"} DiffKind */

/** Code longer than this many lines is split into blocks of {@link CHUNK_LINES}. */
export const CHUNK_THRESHOLD = 1000;
/** Lines per block for long code. */
export const CHUNK_LINES = 200;

/**
 * Splits a unified diff into display kinds and the code without the sign column.
 *
 * @param {string[]} lines
 * @returns {{ kinds: DiffKind[], code: string[] }}
 */
export function parseDiff(lines) {
  /** @type {DiffKind[]} */
  const kinds = [];
  /** @type {string[]} */
  const code = [];
  for (const line of lines) {
    if (line.startsWith('@@')) {
      kinds.push('hunk');
      code.push(line);
    } else if (/^(?:\+\+\+|---)(?: |$)|^diff |^index /.test(line)) {
      kinds.push('meta');
      code.push(line);
    } else if (line.startsWith('+')) {
      kinds.push('added');
      code.push(line.slice(1));
    } else if (line.startsWith('-')) {
      kinds.push('removed');
      code.push(line.slice(1));
    } else {
      kinds.push('context');
      code.push(line.startsWith(' ') ? line.slice(1) : line);
    }
  }
  return { kinds, code };
}

/**
 * Builds the code view.
 *
 * @param {string} text
 * @param {CodeViewOptions} options
 * @returns {CodeView}
 */
export function buildCodeView(text, options) {
  // A single trailing newline is not displayed as an empty last line.
  const display = text.endsWith('\n') ? text.slice(0, -1) : text;
  let sourceLines = display.split('\n');
  /** @type {DiffKind[] | null} */
  let kinds = null;
  if (options.diff) {
    const parsed = parseDiff(sourceLines);
    kinds = parsed.kinds;
    sourceLines = parsed.code;
  }
  const code = sourceLines.join('\n');
  const highlightSkipped = code.length > options.highlightLimit;
  const lines =
    highlightSkipped || options.language === 'plaintext'
      ? plainLines(code)
      : splitLines(highlight(code, options.language));

  const lastNumber = options.startLine + lines.length - 1;
  const digits = Math.max(String(options.startLine).length, String(lastNumber).length);
  const pre = h('pre', { class: 'code', part: 'code' });
  pre.style.setProperty('--_digits', String(digits));

  const rows = document.createDocumentFragment();
  // Long code is grouped in blocks the browser can skip while they are off-screen
  // (content-visibility), which keeps tens of thousands of lines fast to lay out.
  const chunked = lines.length > CHUNK_THRESHOLD;
  /** @type {Node} */
  let target = rows;
  lines.forEach((fragment, index) => {
    if (chunked && index % CHUNK_LINES === 0) {
      target = h('span', { class: 'chunk' });
      const size = Math.min(CHUNK_LINES, lines.length - index);
      /** @type {HTMLElement} */ (target).style.setProperty('--_chunk-lines', String(size));
      rows.append(target);
    }
    const number = options.startLine + index;
    const kind = kinds?.[index];
    const row = h('span', { class: 'line', part: 'line', attrs: { 'data-line': number } });
    if (options.highlightRanges.length && inRanges(number, options.highlightRanges)) {
      row.classList.add('highlighted');
      row.setAttribute('part', 'line line-highlighted');
    }
    if (kind && kind !== 'context') row.classList.add(kind);
    if (options.lineNumbers) {
      row.append(
        // The number is drawn from data-n by CSS, so it is never selected or copied.
        h('span', {
          class: 'gutter',
          part: 'gutter line-number',
          attrs: { 'aria-hidden': 'true', 'data-n': number },
        }),
      );
    }
    if (kinds) {
      // The +/− sign is drawn by CSS; screen readers get a word instead.
      const label =
        kind === 'added'
          ? options.diffLabels?.added
          : kind === 'removed'
            ? options.diffLabels?.removed
            : '';
      row.append(
        h(
          'span',
          { class: 'sign' },
          label ? h('span', { class: 'sr-only', text: `${label}: ` }) : null,
        ),
      );
    }
    const content = h('span', { class: 'content' });
    content.append(fragment);
    if (index < lines.length - 1) content.append('\n');
    row.append(content);
    target.appendChild(row);
  });
  pre.append(rows);
  const element = h('div', { class: 'code-view' }, pre);
  return { element, code: pre, lineCount: lines.length, highlightSkipped };
}

/**
 * Scrolls a search match into view. Blocks of long code skip layout while off-screen,
 * and some browsers scroll to an estimated position: lay the block out first.
 *
 * @param {Element | null} mark
 */
export function revealMatch(mark) {
  if (!mark) return;
  mark.closest('.chunk')?.classList.add('revealed');
  mark.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
