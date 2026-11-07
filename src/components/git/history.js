// @ts-check
/**
 * Commit histories: reading `git log` output or JSON, and laying commits out on lanes.
 *
 * Inputs read:
 * - JSON: `[{ hash, parents, author, date, subject, refs, body, url }]`, or what the APIs of
 *   GitHub (REST and GraphQL), GitLab and Bitbucket return, with branches and tags given
 *   beside the commits (`{ commits, branches, tags, head }`).
 * - `git log --pretty=format:'%H|%P|%an|%ad|%D|%s'`: one commit per line, parents given.
 * - `git log`, `git log --parents` and `git log --graph`, in the default format (`commit`,
 *   `Author:`, `Date:`, then the message).
 * - `git log --graph --oneline --decorate` (with or without `--graph`).
 *
 * Without a drawing or parents, each commit follows the next one. The lanes are computed
 * from the parents, whatever the input, so every graph is drawn the same way.
 *
 * @module components/git/history
 */
import { isSafeUrl } from '../../core/urls.js';

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
 * @property {string | null} url - Page of the commit, when the source gives one.
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
/** The drawing in front of a line of the default format: no commit marker, no letters. */
const DRAWING = /^[|/\\_ ]*/;
/** `commit <hash> [<parents>…] [(refs)]`, after the drawing. */
const FULL_HEADER = /^commit ([0-9a-f]{4,64})((?: [0-9a-f]{4,64})*)\s*(?:\((.*)\))?\s*$/i;

/**
 * Reads commits from JSON or `git log` output, in `git log` order (children first).
 *
 * @param {string} text
 * @returns {Commit[]}
 */
export function readCommits(text) {
  const source = text.trim();
  if (!source) return [];
  if (/^[[{]/.test(source)) return topoOrder(fromJson(source));
  const first = source.split('\n', 1)[0].replace(GRAPH_CHARS, '');
  if (PRETTY.test(first)) return topoOrder(fromPretty(source));
  return topoOrder(fromGraph(source));
}

// ---------------------------------------------------------------- JSON

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string}
 */
function str(value, max = 10000) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function safeUrl(value) {
  const url = str(value, 2000).trim();
  return url && /^https?:\/\//i.test(url) && isSafeUrl(url) ? url : null;
}

/**
 * The hash of a commit or a reference to one, in the shapes the APIs use.
 *
 * @param {unknown} value
 * @returns {string}
 */
function hashOf(value) {
  if (!isObject(value)) return str(value, 64).trim();
  const target = isObject(value.commit)
    ? value.commit
    : isObject(value.target)
      ? value.target
      : value;
  return str(target.sha ?? target.oid ?? target.hash ?? target.id, 64).trim();
}

/**
 * A list of items, or a GraphQL connection (`{ nodes }` or `{ edges: [{ node }] }`).
 *
 * @param {unknown} value
 * @returns {unknown[] | null}
 */
function listOf(value) {
  if (Array.isArray(value)) return value;
  if (!isObject(value)) return null;
  if (Array.isArray(value.nodes)) return value.nodes;
  if (Array.isArray(value.edges))
    return value.edges.map((edge) => (isObject(edge) ? edge.node : null));
  return null;
}

/**
 * @param {unknown} value
 * @returns {boolean} Whether a value looks like a commit of one of the formats read.
 */
function looksLikeCommit(value) {
  if (!isObject(value)) return false;
  const id = value.hash ?? value.sha ?? value.oid ?? value.id;
  return typeof id === 'string' && id.trim() !== '' && ('parents' in value || 'parent_ids' in value || 'message' in value || 'commit' in value || 'subject' in value || 'messageHeadline' in value); // prettier-ignore
}

/**
 * Finds the list of commits in a document: the document itself, `commits`, `values`
 * (Bitbucket), or the first list of commits a few levels down (GraphQL answers).
 *
 * @param {unknown} data
 * @returns {unknown[] | null}
 */
function findCommitList(data) {
  if (Array.isArray(data)) return data;
  /** @type {unknown[]} */
  let level = [data];
  for (let depth = 0; depth < 8 && level.length; depth += 1) {
    /** @type {unknown[]} */
    const next = [];
    for (const value of level) {
      const list = listOf(value);
      if (list && (list.length === 0 || looksLikeCommit(list[0]))) return list;
      if (isObject(value)) for (const child of Object.values(value).slice(0, 50)) next.push(child);
    }
    level = next.slice(0, 500);
  }
  return null;
}

/**
 * `Ada Lovelace <ada@example.com>` as `Ada Lovelace`.
 *
 * @param {string} raw
 * @returns {string}
 */
function nameOnly(raw) {
  return raw.replace(/\s*<[^>]*>\s*$/, '').trim();
}

/**
 * @param {Record<string, any>} item
 * @returns {string}
 */
function authorOf(item) {
  const git = isObject(item.commit) ? item.commit.author : null;
  const author = item.author;
  return nameOnly(
    str(git?.name) ||
      str(item.author_name) ||
      (isObject(author) ? str(author.name ?? author.raw ?? author.user?.display_name ?? author.login ?? author.user?.login) : str(author)), // prettier-ignore
  ).slice(0, 200);
}

/**
 * @param {Record<string, any>} item
 * @returns {string}
 */
function dateOf(item) {
  const git = isObject(item.commit) ? item.commit : null;
  return str(
    item.date ??
      git?.author?.date ??
      git?.committer?.date ??
      item.committedDate ??
      item.authoredDate ??
      item.committed_date ??
      item.authored_date ??
      (isObject(item.author) ? item.author.date : undefined),
    100,
  );
}

/**
 * One commit from any of the JSON shapes read.
 *
 * @param {Record<string, any>} item
 * @returns {Commit | null}
 */
function readJsonCommit(item) {
  const hash = str(item.hash ?? item.sha ?? item.oid ?? item.id, 64).trim();
  if (!hash) return null;
  const rawParents = listOf(item.parents) ?? listOf(item.parent_ids) ?? (typeof item.parents === 'string' ? item.parents.split(/[\s,]+/) : []); // prettier-ignore
  const message = str(item.message ?? (isObject(item.commit) ? item.commit.message : undefined));
  const date = dateOf(item);
  return {
    hash,
    parents: rawParents.slice(0, 64).map(hashOf).filter(Boolean),
    author: authorOf(item),
    date,
    time: parseTime(date),
    subject: str(
      item.subject ?? item.title ?? item.messageHeadline ?? message.split('\n')[0],
      1000,
    ),
    body: str(item.body ?? item.messageBody ?? message.split('\n').slice(1).join('\n')).trim(),
    refs: Array.isArray(item.refs)
      ? parseRefs(item.refs.map((ref) => str(ref, 200)).join(', '))
      : parseRefs(str(item.refs, 2000)),
    url: safeUrl(
      item.url_html ?? item.html_url ?? item.web_url ?? item.url ?? item.links?.html?.href,
    ),
  };
}

/**
 * Branches and tags given beside the commits: lists of `{ name, commit: { sha } }`,
 * `{ name, sha }` or `{ name, target: { oid } }`, or objects of `name: hash`.
 *
 * @param {unknown} source
 * @param {'branch' | 'tag'} type
 * @param {string} head - Name of the branch HEAD points to.
 * @returns {{ hash: string, ref: GitRef }[]}
 */
function readNamedRefs(source, type, head) {
  /** @type {[string, string][]} */
  let pairs = [];
  const list = listOf(source);
  if (list)
    pairs = list
      .filter(isObject)
      .map((item) => [str(item.name ?? item.ref, 200).replace(/^refs\/(?:heads|tags)\//, ''), hashOf(item)]); // prettier-ignore
  else if (isObject(source))
    pairs = Object.entries(source).map(([name, value]) => [name.slice(0, 200), hashOf(value)]);
  return pairs
    .filter(([name, hash]) => name && hash)
    .slice(0, 500)
    .map(([name, hash]) => ({
      hash,
      ref: { name, type, head: type === 'branch' && name === head },
    }));
}

/**
 * @param {Commit[]} commits
 * @param {Record<string, any>} root
 */
function attachRefs(commits, root) {
  const head = str(root.head ?? root.default_branch ?? root.defaultBranch, 200);
  const extra = [
    ...readNamedRefs(root.branches, 'branch', head),
    ...readNamedRefs(root.tags, 'tag', head),
  ];
  for (const { hash, ref } of extra) {
    const commit = findCommit(commits, hash);
    if (commit && !commit.refs.some((r) => r.name === ref.name && r.type === ref.type))
      commit.refs.push(ref);
  }
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
  const list = findCommitList(data);
  if (!list) throw new GitError('expected an array of commits');
  /** @type {Commit[]} */
  const commits = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const item of list.slice(0, MAX_COMMITS)) {
    const commit = isObject(item) ? readJsonCommit(item) : null;
    if (!commit || seen.has(commit.hash)) continue;
    seen.add(commit.hash);
    commits.push(commit);
  }
  if (isObject(data)) attachRefs(commits, data);
  return commits;
}

// ---------------------------------------------------------------- git log

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
      url: null,
    });
    if (commits.length >= MAX_COMMITS) break;
  }
  return commits;
}

/**
 * @typedef {object} GraphState
 * @property {Map<number, Set<string>>} waiting - Children waiting for a parent, by position.
 * @property {Map<string, number>} column - Position of each commit's marker.
 * @property {Map<string, number>} distance - How far a parent was from its child's column.
 */

/**
 * Carries the waiting children along the drawing of one line.
 *
 * @param {string} graph
 * @param {Map<number, Set<string>>} waiting
 * @returns {Map<number, Set<string>>}
 */
function carryLanes(graph, waiting) {
  /** @type {Map<number, Set<string>>} */
  const next = new Map();
  const carry = (/** @type {number} */ from, /** @type {number} */ to) => {
    const children = waiting.get(from);
    if (!children?.size) return;
    const set = next.get(to) ?? new Set();
    for (const child of children) set.add(child);
    next.set(to, set);
  };
  for (let q = 0; q < graph.length; q += 1) {
    const c = graph[q];
    if (c === '|') carry(q, q);
    else if (c === '/' || c === '_') carry(q + 1, q - 1);
    else if (c === '\\') carry(q - 1, q + 1);
  }
  return next;
}

/**
 * The lines of the default format after `commit`: `Merge:`, `Author:`, `Date:`, and the
 * message, indented.
 *
 * @param {Commit & { merge?: string[], message?: boolean }} commit
 * @param {string} line - Without the drawing.
 */
function addDetail(commit, line) {
  const header = /^(Merge|Author|AuthorDate|Date|Commit|CommitDate):\s*(.*)$/.exec(line);
  if (header && !commit.message) {
    const [, name, value] = header;
    if (name === 'Merge') commit.merge = value.split(/\s+/).filter(Boolean);
    else if (name === 'Author') commit.author = nameOnly(value).slice(0, 200);
    else if ((name === 'Date' || name === 'AuthorDate') && !commit.date) {
      commit.date = value.trim();
      commit.time = parseTime(commit.date);
    }
    return;
  }
  const text = line.trim();
  if (!commit.subject) {
    if (text) commit.subject = text.slice(0, 1000);
  } else if (commit.body.length < 10000)
    commit.body = commit.body ? `${commit.body}\n${text}` : text;
}

/**
 * `git log` with or without `--graph`, in the default format or with `--oneline`.
 * Commits are at `*` (or `o`); `|`, `/`, `\` and `_` carry lanes between lines.
 *
 * @param {string} source
 * @returns {Commit[]}
 */
function fromGraph(source) {
  const full = /^[*|/\\_ ]*commit [0-9a-f]{4,64}/im.test(source);
  /** @type {(Commit & { merge?: string[], given?: boolean, message?: boolean })[]} */
  const commits = [];
  /** @type {Map<string, Commit & { given?: boolean }>} */
  const byHash = new Map();
  /** @type {GraphState} */
  const state = { waiting: new Map(), column: new Map(), distance: new Map() };
  let drawn = false;
  for (const raw of source.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    // In the default format, the first blank line ends the headers: the message follows.
    if (full && commits.length && !line.replace(DRAWING, ''))
      commits[commits.length - 1].message = true;
    if (!line.trim()) continue;
    const graph = /** @type {RegExpMatchArray} */ (
      line.match(full ? /^[*|/\\_ ]*/ : GRAPH_CHARS)
    )[0];
    const star = graph.search(/[*o]/);
    if (/[*|/\\_]/.test(graph)) drawn = true;
    const next = carryLanes(graph, state.waiting);
    const rest = line.slice(graph.length);
    // A header starts at the marker of the drawing, or at the start of a line without one:
    // `commit …` written inside an indented message is text.
    const header = star >= 0 || /^commit /.test(line);
    const commit = full
      ? header
        ? parseFullHeader(rest)
        : null
      : star >= 0 || !drawn
        ? parseOneline(rest)
        : null;
    if (!commit) {
      if (full && commits.length) addDetail(commits[commits.length - 1], line.replace(DRAWING, ''));
      state.waiting = next;
      continue;
    }
    if (byHash.has(commit.hash)) {
      state.waiting = next;
      continue;
    }
    linkCommit(commit, star, drawn, state, next, byHash, commits);
    commits.push(commit);
    byHash.set(commit.hash, commit);
    state.waiting = next;
    if (commits.length >= MAX_COMMITS) break;
  }
  if (!commits.length) throw new GitError('no commit found');
  finishParents(commits, drawn, state);
  return commits.map(
    ({ merge, given, message, ...commit }) => (
      void merge,
      void given,
      void message,
      { ...commit, body: commit.body.trim() }
    ),
  );
}

/**
 * Links a commit to the children waiting for it, from the drawing, or to the previous commit.
 *
 * @param {Commit & { given?: boolean }} commit
 * @param {number} star
 * @param {boolean} drawn
 * @param {GraphState} state
 * @param {Map<number, Set<string>>} next
 * @param {Map<string, Commit & { given?: boolean }>} byHash
 * @param {(Commit & { given?: boolean })[]} commits
 */
function linkCommit(commit, star, drawn, state, next, byHash, commits) {
  const at = star >= 0 ? star : 0;
  if (drawn) {
    for (const child of state.waiting.get(at) ?? []) {
      const parent = byHash.get(child);
      if (parent && !parent.given) parent.parents.push(commit.hash);
      state.distance.set(`${child} ${commit.hash}`, Math.abs(at - (state.column.get(child) ?? at)));
    }
    state.column.set(commit.hash, at);
    next.set(at, new Set([commit.hash]));
    return;
  }
  const previous = commits[commits.length - 1];
  if (previous && !previous.given) previous.parents.push(commit.hash);
}

/**
 * Orders the parents of merges, and uses `Merge:` lines where nothing else told the parents.
 *
 * @param {(Commit & { merge?: string[], given?: boolean })[]} commits
 * @param {boolean} drawn
 * @param {GraphState} state
 */
function finishParents(commits, drawn, state) {
  for (const commit of commits) {
    if (!drawn && !commit.given && commit.merge?.length) {
      // `Merge: a1b2c3d e4f5a6b` names the parents by a prefix of their hash.
      commit.parents = commit.merge.map((prefix) => findCommit(commits, prefix)?.hash ?? prefix);
    }
    if (commit.parents.length < 2 || commit.given) continue;
    // The first parent is the one straight below the commit; merged branches come in from the side.
    const away = (/** @type {string} */ parent) =>
      state.distance.get(`${commit.hash} ${parent}`) ?? 0;
    commit.parents.sort((x, y) => away(x) - away(y));
  }
}

/**
 * `commit a1b2… [parents…] (HEAD -> main, tag: v1)`
 *
 * @param {string} text
 * @returns {(Commit & { given: boolean }) | null}
 */
function parseFullHeader(text) {
  const match = FULL_HEADER.exec(text.trim());
  if (!match) return null;
  const parents = match[2].trim().split(/\s+/).filter(Boolean);
  return {
    hash: match[1],
    parents,
    given: parents.length > 0,
    author: '',
    date: '',
    time: null,
    subject: '',
    body: '',
    refs: parseRefs(match[3] ?? ''),
    url: null,
  };
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
    url: null,
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

// ---------------------------------------------------------------- order

/**
 * Puts commits in `git log` order, children before their parents, when the source did not:
 * APIs and exports often list commits oldest first, or by date only. Among the commits that
 * can come next, the newest comes first. Commits already in order are left as they are.
 *
 * @param {Commit[]} commits
 * @returns {Commit[]}
 */
export function topoOrder(commits) {
  /** @type {Map<string, number>} */
  const index = new Map(commits.map((commit, i) => [commit.hash, i]));
  const ordered = commits.every((commit, i) =>
    commit.parents.every((parent) => (index.get(parent) ?? Infinity) > i),
  );
  if (ordered) return commits;
  /** @type {number[]} Children of each commit not placed yet. */
  const children = commits.map(() => 0);
  for (const commit of commits)
    for (const parent of new Set(commit.parents)) {
      const i = index.get(parent);
      if (i !== undefined && i !== index.get(commit.hash)) children[i] += 1;
    }
  const newer = (/** @type {number} */ a, /** @type {number} */ b) =>
    (commits[b].time ?? -Infinity) - (commits[a].time ?? -Infinity) || a - b;
  const heap = new Heap(newer);
  commits.forEach((_, i) => children[i] === 0 && heap.push(i));
  /** @type {Commit[]} */
  const result = [];
  const placed = new Set();
  while (heap.size) {
    const i = /** @type {number} */ (heap.pop());
    placed.add(i);
    result.push(commits[i]);
    for (const parent of new Set(commits[i].parents)) {
      const p = index.get(parent);
      if (p === undefined || p === i || placed.has(p)) continue;
      children[p] -= 1;
      if (children[p] === 0) heap.push(p);
    }
  }
  // A cycle (only in hand-written data) leaves commits out: they keep their order at the end.
  if (result.length < commits.length) commits.forEach((c, i) => !placed.has(i) && result.push(c));
  return result;
}

/** A small binary heap of numbers. */
class Heap {
  /** @param {(a: number, b: number) => number} compare */
  constructor(compare) {
    this.compare = compare;
    /** @type {number[]} */
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  /** @param {number} value */
  push(value) {
    const items = this.items;
    items.push(value);
    for (let i = items.length - 1; i > 0;) {
      const up = (i - 1) >> 1;
      if (this.compare(items[i], items[up]) >= 0) break;
      [items[i], items[up]] = [items[up], items[i]];
      i = up;
    }
  }

  /** @returns {number | undefined} */
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length && last !== undefined) {
      items[0] = last;
      for (let i = 0; ;) {
        const [l, r] = [i * 2 + 1, i * 2 + 2];
        let best = i;
        if (l < items.length && this.compare(items[l], items[best]) < 0) best = l;
        if (r < items.length && this.compare(items[r], items[best]) < 0) best = r;
        if (best === i) break;
        [items[i], items[best]] = [items[best], items[i]];
        i = best;
      }
    }
    return top;
  }
}

// ---------------------------------------------------------------- lanes

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

/**
 * The page of a commit: its own link, else `template` with `{hash}` replaced.
 *
 * @param {Commit} commit
 * @param {string | null} template - Like `https://github.com/owner/repo/commit/{hash}`.
 * @returns {string | null}
 */
export function commitUrl(commit, template) {
  if (commit.url) return commit.url;
  if (!template || !template.includes('{hash}')) return null;
  return safeUrl(template.replace(/\{hash\}/g, encodeURIComponent(commit.hash)));
}
