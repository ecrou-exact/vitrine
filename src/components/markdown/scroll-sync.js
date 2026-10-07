// @ts-check
/**
 * Keeps the source and preview panes of the split view scrolled to the same place.
 *
 * Every rendered block carries a marker with the line where it starts in the source
 * (see render.js). Those markers give pairs of matching positions — "source line 42 is
 * at 1,180 px in the source pane and its block at 2,310 px in the preview" — and the
 * scroll position is interpolated between the two closest pairs, in both directions.
 *
 * @module components/markdown/scroll-sync
 */

/** How long a pane ignores its own scroll events after being scrolled by the other one. */
const LOCK_MS = 150;

/** @typedef {{ source: number, preview: number }} Anchor */

export class ScrollSync {
  /**
   * @param {HTMLElement} source - Scrollable source pane.
   * @param {HTMLElement} preview - Scrollable preview pane.
   */
  constructor(source, preview) {
    this.source = source;
    this.preview = preview;
    /** @type {Anchor[] | null} */
    this.anchors = null;
    /** @type {Map<HTMLElement, number>} Time until which a pane ignores scroll events. */
    this.lockedUntil = new Map();
    this.onSourceScroll = () => this.follow(this.source, this.preview);
    this.onPreviewScroll = () => this.follow(this.preview, this.source);
    this.resize = new ResizeObserver(() => {
      this.anchors = null;
    });
  }

  /** Starts listening. */
  start() {
    this.source.addEventListener('scroll', this.onSourceScroll, { passive: true });
    this.preview.addEventListener('scroll', this.onPreviewScroll, { passive: true });
    // Images loading, fonts, window resizing: any size change invalidates the anchors.
    for (const pane of [this.source, this.preview]) {
      this.resize.observe(pane);
      if (pane.firstElementChild) this.resize.observe(pane.firstElementChild);
    }
    return this;
  }

  /** Stops listening. */
  stop() {
    this.source.removeEventListener('scroll', this.onSourceScroll);
    this.preview.removeEventListener('scroll', this.onPreviewScroll);
    this.resize.disconnect();
  }

  /**
   * Scrolls `to` so it shows what `from` shows.
   *
   * @param {HTMLElement} from
   * @param {HTMLElement} to
   */
  follow(from, to) {
    if (performance.now() < (this.lockedUntil.get(from) ?? 0)) return;
    const anchors = this.anchors ?? (this.anchors = this.measure());
    if (anchors.length < 2) return;
    const key = from === this.source ? 'source' : 'preview';
    const other = key === 'source' ? 'preview' : 'source';
    const y = from.scrollTop;
    let i = 0;
    while (i < anchors.length - 2 && anchors[i + 1][key] <= y) i += 1;
    const a = anchors[i];
    const b = anchors[i + 1];
    const span = b[key] - a[key];
    const ratio = span > 0 ? Math.min(1, Math.max(0, (y - a[key]) / span)) : 0;
    const target = Math.round(a[other] + ratio * (b[other] - a[other]));
    if (Math.abs(to.scrollTop - target) < 1) return;
    this.lockedUntil.set(to, performance.now() + LOCK_MS);
    to.scrollTop = target;
  }

  /**
   * Pairs of matching scroll positions, strictly increasing on both sides, from the top
   * of both panes to the bottom of both panes.
   *
   * @returns {Anchor[]}
   */
  measure() {
    const rows = this.source.querySelectorAll('.line');
    const first = /** @type {HTMLElement | undefined} */ (rows[0]);
    if (!first) return [];
    // Source lines never wrap: line N is at a fixed distance from the first line. This
    // also works for lines inside blocks the browser has not laid out yet.
    const base = offsetIn(this.source, first);
    const lineHeight = first.getBoundingClientRect().height || 1;
    const maxSource = Math.max(0, this.source.scrollHeight - this.source.clientHeight);
    const maxPreview = Math.max(0, this.preview.scrollHeight - this.preview.clientHeight);

    /** @type {Anchor[]} */
    const anchors = [{ source: 0, preview: 0 }];
    for (const marker of this.preview.querySelectorAll('[data-vt-line]')) {
      const line = Number(marker.getAttribute('data-vt-line'));
      // Empty markers have no box of their own: measure the block that follows.
      const block = marker.nextElementSibling ?? marker;
      const anchor = {
        source: base + (line - 1) * lineHeight,
        preview: offsetIn(this.preview, block),
      };
      const last = anchors[anchors.length - 1];
      if (anchor.source > last.source && anchor.preview > last.preview) anchors.push(anchor);
    }
    // Bottoms always match: the end of the source shows the end of the preview.
    while (anchors.length > 1) {
      const last = anchors[anchors.length - 1];
      if (last.source < maxSource && last.preview < maxPreview) break;
      anchors.pop();
    }
    anchors.push({ source: maxSource, preview: maxPreview });
    return anchors;
  }
}

/**
 * Distance from the top of a scroll container's content to an element.
 *
 * @param {HTMLElement} container
 * @param {Element} element
 * @returns {number}
 */
function offsetIn(container, element) {
  return (
    element.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop
  );
}
