// @ts-check
/**
 * Regular expressions: a parser that turns a JavaScript pattern into a tree (for
 * highlighting and explanation), and a matcher with limits on text length, number of
 * matches and time.
 *
 * @module components/regex/pattern
 */

/** Longest pattern read. */
export const MAX_PATTERN_LENGTH = 2000;
/** Longest test text matched; the rest is shown but not tested. */
export const MAX_TEXT_LENGTH = 100_000;
/** Most matches kept. */
export const MAX_REGEX_MATCHES = 1000;
/** Time budget for all matches, checked between two matches (ms). */
export const TIME_BUDGET = 100;
/** Flags in the order they are written. */
export const FLAGS = /** @type {const} */ (['d', 'g', 'i', 'm', 's', 'u', 'v', 'y']);

/**
 * @typedef {{ type: 'alt', start: number, end: number, alternatives: RegexNode[], pipes: number[] }
 *   | { type: 'seq', start: number, end: number, items: RegexNode[] }
 *   | { type: 'group', start: number, end: number, kind: GroupKind, n: number, name: string, open: number, close: number, body: RegexNode }
 *   | { type: 'class', start: number, end: number, negate: boolean, items: string[] }
 *   | { type: 'any', start: number, end: number }
 *   | { type: 'anchor', start: number, end: number, kind: 'start'|'end'|'boundary'|'not-boundary' }
 *   | { type: 'escape', start: number, end: number, kind: string, text: string }
 *   | { type: 'backref', start: number, end: number, ref: string }
 *   | { type: 'literal', start: number, end: number, text: string }
 *   | { type: 'quant', start: number, end: number, target: RegexNode, min: number, max: number, lazy: boolean, qStart: number }} RegexNode
 */
/** @typedef {'capture'|'named'|'non-capture'|'lookahead'|'negative-lookahead'|'lookbehind'|'negative-lookbehind'|'modifiers'} GroupKind */

/**
 * @typedef {object} RegexMatch
 * @property {number} index - Start offset in the text.
 * @property {number} end - End offset.
 * @property {string} text - The matched text.
 * @property {(string | undefined)[]} groups - Captured groups, from group 1.
 * @property {([number, number] | undefined)[]} ranges - Offsets of each group, from group 1.
 * @property {Record<string, string | undefined>} named - Named groups.
 */

/**
 * @typedef {object} MatchResult
 * @property {RegexMatch[]} matches
 * @property {boolean} capped - Stopped at {@link MAX_REGEX_MATCHES}.
 * @property {boolean} timedOut - Stopped at {@link TIME_BUDGET}.
 * @property {boolean} truncated - The text was longer than {@link MAX_TEXT_LENGTH}.
 * @property {number} ms - Time spent.
 */

const SHORTHANDS = /** @type {Record<string, string>} */ ({
  d: 'digit', D: 'not-digit', w: 'word', W: 'not-word', s: 'space', S: 'not-space',
}); // prettier-ignore
const CONTROLS = /** @type {Record<string, string>} */ ({
  n: '\\n', r: '\\r', t: '\\t', f: '\\f', v: '\\v', 0: '\\0',
}); // prettier-ignore

/**
 * Normalizes a flag string: known flags only, once each, in order; `u` and `v` exclude
 * each other (`v` wins).
 *
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function cleanFlags(value) {
  const set = new Set(String(value ?? '').split(''));
  if (set.has('v')) set.delete('u');
  return FLAGS.filter((flag) => set.has(flag)).join('');
}

/**
 * Compiles a pattern.
 *
 * @param {string} pattern
 * @param {string} flags
 * @returns {{ regex: RegExp | null, error: string }}
 */
export function compile(pattern, flags) {
  if (pattern.length > MAX_PATTERN_LENGTH) return { regex: null, error: 'pattern too long' };
  try {
    return { regex: new RegExp(pattern, flags), error: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { regex: null, error: message.replace(/^Invalid regular expression: /, '') };
  }
}

/**
 * Parses a pattern into a tree. Never throws: what is not understood is read as text.
 *
 * @param {string} pattern
 * @returns {{ tree: RegexNode, groups: number }}
 */
export function parsePattern(pattern) {
  const source = pattern.slice(0, MAX_PATTERN_LENGTH);
  let pos = 0;
  let groups = 0;

  /** @returns {RegexNode} */
  const parseAlt = () => {
    const start = pos;
    /** @type {RegexNode[]} */
    const alternatives = [parseSeq()];
    /** @type {number[]} */
    const pipes = [];
    while (source[pos] === '|') {
      pipes.push(pos);
      pos += 1;
      alternatives.push(parseSeq());
    }
    if (alternatives.length === 1) return alternatives[0];
    return { type: 'alt', start, end: pos, alternatives, pipes };
  };

  /** @returns {RegexNode} */
  const parseSeq = () => {
    const start = pos;
    /** @type {RegexNode[]} */
    const items = [];
    while (pos < source.length && source[pos] !== '|' && source[pos] !== ')') {
      const atom = parseAtom();
      const quantified = parseQuantifier(atom);
      const last = items[items.length - 1];
      const plain = (/** @type {RegexNode} */ node) =>
        node.type === 'literal' && node.end - node.start === node.text.length;
      if (plain(quantified) && last && plain(last) && last.end === quantified.start) {
        if (last.type !== 'literal' || quantified.type !== 'literal') continue;
        last.text += quantified.text;
        last.end = quantified.end;
      } else items.push(quantified);
    }
    return { type: 'seq', start, end: pos, items };
  };

  /**
   * @param {RegexNode} atom
   * @returns {RegexNode}
   */
  const parseQuantifier = (atom) => {
    const qStart = pos;
    const c = source[pos];
    let min;
    let max;
    if (c === '*') [min, max] = [0, Infinity];
    else if (c === '+') [min, max] = [1, Infinity];
    else if (c === '?') [min, max] = [0, 1];
    else if (c === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(source.slice(pos));
      if (!m) return atom;
      min = Number(m[1]);
      max = m[2] === undefined ? min : m[3] ? Number(m[3]) : Infinity;
      pos += m[0].length - 1;
    } else return atom;
    pos += 1;
    const lazy = source[pos] === '?';
    if (lazy) pos += 1;
    return { type: 'quant', start: atom.start, end: pos, target: atom, min, max, lazy, qStart };
  };

  /** @returns {RegexNode} */
  const parseAtom = () => {
    const start = pos;
    const c = source[pos];
    if (c === '(') return parseGroup();
    if (c === '[') return parseClass();
    if (c === '.') return { type: 'any', start, end: (pos += 1) };
    if (c === '^') return { type: 'anchor', start, end: (pos += 1), kind: 'start' };
    if (c === '$') return { type: 'anchor', start, end: (pos += 1), kind: 'end' };
    if (c === '\\') return parseEscape();
    pos += 1;
    return { type: 'literal', start, end: pos, text: c };
  };

  /** @returns {RegexNode} */
  const parseGroup = () => {
    const start = pos;
    pos += 1;
    /** @type {GroupKind} */
    let kind = 'capture';
    let name = '';
    const rest = source.slice(pos);
    const prefixes = /** @type {[string, GroupKind][]} */ ([
      ['?:', 'non-capture'], ['?=', 'lookahead'], ['?!', 'negative-lookahead'],
      ['?<=', 'lookbehind'], ['?<!', 'negative-lookbehind'],
    ]); // prettier-ignore
    const named = /^\?<([A-Za-z_$][\w$]*)>/.exec(rest);
    const modifiers = /^\?[imsx-]+:/.exec(rest);
    const prefix = prefixes.find(([p]) => rest.startsWith(p));
    if (named) {
      kind = 'named';
      name = named[1];
      pos += named[0].length;
    } else if (prefix) {
      kind = prefix[1];
      pos += prefix[0].length;
    } else if (modifiers) {
      kind = 'modifiers';
      name = modifiers[0].slice(1, -1);
      pos += modifiers[0].length;
    }
    const n = kind === 'capture' || kind === 'named' ? ++groups : 0;
    const open = pos;
    const body = parseAlt();
    const close = pos;
    if (source[pos] === ')') pos += 1;
    return { type: 'group', start, end: pos, kind, n, name, open, close, body };
  };

  /** @returns {RegexNode} */
  const parseClass = () => {
    const start = pos;
    pos += 1;
    const negate = source[pos] === '^';
    if (negate) pos += 1;
    /** @type {string[]} */
    const items = [];
    let depth = 0;
    let item = '';
    while (pos < source.length) {
      const c = source[pos];
      if (c === '\\') {
        item += source.slice(pos, pos + 2);
        pos += 2;
      } else {
        if (c === '[') depth += 1;
        if (c === ']') {
          if (depth === 0) break;
          depth -= 1;
        }
        item += c;
        pos += 1;
      }
      if (depth === 0 && source[pos] !== '-' && !item.endsWith('-')) {
        items.push(item);
        item = '';
      }
    }
    if (item) items.push(item);
    if (source[pos] === ']') pos += 1;
    return { type: 'class', start, end: pos, negate, items };
  };

  /** @returns {RegexNode} */
  const parseEscape = () => {
    const start = pos;
    const c = source[pos + 1] ?? '';
    pos += 2;
    if (c === 'b' || c === 'B')
      return { type: 'anchor', start, end: pos, kind: c === 'b' ? 'boundary' : 'not-boundary' };
    if (SHORTHANDS[c]) return { type: 'escape', start, end: pos, kind: SHORTHANDS[c], text: c };
    if (/[1-9]/.test(c)) {
      const m = /^\d*/.exec(source.slice(pos));
      pos += m ? m[0].length : 0;
      return { type: 'backref', start, end: pos, ref: source.slice(start + 1, pos) };
    }
    if (c === 'k') {
      const m = /^<([^>]+)>/.exec(source.slice(pos));
      if (m) {
        pos += m[0].length;
        return { type: 'backref', start, end: pos, ref: m[1] };
      }
    }
    if (c === 'p' || c === 'P') {
      const m = /^\{([^}]+)\}/.exec(source.slice(pos));
      if (m) {
        pos += m[0].length;
        return {
          type: 'escape',
          start,
          end: pos,
          kind: c === 'p' ? 'property' : 'not-property',
          text: m[1],
        };
      }
    }
    const code = /^(x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|c[A-Za-z])/.exec(
      source.slice(pos - 1),
    );
    if (code) {
      pos += code[0].length - 1;
      return { type: 'escape', start, end: pos, kind: 'code', text: `\\${code[0]}` };
    }
    if (CONTROLS[c]) return { type: 'escape', start, end: pos, kind: 'control', text: CONTROLS[c] };
    return { type: 'literal', start, end: pos, text: c };
  };

  /** @type {RegexNode} */
  let tree = parseAlt();
  // A stray ")" ends the top level early: read the rest as more of the pattern.
  while (pos < source.length) {
    const stray = { type: /** @type {const} */ ('literal'), start: pos, end: pos + 1, text: ')' };
    pos += 1;
    const more = parseAlt();
    tree = { type: 'seq', start: 0, end: pos, items: [tree, stray, more] };
  }
  return { tree, groups };
}

/**
 * Whether a pattern repeats something that itself repeats, like `(a+)+`: such patterns can
 * take exponential time on text that almost matches.
 *
 * @param {RegexNode} node
 * @param {boolean} [inside] - Inside a quantified node.
 * @returns {boolean}
 */
export function isRisky(node, inside = false) {
  switch (node.type) {
    case 'quant': {
      const repeats = node.max > 1;
      if (inside && repeats) return true;
      return isRisky(node.target, inside || repeats);
    }
    case 'group':
      return isRisky(node.body, inside);
    case 'seq':
      return node.items.some((item) => isRisky(item, inside));
    case 'alt':
      return node.alternatives.some((item) => isRisky(item, inside));
    default:
      return false;
  }
}

/**
 * Runs a pattern on a text with limits. One call of `exec()` cannot be interrupted, so the
 * time budget is checked between matches; see {@link isRisky} for patterns to run with care.
 *
 * @param {RegExp} regex
 * @param {string} text
 * @returns {MatchResult}
 */
export function runMatches(regex, text) {
  const started = performance.now();
  const truncated = text.length > MAX_TEXT_LENGTH;
  const input = truncated ? text.slice(0, MAX_TEXT_LENGTH) : text;
  let flags = regex.flags;
  if (!flags.includes('d')) flags += 'd';
  const global = regex.global || regex.sticky;
  const re = new RegExp(regex.source, global ? flags : `${flags}g`);
  const unicode = regex.unicode || regex.flags.includes('v');
  /** @type {RegexMatch[]} */
  const matches = [];
  let capped = false;
  let timedOut = false;
  for (;;) {
    const m = re.exec(input);
    if (!m) break;
    const indices = /** @type {RegExpMatchArray & { indices?: [number, number][] }} */ (m).indices;
    matches.push({
      index: m.index,
      end: m.index + m[0].length,
      text: m[0],
      groups: m.slice(1),
      ranges: indices ? indices.slice(1).map((r) => (r ? [r[0], r[1]] : undefined)) : [],
      named: m.groups ? { ...m.groups } : {},
    });
    if (!regex.global) break;
    // A zero-length match would be found again at the same place: step over one character.
    if (m[0].length === 0) {
      const code = input.codePointAt(re.lastIndex) ?? 0;
      re.lastIndex += unicode && code > 0xffff ? 2 : 1;
      if (re.lastIndex > input.length) break;
    }
    if (matches.length >= MAX_REGEX_MATCHES) {
      capped = true;
      break;
    }
    if (performance.now() - started > TIME_BUDGET) {
      timedOut = true;
      break;
    }
  }
  return { matches, capped, timedOut, truncated, ms: performance.now() - started };
}

/**
 * The pattern written as a JavaScript literal: `/a\/b/gi`.
 *
 * @param {string} pattern
 * @param {string} flags
 * @returns {string}
 */
export function toLiteral(pattern, flags) {
  let out = '';
  let inClass = false;
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '\\') {
      out += pattern.slice(i, i + 2);
      i += 1;
    } else if (c === '\n') out += '\\n';
    else if (c === '\r') out += '\\r';
    else {
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      out += c === '/' && !inClass ? '\\/' : c;
    }
  }
  return `/${out || '(?:)'}/${flags}`;
}

/**
 * Pattern ranges to color, in order and without overlap.
 *
 * @param {RegexNode} tree
 * @returns {{ start: number, end: number, kind: string, pair?: number }[]}
 */
export function patternTokens(tree) {
  /** @type {{ start: number, end: number, kind: string, pair?: number }[]} */
  const tokens = [];
  let pairs = 0;
  /** @param {RegexNode} node */
  const walk = (node) => {
    switch (node.type) {
      case 'alt':
        node.alternatives.forEach((alt, i) => {
          walk(alt);
          if (i < node.pipes.length)
            tokens.push({ start: node.pipes[i], end: node.pipes[i] + 1, kind: 'alt' });
        });
        break;
      case 'seq':
        node.items.forEach(walk);
        break;
      case 'group': {
        const pair = ++pairs;
        const kind = node.kind.includes('look') ? 'look' : 'group';
        tokens.push({ start: node.start, end: node.open, kind, pair });
        walk(node.body);
        if (node.end > node.close) tokens.push({ start: node.close, end: node.end, kind, pair });
        break;
      }
      case 'quant':
        walk(node.target);
        tokens.push({ start: node.qStart, end: node.end, kind: 'quant' });
        break;
      case 'literal':
        if (node.end - node.start > node.text.length)
          tokens.push({ start: node.start, end: node.end, kind: 'escape' });
        break;
      default:
        tokens.push({ start: node.start, end: node.end, kind: node.type });
    }
  };
  walk(tree);
  return tokens.sort((a, b) => a.start - b.start);
}
