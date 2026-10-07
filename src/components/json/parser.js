// @ts-check
/**
 * Iterative JSON parser producing a lightweight tree.
 *
 * Why not `JSON.parse`?
 * - numbers are kept as written (`12345678901234567890` is not rounded);
 * - duplicate keys are kept, in order (the viewer shows what the document contains);
 * - errors report a precise line and column in every browser;
 * - nesting depth is limited and parsing never recurses, so `[[[[…` cannot overflow the stack;
 * - keys such as `__proto__` are plain data (entries are stored in arrays).
 *
 * @module components/json/parser
 */

/**
 * @typedef {object} JsonBase
 * @property {number} id - Unique id within the document.
 * @property {JsonContainer | null} parent
 * @property {string | number | null} key - Key in the parent object, or index in the parent array.
 */
/** @typedef {JsonBase & { type: "object", entries: { key: string, value: JsonNode }[] }} JsonObject */
/** @typedef {JsonBase & { type: "array", items: JsonNode[] }} JsonArray */
/** @typedef {JsonBase & { type: "string", value: string }} JsonString */
/** @typedef {JsonBase & { type: "number", raw: string }} JsonNumber */
/** @typedef {JsonBase & { type: "boolean", value: boolean }} JsonBoolean */
/** @typedef {JsonBase & { type: "null" }} JsonNull */
/** @typedef {JsonObject | JsonArray} JsonContainer */
/** @typedef {JsonContainer | JsonString | JsonNumber | JsonBoolean | JsonNull} JsonNode */

/**
 * @typedef {object} JsonSyntaxError
 * @property {string} message - English description of the problem.
 * @property {number} offset - Character offset of the error.
 * @property {number} line - 1-based line.
 * @property {number} column - 1-based column.
 * @property {boolean} tooDeep - `true` when the nesting limit was exceeded.
 */

/** @typedef {{ ok: true, value: JsonNode, count: number } | { ok: false, error: JsonSyntaxError }} ParseResult */

class ParseFailure extends Error {
  /**
   * @param {string} message
   * @param {number} offset
   * @param {boolean} [tooDeep]
   */
  constructor(message, offset, tooDeep = false) {
    super(message);
    this.offset = offset;
    this.tooDeep = tooDeep;
  }
}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const ESCAPES = /** @type {Record<string, string>} */ ({
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
});

/**
 * Parses a JSON document.
 *
 * @param {string} text
 * @param {{ maxDepth: number }} options
 * @returns {ParseResult}
 */
export function parseJson(text, { maxDepth }) {
  try {
    const { value, count } = new Parser(text, maxDepth).parse();
    return { ok: true, value, count };
  } catch (error) {
    if (!(error instanceof ParseFailure)) throw error;
    const { line, column } = position(text, error.offset);
    return {
      ok: false,
      error: { message: error.message, offset: error.offset, line, column, tooDeep: error.tooDeep },
    };
  }
}

/**
 * Converts an offset to a 1-based line and column.
 *
 * @param {string} text
 * @param {number} offset
 * @returns {{ line: number, column: number }}
 */
export function position(text, offset) {
  let line = 1;
  let lineStart = 0;
  const end = Math.min(offset, text.length);
  for (let i = text.indexOf('\n'); i !== -1 && i < end; i = text.indexOf('\n', i + 1)) {
    line += 1;
    lineStart = i + 1;
  }
  return { line, column: end - lineStart + 1 };
}

class Parser {
  /**
   * @param {string} text
   * @param {number} maxDepth
   */
  constructor(text, maxDepth) {
    this.text = text;
    this.maxDepth = maxDepth;
    this.i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    this.count = 0;
  }

  /** @returns {{ value: JsonNode, count: number }} */
  parse() {
    const text = this.text;
    /** @type {JsonContainer[]} */
    const stack = [];
    /** @type {JsonNode | null} */
    let root = null;
    /** @type {string} */
    let pendingKey = '';
    let state = 'value';

    for (;;) {
      this.skipWhitespace();
      const c = text[this.i];
      const top = stack[stack.length - 1];

      if (state === 'value') {
        if (c === undefined) throw new ParseFailure('Unexpected end of input', this.i);
        const parent = top ?? null;
        const key = parent?.type === 'object' ? pendingKey : parent ? parent.items.length : null;
        if (c === '{' || c === '[') {
          if (stack.length >= this.maxDepth)
            throw new ParseFailure(`Nesting deeper than ${this.maxDepth} levels`, this.i, true);
          /** @type {JsonContainer} */
          const node =
            c === '{'
              ? { type: 'object', entries: [], id: this.count++, parent, key }
              : { type: 'array', items: [], id: this.count++, parent, key };
          this.i += 1;
          if (parent) attach(parent, node, pendingKey);
          else root = node;
          stack.push(node);
          this.skipWhitespace();
          if (text[this.i] === (c === '{' ? '}' : ']')) {
            this.i += 1;
            stack.pop();
            state = 'after';
          } else {
            state = c === '{' ? 'key' : 'value';
          }
          continue;
        }
        const node = this.readPrimitive(parent, key);
        if (parent) attach(parent, node, pendingKey);
        else root = node;
        state = 'after';
        continue;
      }

      if (state === 'key') {
        if (c !== '"')
          throw new ParseFailure(
            c === undefined
              ? 'Unexpected end of input'
              : 'Expected a property name in double quotes',
            this.i,
          );
        pendingKey = this.readString();
        this.skipWhitespace();
        if (text[this.i] !== ':')
          throw new ParseFailure('Expected ":" after the property name', this.i);
        this.i += 1;
        state = 'value';
        continue;
      }

      // state === 'after': a value just ended.
      if (!top) {
        if (c !== undefined)
          throw new ParseFailure('Unexpected content after the JSON value', this.i);
        return { value: /** @type {JsonNode} */ (root), count: this.count };
      }
      const close = top.type === 'object' ? '}' : ']';
      if (c === ',') {
        this.i += 1;
        this.skipWhitespace();
        if (text[this.i] === close) throw new ParseFailure('Trailing comma', this.i - 1);
        state = top.type === 'object' ? 'key' : 'value';
      } else if (c === close) {
        this.i += 1;
        stack.pop();
      } else {
        throw new ParseFailure(
          c === undefined ? 'Unexpected end of input' : `Expected "," or "${close}"`,
          this.i,
        );
      }
    }
  }

  skipWhitespace() {
    const text = this.text;
    let c = text.charCodeAt(this.i);
    while (c === 32 || c === 10 || c === 13 || c === 9) {
      this.i += 1;
      c = text.charCodeAt(this.i);
    }
  }

  /**
   * @param {JsonContainer | null} parent
   * @param {string | number | null} key
   * @returns {JsonNode}
   */
  readPrimitive(parent, key) {
    const text = this.text;
    const c = text[this.i];
    const id = this.count++;
    if (c === '"') return { type: 'string', value: this.readString(), id, parent, key };
    if (c === '-' || (c >= '0' && c <= '9')) {
      NUMBER.lastIndex = this.i;
      const match = NUMBER.exec(text);
      if (!match) throw new ParseFailure('Invalid number', this.i);
      this.i += match[0].length;
      return { type: 'number', raw: match[0], id, parent, key };
    }
    for (const [word, node] of /** @type {const} */ ([
      ['true', { type: 'boolean', value: true }],
      ['false', { type: 'boolean', value: false }],
      ['null', { type: 'null' }],
    ])) {
      if (text.startsWith(word, this.i)) {
        this.i += word.length;
        return /** @type {JsonNode} */ ({ ...node, id, parent, key });
      }
    }
    const shown = /[\x20-\x7e]/.test(c)
      ? `"${c}"`
      : `U+${c.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}`;
    throw new ParseFailure(`Unexpected character ${shown}`, this.i);
  }

  /** @returns {string} */
  readString() {
    const text = this.text;
    const start = this.i;
    this.i += 1;
    let result = '';
    let chunkStart = this.i;
    for (;;) {
      const code = text.charCodeAt(this.i);
      if (Number.isNaN(code)) throw new ParseFailure('Unterminated string', start);
      if (code === 34) break;
      if (code < 0x20) throw new ParseFailure('Control character in string (escape it)', this.i);
      if (code === 92) {
        result += text.slice(chunkStart, this.i);
        const e = text[this.i + 1];
        if (e === 'u') {
          const hex = text.slice(this.i + 2, this.i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new ParseFailure('Invalid \\u escape', this.i);
          result += String.fromCharCode(parseInt(hex, 16));
          this.i += 6;
        } else if (e !== undefined && Object.prototype.hasOwnProperty.call(ESCAPES, e)) {
          result += ESCAPES[e];
          this.i += 2;
        } else {
          throw new ParseFailure('Invalid escape sequence', this.i);
        }
        chunkStart = this.i;
        continue;
      }
      this.i += 1;
    }
    result += text.slice(chunkStart, this.i);
    this.i += 1;
    return result;
  }
}

/**
 * @param {JsonContainer} parent
 * @param {JsonNode} node
 * @param {string} key
 */
function attach(parent, node, key) {
  if (parent.type === 'object') parent.entries.push({ key, value: node });
  else parent.items.push(node);
}

/**
 * Serializes a tree back to JSON text.
 * Numbers are written exactly as in the source.
 *
 * @param {JsonNode} root
 * @param {{ indent: number, sortKeys: boolean }} options
 * @returns {string}
 */
export function stringify(root, { indent, sortKeys }) {
  /** @type {string[]} */
  const out = [];
  const pad = ' '.repeat(indent);
  const nl = indent ? '\n' : '';
  const colon = indent ? ': ' : ':';
  /** @type {[node: JsonNode | string, depth: number][]} Work stack; strings are literal output. */
  const work = [[root, 0]];
  while (work.length) {
    const [item, depth] = /** @type {[JsonNode | string, number]} */ (work.pop());
    if (typeof item === 'string') {
      out.push(item);
      continue;
    }
    const inner = nl + pad.repeat(depth + 1);
    const outer = nl + pad.repeat(depth);
    if (item.type === 'object') {
      const entries = sortKeys ? sortedEntries(item) : item.entries;
      if (!entries.length) {
        out.push('{}');
        continue;
      }
      /** @type {[JsonNode | string, number][]} */
      const parts = [['{', depth]];
      entries.forEach((entry, index) => {
        parts.push(
          [`${index ? ',' : ''}${inner}${JSON.stringify(entry.key)}${colon}`, depth],
          [entry.value, depth + 1],
        );
      });
      parts.push([`${outer}}`, depth]);
      for (let k = parts.length - 1; k >= 0; k -= 1) work.push(parts[k]);
    } else if (item.type === 'array') {
      if (!item.items.length) {
        out.push('[]');
        continue;
      }
      /** @type {[JsonNode | string, number][]} */
      const parts = [['[', depth]];
      item.items.forEach((child, index) =>
        parts.push([`${index ? ',' : ''}${inner}`, depth], [child, depth + 1]),
      );
      parts.push([`${outer}]`, depth]);
      for (let k = parts.length - 1; k >= 0; k -= 1) work.push(parts[k]);
    } else {
      out.push(primitiveText(item));
    }
  }
  return out.join('');
}

/**
 * Entries sorted by key (code unit order, stable).
 *
 * @param {JsonObject} node
 * @returns {{ key: string, value: JsonNode }[]}
 */
export function sortedEntries(node) {
  return [...node.entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * JSON text of a primitive node.
 *
 * @param {JsonNode} node
 * @returns {string}
 */
export function primitiveText(node) {
  switch (node.type) {
    case 'string':
      return JSON.stringify(node.value);
    case 'number':
      return node.raw;
    case 'boolean':
      return String(node.value);
    case 'null':
      return 'null';
    default:
      return '';
  }
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * JSONPath of a node, e.g. `$.users[0].name` or `$["key with spaces"]`.
 *
 * @param {JsonNode} node
 * @returns {string}
 */
export function pathOf(node) {
  /** @type {string[]} */
  const parts = [];
  /** @type {JsonNode | null} */
  let current = node;
  while (current && current.parent) {
    const key = current.key;
    if (typeof key === 'number') parts.push(`[${key}]`);
    else if (IDENTIFIER.test(String(key))) parts.push(`.${key}`);
    else parts.push(`[${JSON.stringify(key)}]`);
    current = current.parent;
  }
  return `$${parts.reverse().join('')}`;
}
