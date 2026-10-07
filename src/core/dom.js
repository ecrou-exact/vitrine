// @ts-check
/**
 * Small DOM helpers. Text is always inserted with `textContent` / text nodes.
 *
 * @module core/dom
 */

/**
 * @typedef {object} ElementProps
 * @property {string} [class] - Class names.
 * @property {string} [part] - Shadow part names.
 * @property {string} [text] - Text content (inserted as text, never HTML).
 * @property {Record<string, string | number | boolean | null | undefined>} [attrs] -
 *   Attributes. `true` sets an empty attribute; `false`, `null` and `undefined` skip it.
 * @property {Record<string, EventListener>} [on] - Event listeners.
 */

/** @typedef {Node | string | null | undefined | false} Child */

/**
 * Creates an element.
 *
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {ElementProps} [props]
 * @param {...Child} children
 * @returns {HTMLElementTagNameMap[K]}
 *
 * @example
 * h('button', { class: 'btn', attrs: { type: 'button' }, text: 'Copy' })
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.part) el.setAttribute('part', props.part);
  if (props.attrs) {
    for (const [name, value] of Object.entries(props.attrs)) {
      if (value === false || value === null || value === undefined) continue;
      el.setAttribute(name, value === true ? '' : String(value));
    }
  }
  if (props.text !== undefined) el.textContent = props.text;
  if (props.on) {
    for (const [type, listener] of Object.entries(props.on)) el.addEventListener(type, listener);
  }
  append(el, children);
  return el;
}

/**
 * Appends children, turning strings into text nodes and skipping empty values.
 *
 * @param {Element | DocumentFragment} parent
 * @param {Child[]} children
 */
export function append(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

let idCounter = 0;

/**
 * Returns a document-unique id with a prefix.
 *
 * @param {string} prefix
 * @returns {string}
 */
export function uid(prefix) {
  idCounter += 1;
  return `vt-${prefix}-${idCounter}`;
}

/**
 * Removes the common leading indentation of a block of text and trims leading and
 * trailing blank lines. Used for content written inline in HTML.
 *
 * @param {string} text
 * @returns {string}
 */
export function dedent(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  let indent = Infinity;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const match = /^[ \t]*/.exec(line);
    indent = Math.min(indent, match ? match[0].length : 0);
    if (indent === 0) break;
  }
  if (!Number.isFinite(indent) || indent === 0) return lines.join('\n');
  return lines.map((line) => line.slice(indent)).join('\n');
}

/**
 * Runs `callback` after `delay` ms of inactivity.
 *
 * @template {unknown[]} A
 * @param {(...args: A) => void} callback
 * @param {number} delay
 * @returns {((...args: A) => void) & { cancel(): void }}
 */
export function debounce(callback, delay) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const debounced = (/** @type {A} */ ...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}
