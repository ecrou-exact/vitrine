// @ts-check
/**
 * Blocks of lines filled on demand.
 *
 * Long code is split in blocks of lines. Building every line up front is what makes
 * very large content slow (a 20,000-object JSON document is 220,000 lines), so a block
 * only gets its lines when it comes near the screen, or when something needs its text
 * (search, jumping to a line).
 *
 * This module has no dependencies so search and every component can use it.
 *
 * @module core/chunks
 */

/** @type {WeakMap<Element, () => void>} */
const pending = new WeakMap();

/** @type {IntersectionObserver | null} */
let observer = null;

/**
 * @returns {IntersectionObserver | null}
 */
function getObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) fillChunk(entry.target);
    },
    // Fill blocks a little before they are visible when the page itself scrolls.
    { rootMargin: '600px 0px' },
  );
  return observer;
}

/**
 * Registers an empty block and the function that fills it.
 *
 * @param {Element} chunk
 * @param {() => void} fill
 */
export function deferChunk(chunk, fill) {
  pending.set(chunk, fill);
  const io = getObserver();
  if (io) io.observe(chunk);
  else fillChunk(chunk);
}

/**
 * Fills a block now, if it is still empty.
 *
 * @param {Element} chunk
 */
export function fillChunk(chunk) {
  const fill = pending.get(chunk);
  if (!fill) return;
  pending.delete(chunk);
  observer?.unobserve(chunk);
  fill();
}

/**
 * Fills every pending block inside an element (before searching its text).
 *
 * @param {ParentNode} root
 */
export function fillChunks(root) {
  for (const chunk of Array.from(root.querySelectorAll('.chunk[data-pending]'))) fillChunk(chunk);
}

/**
 * Returns the row of a line number, filling its block first when needed.
 *
 * @param {ParentNode} root
 * @param {number} line - Line number as displayed.
 * @returns {HTMLElement | null}
 */
export function lineElement(root, line) {
  for (const chunk of Array.from(root.querySelectorAll('.chunk[data-pending]'))) {
    const first = Number(chunk.getAttribute('data-first'));
    const count = Number(chunk.getAttribute('data-count'));
    if (line >= first && line < first + count) {
      fillChunk(chunk);
      break;
    }
  }
  return root.querySelector(`.line[data-line="${line}"]`);
}
