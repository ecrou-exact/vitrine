// @ts-check
/**
 * TeX for <vt-math>: equations split from the content, math found between delimiters in
 * text, macros, and a second barrier on the MathML that Temml builds.
 *
 * @module components/math/math
 */

/** Characters of TeX per equation. */
export const MAX_TEX = 20_000;
/** Equations per element. */
export const MAX_EQUATIONS = 500;

/**
 * @typedef {{ type: "text", text: string } | { type: "math", tex: string, display: boolean }} Segment
 */

/**
 * Equations of the content: blocks separated by blank lines, unless they are inside an
 * environment (`\begin{align}` … `\end{align}`) that spans them.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitEquations(text) {
  /** @type {string[]} */
  const equations = [];
  let current = '';
  let depth = 0;
  for (const line of text.split('\n')) {
    depth += (line.match(/\\begin\{/g) ?? []).length - (line.match(/\\end\{/g) ?? []).length;
    if (!line.trim() && depth <= 0) {
      if (current.trim()) equations.push(current.trim());
      current = '';
      depth = 0;
      continue;
    }
    current += `${current ? '\n' : ''}${line}`;
  }
  if (current.trim()) equations.push(current.trim());
  return equations.slice(0, MAX_EQUATIONS).map((tex) => tex.replace(/^\$\$([\s\S]*)\$\$$|^\\\[([\s\S]*)\\\]$/, (_, a, b) => (a ?? b).trim())); // prettier-ignore
}

/**
 * Splits text into text and math: `$$…$$` and `\[…\]` are display math, `$…$` and `\(…\)`
 * inline math. `\$` is a dollar sign; a `$` followed by a digit only closes math when it
 * opened some, so "$5 and $10" stays text.
 *
 * @param {string} text
 * @returns {Segment[]}
 */
export function splitMath(text) {
  /** @type {Segment[]} */
  const segments = [];
  let plain = '';
  let i = 0;
  const flush = () => {
    if (plain) segments.push({ type: 'text', text: plain.replace(/\\\$/g, '$') });
    plain = '';
  };
  while (i < text.length) {
    const rest = text.slice(i, i + 2);
    /** @type {[string, string, boolean] | null} */
    const open =
      rest === '$$' ? ['$$', '$$', true]
      : rest === '\\[' ? ['\\[', '\\]', true]
      : rest === '\\(' ? ['\\(', '\\)', false]
      : text[i] === '$' && text[i - 1] !== '\\' && !/\s/.test(text[i + 1] ?? ' ') ? ['$', '$', false]
      : null; // prettier-ignore
    if (!open || (text[i] === '\\' && text[i - 1] === '\\')) {
      plain += text[i];
      i += 1;
      continue;
    }
    const [start, end, display] = open;
    const close = findClose(text, i + start.length, end);
    if (close < 0) {
      plain += text[i];
      i += 1;
      continue;
    }
    const tex = text.slice(i + start.length, close);
    flush();
    segments.push({ type: 'math', tex: tex.trim(), display });
    i = close + end.length;
  }
  flush();
  return segments;
}

/**
 * @param {string} text
 * @param {number} from
 * @param {string} end
 * @returns {number} Position of the closing delimiter, or -1.
 */
function findClose(text, from, end) {
  for (let i = from; i < text.length && i - from <= MAX_TEX; i += 1) {
    if (text[i] === '\\' && end !== '\\]' && end !== '\\)') {
      i += 1;
      continue;
    }
    if (!text.startsWith(end, i)) continue;
    if (end === '$') {
      // Inline math never spans a blank line, and ends before a non-space.
      if (/\s/.test(text[i - 1] ?? '')) continue;
      if (/\d/.test(text[i + 1] ?? '')) continue;
    }
    if (end === '\\]' || end === '\\)') {
      if (text[i - 1] === '\\') continue;
    }
    return i;
  }
  return -1;
}

/**
 * Macros from JSON: `{"\\R": "\\mathbb{R}"}`. Names must be commands; definitions are text.
 *
 * @param {string | null} value
 * @returns {Record<string, string>}
 */
export function parseMacros(value) {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    /** @type {Record<string, string>} */
    const macros = Object.create(null);
    for (const [name, definition] of Object.entries(parsed).slice(0, 200)) {
      if (/^\\[A-Za-z]{1,40}$/.test(name) && typeof definition === 'string')
        macros[name] = definition.slice(0, 2000);
    }
    return macros;
  } catch {
    return {};
  }
}

// ------------------------------------------------------------------ second barrier

/** MathML Core elements, and the `span` Temml uses around errors. */
const ELEMENTS = new Set(
  `math semantics annotation mrow mi mn mo ms mtext mspace mpadded mphantom mfrac msqrt mroot
  msub msup msubsup munder mover munderover mmultiscripts mprescripts none mtable mtr mtd
  menclose mstyle merror maction mlabeledtr`.split(/\s+/),
);

/** Attributes of MathML Core and the presentation attributes Temml writes. */
const ATTRIBUTES = new Set(
  `display displaystyle scriptlevel mathvariant mathsize mathcolor mathbackground dir class
  stretchy symmetric largeop movablelimits fence separator form lspace rspace minsize maxsize
  width height depth voffset linethickness notation encoding columnalign rowalign columnspan
  rowspan columnlines rowlines columnspacing rowspacing frame framespacing accent accentunder
  linebreak xmlns`.split(/\s+/),
);

/** CSS properties Temml sets on MathML; any other is dropped. */
const STYLES = new Set(
  `width height padding padding-top padding-right padding-bottom padding-left padding-inline-start
  padding-inline-end margin margin-left margin-right margin-top margin-bottom text-align
  font-weight font-style font-family color background-color border border-top border-right
  border-bottom border-left border-color border-style border-width position top right bottom
  left transform white-space math-depth math-style display vertical-align min-width`.split(/\s+/),
);

/**
 * Checks the MathML built by Temml before it reaches the page, the way the sanitizer checks
 * HTML: unknown elements are removed (their text kept), unknown attributes and any `href`
 * are removed, colors and lengths must be plain values, and inline styles keep only the
 * properties Temml uses, without `url()`.
 *
 * @param {Element} root
 */
export function scrubMath(root) {
  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (!element.isConnected && !root.contains(element)) continue;
    const name = element.localName;
    if (!ELEMENTS.has(name) && name !== 'span') {
      element.replaceWith(document.createTextNode(element.textContent ?? ''));
      continue;
    }
    for (const attr of Array.from(element.attributes)) {
      const key = attr.name.toLowerCase();
      if (key === 'style') continue;
      if (!ATTRIBUTES.has(key) || !safeValue(attr.value)) element.removeAttribute(attr.name);
    }
    if (
      element.localName === 'annotation' &&
      element.getAttribute('encoding') !== 'application/x-tex'
    )
      element.remove();
    scrubStyle(/** @type {HTMLElement | MathMLElement} */ (element));
  }
}

/**
 * @param {string} value
 */
function safeValue(value) {
  return value.length <= 200 && !/[<>"'`\\]|url\s*\(|expression\s*\(|javascript:|@/i.test(value);
}

/**
 * @param {HTMLElement | MathMLElement} element
 */
function scrubStyle(element) {
  const style = /** @type {CSSStyleDeclaration | undefined} */ (/** @type {any} */ (element).style);
  if (!style) return;
  for (const property of Array.from(style)) {
    const value = style.getPropertyValue(property);
    if (!STYLES.has(property) || !safeValue(value)) style.removeProperty(property);
  }
}

/**
 * The TeX of a rendered equation and its MathML, for copying.
 *
 * @param {Element} math
 * @returns {string}
 */
export function mathMarkup(math) {
  return new XMLSerializer().serializeToString(math);
}
