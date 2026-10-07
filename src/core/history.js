// @ts-check
/**
 * Undo / redo history of an editor.
 *
 * Kept outside the editor so it survives re-renders (theme change, wrap toggle…).
 * Consecutive keystrokes of the same kind are grouped into one step.
 *
 * @module core/history
 */

/** Steps kept. */
const MAX_STEPS = 300;
/** Characters kept across all steps (avoids holding hundreds of copies of a huge text). */
const MAX_CHARACTERS = 20_000_000;
/** Keystrokes closer than this are grouped. */
const GROUP_MS = 600;

/**
 * @typedef {object} Snapshot
 * @property {string} value
 * @property {number} start - Selection start after the change.
 * @property {number} end - Selection end after the change.
 */

export class EditHistory {
  /**
   * @param {string} value - Initial text.
   */
  constructor(value) {
    /** @type {Snapshot[]} */
    this.steps = [{ value, start: 0, end: 0 }];
    this.index = 0;
    this.lastKind = '';
    this.lastTime = 0;
    /** @type {Set<() => void>} */
    this.listeners = new Set();
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.steps.length - 1;
  }

  /** @returns {Snapshot} */
  get current() {
    return this.steps[this.index];
  }

  /**
   * Records the state after a change.
   *
   * @param {Snapshot} snapshot
   * @param {string} kind - Input type (`insertText`, `deleteContentBackward`, `insertFromPaste`…).
   */
  record(snapshot, kind) {
    if (snapshot.value === this.current.value) return;
    const now = Date.now();
    const groupable = kind === 'insertText' || kind.startsWith('delete');
    const group =
      groupable && kind === this.lastKind && now - this.lastTime < GROUP_MS && !this.canRedo;
    this.steps.length = this.index + 1;
    if (group && this.index > 0) this.steps[this.index] = snapshot;
    else {
      this.steps.push(snapshot);
      this.index += 1;
    }
    this.lastKind = kind;
    this.lastTime = now;
    this.trim();
    this.notify();
  }

  /** @returns {Snapshot | null} The state to restore, or `null`. */
  undo() {
    if (!this.canUndo) return null;
    this.index -= 1;
    this.lastKind = '';
    this.notify();
    return this.current;
  }

  /** @returns {Snapshot | null} The state to restore, or `null`. */
  redo() {
    if (!this.canRedo) return null;
    this.index += 1;
    this.lastKind = '';
    this.notify();
    return this.current;
  }

  /** Drops the oldest steps beyond the limits. */
  trim() {
    let total = this.steps.reduce((sum, step) => sum + step.value.length, 0);
    while (
      this.steps.length > 1 &&
      (this.steps.length > MAX_STEPS || total > MAX_CHARACTERS) &&
      this.index > 0
    ) {
      total -= /** @type {Snapshot} */ (this.steps.shift()).value.length;
      this.index -= 1;
    }
  }

  /**
   * @param {() => void} listener
   * @returns {() => void}
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) listener();
  }
}
