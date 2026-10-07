// @ts-check
/**
 * Reads a file tree from text or JSON.
 *
 * Accepted formats (detected automatically):
 *
 * - **JSON**: an array of paths, an array of `{ name, children?, type?, note?, status? }`
 *   objects, or nested objects (`{ "src": { "app.js": null } }`, where a string value is
 *   a note);
 * - **`tree` output**: lines drawn with `├──`, `└──` and `│`;
 * - **indented text**: one name per line, children indented under their folder;
 * - **paths**: one path per line (`src/app.js`), folders created as needed.
 *
 * In text formats, a name ending with `/` is a folder, `  # text` at the end of a line
 * is a note, and a leading `+ `, `- `, `~ ` or `* ` marks the entry as added, removed,
 * modified or highlighted.
 *
 * @module components/tree/parser
 */

/** @typedef {"added" | "removed" | "modified" | "highlighted"} Status */

/**
 * @typedef {object} TreeNode
 * @property {string} name
 * @property {"folder" | "file"} type
 * @property {TreeNode[]} children
 * @property {string} note
 * @property {Status | null} status
 */

/**
 * @typedef {object} TreeResult
 * @property {TreeNode[]} roots
 * @property {"json" | "tree" | "indent" | "paths"} format
 * @property {number} files
 * @property {number} folders
 * @property {boolean} truncated - More than {@link MAX_NODES} entries: the rest is ignored.
 */

/** Entries kept at most. */
export const MAX_NODES = 20_000;
/** Deepest level kept. */
export const MAX_DEPTH = 64;
/** Longest name kept (characters). */
const MAX_NAME = 255;
/** Longest note kept (characters). */
const MAX_NOTE = 500;

const STATUS_MARKS = /** @type {Record<string, Status>} */ ({
  '+': 'added',
  '-': 'removed',
  '~': 'modified',
  '*': 'highlighted',
});
const STATUSES = new Set(['added', 'removed', 'modified', 'highlighted']);

/** Thrown when the input cannot be read as a tree. */
export class TreeError extends Error {
  /**
   * @param {"invalidJson" | "tooDeep"} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Builds nodes while counting them, so every format shares the limits.
 */
class Builder {
  constructor() {
    this.count = 0;
    this.files = 0;
    this.folders = 0;
    this.truncated = false;
  }

  /**
   * @param {string} name
   * @param {Partial<Pick<TreeNode, "type" | "note" | "status">>} [props]
   * @returns {TreeNode | null} `null` once the limit is reached.
   */
  node(name, props = {}) {
    if (this.count >= MAX_NODES) {
      this.truncated = true;
      return null;
    }
    this.count += 1;
    return {
      name: cleanText(name, MAX_NAME),
      type: props.type ?? 'file',
      children: [],
      note: cleanText(props.note ?? '', MAX_NOTE),
      status: props.status ?? null,
    };
  }

  /** Counts files and folders once the tree is complete. @param {TreeNode[]} roots */
  finish(roots) {
    /** @type {TreeNode[]} */
    const stack = [...roots];
    while (stack.length) {
      const node = /** @type {TreeNode} */ (stack.pop());
      if (node.children.length) node.type = 'folder';
      if (node.type === 'folder') this.folders += 1;
      else this.files += 1;
      stack.push(...node.children);
    }
  }
}

/**
 * Removes control characters and limits the length of a name or note.
 *
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function cleanText(text, max) {
  const clean = Array.from(String(text))
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * Splits a text line into its status, name and note.
 *
 * @param {string} text - Line without indentation or tree drawing.
 * @returns {{ name: string, folder: boolean, note: string, status: Status | null }}
 */
export function parseLine(text) {
  let rest = text.trim();
  /** @type {Status | null} */
  let status = null;
  const mark = /^([+\-~*]) (?=\S)/.exec(rest);
  if (mark) {
    status = STATUS_MARKS[mark[1]];
    rest = rest.slice(2);
  }
  let note = '';
  const comment = /\s+#\s?(.*)$/.exec(rest);
  if (comment && comment.index > 0) {
    note = comment[1];
    rest = rest.slice(0, comment.index);
  }
  // `tree -F` and `ls -F` style suffixes; a trailing slash marks a folder.
  const folder = /[/\\]$/.test(rest);
  const name = rest.replace(/[/\\]+$/, '') || rest;
  return { name, folder, note, status };
}

/**
 * Reads a file tree.
 *
 * @param {string} text
 * @returns {TreeResult}
 * @throws {TreeError} Invalid JSON, or JSON nested too deeply.
 */
export function parseTree(text) {
  const source = text.replace(/^\uFEFF/, '');
  const trimmed = source.trim();
  const builder = new Builder();
  /** @type {TreeResult["format"]} */
  let format;
  /** @type {TreeNode[]} */
  let roots;
  if (/^[[{]/.test(trimmed)) {
    format = 'json';
    roots = fromJson(trimmed, builder);
  } else {
    const lines = source.split(/\r\n?|\n/).filter((line) => line.trim());
    if (lines.some((line) => /[├└]──|[|`]-- /.test(line))) {
      format = 'tree';
      roots = fromTreeOutput(lines, builder);
    } else if (lines.some((line) => /^\s/.test(line))) {
      format = 'indent';
      roots = fromIndented(lines, builder);
    } else {
      format = 'paths';
      roots = fromPaths(lines, builder);
    }
  }
  builder.finish(roots);
  return {
    roots,
    format,
    files: builder.files,
    folders: builder.folders,
    truncated: builder.truncated,
  };
}

/**
 * Adds a node at a depth, using the stack of current ancestors.
 *
 * @param {TreeNode[]} roots
 * @param {TreeNode[]} stack - stack[d] is the last node seen at depth d.
 * @param {number} depth
 * @param {TreeNode} node
 */
function placeAt(roots, stack, depth, node) {
  const level = Math.min(depth, stack.length, MAX_DEPTH - 1);
  stack.length = level;
  if (level === 0) roots.push(node);
  else {
    const parent = stack[level - 1];
    parent.type = 'folder';
    parent.children.push(node);
  }
  stack.push(node);
}

/**
 * @param {string[]} lines
 * @param {Builder} builder
 * @returns {TreeNode[]}
 */
function fromIndented(lines, builder) {
  const indents = lines.map((line) => {
    const lead = /^[ \t]*/.exec(line)?.[0] ?? '';
    return lead.replace(/\t/g, '    ').length;
  });
  const base = Math.min(...indents);
  const steps = indents.map((n) => n - base).filter((n) => n > 0);
  const unit = steps.length ? Math.min(...steps) : 2;
  /** @type {TreeNode[]} */
  const roots = [];
  /** @type {TreeNode[]} */
  const stack = [];
  for (let i = 0; i < lines.length; i += 1) {
    const { name, folder, note, status } = parseLine(lines[i]);
    const node = builder.node(name, { type: folder ? 'folder' : 'file', note, status });
    if (!node) break;
    placeAt(roots, stack, Math.round((indents[i] - base) / unit), node);
  }
  return roots;
}

/**
 * @param {string[]} lines
 * @param {Builder} builder
 * @returns {TreeNode[]}
 */
function fromTreeOutput(lines, builder) {
  /** @type {TreeNode[]} */
  const roots = [];
  /** @type {TreeNode[]} */
  const stack = [];
  for (const line of lines) {
    // The summary line of `tree` ("3 directories, 12 files") is not an entry.
    if (/^\d+ director(?:y|ies)(?:, \d+ files?)?$/.test(line.trim())) continue;
    const drawing = /^((?:[│|] {3}|\s{4})*)(?:[├└]── |[|`]-- )?/.exec(line);
    const prefix = drawing?.[1] ?? '';
    const hasBranch = drawing ? drawing[0].length > prefix.length : false;
    const depth = hasBranch ? prefix.length / 4 + 1 : 0;
    const { name, folder, note, status } = parseLine(line.slice(drawing?.[0].length ?? 0));
    const node = builder.node(name, { type: folder ? 'folder' : 'file', note, status });
    if (!node) break;
    placeAt(roots, stack, depth, node);
  }
  return roots;
}

/**
 * @param {string[]} lines
 * @param {Builder} builder
 * @returns {TreeNode[]}
 */
function fromPaths(lines, builder) {
  /** @type {TreeNode[]} */
  const roots = [];
  /** @type {Map<string, TreeNode>} Folders by their full path. */
  const folders = new Map();
  for (const line of lines) {
    const { name, folder, note, status } = parseLine(line);
    const parts = name
      .split(/[/\\]+/)
      .filter((part) => part && part !== '.')
      .slice(0, MAX_DEPTH);
    if (!parts.length) continue;
    let siblings = roots;
    let path = '';
    for (let i = 0; i < parts.length; i += 1) {
      path += `/${parts[i]}`;
      const last = i === parts.length - 1;
      if (last && !folder) {
        const node = builder.node(parts[i], { note, status });
        if (!node) return roots;
        siblings.push(node);
        break;
      }
      let dir = folders.get(path);
      if (!dir) {
        const created = builder.node(parts[i], { type: 'folder' });
        if (!created) return roots;
        dir = created;
        folders.set(path, dir);
        siblings.push(dir);
      }
      if (last) {
        if (note) dir.note = cleanText(note, MAX_NOTE);
        if (status) dir.status = status;
      }
      siblings = dir.children;
    }
  }
  return roots;
}

/**
 * @param {string} text
 * @param {Builder} builder
 * @returns {TreeNode[]}
 */
function fromJson(text, builder) {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    if (error instanceof RangeError) throw new TreeError('tooDeep', 'JSON nested too deeply.');
    throw new TreeError('invalidJson', error instanceof Error ? error.message : 'Invalid JSON.');
  }
  // An array of strings is a list of paths.
  if (Array.isArray(data) && data.every((item) => typeof item === 'string')) {
    return fromPaths(/** @type {string[]} */ (data), builder);
  }
  /** @type {TreeNode[]} */
  const roots = [];
  /** @type {{ value: unknown, name: string | null, into: TreeNode[], depth: number }[]} */
  const queue = [];
  const enqueue = (/** @type {unknown} */ value, /** @type {TreeNode[]} */ into, depth = 0) => {
    if (Array.isArray(value))
      for (const item of value) queue.push({ value: item, name: null, into, depth });
    else if (value && typeof value === 'object') {
      for (const [name, child] of Object.entries(value))
        queue.push({ value: child, name, into, depth });
    }
  };
  enqueue(data, roots);
  // Breadth-first with an explicit queue: no recursion, whatever the nesting.
  for (let i = 0; i < queue.length; i += 1) {
    const { value, name, into, depth } = queue[i];
    if (depth >= MAX_DEPTH) continue;
    /** @type {TreeNode | null} */
    let node;
    if (name === null) {
      // Array item: a string (file), or an object describing the entry.
      if (typeof value === 'string') node = builder.node(value);
      else if (value && typeof value === 'object' && !Array.isArray(value)) {
        const entry = /** @type {Record<string, unknown>} */ (value);
        if (typeof entry.name !== 'string' && typeof entry.name !== 'number') continue;
        const status =
          typeof entry.status === 'string' && STATUSES.has(entry.status) ? entry.status : null;
        const children = Array.isArray(entry.children) ? entry.children : null;
        node = builder.node(String(entry.name), {
          type:
            entry.type === 'folder' || entry.type === 'directory' || children ? 'folder' : 'file',
          note: typeof entry.note === 'string' ? entry.note : '',
          status: /** @type {Status | null} */ (status),
        });
        if (node && children) enqueue(children, node.children, depth + 1);
      } else continue;
    } else {
      // Object key: an object or array is a folder; a string is a note on a file.
      const folder = Boolean(value) && typeof value === 'object';
      node = builder.node(name, {
        type: folder ? 'folder' : 'file',
        note: typeof value === 'string' ? value : '',
      });
      if (node && folder) enqueue(value, node.children, depth + 1);
    }
    if (!node) break;
    into.push(node);
  }
  return roots;
}

/**
 * Sorts a tree in place: folders first, then by name (numbers in names compared as
 * numbers, case-insensitive).
 *
 * @param {TreeNode[]} nodes
 */
export function sortTree(nodes) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  /** @type {TreeNode[][]} */
  const stack = [nodes];
  while (stack.length) {
    const list = /** @type {TreeNode[]} */ (stack.pop());
    list.sort((a, b) =>
      a.type === b.type ? collator.compare(a.name, b.name) : a.type === 'folder' ? -1 : 1,
    );
    for (const node of list) if (node.children.length) stack.push(node.children);
  }
}

/**
 * Draws a tree like the `tree` command.
 *
 * @param {TreeNode[]} roots
 * @returns {string}
 */
export function toTreeText(roots) {
  /** @type {string[]} */
  const lines = [];
  /** @type {{ node: TreeNode, prefix: string, last: boolean, top: boolean }[]} */
  const stack = roots
    .map((node, i) => ({ node, prefix: '', last: i === roots.length - 1, top: true }))
    .reverse();
  while (stack.length) {
    const { node, prefix, last, top } = /** @type {(typeof stack)[number]} */ (stack.pop());
    const label = `${node.name}${node.type === 'folder' ? '/' : ''}${node.note ? `  # ${node.note}` : ''}`;
    lines.push(top ? label : `${prefix}${last ? '└── ' : '├── '}${label}`);
    const childPrefix = top ? '' : `${prefix}${last ? '    ' : '│   '}`;
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      stack.push({
        node: node.children[i],
        prefix: childPrefix,
        last: i === node.children.length - 1,
        top: false,
      });
    }
  }
  return lines.join('\n');
}

/**
 * Plain JSON for a tree (the `data` property).
 *
 * @param {TreeNode[]} roots
 * @returns {object[]}
 */
export function toJson(roots) {
  /** @param {TreeNode} node @returns {object} */
  const convert = (node) => ({
    name: node.name,
    type: node.type,
    ...(node.note ? { note: node.note } : {}),
    ...(node.status ? { status: node.status } : {}),
    ...(node.type === 'folder' ? { children: node.children.map(convert) } : {}),
  });
  return roots.map(convert);
}
