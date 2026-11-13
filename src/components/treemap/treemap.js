// @ts-check
/**
 * Treemaps for <vt-treemap>: sizes of a hierarchy read from JSON trees, esbuild metafiles,
 * webpack stats, lists of paths and sizes (JSON or CSV) or the output of `du`, and the
 * squarified layout that turns them into rectangles.
 *
 * @module components/treemap/treemap
 */
import { parseCsv } from '../csv/parser.js';
import { toNumber } from '../pivot/pivot.js';

/** Nodes read; the rest are dropped. */
export const MAX_NODES = 100_000;
/** Depth of a path or a tree. */
export const MAX_DEPTH = 64;

/**
 * @typedef {object} TreeNode
 * @property {number} id
 * @property {string} name
 * @property {number} total - Its size, with what it holds.
 * @property {number} self - Its own size, beside its children.
 * @property {number} depth - 0 for the root.
 * @property {TreeNode | null} parent
 * @property {TreeNode[]} children - Largest first.
 */

/**
 * @typedef {object} Tree
 * @property {TreeNode} root
 * @property {"tree" | "esbuild" | "webpack" | "list" | "csv" | "du"} format
 * @property {boolean} bytes - Sizes are bytes (bundles).
 * @property {number} count - Nodes read.
 */

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */

export class TreemapError extends Error {}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Builds a tree from paths, merging nodes of the same name under the same parent. */
class Builder {
  constructor() {
    this.count = 1;
    /** @type {Map<TreeNode, Map<string, TreeNode>>} */
    this.index = new Map();
    /** @type {Map<TreeNode, number>} Sizes given for a node itself (or with what it holds). */
    this.given = new Map();
    this.root = this.node('', null);
  }

  /**
   * @param {string} name
   * @param {TreeNode | null} parent
   * @returns {TreeNode}
   */
  node(name, parent) {
    return { id: this.count++, name, total: 0, self: 0, depth: parent ? parent.depth + 1 : 0, parent, children: [] }; // prettier-ignore
  }

  /**
   * @param {TreeNode} parent
   * @param {string} name
   * @returns {TreeNode | null}
   */
  child(parent, name) {
    let names = this.index.get(parent);
    if (!names) {
      names = new Map();
      this.index.set(parent, names);
    }
    let node = names.get(name);
    if (!node) {
      if (this.count > MAX_NODES || parent.depth >= MAX_DEPTH) return null;
      node = this.node(name, parent);
      names.set(name, node);
      parent.children.push(node);
    }
    return node;
  }

  /**
   * Adds a size at a path: `["src", "core", "dom.js"]`.
   *
   * @param {string[]} path
   * @param {number} size
   */
  add(path, size) {
    if (!Number.isFinite(size) || size < 0) return;
    let node = this.root;
    for (const part of path) {
      const next = this.child(node, part.slice(0, 300));
      if (!next) return;
      node = next;
    }
    this.given.set(node, (this.given.get(node) ?? 0) + size);
  }

  /** @returns {TreeNode} */
  finish() {
    // Totals bottom-up: a size given for a node that has children (a directory of `du`, a
    // node of a JSON tree) is its total; what its children do not account for is its own.
    /** @type {TreeNode[]} */
    const order = [];
    /** @type {TreeNode[]} */
    const stack = [this.root];
    while (stack.length) {
      const node = /** @type {TreeNode} */ (stack.pop());
      order.push(node);
      stack.push(...node.children);
    }
    for (let i = order.length - 1; i >= 0; i -= 1) {
      const node = order[i];
      node.children = node.children.filter((c) => c.total > 0);
      node.children.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
      const sum = node.children.reduce((s, c) => s + c.total, 0);
      node.total = Math.max(this.given.get(node) ?? 0, sum);
      node.self = node.total - sum;
    }
    return this.root;
  }
}

/**
 * A path split on `/` and `\`, without `.` and empty parts.
 *
 * @param {string} path
 * @returns {string[]}
 */
export function splitPath(path) {
  return path
    .trim()
    .split(/[\\/]+/)
    .filter((part) => part && part !== '.');
}

/**
 * Reads a tree of sizes.
 *
 * @param {string} text
 * @returns {Tree}
 */
export function parseTree(text) {
  const source = text.trim();
  if (!source) throw new TreemapError('empty');
  const builder = new Builder();
  /** @type {Tree["format"]} */
  let format;
  let bytes = false;
  if (/^[[{]/.test(source)) {
    /** @type {unknown} */
    let value;
    try {
      value = JSON.parse(source);
    } catch (error) {
      throw new TreemapError(`json:${error instanceof Error ? error.message : ''}`);
    }
    if (
      isObject(value) &&
      (isObject(value.outputs) || isObject(value.inputs)) &&
      !('children' in value)
    ) {
      format = 'esbuild';
      bytes = true;
      readEsbuild(value, builder);
    } else if (
      isObject(value) &&
      (Array.isArray(value.modules) ||
        (Array.isArray(value.children) &&
          value.children.some((c) => isObject(c) && Array.isArray(c.modules))))
    ) {
      format = 'webpack';
      bytes = true;
      readWebpack(value, builder);
    } else if (Array.isArray(value)) {
      format = 'list';
      readList(value, builder);
    } else if (isObject(value) && Array.isArray(value.children)) {
      format = 'tree';
      readJsonTree(value, builder);
    } else throw new TreemapError('format');
  } else {
    const lines = source.split(/\r?\n/).filter((line) => line.trim());
    if (lines.every((line) => /^\s*\d+(?:\.\d+)?[KMGTP]?\s+\S/.test(line))) {
      format = 'du';
      readDu(lines, builder);
    } else {
      format = 'csv';
      readCsv(source, builder);
    }
  }
  const root = builder.finish();
  if (!root.total) throw new TreemapError('noSizes');
  return { root, format, bytes, count: builder.count - 1 };
}

/**
 * esbuild `--metafile`: the bytes of each input in each output, or the inputs alone.
 *
 * @param {Record<string, unknown>} meta
 * @param {Builder} builder
 */
function readEsbuild(meta, builder) {
  const outputs = isObject(meta.outputs) ? Object.entries(meta.outputs).filter(([name]) => !name.endsWith('.map')) : []; // prettier-ignore
  if (outputs.length) {
    for (const [name, output] of outputs) {
      if (!isObject(output) || !isObject(output.inputs)) continue;
      const head = outputs.length > 1 ? [name] : [];
      for (const [input, info] of Object.entries(output.inputs))
        builder.add([...head, ...splitPath(input)], isObject(info) ? (toNumber(/** @type {any} */ (info.bytesInOutput)) ?? 0) : 0); // prettier-ignore
    }
    return;
  }
  for (const [input, info] of Object.entries(/** @type {Record<string, unknown>} */ (meta.inputs)))
    builder.add(splitPath(input), isObject(info) ? (toNumber(/** @type {any} */ (info.bytes)) ?? 0) : 0); // prettier-ignore
}

/**
 * webpack `--json` stats: the size of each module (also in `children` compilations).
 *
 * @param {Record<string, unknown>} stats
 * @param {Builder} builder
 * @param {number} [level]
 */
function readWebpack(stats, builder, level = 0) {
  if (Array.isArray(stats.modules))
    for (const module of stats.modules) {
      if (!isObject(module)) continue;
      const name = typeof module.name === 'string' ? module.name : typeof module.identifier === 'string' ? module.identifier : ''; // prettier-ignore
      // Concatenated modules hold the modules they were made of.
      if (Array.isArray(module.modules) && module.modules.length) {
        readWebpack({ modules: module.modules }, builder, level + 1);
        continue;
      }
      const size = toNumber(/** @type {any} */ (module.size)) ?? 0;
      if (name) builder.add(splitPath(name.replace(/^.*!/, '').replace(/ \+ \d+ modules$/, '')), size); // prettier-ignore
    }
  if (Array.isArray(stats.children) && level < 4)
    for (const child of stats.children) if (isObject(child)) readWebpack(child, builder, level + 1);
}

/**
 * A list of `{ path | name, size | value | bytes }`, or of `[path, size]`.
 *
 * @param {unknown[]} list
 * @param {Builder} builder
 */
function readList(list, builder) {
  for (const item of list.slice(0, MAX_NODES)) {
    if (Array.isArray(item)) {
      if (typeof item[0] === 'string') builder.add(splitPath(item[0]), toNumber(item[1]) ?? 0);
      continue;
    }
    if (!isObject(item)) continue;
    const path = [item.path, item.name, item.file, item.id].find((v) => typeof v === 'string');
    const size = [item.size, item.value, item.bytes, item.count].map((v) => toNumber(/** @type {any} */ (v))).find((v) => v !== null); // prettier-ignore
    if (typeof path === 'string' && size !== undefined && size !== null) builder.add(splitPath(path), size); // prettier-ignore
  }
}

/**
 * `{ name, value, children }`: a value on a node with children is its total.
 *
 * @param {Record<string, unknown>} tree
 * @param {Builder} builder
 */
function readJsonTree(tree, builder) {
  /** @type {{ item: Record<string, unknown>, path: string[] }[]} */
  const stack = [{ item: tree, path: [] }];
  while (stack.length) {
    const { item, path } = /** @type {{ item: Record<string, unknown>, path: string[] }} */ (stack.pop()); // prettier-ignore
    const size = [item.value, item.size].map((v) => toNumber(/** @type {any} */ (v))).find((v) => v !== null); // prettier-ignore
    if (size !== undefined && size !== null) builder.add(path, size);
    if (Array.isArray(item.children) && path.length < MAX_DEPTH)
      item.children.forEach((child, i) => {
        if (isObject(child)) {
          const name = typeof child.name === 'string' ? child.name : String(i + 1);
          stack.push({ item: child, path: [...path, name] });
        }
      });
  }
}

/**
 * `du` (`du -a`, `du -k`, `du -h`): a size, then a path; directories hold their content.
 *
 * @param {string[]} lines
 * @param {Builder} builder
 */
function readDu(lines, builder) {
  /** @type {Record<string, number>} */
  const units = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4, P: 1024 ** 5 };
  const human = lines.some((line) => /^\s*\d+(?:\.\d+)?[KMGTP]\s/.test(line));
  const parsed = lines.slice(0, MAX_NODES).map((line) => {
    const match = /^\s*(\d+(?:\.\d+)?)([KMGTP]?)\s+(.+)$/.exec(line);
    if (!match) return null;
    const size = Number(match[1]) * (human ? units[match[2]] : 1);
    return { size, path: splitPath(match[3]) };
  });
  // The last line of `du` is often the total of the directory given (`.`): it is the root.
  for (const entry of parsed) if (entry) builder.add(entry.path, entry.size);
}

/**
 * CSV: the first text column is the path, the first numeric column the size.
 *
 * @param {string} source
 * @param {Builder} builder
 */
function readCsv(source, builder) {
  const { rows } = parseCsv(source);
  const [header, ...body] = rows;
  if (!header || header.length < 2) throw new TreemapError('format');
  const sample = body.slice(0, 200);
  const numeric = (/** @type {number} */ i) => sample.length > 0 && sample.every((row) => !row[i]?.trim() || toNumber(row[i]) !== null); // prettier-ignore
  const sizeAt = header.findIndex((_, i) => numeric(i));
  if (sizeAt < 0) throw new TreemapError('format');
  // With several text columns before the size (`team,service,cost`), they are the levels.
  const levels = header.map((_, i) => i).filter((i) => i < sizeAt && !numeric(i));
  if (!levels.length) throw new TreemapError('format');
  for (const row of body.slice(0, MAX_NODES)) {
    const size = toNumber(row[sizeAt] ?? '');
    if (size === null) continue;
    const path = levels.length === 1 ? splitPath(row[levels[0]] ?? '') : levels.map((i) => (row[i] ?? '').trim()).filter(Boolean); // prettier-ignore
    if (path.length) builder.add(path, size);
  }
}

/**
 * The nodes from the root to a node, the root included.
 *
 * @param {TreeNode} node
 * @returns {TreeNode[]}
 */
export function pathOf(node) {
  /** @type {TreeNode[]} */
  const path = [];
  for (let n = /** @type {TreeNode | null} */ (node); n; n = n.parent) path.unshift(n);
  return path;
}

/**
 * The squarified layout (Bruls, Huizing and van Wijk, 2000): rectangles of areas in
 * proportion to the values, as close to squares as the order allows. Values are sorted,
 * largest first.
 *
 * @param {number[]} values
 * @param {Rect} rect
 * @returns {Rect[]} In the order of `values`.
 */
export function squarify(values, rect) {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  /** @type {Rect[]} */
  const out = values.map(() => ({ x: rect.x, y: rect.y, w: 0, h: 0 }));
  if (!total || rect.w <= 0 || rect.h <= 0) return out;
  const scale = (rect.w * rect.h) / total;
  const areas = values.map((v) => Math.max(0, v) * scale);
  let { x, y, w, h } = rect;
  let start = 0;
  /**
   * Worst aspect ratio of a row of areas laid along a side.
   *
   * @param {number} sum
   * @param {number} min
   * @param {number} max
   * @param {number} side
   */
  const worst = (sum, min, max, side) => {
    const s2 = sum * sum;
    const side2 = side * side;
    return Math.max((side2 * max) / s2, s2 / (side2 * min));
  };
  while (start < areas.length) {
    const side = Math.min(w, h);
    let end = start;
    let sum = 0;
    let min = Infinity;
    let max = 0;
    while (end < areas.length) {
      const a = areas[end];
      if (a <= 0) {
        end += 1;
        continue;
      }
      const nextSum = sum + a;
      const nextMin = Math.min(min, a);
      const nextMax = Math.max(max, a);
      if (sum > 0 && worst(nextSum, nextMin, nextMax, side) > worst(sum, min, max, side)) break;
      sum = nextSum;
      min = nextMin;
      max = nextMax;
      end += 1;
    }
    if (sum <= 0) break;
    // The row fills a strip along the shorter side.
    const thickness = sum / side;
    let offset = 0;
    for (let i = start; i < end; i += 1) {
      const length = areas[i] / thickness;
      out[i] = w >= h
        ? { x, y: y + offset, w: thickness, h: length }
        : { x: x + offset, y, w: length, h: thickness }; // prettier-ignore
      offset += length;
    }
    if (w >= h) {
      x += thickness;
      w -= thickness;
    } else {
      y += thickness;
      h -= thickness;
    }
    start = end;
  }
  return out;
}

/**
 * Sizes of the children of a node as CSV, with the path of each.
 *
 * @param {TreeNode} node
 * @returns {string}
 */
export function treeToCsv(node) {
  const field = (/** @type {string} */ v) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = ['path,size'];
  /** @type {TreeNode[]} */
  const stack = [node];
  while (stack.length && lines.length <= MAX_NODES) {
    const n = /** @type {TreeNode} */ (stack.pop());
    if (n.self > 0 && n.depth > 0)
      lines.push(
        `${field(
          pathOf(n)
            .slice(1)
            .map((p) => p.name)
            .join('/'),
        )},${n.self}`,
      );
    for (let i = n.children.length - 1; i >= 0; i -= 1) stack.push(n.children[i]);
  }
  return lines.join('\n');
}
