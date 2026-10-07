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
import { deferChunk } from './chunks.js';
import { splitLines } from './lines.js';

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
 * @property {boolean} [chunk] - Allow splitting long code in blocks (default true). The
 *   editor turns it off: its text field must match the exact height of every line.
 * @property {boolean} [trailingNewline] - Show a trailing newline as an empty last line
 *   (the editor needs it so the caret line exists).
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
  // A single trailing newline is not displayed as an empty last line (except in the editor).
  const display = text.endsWith('\n') && !options.trailingNewline ? text.slice(0, -1) : text;
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
  const plain = highlightSkipped || options.language === 'plaintext';
  // Plain lines are created when their row is built: a huge document never holds a
  // DOM fragment per line it does not show.
  const fragments = plain ? null : splitLines(highlight(code, options.language));
  const textLines = plain ? code.split('\n') : null;
  const count = fragments ? fragments.length : /** @type {string[]} */ (textLines).length;

  const lastNumber = options.startLine + count - 1;
  const digits = Math.max(String(options.startLine).length, String(lastNumber).length);
  const pre = h('pre', { class: 'code', part: 'code' });
  pre.style.setProperty('--_digits', String(digits));

  /**
   * @param {number} index
   * @returns {HTMLElement}
   */
  const buildRow = (index) => {
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
    if (fragments) content.append(fragments[index]);
    else if (textLines?.[index]) content.append(textLines[index]);
    if (index < count - 1) content.append('\n');
    row.append(content);
    return row;
  };

  /**
   * @param {Node} target
   * @param {number} from
   * @param {number} to
   */
  const buildRows = (target, from, to) => {
    const rows = document.createDocumentFragment();
    for (let index = from; index < to; index += 1) rows.appendChild(buildRow(index));
    target.appendChild(rows);
  };

  const rows = document.createDocumentFragment();
  // Long code is grouped in blocks the browser can skip while they are off-screen
  // (content-visibility). Blocks after the first get their lines only when they come
  // near the screen or when their text is needed (see core/chunks.js), so even
  // hundreds of thousands of lines open at once.
  if (options.chunk !== false && count > CHUNK_THRESHOLD) {
    for (let from = 0; from < count; from += CHUNK_LINES) {
      const to = Math.min(count, from + CHUNK_LINES);
      const chunk = h('span', {
        class: 'chunk',
        attrs: { 'data-first': options.startLine + from, 'data-count': to - from },
      });
      chunk.style.setProperty('--_chunk-lines', String(to - from));
      rows.append(chunk);
      if (from === 0) {
        buildRows(chunk, from, to);
      } else {
        chunk.setAttribute('data-pending', '');
        deferChunk(chunk, () => {
          chunk.removeAttribute('data-pending');
          buildRows(chunk, from, to);
        });
      }
    }
  } else {
    buildRows(rows, 0, count);
  }
  pre.append(rows);
  const element = h('div', { class: 'code-view' }, pre);
  return { element, code: pre, lineCount: count, highlightSkipped };
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
