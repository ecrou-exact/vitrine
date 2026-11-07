// @ts-check
/**
 * Dragging cards between and inside the lists of a board with a pointer.
 *
 * A mouse drags a card from anywhere on it; a finger or a pen from its handle, so the page
 * still scrolls under a finger. The card follows the pointer as a copy while the card itself
 * moves through the lists to show where it will land, and the lists and the page scroll near
 * their edges.
 *
 * @module components/board/drag
 */

/** Pixels the pointer moves before a press becomes a drag. */
const THRESHOLD = 5;
/** Distance from an edge, in pixels, at which scrolling starts. */
const EDGE = 48;
/** Pixels scrolled per pointer move near an edge. */
const STEP = 14;

/**
 * @typedef {object} DragCallbacks
 * @property {(id: string) => void} start
 * @property {(id: string, column: string, index: number) => void} drop
 * @property {() => void} cancel
 */

export class BoardDrag {
  /**
   * @param {ShadowRoot} root
   * @param {HTMLElement} layer - Where the moving copy is drawn.
   * @param {DragCallbacks} callbacks
   */
  constructor(root, layer, callbacks) {
    this.root = root;
    this.layer = layer;
    this.callbacks = callbacks;
    /** @type {{ id: string, card: HTMLElement, x: number, y: number, dx: number, dy: number } | null} */
    this.pending = null;
    this.dragging = false;
    /** @type {HTMLElement | null} */
    this.ghost = null;
    this.justDropped = false;
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);
    this.onKey = this.onKey.bind(this);
  }

  /**
   * Listens to presses on the cards of a board.
   *
   * @param {HTMLElement} board
   */
  attach(board) {
    board.addEventListener('pointerdown', (event) => this.onDown(event));
    // A drop must not also count as a press on the card.
    board.addEventListener(
      'click',
      (event) => {
        if (!this.justDropped) return;
        this.justDropped = false;
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );
  }

  /** @param {PointerEvent} event */
  onDown(event) {
    if (event.button !== 0 || this.pending) return;
    const target = /** @type {HTMLElement} */ (event.target);
    const card = /** @type {HTMLElement | null} */ (target.closest('[data-task]'));
    if (!card) return;
    const handle = target.closest('.board-handle');
    if (event.pointerType !== 'mouse' && !handle) return;
    if (!handle && target.closest('input, textarea, select, a, .board-action')) return;
    const rect = card.getBoundingClientRect();
    this.pending = {
      id: /** @type {string} */ (card.dataset.task),
      card,
      x: event.clientX,
      y: event.clientY,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
    };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey, true);
  }

  /** @param {PointerEvent} event */
  onMove(event) {
    const pending = this.pending;
    if (!pending) return;
    if (!this.dragging) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < THRESHOLD) return;
      this.begin(pending);
    }
    event.preventDefault();
    this.place(event.clientX, event.clientY);
    this.scroll(event.clientX, event.clientY);
  }

  /**
   * @param {NonNullable<BoardDrag['pending']>} pending
   */
  begin(pending) {
    this.dragging = true;
    const rect = pending.card.getBoundingClientRect();
    const ghost = /** @type {HTMLElement} */ (pending.card.cloneNode(true));
    ghost.classList.add('board-ghost');
    ghost.removeAttribute('data-task');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.setProperty('width', `${rect.width}px`);
    this.ghost = ghost;
    this.layer.append(ghost);
    pending.card.classList.add('board-placeholder');
    this.layer.classList.add('board-dragging');
    this.callbacks.start(pending.id);
  }

  /**
   * Moves the copy under the pointer and the card where it would land.
   *
   * @param {number} x
   * @param {number} y
   */
  place(x, y) {
    const pending = /** @type {NonNullable<BoardDrag['pending']>} */ (this.pending);
    this.ghost?.style.setProperty(
      'transform',
      `translate(${x - pending.dx}px, ${y - pending.dy}px)`,
    );
    const under = /** @type {HTMLElement | null} */ (this.root.elementFromPoint(x, y));
    const list = /** @type {HTMLElement | null} */ (under?.closest('[data-list]'));
    if (!list) return;
    const cards = [...list.querySelectorAll('[data-task]')].filter((card) => card !== pending.card);
    const next = cards.find((card) => {
      const rect = card.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    });
    if (next) {
      if (next.previousElementSibling !== pending.card) list.insertBefore(pending.card, next);
    } else if (list.lastElementChild !== pending.card) list.append(pending.card);
  }

  /**
   * Scrolls the board, the list under the pointer, and the page, near their edges.
   *
   * @param {number} x
   * @param {number} y
   */
  scroll(x, y) {
    const board = /** @type {HTMLElement | null} */ (this.root.querySelector('.board-scroll'));
    if (board) {
      const rect = board.getBoundingClientRect();
      if (x < rect.left + EDGE) board.scrollLeft -= STEP;
      else if (x > rect.right - EDGE) board.scrollLeft += STEP;
    }
    const list = /** @type {HTMLElement | null} */ (
      /** @type {HTMLElement | null} */ (this.root.elementFromPoint(x, y))?.closest('[data-list]')
    );
    if (list && list.scrollHeight > list.clientHeight) {
      const rect = list.getBoundingClientRect();
      if (y < rect.top + EDGE) list.scrollTop -= STEP;
      else if (y > rect.bottom - EDGE) list.scrollTop += STEP;
    }
    if (y < EDGE) window.scrollBy(0, -STEP);
    else if (y > window.innerHeight - EDGE) window.scrollBy(0, STEP);
  }

  onUp() {
    const pending = this.pending;
    const dropped = this.dragging && pending;
    let column = '';
    let index = 0;
    if (dropped) {
      const list = /** @type {HTMLElement} */ (pending.card.closest('[data-list]'));
      column = list.dataset.list ?? '';
      index = [...list.querySelectorAll('[data-task]')].indexOf(pending.card);
    }
    this.stop();
    if (dropped) {
      this.justDropped = true;
      setTimeout(() => (this.justDropped = false), 0);
      this.callbacks.drop(pending.id, column, Math.max(0, index));
    }
  }

  /** @param {KeyboardEvent} event */
  onKey(event) {
    if (event.key !== 'Escape' || !this.pending) return;
    event.preventDefault();
    event.stopPropagation();
    const was = this.dragging;
    this.stop();
    if (was) this.callbacks.cancel();
  }

  /** Ends a drag, without deciding anything. */
  stop() {
    this.ghost?.remove();
    this.ghost = null;
    this.pending?.card.classList.remove('board-placeholder');
    this.layer.classList.remove('board-dragging');
    this.pending = null;
    this.dragging = false;
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKey, true);
  }
}
