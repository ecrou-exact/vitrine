// @ts-check
/**
 * Line diff (Myers, the algorithm behind `git diff`), word-level changes inside modified
 * lines, folding of unchanged regions, and unified patch reading and writing.
 *
 * The cost of Myers grows with the number of differences, so it is bounded: past
 * {@link MAX_EDIT_COST} the changed region is shown as removed then added, and the caller
 * is told the comparison was simplified.
 *
 * @module components/diff/diff
 */

/** Most edits computed exactly before simplifying. */
export const MAX_EDIT_COST = 2000;
/** Lines longer than this are not compared word by word. */
const MAX_WORD_DIFF_LINE = 1000;

/** @typedef {{ type: "equal" | "delete" | "insert", a: number, b: number }} Op */
/** @typedef {[start: number, end: number]} Range */

/**
 * @typedef {object} Line
 * @property {"context" | "delete" | "insert"} type
 * @property {number | null} oldNo - 1-based line number in the original.
 * @property {number | null} newNo - 1-based line number in the modified text.
 * @property {string} text
 * @property {Range[]} [ranges] - Changed character ranges (word-level changes).
 */

/**
 * Minimal edit script between two sequences.
 *
 * @template T
 * @param {T[]} a
 * @param {T[]} b
 * @param {number} [maxCost]
 * @returns {{ ops: Op[], simplified: boolean }}
 */
export function diffSequences(a, b, maxCost = MAX_EDIT_COST) {
  /** @type {Op[]} */
  const ops = [];
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    ops.push({ type: 'equal', a: start, b: start });
    start += 1;
  }
  let endA = a.length;
  let endB = b.length;
  /** @type {Op[]} */
  const tail = [];
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
    tail.unshift({ type: 'equal', a: endA, b: endB });
  }
  const middle = myers(a, b, start, endA, start, endB, maxCost);
  if (middle) ops.push(...middle);
  else {
    for (let i = start; i < endA; i += 1) ops.push({ type: 'delete', a: i, b: start });
    for (let j = start; j < endB; j += 1) ops.push({ type: 'insert', a: endA, b: j });
  }
  ops.push(...tail);
  return { ops, simplified: middle === null };
}

/**
 * Myers' O(ND) algorithm on a[aStart..aEnd) and b[bStart..bEnd).
 *
 * @template T
 * @param {T[]} a
 * @param {T[]} b
 * @param {number} aStart
 * @param {number} aEnd
 * @param {number} bStart
 * @param {number} bEnd
 * @param {number} maxCost
 * @returns {Op[] | null} `null` when more than `maxCost` edits are needed.
 */
function myers(a, b, aStart, aEnd, bStart, bEnd, maxCost) {
  const n = aEnd - aStart;
  const m = bEnd - bStart;
  if (n === 0 && m === 0) return [];
  const max = Math.min(n + m, maxCost);
  const offset = max + 1;
  /** @type {Int32Array[]} */
  const trace = [];
  let v = new Int32Array(2 * max + 3);
  for (let d = 0; d <= max; d += 1) {
    const next = new Int32Array(v);
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
          ? v[offset + k + 1]
          : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[aStart + x] === b[bStart + y]) {
        x += 1;
        y += 1;
      }
      next[offset + k] = x;
      if (x >= n && y >= m) {
        trace.push(next);
        return backtrack(trace, offset, n, m, aStart, bStart);
      }
    }
    trace.push(next);
    v = next;
  }
  return null;
}

/**
 * Rebuilds the edit script from the saved frontiers.
 *
 * @param {Int32Array[]} trace
 * @param {number} offset
 * @param {number} n
 * @param {number} m
 * @param {number} aStart
 * @param {number} bStart
 * @returns {Op[]}
 */
function backtrack(trace, offset, n, m, aStart, bStart) {
  /** @type {Op[]} */
  const ops = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d -= 1) {
    const v = trace[d - 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? k + 1 : k - 1;
    const prevX = v[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x -= 1;
      y -= 1;
      ops.push({ type: 'equal', a: aStart + x, b: bStart + y });
    }
    if (x === prevX) ops.push({ type: 'insert', a: aStart + x, b: bStart + prevY });
    else ops.push({ type: 'delete', a: aStart + prevX, b: bStart + y });
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    x -= 1;
    y -= 1;
    ops.push({ type: 'equal', a: aStart + x, b: bStart + y });
  }
  return ops.reverse();
}

/**
 * Compares two texts line by line.
 *
 * @param {string} original
 * @param {string} modified
 * @returns {{ lines: Line[], simplified: boolean }}
 */
export function diffTexts(original, modified) {
  const a = splitText(original);
  const b = splitText(modified);
  // Compare integers instead of strings.
  /** @type {Map<string, number>} */
  const ids = new Map();
  const id = (/** @type {string} */ line) => {
    let value = ids.get(line);
    if (value === undefined) {
      value = ids.size;
      ids.set(line, value);
    }
    return value;
  };
  const { ops, simplified } = diffSequences(a.map(id), b.map(id));
  /** @type {Line[]} */
  const lines = ops.map((op) =>
    op.type === 'equal'
      ? { type: 'context', oldNo: op.a + 1, newNo: op.b + 1, text: a[op.a] }
      : op.type === 'delete'
        ? { type: 'delete', oldNo: op.a + 1, newNo: null, text: a[op.a] }
        : { type: 'insert', oldNo: null, newNo: op.b + 1, text: b[op.b] },
  );
  addWordRanges(lines);
  return { lines, simplified };
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function splitText(text) {
  if (!text) return [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Pairs removed and added lines of each change block and marks the changed words.
 *
 * @param {Line[]} lines
 */
export function addWordRanges(lines) {
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === 'context') {
      i += 1;
      continue;
    }
    /** @type {Line[]} */
    const deleted = [];
    /** @type {Line[]} */
    const inserted = [];
    while (i < lines.length && lines[i].type !== 'context') {
      (lines[i].type === 'delete' ? deleted : inserted).push(lines[i]);
      i += 1;
    }
    const pairs = Math.min(deleted.length, inserted.length);
    for (let p = 0; p < pairs; p += 1) {
      const [left, right] = wordRanges(deleted[p].text, inserted[p].text);
      deleted[p].ranges = left;
      inserted[p].ranges = right;
    }
  }
}

/**
 * Changed character ranges between two versions of a line, at word level.
 *
 * @param {string} before
 * @param {string} after
 * @returns {[Range[], Range[]]}
 */
export function wordRanges(before, after) {
  if (before.length > MAX_WORD_DIFF_LINE || after.length > MAX_WORD_DIFF_LINE) return [[], []];
  const a = before.match(/\w+|\s+|[^\w\s]/g) ?? [];
  const b = after.match(/\w+|\s+|[^\w\s]/g) ?? [];
  const { ops, simplified } = diffSequences(a, b, 200);
  if (simplified) return [[], []];
  const offsets = (/** @type {string[]} */ tokens) => {
    const result = [0];
    for (const token of tokens) result.push(result[result.length - 1] + token.length);
    return result;
  };
  const oa = offsets(a);
  const ob = offsets(b);
  /** @type {Range[]} */
  const left = [];
  /** @type {Range[]} */
  const right = [];
  for (const op of ops) {
    if (op.type === 'delete') pushRange(left, oa[op.a], oa[op.a + 1]);
    else if (op.type === 'insert') pushRange(right, ob[op.b], ob[op.b + 1]);
  }
  // Lines with little in common are a replacement, not an edit: no word marks (noise).
  const changed = (/** @type {Range[]} */ ranges) => ranges.reduce((sum, [s, e]) => sum + e - s, 0);
  const common = Math.min(before.length - changed(left), after.length - changed(right));
  if (common < 0.4 * Math.max(before.length, after.length)) return [[], []];
  // A line changed entirely does not need word marks.
  const whole = (/** @type {Range[]} */ ranges, /** @type {number} */ length) =>
    ranges.length === 1 && ranges[0][0] === 0 && ranges[0][1] === length;
  return [whole(left, before.length) ? [] : left, whole(right, after.length) ? [] : right];
}

/**
 * @param {Range[]} ranges
 * @param {number} start
 * @param {number} end
 */
function pushRange(ranges, start, end) {
  const last = ranges[ranges.length - 1];
  if (last && last[1] === start) last[1] = end;
  else ranges.push([start, end]);
}

/**
 * @typedef {{ type: "line", line: Line } | { type: "fold", from: number, to: number, count: number }} Row
 */

/**
 * Folds unchanged regions, keeping `context` lines around changes.
 *
 * @param {Line[]} lines
 * @param {number} context - Lines kept around changes; negative keeps everything.
 * @param {Set<number>} expanded - Folds (by first index) the user opened.
 * @returns {Row[]}
 */
export function foldLines(lines, context, expanded) {
  if (context < 0) return lines.map((line) => ({ type: 'line', line }));
  /** @type {Row[]} */
  const rows = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type !== 'context') {
      rows.push({ type: 'line', line: lines[i] });
      i += 1;
      continue;
    }
    let end = i;
    while (end < lines.length && lines[end].type === 'context') end += 1;
    const keepStart = i === 0 ? 0 : context;
    const keepEnd = end === lines.length ? 0 : context;
    const hidden = end - i - keepStart - keepEnd;
    if (hidden > 1 && !expanded.has(i + keepStart)) {
      for (let k = i; k < i + keepStart; k += 1) rows.push({ type: 'line', line: lines[k] });
      rows.push({ type: 'fold', from: i + keepStart, to: end - keepEnd, count: hidden });
      for (let k = end - keepEnd; k < end; k += 1) rows.push({ type: 'line', line: lines[k] });
    } else {
      for (let k = i; k < end; k += 1) rows.push({ type: 'line', line: lines[k] });
    }
    i = end;
  }
  return rows;
}

/**
 * Writes a unified patch (`--- / +++ / @@` hunks with `context` lines).
 *
 * @param {Line[]} lines
 * @param {{ originalName: string, modifiedName: string, context?: number }} options
 * @returns {string}
 */
export function toPatch(lines, { originalName, modifiedName, context = 3 }) {
  const out = [`--- ${originalName}`, `+++ ${modifiedName}`];
  const changes = lines
    .map((line, index) => (line.type !== 'context' ? index : -1))
    .filter((i) => i >= 0);
  if (!changes.length) return '';
  let h = 0;
  // oldBefore[i] / newBefore[i]: lines of each side before index i (one pass, not per hunk).
  const oldBefore = new Int32Array(lines.length + 1);
  const newBefore = new Int32Array(lines.length + 1);
  lines.forEach((line, i) => {
    oldBefore[i + 1] = oldBefore[i] + (line.type !== 'insert' ? 1 : 0);
    newBefore[i + 1] = newBefore[i] + (line.type !== 'delete' ? 1 : 0);
  });
  while (h < changes.length) {
    const start = Math.max(0, changes[h] - context);
    let end = Math.min(lines.length, changes[h] + context + 1);
    h += 1;
    while (h < changes.length && changes[h] - context <= end) {
      end = Math.min(lines.length, changes[h] + context + 1);
      h += 1;
    }
    const hunk = lines.slice(start, end);
    const firstOld = oldBefore[start] + 1;
    const firstNew = newBefore[start] + 1;
    const oldCount = oldBefore[end] - oldBefore[start];
    const newCount = newBefore[end] - newBefore[start];
    out.push(
      `@@ -${oldCount ? firstOld : firstOld - 1},${oldCount} +${newCount ? firstNew : firstNew - 1},${newCount} @@`,
    );
    for (const line of hunk)
      out.push(`${line.type === 'insert' ? '+' : line.type === 'delete' ? '-' : ' '}${line.text}`);
  }
  return `${out.join('\n')}\n`;
}

/**
 * Reads a unified patch into lines (headers and "\ No newline" markers are skipped).
 *
 * @param {string} patch
 * @returns {{ lines: Line[], originalName: string, modifiedName: string }}
 */
export function parsePatch(patch) {
  /** @type {Line[]} */
  const lines = [];
  let oldNo = 0;
  let newNo = 0;
  let originalName = '';
  let modifiedName = '';
  let inHunk = false;
  for (const raw of splitText(patch)) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk || raw.startsWith('diff ') || raw.startsWith('index ')) {
      if (raw.startsWith('--- ')) originalName = raw.slice(4).trim();
      else if (raw.startsWith('+++ ')) modifiedName = raw.slice(4).trim();
      if (raw.startsWith('diff ')) inHunk = false;
      continue;
    }
    if (raw.startsWith('\\')) continue;
    if (raw.startsWith('+'))
      lines.push({ type: 'insert', oldNo: null, newNo: newNo++, text: raw.slice(1) });
    else if (raw.startsWith('-'))
      lines.push({ type: 'delete', oldNo: oldNo++, newNo: null, text: raw.slice(1) });
    else
      lines.push({
        type: 'context',
        oldNo: oldNo++,
        newNo: newNo++,
        text: raw.startsWith(' ') ? raw.slice(1) : raw,
      });
  }
  addWordRanges(lines);
  return { lines, originalName, modifiedName };
}
