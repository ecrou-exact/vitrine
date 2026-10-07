// @ts-check
/**
 * Splits highlighted code into lines while keeping token spans intact.
 *
 * Highlighters produce spans that may cross line breaks (multi-line comments,
 * template strings…). To render one element per line, every span still open at a
 * line break is closed and re-opened on the next line.
 *
 * @module core/lines
 */

/**
 * Splits a fragment of text and `<span class="hljs-…">` elements into one fragment per line.
 *
 * @param {DocumentFragment | Element} root - Sanitized highlighted code.
 * @returns {DocumentFragment[]}
 */
export function splitLines(root) {
  /** @type {DocumentFragment[]} */
  const lines = [];
  /** @type {Element[]} */
  const open = [];
  let line = document.createDocumentFragment();
  /** @type {Node} */
  let current = line;

  const breakLine = () => {
    lines.push(line);
    line = document.createDocumentFragment();
    current = line;
    for (const el of open) {
      const clone = el.cloneNode(false);
      current.appendChild(clone);
      current = clone;
    }
  };

  /** @param {Node} node */
  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = (node.nodeValue ?? '').split('\n');
      parts.forEach((part, index) => {
        if (index > 0) breakLine();
        if (part) current.appendChild(document.createTextNode(part));
      });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = /** @type {Element} */ (node);
    current.appendChild(el.cloneNode(false));
    current = /** @type {Node} */ (current.lastChild);
    open.push(el);
    for (const child of Array.from(el.childNodes)) visit(child);
    open.pop();
    current = /** @type {Node} */ (current.parentNode);
  };

  for (const child of Array.from(root.childNodes)) visit(child);
  lines.push(line);
  return lines;
}

/**
 * Splits plain text into line fragments (no highlighting).
 *
 * @param {string} text
 * @returns {DocumentFragment[]}
 */
export function plainLines(text) {
  return text.split('\n').map((content) => {
    const fragment = document.createDocumentFragment();
    if (content) fragment.appendChild(document.createTextNode(content));
    return fragment;
  });
}
