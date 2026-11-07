// @ts-check
/**
 * A public roadmap read from JSON: items and the columns they go in.
 *
 * @module components/roadmap/model
 */
import { firstText, isObject, parseList, safeLink, text, toNumber } from '../../core/data.js';

/**
 * @typedef {object} RoadmapItem
 * @property {string} title
 * @property {string} description
 * @property {string} status - Key of its column.
 * @property {string[]} tags
 * @property {string} when - Free text: "Q1 2027".
 * @property {number | null} progress - 0 to 100.
 * @property {number | null} votes
 * @property {string | null} url
 */

/**
 * @typedef {object} RoadmapColumn
 * @property {string} id
 * @property {string} title - Empty when the interface names it.
 */

/** The usual order of known statuses. */
const KNOWN = ['planned', 'next', 'in-progress', 'beta', 'done'];

/** @type {Record<string, string>} */
const ALIASES = {
  todo: 'planned',
  later: 'planned',
  backlog: 'planned',
  soon: 'next',
  doing: 'in-progress',
  'in progress': 'in-progress',
  in_progress: 'in-progress',
  now: 'in-progress',
  active: 'in-progress',
  shipped: 'done',
  released: 'done',
  complete: 'done',
  completed: 'done',
};

/**
 * @param {unknown} value
 * @returns {string} A column key, in lower case.
 */
export function statusKey(value) {
  const key = text(value, 60).toLowerCase();
  if (Object.hasOwn(ALIASES, key)) return ALIASES[key];
  return key || 'planned';
}

/**
 * @param {Record<string, any>} item
 * @returns {RoadmapItem}
 */
function readItem(item) {
  const tags = Array.isArray(item.tags) ? item.tags : item.tag ? [item.tag] : [];
  const progress = toNumber(item.progress);
  const votes = toNumber(item.votes);
  return {
    title: firstText(item, ['title', 'name'], 300),
    description: firstText(item, ['description', 'text', 'summary'], 2000),
    status: statusKey(item.status ?? item.state ?? item.column),
    tags: tags
      .slice(0, 20)
      .map((tag) => text(tag, 60))
      .filter(Boolean),
    when: firstText(item, ['when', 'date', 'quarter', 'target', 'eta'], 60),
    progress: progress === null ? null : Math.max(0, Math.min(100, progress)),
    votes: votes !== null && votes >= 0 ? Math.floor(votes) : null,
    url: safeLink(item.url ?? item.href),
  };
}

/**
 * @param {string} source
 * @returns {{ ok: true, items: RoadmapItem[], columns: RoadmapColumn[] }
 *   | { ok: false, error: 'json' | 'shape', message: string }}
 */
export function parseRoadmap(source) {
  const result = parseList(source, ['items', 'features', 'roadmap']);
  if (!result.ok) return result;
  const items = result.items.map(readItem).filter((item) => item.title);
  const declared = Array.isArray(result.root.columns) ? result.root.columns.slice(0, 20) : [];
  /** @type {RoadmapColumn[]} */
  const columns = [];
  for (const entry of declared) {
    const id = statusKey(isObject(entry) ? (entry.id ?? entry.status ?? entry.title) : entry);
    if (columns.some((column) => column.id === id)) continue;
    columns.push({
      id,
      title: isObject(entry) ? firstText(entry, ['title', 'label', 'name'], 100) : text(entry, 100),
    });
  }
  // Statuses without a column get one: known ones in their usual order, then the others.
  const used = [...new Set(items.map((item) => item.status))].filter(
    (id) => !columns.some((column) => column.id === id),
  );
  const rank = (/** @type {string} */ id) =>
    KNOWN.includes(id) ? KNOWN.indexOf(id) : KNOWN.length;
  for (const id of used.sort((a, b) => rank(a) - rank(b)).slice(0, 20))
    columns.push({ id, title: '' });
  return { ok: true, items, columns };
}
