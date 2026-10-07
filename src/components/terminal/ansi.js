// @ts-check
/**
 * ANSI escape sequence parser for terminal output.
 *
 * Turns text with SGR sequences (colors, bold, underline…) into lines of styled
 * segments. Only what can be shown safely is kept:
 *
 * - SGR (`ESC [ … m`): 16 colors, 256 colors, 24-bit colors and text attributes;
 * - carriage returns and `ESC [ K` / `ESC [ G`: progress bars that redraw their line show
 *   their final state, as in a terminal;
 * - OSC 8 hyperlinks: kept as links when the URL is http(s);
 * - every other escape sequence and control character is removed.
 *
 * The output is plain data (strings and numbers); the component turns it into DOM nodes.
 *
 * @module components/terminal/ansi
 */
import { isSafeUrl } from '../../core/urls.js';

/**
 * A color: an index in the 16-color palette (0–15), or an RGB triplet.
 *
 * @typedef {{ index: number } | { rgb: [number, number, number] }} AnsiColor
 */

/**
 * @typedef {object} AnsiStyle
 * @property {AnsiColor | null} fg
 * @property {AnsiColor | null} bg
 * @property {boolean} bold
 * @property {boolean} dim
 * @property {boolean} italic
 * @property {boolean} underline
 * @property {boolean} inverse
 * @property {boolean} strike
 * @property {string | null} link - Safe http(s) URL of an OSC 8 hyperlink.
 */

/** @typedef {{ text: string, style: AnsiStyle }} Segment */

/** Columns of a tab stop. */
const TAB = 8;
/** Longest line kept, in characters (longer lines are cut, as most terminals wrap). */
export const MAX_LINE = 20_000;
/** Longest escape sequence parsed; longer ones are dropped as garbage. */
const MAX_SEQUENCE = 256;

/** @type {AnsiStyle} */
export const PLAIN = Object.freeze({
  fg: null,
  bg: null,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
  strike: false,
  link: null,
});

/**
 * Converts a 256-color palette index to a color.
 *
 * @param {number} n - 0 to 255.
 * @returns {AnsiColor}
 */
export function color256(n) {
  if (n < 16) return { index: n };
  if (n < 232) {
    const value = n - 16;
    const level = (/** @type {number} */ c) => (c === 0 ? 0 : 55 + c * 40);
    return {
      rgb: [level(Math.floor(value / 36)), level(Math.floor(value / 6) % 6), level(value % 6)],
    };
  }
  const gray = 8 + (n - 232) * 10;
  return { rgb: [gray, gray, gray] };
}

/**
 * Reads an extended color (`38;5;n` or `38;2;r;g;b`) from SGR parameters.
 *
 * @param {number[]} params
 * @param {number} i - Index of the parameter after 38 / 48.
 * @returns {{ color: AnsiColor | null, next: number }}
 */
function extendedColor(params, i) {
  const mode = params[i];
  if (mode === 5) {
    const n = params[i + 1];
    return { color: Number.isInteger(n) && n >= 0 && n <= 255 ? color256(n) : null, next: i + 2 };
  }
  if (mode === 2) {
    const rgb = params.slice(i + 1, i + 4);
    const valid = rgb.length === 3 && rgb.every((c) => Number.isInteger(c) && c >= 0 && c <= 255);
    return {
      color: valid ? { rgb: /** @type {[number, number, number]} */ (rgb) } : null,
      next: i + 4,
    };
  }
  return { color: null, next: params.length };
}

/**
 * Parses SGR parameters ("1;31", "38:2::255:0:0"…) into numbers.
 * Colon sub-parameters are flattened; the optional color space id of `38:2:` is skipped.
 *
 * @param {string} text
 * @returns {number[]}
 */
function sgrParams(text) {
  if (!text) return [0];
  /** @type {number[]} */
  const params = [];
  for (const part of text.split(';')) {
    if (part.includes(':')) {
      const sub = part.split(':').map((p) => (p === '' ? -1 : Number(p)));
      // 38:2:<colorspace>:r:g:b — drop the color space id.
      if ((sub[0] === 38 || sub[0] === 48 || sub[0] === 58) && sub[1] === 2 && sub.length === 6)
        sub.splice(2, 1);
      params.push(...sub.map((n) => (n < 0 ? 0 : n)));
    } else params.push(part === '' ? 0 : Number(part));
  }
  return params.map((n) => (Number.isFinite(n) ? n : -1));
}

/**
 * Applies SGR parameters to a style.
 *
 * @param {AnsiStyle} style
 * @param {number[]} params
 * @returns {AnsiStyle}
 */
export function applySgr(style, params) {
  const next = { ...style };
  for (let i = 0; i < params.length; i += 1) {
    const p = params[i];
    if (p === 0) Object.assign(next, PLAIN, { link: style.link });
    else if (p === 1) next.bold = true;
    else if (p === 2) next.dim = true;
    else if (p === 3) next.italic = true;
    else if (p === 4) next.underline = true;
    else if (p === 7) next.inverse = true;
    else if (p === 9) next.strike = true;
    else if (p === 21) next.underline = true;
    else if (p === 22) next.bold = next.dim = false;
    else if (p === 23) next.italic = false;
    else if (p === 24) next.underline = false;
    else if (p === 27) next.inverse = false;
    else if (p === 29) next.strike = false;
    else if (p >= 30 && p <= 37) next.fg = { index: p - 30 };
    else if (p === 39) next.fg = null;
    else if (p >= 40 && p <= 47) next.bg = { index: p - 40 };
    else if (p === 49) next.bg = null;
    else if (p >= 90 && p <= 97) next.fg = { index: p - 90 + 8 };
    else if (p >= 100 && p <= 107) next.bg = { index: p - 100 + 8 };
    else if (p === 38 || p === 48) {
      const { color, next: after } = extendedColor(params, i + 1);
      if (color) next[p === 38 ? 'fg' : 'bg'] = color;
      i = after - 1;
    } else if (p === 58) {
      // Underline color: not shown, but its parameters must be skipped.
      i = extendedColor(params, i + 1).next - 1;
    }
  }
  return next;
}

/**
 * Two styles are the same (segments can be merged).
 *
 * @param {AnsiStyle} a
 * @param {AnsiStyle} b
 */
function sameStyle(a, b) {
  if (a === b) return true;
  return (
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.inverse === b.inverse &&
    a.strike === b.strike &&
    a.link === b.link &&
    JSON.stringify(a.fg) === JSON.stringify(b.fg) &&
    JSON.stringify(a.bg) === JSON.stringify(b.bg)
  );
}

/**
 * One line being written: characters and their styles, with a cursor, so carriage
 * returns and cursor moves overwrite text like a terminal does.
 */
class LineBuffer {
  constructor() {
    /** @type {string[]} */
    this.chars = [];
    /** @type {AnsiStyle[]} */
    this.styles = [];
    this.cursor = 0;
  }

  /**
   * @param {string} char
   * @param {AnsiStyle} style
   */
  write(char, style) {
    if (this.cursor >= MAX_LINE) return;
    while (this.chars.length < this.cursor) {
      this.chars.push(' ');
      this.styles.push(PLAIN);
    }
    this.chars[this.cursor] = char;
    this.styles[this.cursor] = style;
    this.cursor += 1;
  }

  /** Erases from the cursor to the end of the line. */
  eraseToEnd() {
    this.chars.length = Math.min(this.chars.length, this.cursor);
    this.styles.length = this.chars.length;
  }

  /** Erases the whole line (the cursor stays). */
  eraseAll() {
    this.chars = [];
    this.styles = [];
  }

  /** @returns {Segment[]} */
  segments() {
    /** @type {Segment[]} */
    const segments = [];
    for (let i = 0; i < this.chars.length; i += 1) {
      const style = this.styles[i];
      const last = segments[segments.length - 1];
      if (last && sameStyle(last.style, style)) last.text += this.chars[i];
      else segments.push({ text: this.chars[i], style });
    }
    return segments;
  }
}

/**
 * Replaces literal escapes written in source text (`\e`, `\x1b`, `\033`, `\u001b`) by
 * the escape character, for transcripts written by hand in HTML.
 *
 * @param {string} text
 * @returns {string}
 */
export function decodeLiteralEscapes(text) {
  return text.replace(/\\(?:e|x1b|x1B|033|u001b|u001B)/g, '\u001b');
}

/**
 * Parses terminal output into lines of styled segments.
 *
 * @param {string} text
 * @returns {Segment[][]}
 */
export function parseAnsi(text) {
  /** @type {Segment[][]} */
  const lines = [];
  let line = new LineBuffer();
  /** @type {AnsiStyle} */
  let style = PLAIN;
  const length = text.length;
  let i = 0;

  const newLine = () => {
    lines.push(line.segments());
    line = new LineBuffer();
  };

  while (i < length) {
    const char = text[i];
    const code = char.charCodeAt(0);

    if (char === '\n') {
      newLine();
      i += 1;
    } else if (char === '\r') {
      if (text[i + 1] === '\n') {
        newLine();
        i += 2;
      } else {
        line.cursor = 0;
        i += 1;
      }
    } else if (char === '\t') {
      const stop = Math.min(MAX_LINE, (Math.floor(line.cursor / TAB) + 1) * TAB);
      while (line.cursor < stop) line.write(' ', style);
      i += 1;
    } else if (char === '\b') {
      line.cursor = Math.max(0, line.cursor - 1);
      i += 1;
    } else if (char === '\u001b' || char === '\u009b') {
      const result = readEscape(text, i);
      i = result.end;
      const seq = result.sequence;
      if (seq?.kind === 'csi') {
        if (seq.final === 'm') style = applySgr(style, sgrParams(seq.params));
        else if (seq.final === 'K') {
          const mode = Number(seq.params || 0);
          if (mode === 0) line.eraseToEnd();
          else if (mode === 2) line.eraseAll();
          else if (mode === 1) for (let c = 0; c < line.cursor; c += 1) line.chars[c] = ' ';
        } else if (seq.final === 'G') {
          line.cursor = Math.min(MAX_LINE, Math.max(0, (Number(seq.params) || 1) - 1));
        } else if (seq.final === 'C') {
          line.cursor = Math.min(MAX_LINE, line.cursor + (Number(seq.params) || 1));
        } else if (seq.final === 'D') {
          line.cursor = Math.max(0, line.cursor - (Number(seq.params) || 1));
        }
      } else if (seq?.kind === 'osc') {
        const link = /^8;[^;]*;(.*)$/s.exec(seq.params);
        if (link) style = { ...style, link: link[1] && isSafeUrl(link[1]) ? link[1] : null };
      }
    } else if (code < 0x20 || code === 0x7f || (code >= 0x80 && code < 0xa0)) {
      // Other control characters (bell, NUL…) are not displayed.
      i += 1;
    } else {
      line.write(char, style);
      i += 1;
    }
  }
  lines.push(line.segments());
  // A trailing newline does not make an extra empty line.
  if (lines.length > 1 && lines[lines.length - 1].length === 0 && /\r?\n$/.test(text)) lines.pop();
  return lines;
}

/**
 * Reads an escape sequence starting at `start` (ESC or CSI).
 *
 * @param {string} text
 * @param {number} start
 * @returns {{ end: number, sequence: { kind: "csi" | "osc", params: string, final: string } | null }}
 */
function readEscape(text, start) {
  let i = start;
  /** @type {"csi" | "osc"} */
  let kind = 'csi';
  if (text[i] === '\u009b') {
    i += 1;
  } else {
    const next = text[i + 1];
    if (next === ']') kind = 'osc';
    else if (next === '[') kind = 'csi';
    else if (next === undefined) return { end: i + 1, sequence: null };
    else if ('PX^_'.includes(next)) {
      // DCS, SOS, PM, APC strings: skip until the string terminator.
      const end = findTerminator(text, i + 2);
      return { end, sequence: null };
    } else {
      // Two-character sequences (ESC 7, ESC =, ESC ( B…).
      const skip = '()*+'.includes(next) ? 3 : 2;
      return { end: Math.min(text.length, i + skip), sequence: null };
    }
    i += 2;
  }
  if (kind === 'osc') {
    const end = findTerminator(text, i);
    let body = text.slice(i, end);
    if (body.endsWith('\u0007')) body = body.slice(0, -1);
    else if (body.endsWith('\u001b\\')) body = body.slice(0, -2);
    return { end, sequence: body.length <= 2048 ? { kind, params: body, final: '' } : null };
  }
  // CSI: parameter bytes 0x30–0x3F, intermediate bytes 0x20–0x2F, final byte 0x40–0x7E.
  const paramsStart = i;
  while (i < text.length && i - start < MAX_SEQUENCE) {
    const code = text.charCodeAt(i);
    if (code >= 0x40 && code <= 0x7e) {
      const params = text.slice(paramsStart, i);
      // Private sequences (ESC [ ? 25 l…) are cursor and mode changes: ignored.
      const visible = /^[\d;:]*$/.test(params);
      return {
        end: i + 1,
        sequence: visible ? { kind: 'csi', params, final: text[i] } : null,
      };
    }
    if (code < 0x20 || code > 0x3f) {
      if (code >= 0x20 && code <= 0x2f) {
        i += 1;
        continue;
      }
      // Malformed: stop the sequence here and show what follows.
      return { end: i, sequence: null };
    }
    i += 1;
  }
  return { end: i, sequence: null };
}

/**
 * End of an OSC / DCS string: after BEL or ESC \ (or a bounded length).
 *
 * @param {string} text
 * @param {number} from
 * @returns {number}
 */
function findTerminator(text, from) {
  const limit = Math.min(text.length, from + 4096);
  for (let i = from; i < limit; i += 1) {
    if (text[i] === '\u0007') return i + 1;
    if (text[i] === '\u001b' && text[i + 1] === '\\') return i + 2;
    if (text[i] === '\n') return i;
  }
  return limit;
}

/**
 * Text of a line without styles.
 *
 * @param {Segment[]} segments
 * @returns {string}
 */
export function lineText(segments) {
  let text = '';
  for (const segment of segments) text += segment.text;
  return text;
}

/**
 * Removes every escape sequence and control character (keeps line breaks).
 *
 * @param {string} text
 * @returns {string}
 */
export function stripAnsi(text) {
  return parseAnsi(text).map(lineText).join('\n');
}
