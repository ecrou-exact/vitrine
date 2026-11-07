// @ts-check
/**
 * A board of tasks read from JSON: columns, tasks and the operations on them. Every operation
 * returns a new board, so the element can offer to cancel it.
 *
 * @module components/board/model
 */
import { firstText, isObject, safeLink, text, toNumber } from '../../core/data.js';

/** @typedef {'none' | 'low' | 'medium' | 'high' | 'urgent'} Priority */

/**
 * @typedef {object} Task
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} column - Id of its column.
 * @property {Priority} priority
 * @property {string[]} labels
 * @property {string} assignee
 * @property {string} due - `YYYY-MM-DD`, or empty.
 * @property {number | null} progress - 0 to 100.
 * @property {number | null} votes
 * @property {string} when - Free text, such as "Q1 2027".
 * @property {string | null} url
 */

/**
 * @typedef {object} Column
 * @property {string} id
 * @property {string} title - Empty when the interface names it.
 * @property {number | null} limit - Most tasks it should hold.
 */

/** @typedef {{ columns: Column[], tasks: Task[] }} Board */

export const PRIORITIES = /** @type {const} */ (['none', 'low', 'medium', 'high', 'urgent']);

/** Statuses with a name in the interface, in their usual order. */
export const KNOWN = [
  'backlog',
  'todo',
  'planned',
  'next',
  'in-progress',
  'review',
  'beta',
  'done',
];

/** Limits against oversized sources. */
export const LIMITS = Object.freeze({ tasks: 2000, columns: 30, labels: 20 });

/** @type {Record<string, string>} */
const ALIASES = {
  'to do': 'todo',
  'to-do': 'todo',
  later: 'planned',
  soon: 'next',
  doing: 'in-progress',
  'in progress': 'in-progress',
  in_progress: 'in-progress',
  wip: 'in-progress',
  now: 'in-progress',
  active: 'in-progress',
  'in review': 'review',
  testing: 'review',
  qa: 'review',
  shipped: 'done',
  released: 'done',
  complete: 'done',
  completed: 'done',
  closed: 'done',
};

/**
 * @param {unknown} value
 * @returns {string} A column key, in lower case.
 */
export function statusKey(value) {
  const key = text(value, 60).toLowerCase();
  if (Object.hasOwn(ALIASES, key)) return ALIASES[key];
  return key || 'todo';
}

/** @returns {string} A new unique id. */
export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {unknown} value
 * @returns {Priority}
 */
export function readPriority(value) {
  const key = text(value, 20).toLowerCase();
  /** @type {Record<string, Priority>} */
  const words = { p0: 'urgent', critical: 'urgent', blocker: 'urgent', p1: 'high', p2: 'medium', normal: 'medium', p3: 'low', minor: 'low' }; // prettier-ignore
  if (Object.hasOwn(words, key)) return words[key];
  return /** @type {readonly string[]} */ (PRIORITIES).includes(key)
    ? /** @type {Priority} */ (key)
    : 'none';
}

/**
 * @param {unknown} value
 * @returns {string} A date as `YYYY-MM-DD`, or empty.
 */
function readDay(value) {
  const day = text(value, 40);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(day);
  return match && !Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`)) ? match[1] : '';
}

/**
 * @param {Record<string, any>} item
 * @param {string} column
 * @param {Set<string>} used - Ids already taken.
 * @returns {Task | null}
 */
export function readTask(item, column, used) {
  const title = firstText(item, ['title', 'name', 'summary', 'text'], 500);
  if (!title) return null;
  let id = firstText(item, ['id', 'uuid', 'key'], 200);
  if (!id || used.has(id)) id = newId();
  used.add(id);
  const labels = Array.isArray(item.labels ?? item.tags) ? (item.labels ?? item.tags) : item.label || item.tag ? [item.label ?? item.tag] : []; // prettier-ignore
  const progress = toNumber(item.progress);
  const votes = toNumber(item.votes);
  const assignee = isObject(item.assignee) ? firstText(item.assignee, ['name', 'login'], 100) : text(item.assignee ?? item.owner, 100); // prettier-ignore
  return {
    id,
    title,
    description: firstText(item, ['description', 'body', 'details'], 5000),
    column: statusKey(item.column ?? item.status ?? item.state ?? column),
    priority: readPriority(item.priority),
    labels: [...new Set(labels.slice(0, LIMITS.labels).map((/** @type {unknown} */ l) => text(isObject(l) ? l.name : l, 60)).filter(Boolean))], // prettier-ignore
    assignee,
    due: readDay(item.due ?? item.dueDate ?? item.deadline),
    progress: progress === null ? null : Math.max(0, Math.min(100, progress)),
    votes: votes !== null && votes >= 0 ? Math.floor(votes) : null,
    when: firstText(item, ['when', 'quarter', 'target', 'eta'], 60),
    url: safeLink(item.url ?? item.href),
  };
}

/**
 * @param {unknown[]} declared
 * @param {Task[]} tasks
 * @returns {Column[]} Declared columns first, then a column for every other status.
 */
function readColumns(declared, tasks) {
  /** @type {Column[]} */
  const columns = [];
  for (const entry of declared.slice(0, LIMITS.columns)) {
    const id = statusKey(isObject(entry) ? (entry.id ?? entry.status ?? entry.title) : entry);
    if (columns.some((column) => column.id === id)) continue;
    const limit = isObject(entry) ? toNumber(entry.limit ?? entry.wip) : null;
    columns.push({
      id,
      title: isObject(entry) ? firstText(entry, ['title', 'label', 'name'], 100) : text(entry, 100),
      limit: limit !== null && limit > 0 ? Math.floor(limit) : null,
    });
  }
  const rank = (/** @type {string} */ id) =>
    KNOWN.includes(id) ? KNOWN.indexOf(id) : KNOWN.length;
  const others = [...new Set(tasks.map((task) => task.column))].filter((id) => !columns.some((c) => c.id === id)); // prettier-ignore
  for (const id of others.sort((a, b) => rank(a) - rank(b)).slice(0, LIMITS.columns))
    columns.push({ id, title: '', limit: null });
  if (!columns.length)
    for (const id of ['todo', 'in-progress', 'done']) columns.push({ id, title: '', limit: null });
  return columns;
}

/**
 * Reads a board: a list of tasks, `{ columns, tasks }` (also `items`, `cards`), or columns
 * holding their tasks (`{ columns: [{ id, tasks: [...] }] }`).
 *
 * @param {string} source
 * @returns {{ ok: true, board: Board } | { ok: false, error: 'json' | 'shape', message: string }}
 */
export function parseBoard(source) {
  if (!source.trim()) return { ok: true, board: { columns: readColumns([], []), tasks: [] } };
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(source);
  } catch (error) {
    return { ok: false, error: 'json', message: error instanceof Error ? error.message : '' };
  }
  const root = isObject(data) ? data : {};
  const list = Array.isArray(data) ? data : [root.tasks, root.items, root.cards, root.features].find(Array.isArray); // prettier-ignore
  const declared = Array.isArray(root.columns) ? root.columns : [];
  if (!list && !declared.length)
    return { ok: false, error: 'shape', message: '"tasks", "columns"' };
  /** @type {Set<string>} */
  const used = new Set();
  /** @type {Task[]} */
  const tasks = [];
  const add = (/** @type {unknown} */ item, /** @type {string} */ column) => {
    const task =
      isObject(item) && tasks.length < LIMITS.tasks ? readTask(item, column, used) : null;
    if (task) tasks.push(task);
  };
  for (const item of list ?? []) add(item, 'todo');
  for (const column of declared) {
    if (!isObject(column)) continue;
    const nested = [column.tasks, column.items, column.cards].find(Array.isArray) ?? [];
    for (const item of nested) add(item, statusKey(column.id ?? column.status ?? column.title));
  }
  return { ok: true, board: { columns: readColumns(declared, tasks), tasks } };
}

/**
 * @param {Board} board
 * @returns {string} The board as JSON, in the shape it is read.
 */
export function serializeBoard(board) {
  const columns = board.columns.map(({ id, title, limit }) => ({ id, ...(title ? { title } : {}), ...(limit ? { limit } : {}) })); // prettier-ignore
  const tasks = board.tasks.map((task) => {
    /** @type {Record<string, unknown>} */
    const out = { id: task.id, title: task.title, column: task.column };
    if (task.description) out.description = task.description;
    if (task.priority !== 'none') out.priority = task.priority;
    if (task.labels.length) out.labels = task.labels;
    if (task.assignee) out.assignee = task.assignee;
    if (task.due) out.due = task.due;
    if (task.progress !== null) out.progress = task.progress;
    if (task.votes !== null) out.votes = task.votes;
    if (task.when) out.when = task.when;
    if (task.url) out.url = task.url;
    return out;
  });
  return JSON.stringify({ columns, tasks }, null, 2);
}

/**
 * Moves a task to a position of a column (counted among the tasks of that column).
 *
 * @param {Board} board
 * @param {string} id
 * @param {string} column
 * @param {number} index
 * @returns {Board}
 */
export function moveTask(board, id, column, index) {
  const task = board.tasks.find((t) => t.id === id);
  if (!task || !board.columns.some((c) => c.id === column)) return board;
  const rest = board.tasks.filter((t) => t.id !== id);
  const moved = { ...task, column };
  const inColumn = rest.filter((t) => t.column === column);
  const at = Math.max(0, Math.min(index, inColumn.length));
  // Insert before the task now at that position, or after the last one of the column.
  const before = inColumn[at];
  const position = before ? rest.indexOf(before) : inColumn.length ? rest.indexOf(inColumn[inColumn.length - 1]) + 1 : rest.length; // prettier-ignore
  return { ...board, tasks: [...rest.slice(0, position), moved, ...rest.slice(position)] };
}

/**
 * @param {Board} board
 * @param {Task} task
 * @returns {Board} The board with a task added at the end of its column.
 */
export function addTask(board, task) {
  return moveTask({ ...board, tasks: [...board.tasks, task] }, task.id, task.column, Infinity);
}

/**
 * @param {Board} board
 * @param {string} id
 * @param {Partial<Task>} patch
 * @returns {Board}
 */
export function updateTask(board, id, patch) {
  return {
    ...board,
    tasks: board.tasks.map((task) => (task.id === id ? { ...task, ...patch, id } : task)),
  };
}

/**
 * @param {Board} board
 * @param {string} id
 * @returns {Board}
 */
export function removeTask(board, id) {
  return { ...board, tasks: board.tasks.filter((task) => task.id !== id) };
}

/**
 * @typedef {object} BoardFilter
 * @property {string} query
 * @property {string | null} label
 * @property {string | null} assignee
 */

/**
 * @param {Task[]} tasks
 * @param {BoardFilter} filter
 * @returns {Task[]} Tasks that hold every word of the query, with the label and assignee asked.
 */
export function filterTasks(tasks, { query, label, assignee }) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return tasks.filter((task) => {
    if (label !== null && !task.labels.includes(label)) return false;
    if (assignee !== null && task.assignee !== assignee) return false;
    const haystack =
      `${task.title}\n${task.description}\n${task.labels.join(' ')}\n${task.assignee}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
