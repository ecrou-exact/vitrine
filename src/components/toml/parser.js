// @ts-check
/**
 * TOML 1.0 parser producing the node tree of `<vt-json>`, so both share the tree view.
 *
 * Integers and floats keep the text they were written with (`raw`); dates and times
 * are number nodes with a `kind` (`datetime`, `datetime-local`, `date-local`,
 * `time-local`) that the tree shows as their own type. Duplicate keys, redefined
 * tables and writes into inline tables or static arrays are errors with a line and
 * column, as the specification requires.
 *
 * @module components/toml/parser
 */
import { position } from '../json/parser.js';

/** @typedef {import('../json/parser.js').JsonNode} JsonNode */
/** @typedef {import('../json/parser.js').JsonObject} JsonObject */
/** @typedef {import('../json/parser.js').JsonArray} JsonArray */
/** @typedef {import('../json/parser.js').JsonContainer} JsonContainer */
/** @typedef {import('../json/parser.js').JsonSyntaxError} TomlSyntaxError */
/** @typedef {{ ok: true, value: JsonObject, count: number } | { ok: false, error: TomlSyntaxError }} TomlResult */

/**
 * How a table came to be, which decides what may still be written into it.
 * - `implicit`: created as a parent of a `[header]`; may be defined once later.
 * - `header`: defined by `[header]` or `[[header]]`.
 * - `dotted`: created by a dotted key; extended only by dotted keys of the same table.
 * - `inline`: an inline table, closed once written.
 *
 * @typedef {{ how: "implicit" | "header" | "dotted" | "inline", keys: Map<string, JsonNode>, owner?: JsonObject }} TableMeta
 */

class TomlFailure extends Error {
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

const BARE_KEY = /[A-Za-z0-9_-]+/y;
const DATE_TIME =
  /(\d{4})-(\d{2})-(\d{2})(?:([Tt ])(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|z|[+-]\d{2}:\d{2})?)?/y;
const TIME = /(\d{2}):(\d{2}):(\d{2})(\.\d+)?/y;
const INTEGER = /[+-]?(?:0|[1-9](?:_?\d)*)(?![\w.:-])/y;
const PREFIXED =
  /0(?:x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*|o[0-7](?:_?[0-7])*|b[01](?:_?[01])*)(?![\w.])/y;
const FLOAT =
  /[+-]?(?:0|[1-9](?:_?\d)*)(?:\.\d(?:_?\d)*(?:[eE][+-]?\d(?:_?\d)*)?|[eE][+-]?\d(?:_?\d)*)(?![\w.])/y;
const SPECIAL_FLOAT = /[+-]?(?:inf|nan)(?![\w.])/y;
const ESCAPES = /** @type {Record<string, string>} */ ({
  b: '\b',
  t: '\t',
  n: '\n',
  f: '\f',
  r: '\r',
  '"': '"',
  '\\': '\\',
});

/**
 * Parses a TOML document.
 *
 * @param {string} text
 * @param {{ maxDepth: number }} options
 * @returns {TomlResult}
 */
export function parseToml(text, { maxDepth }) {
  const parser = new Parser(text, maxDepth);
  try {
    const value = parser.document();
    return { ok: true, value, count: parser.nextId };
  } catch (error) {
    if (!(error instanceof TomlFailure)) throw error;
    const { line, column } = position(text, error.offset);
    return {
      ok: false,
      error: { message: error.message, offset: error.offset, line, column, tooDeep: error.tooDeep },
    };
  }
}

class Parser {
  /**
   * @param {string} text
   * @param {number} maxDepth
   */
  constructor(text, maxDepth) {
    this.text = text.replace(/^\uFEFF/, '');
    this.maxDepth = maxDepth;
    this.i = 0;
    this.nextId = 0;
    /** @type {WeakMap<JsonContainer, TableMeta>} */
    this.meta = new WeakMap();
    /** @type {WeakSet<JsonArray>} Arrays of tables, which `[[header]]` may extend. */
    this.tableArrays = new WeakSet();
  }

  /** @returns {JsonObject} */
  document() {
    const root = this.table(null, null, 'header');
    let current = root;
    const text = this.text;
    while (this.i < text.length) {
      this.blank();
      if (this.i >= text.length) break;
      const c = text[this.i];
      if (c === '\n' || c === '\r') this.newline();
      else if (c === '#') this.comment();
      else if (c === '[') {
        current = this.header(root);
        this.endOfLine();
      } else {
        this.keyValue(current);
        this.endOfLine();
      }
    }
    return root;
  }

  // ------------------------------------------------------------ tables

  /**
   * @param {JsonContainer | null} parent
   * @param {string | number | null} key
   * @param {TableMeta["how"]} how
   * @param {JsonObject} [owner]
   * @returns {JsonObject}
   */
  table(parent, key, how, owner) {
    /** @type {JsonObject} */
    const node = { id: this.nextId++, parent, key, type: 'object', entries: [] };
    this.meta.set(node, { how, keys: new Map(), owner });
    return node;
  }

  /**
   * @param {JsonObject} table
   * @param {string} key
   * @param {JsonNode} value
   */
  attach(table, key, value) {
    table.entries.push({ key, value });
    /** @type {TableMeta} */ (this.meta.get(table)).keys.set(key, value);
  }

  /**
   * `[a.b]` or `[[a.b]]`: returns the table that following keys go into.
   *
   * @param {JsonObject} root
   * @returns {JsonObject}
   */
  header(root) {
    const start = this.i;
    const array = this.text.startsWith('[[', this.i);
    this.i += array ? 2 : 1;
    this.spaces();
    const keys = this.keyPath();
    if (keys.length > this.maxDepth) throw new TomlFailure('Nesting too deep', start, true);
    this.spaces();
    if (!this.text.startsWith(array ? ']]' : ']', this.i))
      throw this.fail(array ? 'Expected "]]"' : 'Expected "]"');
    this.i += array ? 2 : 1;

    let table = root;
    for (const [index, { key, offset }] of keys.entries()) {
      const meta = /** @type {TableMeta} */ (this.meta.get(table));
      const existing = meta.keys.get(key);
      const last = index === keys.length - 1;
      if (last && array) {
        if (!existing) {
          /** @type {JsonArray} */
          const list = { id: this.nextId++, parent: table, key, type: 'array', items: [] };
          this.tableArrays.add(list);
          this.attach(table, key, list);
          return this.pushTable(list);
        }
        if (existing.type !== 'array' || !this.tableArrays.has(existing))
          throw new TomlFailure(`Cannot redefine "${key}" as an array of tables`, offset);
        return this.pushTable(existing);
      }
      if (!existing) {
        const child = this.table(table, key, last ? 'header' : 'implicit');
        this.attach(table, key, child);
        table = child;
        continue;
      }
      if (existing.type === 'array' && this.tableArrays.has(existing)) {
        if (last)
          throw new TomlFailure(`Cannot redefine array of tables "${key}" as a table`, offset);
        table = /** @type {JsonObject} */ (existing.items[existing.items.length - 1]);
        continue;
      }
      const childMeta = existing.type === 'object' ? this.meta.get(existing) : undefined;
      if (!childMeta || childMeta.how === 'inline')
        throw new TomlFailure(`Cannot redefine "${key}"`, offset);
      if (last) {
        if (childMeta.how !== 'implicit')
          throw new TomlFailure(`Table "${key}" is already defined`, offset);
        childMeta.how = 'header';
      }
      table = /** @type {JsonObject} */ (existing);
    }
    return table;
  }

  /**
   * @param {JsonArray} list
   * @returns {JsonObject}
   */
  pushTable(list) {
    const child = this.table(list, list.items.length, 'header');
    list.items.push(child);
    return child;
  }

  /**
   * `a.b = value` into `table`.
   *
   * @param {JsonObject} table
   * @param {number} [depth]
   */
  keyValue(table, depth = 0) {
    const keys = this.keyPath();
    this.spaces();
    if (this.text[this.i] !== '=') throw this.fail('Expected "=" after the key');
    this.i += 1;
    this.spaces();
    let target = table;
    for (const { key, offset } of keys.slice(0, -1)) {
      const meta = /** @type {TableMeta} */ (this.meta.get(target));
      const existing = meta.keys.get(key);
      if (!existing) {
        const child = this.table(target, key, 'dotted', table);
        this.attach(target, key, child);
        target = child;
        continue;
      }
      const childMeta = existing.type === 'object' ? this.meta.get(existing) : undefined;
      if (!childMeta || childMeta.how !== 'dotted' || childMeta.owner !== table)
        throw new TomlFailure(`Cannot add keys to "${key}" here`, offset);
      target = /** @type {JsonObject} */ (existing);
    }
    const { key, offset } = keys[keys.length - 1];
    if (/** @type {TableMeta} */ (this.meta.get(target)).keys.has(key))
      throw new TomlFailure(`Duplicate key "${key}"`, offset);
    if (depth + keys.length > this.maxDepth)
      throw new TomlFailure('Nesting too deep', offset, true);
    const value = this.value(target, key, depth + keys.length);
    this.attach(target, key, value);
  }

  /** @returns {{ key: string, offset: number }[]} */
  keyPath() {
    /** @type {{ key: string, offset: number }[]} */
    const keys = [];
    for (;;) {
      const offset = this.i;
      keys.push({ key: this.simpleKey(), offset });
      this.spaces();
      if (this.text[this.i] !== '.') return keys;
      this.i += 1;
      this.spaces();
    }
  }

  /** @returns {string} */
  simpleKey() {
    const c = this.text[this.i];
    if (c === '"') {
      if (this.text.startsWith('"""', this.i)) throw this.fail('Keys cannot be multi-line strings');
      return this.basicString();
    }
    if (c === "'") {
      if (this.text.startsWith("'''", this.i)) throw this.fail('Keys cannot be multi-line strings');
      return this.literalString();
    }
    BARE_KEY.lastIndex = this.i;
    const match = BARE_KEY.exec(this.text);
    if (!match)
      throw this.fail(c === undefined || c === '\n' ? 'Expected a key' : `Unexpected "${c}"`);
    this.i = BARE_KEY.lastIndex;
    return match[0];
  }

  // ------------------------------------------------------------ values

  /**
   * @param {JsonContainer} parent
   * @param {string | number} key
   * @param {number} depth
   * @returns {JsonNode}
   */
  value(parent, key, depth) {
    const text = this.text;
    const c = text[this.i];
    const base = { id: this.nextId++, parent, key };
    if (c === '"') {
      const value = text.startsWith('"""', this.i) ? this.multilineBasic() : this.basicString();
      return { ...base, type: 'string', value };
    }
    if (c === "'") {
      const value = text.startsWith("'''", this.i) ? this.multilineLiteral() : this.literalString();
      return { ...base, type: 'string', value };
    }
    if (c === '[') return this.array(base, depth);
    if (c === '{') return this.inlineTable(parent, key, depth);
    if (text.startsWith('true', this.i) && !/[\w-]/.test(text[this.i + 4] ?? '')) {
      this.i += 4;
      return { ...base, type: 'boolean', value: true };
    }
    if (text.startsWith('false', this.i) && !/[\w-]/.test(text[this.i + 5] ?? '')) {
      this.i += 5;
      return { ...base, type: 'boolean', value: false };
    }
    const date = this.dateTime();
    if (date) return { ...base, type: 'number', raw: date.raw, kind: date.kind };
    for (const [pattern, kind] of /** @type {[RegExp, string][]} */ ([
      [PREFIXED, 'integer'],
      [FLOAT, 'float'],
      [SPECIAL_FLOAT, 'float'],
      [INTEGER, 'integer'],
    ])) {
      pattern.lastIndex = this.i;
      const match = pattern.exec(text);
      if (match) {
        this.i = pattern.lastIndex;
        return { ...base, type: 'number', raw: match[0], kind };
      }
    }
    throw this.fail(
      c === undefined || c === '\n' || c === '\r' ? 'Expected a value' : `Invalid value`,
    );
  }

  /** @returns {{ raw: string, kind: string } | null} */
  dateTime() {
    const start = this.i;
    DATE_TIME.lastIndex = start;
    const match = DATE_TIME.exec(this.text);
    if (match) {
      const [raw, y, mo, d, sep, hh, mm, ss, , offset] = match;
      // A space only separates a date and a time when a time follows.
      if (!validDate(+y, +mo, +d)) throw this.fail('Invalid date');
      if (sep && !validTime(+hh, +mm, +ss)) throw this.fail('Invalid time');
      if (offset && offset.length > 1 && !validTime(+offset.slice(1, 3), +offset.slice(4), 0))
        throw this.fail('Invalid time offset');
      this.i = DATE_TIME.lastIndex;
      this.trailing();
      return { raw, kind: !sep ? 'date-local' : offset ? 'datetime' : 'datetime-local' };
    }
    TIME.lastIndex = start;
    const time = TIME.exec(this.text);
    if (time) {
      if (!validTime(+time[1], +time[2], +time[3])) throw this.fail('Invalid time');
      this.i = TIME.lastIndex;
      this.trailing();
      return { raw: time[0], kind: 'time-local' };
    }
    return null;
  }

  /** Nothing may stick to a value but a separator. */
  trailing() {
    if (/[\w.:+-]/.test(this.text[this.i] ?? '')) throw this.fail('Invalid value');
  }

  /**
   * @param {{ id: number, parent: JsonContainer, key: string | number }} base
   * @param {number} depth
   * @returns {JsonArray}
   */
  array(base, depth) {
    if (depth > this.maxDepth) throw new TomlFailure('Nesting too deep', this.i, true);
    this.i += 1;
    /** @type {JsonArray} */
    const node = { ...base, type: 'array', items: [] };
    for (;;) {
      this.filler();
      if (this.text[this.i] === ']') break;
      node.items.push(this.value(node, node.items.length, depth + 1));
      this.filler();
      const c = this.text[this.i];
      if (c === ',') this.i += 1;
      else if (c !== ']') throw this.fail('Expected "," or "]" in the array');
    }
    this.i += 1;
    return node;
  }

  /**
   * @param {JsonContainer} parent
   * @param {string | number} key
   * @param {number} depth
   * @returns {JsonObject}
   */
  inlineTable(parent, key, depth) {
    if (depth > this.maxDepth) throw new TomlFailure('Nesting too deep', this.i, true);
    this.i += 1;
    // Built as a header table so dotted keys inside may extend it, then closed.
    const node = this.table(parent, key, 'header');
    this.spaces();
    if (this.text[this.i] === '}') {
      this.i += 1;
    } else {
      for (;;) {
        this.spaces();
        this.keyValue(node, depth);
        this.spaces();
        const c = this.text[this.i];
        if (c === ',') {
          this.i += 1;
          this.spaces();
          if (this.text[this.i] === '}') throw this.fail('Inline tables cannot end with a comma');
        } else if (c === '}') {
          this.i += 1;
          break;
        } else throw this.fail('Expected "," or "}" in the inline table');
      }
    }
    this.close(node);
    return node;
  }

  /**
   * Marks an inline table and every table in it as closed.
   *
   * @param {JsonContainer} node
   */
  close(node) {
    const meta = this.meta.get(node);
    if (meta) meta.how = 'inline';
    const children = node.type === 'object' ? node.entries.map((e) => e.value) : node.items;
    for (const child of children) if (child.type === 'object') this.close(child);
  }

  // ------------------------------------------------------------ strings

  /** @returns {string} */
  basicString() {
    const text = this.text;
    this.i += 1;
    let out = '';
    for (;;) {
      const c = text[this.i];
      if (c === undefined || c === '\n' || c === '\r') throw this.fail('Unterminated string');
      if (c === '"') {
        this.i += 1;
        return out;
      }
      if (c === '\\') out += this.escape();
      else {
        this.checkChar(c);
        out += c;
        this.i += 1;
      }
    }
  }

  /** @returns {string} */
  multilineBasic() {
    const text = this.text;
    this.i += 3;
    this.skipFirstNewline();
    let out = '';
    for (;;) {
      const c = text[this.i];
      if (c === undefined) throw this.fail('Unterminated string');
      if (text.startsWith('"""', this.i)) {
        // Up to two quotes may come right before the closing delimiter.
        let quotes = 3;
        while (quotes < 5 && text[this.i + quotes] === '"') quotes += 1;
        out += '"'.repeat(quotes - 3);
        this.i += quotes;
        return out;
      }
      if (c === '\\') {
        const rest = /\\[ \t]*\r?\n[\s]*/y;
        rest.lastIndex = this.i;
        if (rest.test(text)) this.i = rest.lastIndex;
        else out += this.escape();
      } else if (c === '\r' && text[this.i + 1] === '\n') {
        out += '\n';
        this.i += 2;
      } else {
        if (c !== '\n') this.checkChar(c);
        out += c;
        this.i += 1;
      }
    }
  }

  /** @returns {string} */
  literalString() {
    const end = this.text.indexOf("'", this.i + 1);
    const line = this.text.slice(this.i + 1, end < 0 ? undefined : end);
    const newline = line.search(/[\r\n]/);
    if (end < 0 || newline >= 0) {
      this.i += 1 + (newline >= 0 ? newline : line.length);
      throw this.fail('Unterminated string');
    }
    for (const [k, c] of [...line].entries()) {
      if (isControl(c)) {
        this.i += 1 + k;
        throw this.fail('Control characters must be escaped');
      }
    }
    this.i = end + 1;
    return line;
  }

  /** @returns {string} */
  multilineLiteral() {
    this.i += 3;
    this.skipFirstNewline();
    const end = this.text.indexOf("'''", this.i);
    if (end < 0) {
      this.i = this.text.length;
      throw this.fail('Unterminated string');
    }
    let close = end + 3;
    while (close < end + 5 && this.text[close] === "'") close += 1;
    const value = this.text.slice(this.i, close - 3).replace(/\r\n/g, '\n');
    for (const c of value)
      if (c !== '\n' && isControl(c)) throw this.fail('Control characters must be escaped');
    this.i = close;
    return value;
  }

  skipFirstNewline() {
    if (this.text[this.i] === '\n') this.i += 1;
    else if (this.text.startsWith('\r\n', this.i)) this.i += 2;
  }

  /** @returns {string} */
  escape() {
    const c = this.text[this.i + 1];
    if (c in ESCAPES) {
      this.i += 2;
      return ESCAPES[c];
    }
    if (c === 'u' || c === 'U') {
      const size = c === 'u' ? 4 : 8;
      const hex = this.text.slice(this.i + 2, this.i + 2 + size);
      const code = /^[0-9A-Fa-f]+$/.test(hex) && hex.length === size ? parseInt(hex, 16) : -1;
      if (code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
        throw this.fail('Invalid Unicode escape');
      this.i += 2 + size;
      return String.fromCodePoint(code);
    }
    throw this.fail('Invalid escape sequence');
  }

  /**
   * @param {string} c
   */
  checkChar(c) {
    if (isControl(c)) throw this.fail('Control characters must be escaped');
  }

  // ------------------------------------------------------------ whitespace

  spaces() {
    while (this.text[this.i] === ' ' || this.text[this.i] === '\t') this.i += 1;
  }

  /** Spaces at the start of a line. */
  blank() {
    this.spaces();
  }

  comment() {
    const text = this.text;
    this.i += 1;
    while (this.i < text.length && text[this.i] !== '\n') {
      const c = text[this.i];
      if (c === '\r' && text[this.i + 1] === '\n') return;
      if (c !== '\t' && isControl(c))
        throw this.fail('Control characters are not allowed in comments');
      this.i += 1;
    }
  }

  newline() {
    if (this.text[this.i] === '\n') this.i += 1;
    else if (this.text.startsWith('\r\n', this.i)) this.i += 2;
    else throw this.fail('Expected a new line');
  }

  /** After a key/value pair or a header: spaces, a comment, then a new line or the end. */
  endOfLine() {
    this.spaces();
    if (this.text[this.i] === '#') this.comment();
    if (this.i < this.text.length) {
      if (this.text[this.i] !== '\n' && this.text[this.i] !== '\r')
        throw this.fail('Expected a new line after the value');
      this.newline();
    }
  }

  /** Whitespace, new lines and comments inside arrays. */
  filler() {
    for (;;) {
      this.spaces();
      const c = this.text[this.i];
      if (c === '#') this.comment();
      else if (c === '\n' || c === '\r') this.newline();
      else return;
    }
  }

  /**
   * @param {string} message
   * @returns {TomlFailure}
   */
  fail(message) {
    return new TomlFailure(message, this.i);
  }
}

/**
 * @param {string} c
 * @returns {boolean}
 */
function isControl(c) {
  const code = c.charCodeAt(0);
  return (code < 0x20 && c !== '\t') || code === 0x7f;
}

/**
 * @param {number} y
 * @param {number} m
 * @param {number} d
 * @returns {boolean}
 */
function validDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false;
  const days = [
    31,
    y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return d <= days[m - 1];
}

/**
 * @param {number} h
 * @param {number} m
 * @param {number} s
 * @returns {boolean}
 */
function validTime(h, m, s) {
  return h < 24 && m < 60 && s <= 60;
}

/**
 * The value as JSON: integers in decimal (exact, through BigInt), dates and times as
 * strings, `inf` and `nan` as strings since JSON has no such numbers.
 *
 * @param {JsonNode} root
 * @param {number} [indent]
 * @returns {string}
 */
export function toJson(root, indent = 2) {
  return JSON.stringify(plain(root), null, indent).replace(
    /"\\u0000i(-?\d+)"/g,
    (_, digits) => digits,
  );
}

/**
 * @param {JsonNode} node
 * @returns {unknown}
 */
function plain(node) {
  switch (node.type) {
    case 'object':
      return Object.fromEntries(node.entries.map((e) => [e.key, plain(e.value)]));
    case 'array':
      return node.items.map(plain);
    case 'string':
    case 'boolean':
      return node.value;
    case 'null':
      return null;
    default:
      return numberValue(node);
  }
}

/**
 * @param {import('../json/parser.js').JsonNumber & { kind?: string }} node
 * @returns {unknown}
 */
function numberValue(node) {
  const raw = node.raw.replace(/_/g, '');
  if (node.kind === 'integer') {
    const negative = raw.startsWith('-');
    const digits = raw.replace(/^[+-]/, '');
    const value = BigInt(digits);
    // Marked so toJson() can write it as a number of any size.
    return `\u0000i${negative ? '-' : ''}${value}`;
  }
  if (node.kind === 'float') {
    if (/inf|nan/.test(raw)) return raw.replace(/^\+/, '');
    return Number(raw);
  }
  return node.raw;
}

const BARE = /^[A-Za-z0-9_-]+$/;

/**
 * TOML path of a node: `servers.alpha.ip`, `products[0].name`, `site."key with spaces"`.
 *
 * @param {JsonNode} node
 * @returns {string}
 */
export function tomlPath(node) {
  /** @type {string[]} */
  const parts = [];
  /** @type {JsonNode | null} */
  let current = node;
  while (current && current.parent) {
    const key = current.key;
    if (typeof key === 'number') parts.push(`[${key}]`);
    else parts.push(`${BARE.test(String(key)) ? key : JSON.stringify(key)}`);
    current = current.parent;
  }
  return parts
    .reverse()
    .map((part, index) => (index && !part.startsWith('[') ? `.${part}` : part))
    .join('');
}
