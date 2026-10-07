// @ts-check
/**
 * Keeps the two editors of `<vt-diff>` (original and modified) scrolled to matching lines.
 *
 * Unchanged lines exist on both sides, so they pair a line of the original with a line of
 * the modified text. Between two such pairs (a change), positions are interpolated: a
 * long removed block on the left advances slowly on the right, and the next unchanged
 * line is aligned again on both sides.
 *
 * @module components/diff/sync
 */

/** @typedef {import('./diff.js').Line} Line */
/** @typedef {[number, number]} Pair - Matching (original, modified) line positions, 1-based. */

/** How long a pane ignores its own scroll events after being scrolled by the other one. */
const LOCK_MS = 150;

/**
 * Matching line positions of the two sides, strictly increasing on both.
 *
 * @param {Line[]} lines
 * @returns {Pair[]}
 */
export function linePairs(lines) {
  /** @type {Pair[]} */
  const pairs = [[1, 1]];
  let oldCount = 0;
  let newCount = 0;
  for (const line of lines) {
    if (line.oldNo !== null) oldCount = Math.max(oldCount, line.oldNo);
    if (line.newNo !== null) newCount = Math.max(newCount, line.newNo);
    if (line.type !== 'context' || line.oldNo === null || line.newNo === null) continue;
    const last = pairs[pairs.length - 1];
    if (line.oldNo > last[0] && line.newNo > last[1]) pairs.push([line.oldNo, line.newNo]);
  }
  const last = pairs[pairs.length - 1];
  // The ends of both texts match too.
  if (oldCount + 1 > last[0] && newCount + 1 > last[1]) pairs.push([oldCount + 1, newCount + 1]);
  return pairs;
}

/**
 * Converts a (fractional) line position from one side to the other.
 *
 * @param {Pair[]} pairs
 * @param {number} position - Line position on the `from` side (1-based, may be fractional).
 * @param {0 | 1} from - 0: original to modified; 1: modified to original.
 * @returns {number}
 */
export function mapLine(pairs, position, from) {
  const to = from === 0 ? 1 : 0;
  let low = 0;
  let high = pairs.length - 1;
  // Last pair at or before the position.
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (pairs[mid][from] <= position) low = mid;
    else high = mid - 1;
  }
  const a = pairs[low];
  const b = pairs[low + 1];
  if (!b) return a[to] + (position - a[from]);
  const span = b[from] - a[from];
  return a[to] + ((position - a[from]) / span) * (b[to] - a[to]);
}

export class EditorSync {
  /**
   * @param {[HTMLElement, HTMLElement]} panes - Scrollable original and modified editors.
   * @param {() => Pair[] | null} pairs - Current line pairs (they change while editing).
   */
  constructor(panes, pairs) {
    this.panes = panes;
    this.pairs = pairs;
    /** @type {Map<HTMLElement, number[]>} Top of every line, per pane. */
    this.tops = new Map();
    /** @type {Map<HTMLElement, number>} */
    this.lockedUntil = new Map();
    this.onScroll = [0, 1].map((index) => () => this.follow(/** @type {0 | 1} */ (index)));
    this.invalidate = () => this.tops.clear();
    this.resize = new ResizeObserver(this.invalidate);
  }

  /** Starts listening. */
  start() {
    this.panes.forEach((pane, index) => {
      pane.addEventListener('scroll', this.onScroll[index], { passive: true });
      // Typing changes line heights (wrapped lines) and the number of lines.
      pane.addEventListener('input', this.invalidate, true);
      this.resize.observe(pane);
    });
    return this;
  }

  /** Stops listening. */
  stop() {
    this.panes.forEach((pane, index) => {
      pane.removeEventListener('scroll', this.onScroll[index]);
      pane.removeEventListener('input', this.invalidate, true);
    });
    this.resize.disconnect();
  }

  /**
   * Top of every line of a pane, in its scroll coordinates.
   *
   * @param {HTMLElement} pane
   * @returns {number[]}
   */
  lineTops(pane) {
    let tops = this.tops.get(pane);
    if (!tops) {
      const origin = pane.getBoundingClientRect().top - pane.scrollTop;
      tops = Array.from(
        pane.querySelectorAll('.editor-layer .line'),
        (line) => line.getBoundingClientRect().top - origin,
      );
      tops.push(pane.scrollHeight);
      this.tops.set(pane, tops);
    }
    return tops;
  }

  /**
   * Line position (1-based, fractional) at the top of a pane.
   *
   * @param {HTMLElement} pane
   * @returns {number}
   */
  positionOf(pane) {
    const tops = this.lineTops(pane);
    const y = pane.scrollTop;
    let low = 0;
    let high = tops.length - 2;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (tops[mid] <= y) low = mid;
      else high = mid - 1;
    }
    const height = tops[low + 1] - tops[low] || 1;
    return low + 1 + Math.min(1, Math.max(0, (y - tops[low]) / height));
  }

  /**
   * Scroll offset that puts a line position at the top of a pane.
   *
   * @param {HTMLElement} pane
   * @param {number} position
   * @returns {number}
   */
  offsetOf(pane, position) {
    const tops = this.lineTops(pane);
    const index = Math.min(tops.length - 2, Math.max(0, Math.floor(position) - 1));
    const fraction = Math.min(1, Math.max(0, position - (index + 1)));
    return tops[index] + fraction * (tops[index + 1] - tops[index]);
  }

  /**
   * Scrolls the other pane to the lines shown by `index`.
   *
   * @param {0 | 1} index
   */
  follow(index) {
    const from = this.panes[index];
    const to = this.panes[index === 0 ? 1 : 0];
    if ((this.lockedUntil.get(from) ?? 0) > performance.now()) return;
    const pairs = this.pairs();
    if (!pairs) return;
    const maxFrom = from.scrollHeight - from.clientHeight;
    const maxTo = to.scrollHeight - to.clientHeight;
    let target;
    // Both ends always match, whatever the lengths of the two texts.
    if (from.scrollTop <= 0) target = 0;
    else if (from.scrollTop >= maxFrom - 1) target = maxTo;
    else target = this.offsetOf(to, mapLine(pairs, this.positionOf(from), index));
    this.scroll(to, target);
  }

  /**
   * Scrolls both panes to a pair of lines (original, modified), a third of the way down.
   *
   * @param {number} original
   * @param {number} modified
   */
  reveal(original, modified) {
    [original, modified].forEach((line, index) => {
      const pane = this.panes[index];
      this.scroll(pane, this.offsetOf(pane, line) - pane.clientHeight / 3);
    });
  }

  /**
   * @param {HTMLElement} pane
   * @param {number} top
   */
  scroll(pane, top) {
    const max = Math.max(0, pane.scrollHeight - pane.clientHeight);
    const value = Math.round(Math.min(max, Math.max(0, top)));
    if (Math.abs(pane.scrollTop - value) < 1) return;
    this.lockedUntil.set(pane, performance.now() + LOCK_MS);
    pane.scrollTop = value;
  }
}
