// @ts-check
/**
 * XML reader for <vt-xml>.
 *
 * A small parser that reads XML as data: nothing is ever turned into DOM nodes of the
 * page, and nothing is fetched. It is safe for hostile documents:
 * - the DOCTYPE is kept as text and never processed: external entities (XXE) are never
 *   resolved and entities declared in it are never expanded (no "billion laughs");
 *   a reference to such an entity is kept as an entity node, shown as `&name;`;
 * - only the five predefined entities and numeric character references are decoded;
 * - nesting depth and the number of nodes are limited;
 * - errors are reported with their line and column, never thrown at the caller.
 *
 * @module components/xml/parser
 */

/** Maximum number of nodes read. */
export const MAX_NODES = 200_000;

/** @type {Record<string, string>} */
const PREDEFINED = { lt: '<', gt: '>', amp: '&', apos: "'", quot: '"' };

const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/**
 * @typedef {object} XmlAttr
 * @property {string} name - Qualified name, as written.
 * @property {string} value - Decoded value.
 * @property {string} ns - Namespace URI (`""` when none).
 */

/**
 * @typedef {object} XmlNode
 * @property {number} id
 * @property {"document"|"element"|"text"|"cdata"|"comment"|"pi"|"doctype"|"entity"} type
 * @property {string} name - Element name, PI target or entity name (`""` otherwise).
 * @property {string} value - Text, CDATA, comment, PI data or DOCTYPE text.
 * @property {string} ns - Namespace URI of an element (`""` when none).
 * @property {XmlAttr[]} attrs
 * @property {XmlNode[]} children
 * @property {XmlNode | null} parent
 * @property {number} line
 */

/**
 * @typedef {object} XmlSyntaxError
 * @property {string} message
 * @property {number} line
 * @property {number} column
 * @property {boolean} [tooDeep]
 */

/**
 * @typedef {{ ok: true, value: XmlNode, entities: string[], declaration: string }
 *   | { ok: false, error: XmlSyntaxError }} XmlResult
 */

const NAME = /[A-Za-z_:À-￿][\w.\-:·À-￿]*/y;

/**
 * Parses an XML document.
 *
 * @param {string} text
 * @param {{ maxDepth?: number, maxNodes?: number }} [options]
 * @returns {XmlResult}
 */
export function parseXml(text, options = {}) {
  const maxDepth = options.maxDepth ?? 512;
  const maxNodes = options.maxNodes ?? MAX_NODES;
  let pos = 0;
  let nextId = 0;
  /** @type {Set<string>} */
  const entities = new Set();
  let declaration = '';
  /** @type {number[]} Offsets where lines start. */
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  const lineAt = (/** @type {number} */ at) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= at) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  class Fail extends Error {
    /**
     * @param {string} message
     * @param {number} at
     * @param {boolean} [tooDeep]
     */
    constructor(message, at, tooDeep) {
      super(message);
      this.at = at;
      this.tooDeep = tooDeep;
    }
  }

  /**
   * @param {XmlNode['type']} type
   * @param {XmlNode | null} parent
   * @param {number} at
   * @returns {XmlNode}
   */
  const node = (type, parent, at) => {
    if (nextId >= maxNodes) throw new Fail(`more than ${maxNodes} nodes`, at);
    const created = /** @type {XmlNode} */ ({
      id: nextId++, type, name: '', value: '', ns: '', attrs: [], children: [], parent, line: lineAt(at),
    }); // prettier-ignore
    parent?.children.push(created);
    return created;
  };

  /** @param {string} message */
  const fail = (message, at = pos) => {
    throw new Fail(message, at);
  };

  const readName = () => {
    NAME.lastIndex = pos;
    const match = NAME.exec(text);
    if (!match) fail('a name was expected');
    pos += /** @type {RegExpExecArray} */ (match)[0].length;
    return /** @type {RegExpExecArray} */ (match)[0];
  };

  const skipSpace = () => {
    while (pos < text.length && /\s/.test(text[pos])) pos += 1;
  };

  /**
   * @param {string} end
   * @param {string} what
   * @returns {string}
   */
  const until = (end, what) => {
    const index = text.indexOf(end, pos);
    if (index < 0) fail(`${what} is not closed`);
    const value = text.slice(pos, index);
    pos = index + end.length;
    return value;
  };

  /**
   * Decodes predefined entities and character references. Other entities are kept
   * as entity nodes (in text) or as written (in attributes), never expanded.
   *
   * @param {string} raw
   * @param {number} at
   * @returns {(string | { entity: string })[]}
   */
  const decode = (raw, at) => {
    /** @type {(string | { entity: string })[]} */
    const parts = [];
    let buffer = '';
    let i = 0;
    while (i < raw.length) {
      const amp = raw.indexOf('&', i);
      if (amp < 0) {
        buffer += raw.slice(i);
        break;
      }
      buffer += raw.slice(i, amp);
      const semi = raw.indexOf(';', amp);
      const ref = semi > amp ? raw.slice(amp + 1, semi) : '';
      if (!ref || !/^(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z_:][\w.\-:]*)$/.test(ref))
        fail('"&" must start an entity such as &amp;', at + amp);
      if (ref[0] === '#') {
        const code = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
        if (!(code > 0 && code <= 0x10ffff) || (code >= 0xd800 && code <= 0xdfff))
          fail(`invalid character reference &${ref};`, at + amp);
        buffer += String.fromCodePoint(code);
      } else if (Object.prototype.hasOwnProperty.call(PREDEFINED, ref)) {
        buffer += PREDEFINED[ref];
      } else {
        entities.add(ref);
        if (buffer) parts.push(buffer);
        buffer = '';
        parts.push({ entity: ref });
      }
      i = semi + 1;
    }
    if (buffer) parts.push(buffer);
    return parts;
  };

  /**
   * @param {XmlNode} parent
   * @param {string} raw
   * @param {number} at
   */
  const addText = (parent, raw, at) => {
    if (raw.includes(']]>')) fail('"]]>" is not allowed in text', at + raw.indexOf(']]>'));
    for (const part of decode(raw, at)) {
      if (typeof part === 'string') {
        const last = parent.children[parent.children.length - 1];
        if (last?.type === 'text') last.value += part;
        else node('text', parent, at).value = part;
      } else {
        node('entity', parent, at).name = part.entity;
      }
    }
  };

  /**
   * @param {XmlNode} element
   * @param {Map<string, string>} scope - Prefix to namespace URI, inherited.
   * @returns {Map<string, string>}
   */
  const resolveNamespaces = (element, scope) => {
    /** @type {Map<string, string>} */
    let own = scope;
    for (const attr of element.attrs) {
      if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) {
        if (own === scope) own = new Map(scope);
        own.set(attr.name === 'xmlns' ? '' : attr.name.slice(6), attr.value);
      }
    }
    const prefixOf = (/** @type {string} */ name) =>
      name.includes(':') ? name.slice(0, name.indexOf(':')) : '';
    element.ns = own.get(prefixOf(element.name)) ?? '';
    for (const attr of element.attrs) {
      const prefix = prefixOf(attr.name);
      attr.ns =
        prefix === 'xml' ? XML_NS : prefix && prefix !== 'xmlns' ? (own.get(prefix) ?? '') : '';
    }
    return own;
  };

  try {
    const root = node('document', null, 0);
    if (text.charCodeAt(0) === 0xfeff) pos = 1;
    /** @type {{ element: XmlNode, scope: Map<string, string> }[]} */
    const stack = [{ element: root, scope: new Map([['xml', XML_NS]]) }];
    let sawRoot = false;
    while (pos < text.length) {
      const { element: parent, scope } = stack[stack.length - 1];
      const lt = text.indexOf('<', pos);
      if (lt !== pos) {
        const end = lt < 0 ? text.length : lt;
        const raw = text.slice(pos, end);
        if (parent === root) {
          if (raw.trim()) fail('text outside the root element', pos + raw.search(/\S/));
        } else addText(parent, raw, pos);
        pos = end;
        continue;
      }
      const start = pos;
      if (text.startsWith('<!--', pos)) {
        pos += 4;
        const value = until('-->', 'comment');
        if (value.includes('--')) fail('"--" is not allowed in a comment', start);
        node('comment', parent, start).value = value;
      } else if (text.startsWith('<![CDATA[', pos)) {
        if (parent === root) fail('CDATA outside the root element');
        pos += 9;
        node('cdata', parent, start).value = until(']]>', 'CDATA section');
      } else if (text.startsWith('<?', pos)) {
        pos += 2;
        const target = readName();
        const data = until('?>', 'processing instruction').trim();
        if (target.toLowerCase() === 'xml') {
          if (start !== (text.charCodeAt(0) === 0xfeff ? 1 : 0))
            fail('the XML declaration must come first', start);
          declaration = `<?xml ${data}?>`;
        } else {
          const pi = node('pi', parent, start);
          pi.name = target;
          pi.value = data;
        }
      } else if (text.startsWith('<!DOCTYPE', pos)) {
        if (parent !== root || sawRoot) fail('DOCTYPE after the root element');
        pos += 9;
        // Read the DOCTYPE as text, internal subset included; it is never processed.
        let depth = 0;
        let quote = '';
        const from = pos;
        while (pos < text.length) {
          const c = text[pos];
          if (quote) {
            if (c === quote) quote = '';
          } else if (c === '"' || c === "'") quote = c;
          else if (c === '[') depth += 1;
          else if (c === ']') depth -= 1;
          else if (c === '>' && depth <= 0) break;
          pos += 1;
        }
        if (pos >= text.length) fail('DOCTYPE is not closed', start);
        node('doctype', parent, start).value = text.slice(from, pos).trim();
        pos += 1;
      } else if (text.startsWith('</', pos)) {
        pos += 2;
        const name = readName();
        skipSpace();
        if (text[pos] !== '>') fail('">" was expected');
        pos += 1;
        if (parent === root) fail(`closing tag </${name}> without an opening tag`, start);
        if (name !== parent.name)
          fail(`</${name}> closes <${parent.name}> (line ${parent.line})`, start);
        stack.pop();
      } else {
        pos += 1;
        if (parent === root && sawRoot) fail('only one root element is allowed', start);
        const element = node('element', parent, start);
        element.name = readName();
        /** @type {Set<string>} */
        const seen = new Set();
        for (;;) {
          const before = pos;
          skipSpace();
          if (text.startsWith('/>', pos) || text[pos] === '>') break;
          if (pos >= text.length) fail(`<${element.name}> is not closed`, start);
          if (pos === before) fail('a space was expected before the attribute');
          const at = pos;
          const name = readName();
          if (seen.has(name)) fail(`attribute "${name}" is repeated`, at);
          seen.add(name);
          skipSpace();
          if (text[pos] !== '=') fail(`"=" was expected after ${name}`);
          pos += 1;
          skipSpace();
          const quote = text[pos];
          if (quote !== '"' && quote !== "'") fail('a quoted value was expected');
          pos += 1;
          const valueAt = pos;
          const raw = until(quote, 'attribute value');
          if (raw.includes('<')) fail('"<" is not allowed in an attribute value', valueAt);
          const value = decode(raw, valueAt)
            .map((part) => (typeof part === 'string' ? part : `&${part.entity};`))
            .join('')
            .replace(/[\t\n\r]/g, ' ');
          element.attrs.push({ name, value, ns: '' });
        }
        const own = resolveNamespaces(element, scope);
        if (parent === root) sawRoot = true;
        if (text.startsWith('/>', pos)) pos += 2;
        else {
          pos += 1;
          if (stack.length > maxDepth) throw new Fail(`deeper than ${maxDepth}`, start, true);
          stack.push({ element, scope: own });
        }
      }
    }
    if (stack.length > 1) {
      const open = stack[stack.length - 1].element;
      fail(`<${open.name}> (line ${open.line}) is not closed`, text.length);
    }
    if (!sawRoot) fail('no root element', text.length);
    return { ok: true, value: root, entities: [...entities], declaration };
  } catch (error) {
    if (!(error instanceof Fail)) throw error;
    const at = Math.min(error.at, text.length);
    const line = lineAt(at);
    const column = at - starts[line - 1] + 1;
    return { ok: false, error: { message: error.message, line, column, tooDeep: error.tooDeep } };
  }
}

/**
 * The root element of a document.
 *
 * @param {XmlNode} doc
 * @returns {XmlNode | undefined}
 */
export function rootElement(doc) {
  return doc.children.find((child) => child.type === 'element');
}

/**
 * XPath of a node: `/catalog/book[2]/@id`, `/catalog/book[1]/text()`.
 *
 * @param {XmlNode} target
 * @param {string} [attr] - Name of an attribute of the node.
 * @returns {string}
 */
export function xpathOf(target, attr) {
  /** @type {string[]} */
  const steps = [];
  /** @type {XmlNode | null} */
  let current = target;
  while (current && current.type !== 'document') {
    /** @type {XmlNode | null} */
    const parent = current.parent;
    const node = current;
    const test = (/** @type {XmlNode} */ other) =>
      other.type === node.type && (node.type !== 'element' || other.name === node.name);
    const same = parent ? parent.children.filter(test) : [node];
    const index = same.indexOf(node) + 1;
    const suffix =
      same.length > 1 || (node.type === 'element' && parent?.type !== 'document')
        ? `[${index}]`
        : '';
    const name =
      node.type === 'element' ? node.name
      : node.type === 'comment' ? 'comment()'
      : node.type === 'pi' ? `processing-instruction('${node.name}')`
      : 'text()'; // prettier-ignore
    if (node.type !== 'doctype') steps.unshift(`${name}${suffix}`);
    current = parent;
  }
  const path = `/${steps.join('/')}`;
  return attr ? `${path}/@${attr}` : path;
}

/**
 * Text of a node and its descendants (what XPath `string()` returns).
 *
 * @param {XmlNode} node
 * @returns {string}
 */
export function textContent(node) {
  if (node.type === 'text' || node.type === 'cdata') return node.value;
  if (node.type === 'entity') return `&${node.name};`;
  if (node.type !== 'element' && node.type !== 'document') return node.value;
  let text = '';
  /** @type {XmlNode[]} */
  const stack = [...node.children].reverse();
  while (stack.length) {
    const child = /** @type {XmlNode} */ (stack.pop());
    if (child.type === 'element') stack.push(...[...child.children].reverse());
    else if (child.type === 'text' || child.type === 'cdata') text += child.value;
    else if (child.type === 'entity') text += `&${child.name};`;
  }
  return text;
}

/**
 * @param {string} value
 * @param {boolean} [attribute]
 * @returns {string}
 */
function escape(value, attribute = false) {
  const text = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return attribute ? text.replace(/"/g, '&quot;') : text;
}

/**
 * Writes a node back as XML, indented.
 *
 * @param {XmlNode} doc
 * @param {{ indent?: number, declaration?: string }} [options]
 * @returns {string}
 */
export function serialize(doc, options = {}) {
  const unit = ' '.repeat(options.indent ?? 2);
  /** @type {string[]} */
  const out = options.declaration ? [options.declaration] : [];
  /**
   * @param {XmlNode} node
   * @param {string} pad
   */
  const write = (node, pad) => {
    switch (node.type) {
      case 'document':
        for (const child of node.children) write(child, pad);
        return;
      case 'doctype':
        out.push(`${pad}<!DOCTYPE ${node.value}>`);
        return;
      case 'comment':
        out.push(`${pad}<!--${node.value}-->`);
        return;
      case 'pi':
        out.push(`${pad}<?${node.name}${node.value ? ` ${node.value}` : ''}?>`);
        return;
      case 'cdata':
        out.push(`${pad}<![CDATA[${node.value}]]>`);
        return;
      case 'entity':
        out.push(`${pad}&${node.name};`);
        return;
      case 'text': {
        const text = node.value.trim();
        if (text) out.push(`${pad}${escape(text)}`);
        return;
      }
      default:
        break;
    }
    const attrs = node.attrs.map((attr) => ` ${attr.name}="${escape(attr.value, true)}"`).join('');
    const children = node.children.filter((child) => child.type !== 'text' || child.value.trim());
    if (!children.length) out.push(`${pad}<${node.name}${attrs}/>`);
    else if (children.length === 1 && children[0].type === 'text')
      out.push(`${pad}<${node.name}${attrs}>${escape(children[0].value.trim())}</${node.name}>`);
    else {
      out.push(`${pad}<${node.name}${attrs}>`);
      for (const child of children) write(child, pad + unit);
      out.push(`${pad}</${node.name}>`);
    }
  };
  write(doc, '');
  return out.join('\n');
}
