// @ts-check
/**
 * Commit histories: reading `git log` output or JSON, and laying commits out on lanes.
 *
 * Three inputs are read:
 * - JSON: `[{ hash, parents, author, date, subject, refs, body }]`.
 * - `git log --pretty=format:'%H|%P|%an|%ad|%D|%s'`: one commit per line, parents given.
 * - `git log --graph --oneline --decorate` (with or without `--graph`): parents are read
 *   from the drawing, or each commit follows the next one when there is no drawing.
 *
 * The lanes are computed from the parents, whatever the input, so every graph is drawn
 * the same way.
 *
 * @module components/git/history
 */

/** Most commits read; the rest of a longer history is dropped. */
export const MAX_COMMITS = 20000;

/**
 * @typedef {object} GitRef
 * @property {string} name - `main`, `origin/main`, `v1.2.0`, `HEAD`.
 * @property {"branch" | "remote" | "tag" | "head"} type
 * @property {boolean} head - The branch HEAD points to.
 */

/**
 * @typedef {object} Commit
 * @property {string} hash - Full or abbreviated hash, as written.
 * @property {string[]} parents
 * @property {string} author
 * @property {string} date - As written.
 * @property {number | null} time - Milliseconds since the epoch, or `null`.
 * @property {string} subject
 * @property {string} body
 * @property {GitRef[]} refs
 */

/**
 * @typedef {object} GraphRow
 * @property {number} col - Lane of the commit.
 * @property {number[]} passes - Lanes that go straight through the row.
 * @property {number[]} into - Lanes that end on the commit (from above).
 * @property {number[]} out - Lanes the commit continues into (to its parents, below).
 * @property {number[]} top - Color index of each lane at the top of the row.
 * @property {number[]} bottom - Color index of each lane at the bottom of the row.
 */

/**
 * @typedef {object} GraphLayout
 * @property {GraphRow[]} rows
 * @property {number} width - Number of lanes.
 */

export class GitError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'GitError';
  }
}

const HASH = /^[0-9a-f]{4,64}$/i;
const PRETTY = /^[0-9a-f]{4,64}\|/i;
const GRAPH_CHARS = /^[*|/\\_ .\-o]*/;

/**
 * Reads commits from JSON or `git log` output.
 *
 * @param {string} text
 * @returns {Commit[]}
 */
export function readCommits(text) {
  const source = text.trim();
  if (!source) return [];
  if (/^[[{]/.test(source)) return fromJson(source);
  const first = source.split('\n', 1)[0].replace(GRAPH_CHARS, '');
  if (PRETTY.test(first)) return fromPretty(source);
  return fromGraph(source);
}

/**
 * @param {string} source
 * @returns {Commit[]}
 */
function fromJson(source) {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(source);
  } catch (error) {
    throw new GitError(error instanceof Error ? error.message : String(error));
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray(/** @type {any} */ (data).commits)
      ? /** @type {any} */ (data).commits
      : null;
  if (!list) throw new GitError('expected an array of commits');
  /** @type {Commit[]} */
  const commits = [];
  for (const item of list.slice(0, MAX_COMMITS)) {
    if (!item || typeof item !== 'object') continue;
    const hash = String(item.hash ?? item.sha ?? item.id ?? '').trim();
    if (!hash) continue;
    const parents = Array.isArray(item.parents)
      ? item.parents.map((/** @type {any} */ p) =>
          String(typeof p === 'object' && p ? (p.hash ?? p.sha) : p),
        )
      : typeof item.parents === 'string'
        ? item.parents.split(/[\s,]+/).filter(Boolean)
        : [];
    const date = item.date == null ? '' : String(item.date);
    const message = String(item.message ?? '');
    commits.push({
      hash,
      parents,
      author: String(item.author?.name ?? item.author ?? ''),
      date,
      time: parseTime(date),
      subject: String(item.subject ?? item.title ?? message.split('\n')[0] ?? ''),
      body: String(item.body ?? message.split('\n').slice(1).join('\n').trim()),
      refs: Array.isArray(item.refs)
        ? parseRefs(item.refs.map(String).join(', '))
        : parseRefs(String(item.refs ?? '')),
    });
  }
  return commits;
}

/**
 * `%H|%P|%an|%ad|%D|%s`: the subject may itself contain `|`.
 *
 * @param {string} source
 * @returns {Commit[]}
 */
function fromPretty(source) {
  /** @type {Commit[]} */
  const commits = [];
  for (const raw of source.split('\n')) {
    const line = raw.replace(GRAPH_CHARS, '').trim();
    if (!PRETTY.test(line)) continue;
    const [hash, parents = '', author = '', date = '', refs = '', ...subject] = line.split('|');
    commits.push({
      hash,
      parents: parents.split(/\s+/).filter(Boolean),
      author: author.trim(),
      date: date.trim(),
      time: parseTime(date.trim()),
      subject: subject.join('|').trim(),
      body: '',
      refs: parseRefs(refs),
    });
    if (commits.length >= MAX_COMMITS) break;
  }
  return commits;
}

/**
 * `git log --graph --oneline --decorate`: parents are followed along the drawing.
 * Commits are at `*` (or `o`); `|`, `/`, `\` and `_` carry lanes between lines.
 *
 * @param {string} source
 * @returns {Commit[]}
 */
function fromGraph(source) {
  /** @type {Commit[]} */
  const commits = [];
  /** @type {Map<string, Commit>} */
  const byHash = new Map();
  /** @type {Map<number, Set<string>>} Children waiting for a parent, by character position. */
  let state = new Map();
  let drawn = false;
  /** @type {Map<string, number>} Position of each commit's `*`. */
  const column = new Map();
  /** @type {Map<string, number>} How far a parent was found from its child's column. */
  const distance = new Map();
  for (const raw of source.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const graph = /** @type {RegExpMatchArray} */ (line.match(GRAPH_CHARS))[0];
    const star = graph.search(/[*o]/);
    if (graph.trim()) drawn = true;
    /** @type {Map<number, Set<string>>} */
    const next = new Map();
    const carry = (/** @type {number} */ from, /** @type {number} */ to) => {
      const children = state.get(from);
      if (!children?.size) return;
      const set = next.get(to) ?? new Set();
      for (const child of children) set.add(child);
      next.set(to, set);
    };
    for (let q = 0; q < graph.length; q += 1) {
      const c = graph[q];
      if (c === '|') carry(q, q);
      else if (c === '/') carry(q + 1, q - 1);
      else if (c === '\\') carry(q - 1, q + 1);
      else if (c === '_') carry(q + 1, q - 1);
    }
    if (star >= 0 || !drawn) {
      const commit = parseOneline(line.slice(graph.length));
      if (!commit || byHash.has(commit.hash)) {
        state = next;
        continue;
      }
      const at = star >= 0 ? star : 0;
      if (drawn) {
        for (const child of state.get(at) ?? []) {
          byHash.get(child)?.parents.push(commit.hash);
          distance.set(`${child} ${commit.hash}`, Math.abs(at - (column.get(child) ?? at)));
        }
        column.set(commit.hash, at);
        next.set(at, new Set([commit.hash]));
      } else if (commits.length) commits[commits.length - 1].parents.push(commit.hash);
      commits.push(commit);
      byHash.set(commit.hash, commit);
      if (commits.length >= MAX_COMMITS) break;
    }
    state = next;
  }
  if (!commits.length) throw new GitError('no commit found');
  // The first parent is the one straight below the commit; merged branches come in from the side.
  for (const commit of commits) {
    if (commit.parents.length < 2) continue;
    const away = (/** @type {string} */ parent) => distance.get(`${commit.hash} ${parent}`) ?? 0;
    commit.parents.sort((x, y) => away(x) - away(y));
  }
  return commits;
}

/**
 * `a1b2c3d (HEAD -> main, tag: v1) Subject`
 *
 * @param {string} text
 * @returns {Commit | null}
 */
function parseOneline(text) {
  const match = /^([0-9a-f]{4,64})\s*(?:\(([^)]*)\))?\s*(.*)$/i.exec(text.trim());
  if (!match || !HASH.test(match[1])) return null;
  return {
    hash: match[1],
    parents: [],
    author: '',
    date: '',
    time: null,
    subject: match[3],
    body: '',
    refs: parseRefs(match[2] ?? ''),
  };
}

/**
 * `HEAD -> main, origin/main, origin/HEAD, tag: v1.0`
 *
 * @param {string} text
 * @returns {GitRef[]}
 */
export function parseRefs(text) {
  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const remotes = new Set(['origin', 'upstream']);
  for (const part of parts) {
    const m = /^(?:refs\/remotes\/)?([^/\s]+)\/HEAD$/.exec(part);
    if (m) remotes.add(m[1]);
  }
  /** @type {GitRef[]} */
  const refs = [];
  for (const part of parts) {
    if (part.startsWith('tag:')) {
      refs.push({ name: part.slice(4).trim(), type: 'tag', head: false });
    } else if (part.startsWith('HEAD -> ')) {
      refs.push({ name: part.slice(8).trim(), type: 'branch', head: true });
    } else if (part === 'HEAD') {
      refs.push({ name: 'HEAD', type: 'head', head: true });
    } else if (/\/HEAD$/.test(part)) {
      continue;
    } else {
      const name = part.replace(/^refs\/(?:heads|remotes)\//, '');
      const remote = part.startsWith('refs/remotes/') || remotes.has(name.split('/')[0]);
      refs.push({ name, type: remote && name.includes('/') ? 'remote' : 'branch', head: false });
    }
  }
  return refs;
}

/**
 * @param {string} value
 * @returns {number | null}
 */
export function parseTime(value) {
  const text = value.trim();
  if (!text) return null;
  if (/^\d{9,13}$/.test(text)) return Number(text) * (text.length <= 10 ? 1000 : 1);
  // `git log` default: `Tue Oct 7 18:00:00 2026 +0200`.
  const git = /^\w{3} (\w{3}) (\d{1,2}) (\d{2}:\d{2}:\d{2}) (\d{4}) ([+-]\d{4})$/.exec(text);
  if (git) {
    const [, month, day, time, year, zone] = git;
    const parsed = Date.parse(`${day} ${month} ${year} ${time} GMT${zone}`);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Lays commits out on lanes. Commits are in `git log` order (children before parents).
 * Each commit takes the lane that waits for it (the leftmost one when several children
 * wait), its first parent continues on that lane, and other parents get the lane that
 * already waits for them or the first free one.
 *
 * @param {Commit[]} commits
 * @returns {GraphLayout}
 */
export function layoutGraph(commits) {
  const known = new Set(commits.map((commit) => commit.hash));
  /** @type {(string | null)[]} Hash expected on each lane. */
  const lanes = [];
  /** @type {number[]} Color of each lane. */
  const colors = [];
  let nextColor = 0;
  let width = 0;
  /** @type {GraphRow[]} */
  const rows = [];
  const free = () => {
    const index = lanes.indexOf(null);
    return index === -1 ? lanes.length : index;
  };
  for (const commit of commits) {
    let col = lanes.indexOf(commit.hash);
    // A commit no lane waits for is the tip of a branch: nothing is drawn above it.
    const tip = col === -1;
    if (tip) {
      col = free();
      lanes[col] = commit.hash;
      colors[col] = nextColor++;
    }
    const top = colors.slice();
    /** @type {number[]} */
    const into = [];
    /** @type {number[]} */
    const passes = [];
    lanes.forEach((hash, k) => {
      if (hash === null) return;
      if (hash === commit.hash) into.push(k);
      else passes.push(k);
    });
    // The branches that end here are free again.
    for (const k of into) if (k !== col) lanes[k] = null;
    const parents = commit.parents.filter((p) => known.has(p));
    /** @type {number[]} */
    const out = [];
    if (parents.length) {
      lanes[col] = parents[0];
      out.push(col);
      for (const parent of parents.slice(1)) {
        let k = lanes.indexOf(parent);
        if (k === -1) {
          k = free();
          lanes[k] = parent;
          colors[k] = nextColor++;
        }
        if (!out.includes(k)) out.push(k);
      }
    } else lanes[col] = null;
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    width = Math.max(width, col + 1, ...out.map((k) => k + 1), ...passes.map((k) => k + 1));
    rows.push({
      col,
      passes,
      into: tip ? into.filter((k) => k !== col) : into,
      out,
      top,
      bottom: colors.slice(),
    });
  }
  return { rows, width };
}

/**
 * Hashes of the commits reachable from one commit, following parents.
 *
 * @param {Commit[]} commits
 * @param {string} start
 * @returns {Set<string>}
 */
export function reachable(commits, start) {
  /** @type {Map<string, Commit>} */
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const hash = /** @type {string} */ (stack.pop());
    if (seen.has(hash)) continue;
    const commit = byHash.get(hash);
    if (!commit) continue;
    seen.add(hash);
    stack.push(...commit.parents);
  }
  return seen;
}

/**
 * Branches and tags of a history, in order of appearance.
 *
 * @param {Commit[]} commits
 * @returns {{ ref: GitRef, hash: string }[]}
 */
export function listRefs(commits) {
  /** @type {{ ref: GitRef, hash: string }[]} */
  const list = [];
  for (const commit of commits) {
    for (const ref of commit.refs) if (ref.type !== 'head') list.push({ ref, hash: commit.hash });
  }
  return list;
}

/**
 * The commit a hash, or a prefix of at least 4 characters, refers to.
 *
 * @param {Commit[]} commits
 * @param {string} hash
 * @returns {Commit | undefined}
 */
export function findCommit(commits, hash) {
  const h = hash.toLowerCase();
  return (
    commits.find((c) => c.hash.toLowerCase() === h) ??
    (h.length >= 4
      ? commits.find(
          (c) => c.hash.toLowerCase().startsWith(h) || h.startsWith(c.hash.toLowerCase()),
        )
      : undefined)
  );
}
