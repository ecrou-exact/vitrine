// @ts-check
/**
 * Profiles for <vt-flame>: folded stacks (`a;b;c 12`, written by perf with
 * stackcollapse, py-spy, async-profiler, rbspy…), Chrome and Node CPU profiles
 * (`.cpuprofile`), or a JSON tree `{ name, value, children }`. Everything is read into a
 * tree of frames with their own (self) and total weight. Nothing is ever run.
 *
 * @module components/flame/flame
 */

/** Frames kept. */
export const MAX_FRAMES = 200_000;
/** Deepest stack kept. */
export const MAX_DEPTH = 1024;

/**
 * @typedef {object} Frame
 * @property {number} id
 * @property {string} name
 * @property {string} file - URL or file and line, when the profile gives them.
 * @property {number} self - Weight spent in this frame itself.
 * @property {number} total - Weight of this frame and everything it called.
 * @property {number} depth - 0 for the root.
 * @property {Frame[]} children - By name.
 * @property {Frame | null} parent
 */

/**
 * @typedef {object} Profile
 * @property {Frame} root
 * @property {"samples" | "ms"} unit
 * @property {"folded" | "cpuprofile" | "tree"} format
 * @property {number} frames
 */

export class FlameError extends Error {}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Builds the tree, merging frames with the same name and file under the same parent. */
class Builder {
  constructor() {
    this.count = 1;
    /** @type {Frame} */
    this.root = { id: 0, name: 'all', file: '', self: 0, total: 0, depth: 0, children: [], parent: null }; // prettier-ignore
    /** @type {WeakMap<Frame, Map<string, Frame>>} */
    this.index = new WeakMap();
  }

  /**
   * @param {Frame} parent
   * @param {string} name
   * @param {string} file
   * @returns {Frame | null}
   */
  child(parent, name, file) {
    let byKey = this.index.get(parent);
    if (!byKey) this.index.set(parent, (byKey = new Map()));
    const key = `${name}\u0000${file}`;
    let frame = byKey.get(key);
    if (frame) return frame;
    if (this.count >= MAX_FRAMES || parent.depth >= MAX_DEPTH) return null;
    frame = { id: this.count++, name: name.slice(0, 500), file: file.slice(0, 500), self: 0, total: 0, depth: parent.depth + 1, children: [], parent }; // prettier-ignore
    byKey.set(key, frame);
    parent.children.push(frame);
    return frame;
  }

  /** Totals from the leaves up, children by name. */
  finish() {
    /** @type {Frame[]} */
    const order = [];
    /** @type {Frame[]} */
    const stack = [this.root];
    while (stack.length) {
      const frame = /** @type {Frame} */ (stack.pop());
      order.push(frame);
      for (const child of frame.children) stack.push(child);
    }
    for (let i = order.length - 1; i >= 0; i -= 1) {
      const frame = order[i];
      frame.total = frame.self + frame.children.reduce((sum, c) => sum + c.total, 0);
      frame.children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    }
    return this.root;
  }
}

/**
 * Reads a profile.
 *
 * @param {string} text
 * @returns {Profile}
 */
export function parseProfile(text) {
  const source = text.trim();
  if (!source) throw new FlameError('empty');
  if (/^[[{]/.test(source)) {
    /** @type {unknown} */
    let value;
    try {
      value = JSON.parse(source);
    } catch (error) {
      throw new FlameError(`json:${error instanceof Error ? error.message : ''}`);
    }
    if (isObject(value) && Array.isArray(value.nodes)) return fromCpuProfile(value);
    if (isObject(value) && (typeof value.name === 'string' || Array.isArray(value.children)))
      return fromTree(value);
    throw new FlameError('format');
  }
  return fromFolded(source);
}

/**
 * `main;parse;tokenize 12` per line; the count is the last field.
 *
 * @param {string} source
 * @returns {Profile}
 */
function fromFolded(source) {
  const builder = new Builder();
  let lines = 0;
  for (const line of source.split('\n')) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const match = /^(.*\S)\s+(\d+(?:\.\d+)?)$/.exec(text);
    if (!match) continue;
    const weight = Number(match[2]);
    if (!(weight > 0)) continue;
    let frame = builder.root;
    for (const name of match[1].split(';')) {
      const next = builder.child(frame, name.trim() || '(unknown)', '');
      if (!next) break;
      frame = next;
    }
    frame.self += weight;
    lines += 1;
  }
  if (!lines) throw new FlameError('format');
  return { root: builder.finish(), unit: 'samples', format: 'folded', frames: builder.count };
}

/**
 * Chrome DevTools and `node --cpu-prof`. With `samples` and `timeDeltas`, weights are the
 * time spent, in milliseconds; otherwise the number of samples (`hitCount`).
 *
 * @param {Record<string, unknown>} profile
 * @returns {Profile}
 */
function fromCpuProfile(profile) {
  const nodes = /** @type {unknown[]} */ (profile.nodes).filter(isObject);
  /** @type {Map<number, Record<string, unknown>>} */
  const byId = new Map();
  for (const node of nodes) if (typeof node.id === 'number') byId.set(node.id, node);
  /** @type {Map<number, number>} */
  const parentOf = new Map();
  for (const node of nodes)
    if (Array.isArray(node.children))
      for (const child of node.children) if (typeof child === 'number') parentOf.set(child, /** @type {number} */ (node.id)); // prettier-ignore

  /** @type {Map<number, number>} Self weight by node. */
  const self = new Map();
  let unit = /** @type {"samples" | "ms"} */ ('samples');
  const samples = profile.samples;
  const deltas = profile.timeDeltas;
  if (Array.isArray(samples) && Array.isArray(deltas) && samples.length === deltas.length && samples.length) {
    unit = 'ms';
    // Each delta is the time before its sample: the time of a sample is the next delta.
    for (let i = 0; i < samples.length; i += 1) {
      const next = Number(deltas[i + 1] ?? 0);
      const id = Number(samples[i]);
      if (Number.isFinite(next) && next > 0) self.set(id, (self.get(id) ?? 0) + next / 1000);
    }
  } else {
    for (const node of nodes) {
      const hits = Number(node.hitCount ?? 0);
      if (hits > 0) self.set(/** @type {number} */ (node.id), hits);
    }
  } // prettier-ignore

  const builder = new Builder();
  /** @type {Map<number, Frame>} */
  const frameOf = new Map();
  const rootId = nodes.find((node) => !parentOf.has(/** @type {number} */ (node.id)))?.id;
  /** @param {number} id @returns {Frame | null} */
  const frame = (id) => {
    const known = frameOf.get(id);
    if (known) return known;
    // Walks up to the first ancestor already placed, then down again.
    /** @type {number[]} */
    const path = [];
    for (let at = /** @type {number | undefined} */ (id); at !== undefined && !frameOf.has(at) && at !== rootId && path.length <= MAX_DEPTH; at = parentOf.get(at)) path.push(at); // prettier-ignore
    let parent = frameOf.get(parentOf.get(path[path.length - 1] ?? -1) ?? -1) ?? builder.root;
    for (let i = path.length - 1; i >= 0; i -= 1) {
      const node = byId.get(path[i]);
      const call = isObject(node?.callFrame) ? node.callFrame : {};
      const name = String(call.functionName || '') || '(anonymous)';
      const url = String(call.url ?? '');
      const line = Number(call.lineNumber);
      const file = url ? `${url}${Number.isFinite(line) && line >= 0 ? `:${line + 1}` : ''}` : '';
      const next = builder.child(parent, name, file);
      if (!next) return parent;
      frameOf.set(path[i], next);
      parent = next;
    }
    return parent;
  };
  for (const [id, weight] of self) {
    if (id === rootId) continue;
    const f = frame(id);
    if (f) f.self += weight;
  }
  if (!builder.root.children.length) throw new FlameError('noSamples');
  return { root: builder.finish(), unit, format: 'cpuprofile', frames: builder.count };
}

/**
 * `{ name, value, children }`, where `value` is the total of a frame (d3-flame-graph).
 *
 * @param {Record<string, unknown>} tree
 * @returns {Profile}
 */
function fromTree(tree) {
  const builder = new Builder();
  /** @type {[Record<string, unknown>, Frame][]} */
  const stack = [[tree, builder.root]];
  while (stack.length) {
    const [node, frame] = /** @type {[Record<string, unknown>, Frame]} */ (stack.pop());
    const children = (Array.isArray(node.children) ? node.children : []).filter(isObject);
    const value = Number(node.value ?? 0);
    const sum = children.reduce((a, c) => a + (Number(c.value) || 0), 0);
    frame.self += Math.max(0, (Number.isFinite(value) ? value : 0) - sum);
    for (const child of children) {
      const next = builder.child(
        frame,
        String(child.name ?? '(unknown)'),
        String(child.file ?? ''),
      );
      if (next) stack.push([child, next]);
    }
  }
  if (typeof tree.name === 'string' && tree.name) builder.root.name = tree.name.slice(0, 500);
  return { root: builder.finish(), unit: 'samples', format: 'tree', frames: builder.count };
}

/**
 * The functions that cost the most: self weight, and total weight counted once per stack
 * (a recursive function is not counted twice).
 *
 * @param {Frame} root
 * @returns {{ name: string, file: string, self: number, total: number }[]}
 */
export function topFunctions(root) {
  /** @type {Map<string, { name: string, file: string, self: number, total: number }>} */
  const byName = new Map();
  /** @type {Map<string, number>} How many times each function is on the current stack. */
  const onStack = new Map();
  /** @type {[Frame, boolean][]} */
  const stack = root.children.map((c) => /** @type {[Frame, boolean]} */ ([c, false])).reverse();
  while (stack.length) {
    const [frame, leaving] = /** @type {[Frame, boolean]} */ (stack.pop());
    const key = `${frame.name}\u0000${frame.file}`;
    if (leaving) {
      onStack.set(key, (onStack.get(key) ?? 1) - 1);
      continue;
    }
    let entry = byName.get(key);
    if (!entry)
      byName.set(key, (entry = { name: frame.name, file: frame.file, self: 0, total: 0 }));
    entry.self += frame.self;
    if (!onStack.get(key)) entry.total += frame.total;
    onStack.set(key, (onStack.get(key) ?? 0) + 1);
    stack.push([frame, true]);
    for (let i = frame.children.length - 1; i >= 0; i -= 1) stack.push([frame.children[i], false]);
  }
  return [...byName.values()].sort((a, b) => b.self - a.self || b.total - a.total);
}

/**
 * The frame and its ancestors, from the root.
 *
 * @param {Frame} frame
 * @returns {Frame[]}
 */
export function pathOf(frame) {
  /** @type {Frame[]} */
  const path = [];
  for (let at = /** @type {Frame | null} */ (frame); at; at = at.parent) path.unshift(at);
  return path;
}

/**
 * Folded stacks again, for copying.
 *
 * @param {Frame} root
 * @returns {string}
 */
export function toFolded(root) {
  /** @type {string[]} */
  const lines = [];
  /** @type {[Frame, string][]} */
  const stack = root.children.map((c) => /** @type {[Frame, string]} */ ([c, c.name]));
  while (stack.length) {
    const [frame, path] = /** @type {[Frame, string]} */ (stack.pop());
    if (frame.self > 0) lines.push(`${path} ${Math.round(frame.self * 1000) / 1000}`);
    for (const child of frame.children) stack.push([child, `${path};${child.name}`]);
  }
  return lines.sort().join('\n');
}
