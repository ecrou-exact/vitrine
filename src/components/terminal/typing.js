// @ts-check
/**
 * Replays a rendered transcript: commands are typed character by character, then their
 * output appears. The final DOM is built first; the player only hides and reveals it, so
 * the element keeps its size and stopping at any time shows the complete transcript.
 *
 * @module components/terminal/typing
 */

/** Pause after a command is typed, before its output appears (ms). */
const AFTER_COMMAND = 350;
/** Pause after an output block (ms). */
const AFTER_OUTPUT = 250;

export class TypingPlayer {
  /**
   * @param {HTMLElement} container - Element holding the `.entry` elements.
   * @param {{ speed: number, commandText: (target: Element) => string, onEnd?: () => void }} options
   *   `speed`: ms per character; `commandText`: the command shown in a `.cmd` element, from
   *   the parsed transcript (never read back from the page).
   */
  constructor(container, options) {
    this.container = container;
    this.options = options;
    /** @type {AbortController | null} */
    this.abort = null;
    /** @type {Map<Element, Node[]>} Final content of commands being typed. */
    this.finals = new Map();
    /** @type {IntersectionObserver | null} */
    this.observer = null;
    this.playing = false;
  }

  /** Hides the transcript and plays it once it is on screen. */
  start() {
    this.stop();
    const entries = this.entries();
    if (!entries.length) return;
    for (const entry of entries) entry.classList.add('typing-hidden');
    this.playing = true;
    if (typeof IntersectionObserver === 'undefined') {
      this.play();
      return;
    }
    this.observer = new IntersectionObserver(
      (records) => {
        if (!records.some((record) => record.isIntersecting)) return;
        this.observer?.disconnect();
        this.observer = null;
        this.play();
      },
      { threshold: 0.2 },
    );
    this.observer.observe(this.container);
  }

  /** @returns {HTMLElement[]} */
  entries() {
    return /** @type {HTMLElement[]} */ (Array.from(this.container.querySelectorAll('.entry')));
  }

  async play() {
    const controller = new AbortController();
    this.abort = controller;
    const { signal } = controller;
    try {
      for (const entry of this.entries()) {
        entry.classList.remove('typing-hidden');
        if (entry.classList.contains('command')) {
          await this.type(entry, signal);
          await sleep(AFTER_COMMAND, signal);
        } else {
          await sleep(AFTER_OUTPUT, signal);
        }
      }
      this.end();
    } catch {
      // Stopped: stop() already restored everything.
    }
  }

  /**
   * Types one command.
   *
   * @param {HTMLElement} entry
   * @param {AbortSignal} signal
   */
  async type(entry, signal) {
    const target = entry.querySelector('.cmd');
    if (!target) return;
    const final = Array.from(target.childNodes);
    this.finals.set(target, final);
    const text = this.options.commandText(target);
    const typed = document.createTextNode('');
    const cursor = document.createElement('span');
    cursor.className = 'typing-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    target.replaceChildren(typed, cursor);
    const speed = this.options.speed;
    for (let i = 1; i <= text.length; i += 1) {
      typed.data = text.slice(0, i);
      // A little irregularity reads as typing rather than printing.
      await sleep(speed * (0.6 + ((i * 7919) % 10) / 12), signal);
    }
    target.replaceChildren(...final);
    this.finals.delete(target);
  }

  /** Shows everything now. */
  stop() {
    this.abort?.abort();
    this.abort = null;
    this.observer?.disconnect();
    this.observer = null;
    for (const [target, final] of this.finals) target.replaceChildren(...final);
    this.finals.clear();
    for (const entry of this.entries()) entry.classList.remove('typing-hidden');
    if (this.playing) this.end();
  }

  end() {
    this.playing = false;
    this.options.onEnd?.();
  }
}

/**
 * @param {number} ms
 * @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('stopped'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('stopped'));
      },
      { once: true },
    );
  });
}
