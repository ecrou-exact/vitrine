// @ts-check
/**
 * Reads timeline events from JSON or from a Keep a Changelog Markdown file.
 *
 * @module
 */

/** Kinds with their own color. Any other kind is shown with the neutral color. */
export const KINDS = /** @type {const} */ ([
  'info',
  'success',
  'warning',
  'danger',
  'release',
  'neutral',
]);

/** Most events read, beyond which the rest are dropped. */
export const MAX_EVENTS = 5000;

/**
 * @typedef {object} TimelineEvent
 * @property {string} id - Stable key (index based).
 * @property {string} title
 * @property {string} description - Markdown.
 * @property {string} kind - One of `KINDS`.
 * @property {string} time - The time as written.
 * @property {number | null} date - Milliseconds since the epoch, `null` when unreadable.
 * @property {string[]} tags
 * @property {string} link - An http(s) URL, or `''`.
 */

/** Error with a message meant for readers. */
export class TimelineError extends Error {}

/** Kind aliases, as found in incident tools and changelogs. */
const ALIASES = /** @type {Record<string, string>} */ ({
  ok: 'success',
  done: 'success',
  resolved: 'success',
  fixed: 'success',
  added: 'success',
  warn: 'warning',
  changed: 'warning',
  deprecated: 'warning',
  error: 'danger',
  critical: 'danger',
  incident: 'danger',
  removed: 'danger',
  security: 'danger',
  version: 'release',
  tag: 'release',
});

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeKind(value) {
  const name = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!name) return 'info';
  if (/** @type {readonly string[]} */ (KINDS).includes(name)) return name;
  return ALIASES[name] ?? 'neutral';
}

/**
 * Keeps only absolute http(s) URLs.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function safeLink(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Seconds or milliseconds since the epoch.
    return value < 1e11 ? value * 1000 : value;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (/^\d{9,13}$/.test(text)) return parseDate(Number(text));
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2} \d/.test(text) ? text.replace(' ', 'T') : text);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function text(value) {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : String(value);
}

/**
 * One event from a JSON object.
 *
 * @param {Record<string, unknown>} item
 * @param {number} index
 * @returns {TimelineEvent}
 */
function fromObject(item, index) {
  const time = item.time ?? item.date ?? item.timestamp ?? item.at ?? '';
  const tags = Array.isArray(item.tags)
    ? item.tags.map(text).filter(Boolean).slice(0, 20)
    : typeof item.tags === 'string'
      ? item.tags.split(/[\s,]+/).filter(Boolean)
      : [];
  return {
    id: `e${index}`,
    title: text(item.title ?? item.name ?? item.summary).slice(0, 500),
    description: text(item.description ?? item.body ?? item.details).slice(0, 20000),
    kind: normalizeKind(item.kind ?? item.status ?? item.type ?? item.level),
    time: text(time),
    date: parseDate(time),
    tags,
    link: safeLink(item.link ?? item.url ?? item.href),
  };
}

/**
 * Events from JSON: an array of events, or an object with an `events` array.
 *
 * @param {unknown} data
 * @returns {TimelineEvent[]}
 */
export function readJsonEvents(data) {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray(/** @type {any} */ (data).events)
      ? /** @type {any} */ (data).events
      : null;
  if (!list)
    throw new TimelineError('The events must be a JSON array, or an object with "events".');
  return list
    .slice(0, MAX_EVENTS)
    .filter((/** @type {unknown} */ item) => item && typeof item === 'object')
    .map((/** @type {Record<string, unknown>} */ item, /** @type {number} */ i) =>
      fromObject(item, i),
    );
}

/**
 * Events from a Keep a Changelog file: one event per version, its sections as the
 * description, the section names as tags.
 *
 * @param {string} source
 * @returns {TimelineEvent[]}
 */
export function readChangelog(source) {
  /** @type {TimelineEvent[]} */
  const events = [];
  /** @type {{ title: string, time: string, lines: string[], tags: string[], link: string } | null} */
  let current = null;
  /** @type {Map<string, string>} Link references: `[1.0.0]: https://…`. */
  const links = new Map();
  const flush = () => {
    if (!current) return;
    const unreleased = /^unreleased$/i.test(current.title);
    events.push({
      id: `e${events.length}`,
      title: current.title,
      description: current.lines.join('\n').trim(),
      kind: unreleased ? 'neutral' : 'release',
      time: current.time,
      date: parseDate(current.time),
      tags: current.tags,
      link: current.link,
    });
    current = null;
  };
  for (const line of source.split(/\r?\n/)) {
    const ref = /^\[([^\]]+)\]:\s*(\S+)/.exec(line);
    if (ref) {
      links.set(ref[1].toLowerCase(), safeLink(ref[2]));
      continue;
    }
    const version = /^##\s+\[?([^\]\s]+)\]?(?:\s*[-–—]\s*(.+))?\s*$/.exec(line);
    if (version && !line.startsWith('###')) {
      flush();
      if (events.length >= MAX_EVENTS) break;
      current = {
        title: version[1],
        time: (version[2] ?? '').trim(),
        lines: [],
        tags: [],
        link: '',
      };
      continue;
    }
    if (!current) continue;
    const section = /^###\s+(.+?)\s*$/.exec(line);
    if (section) current.tags.push(section[1]);
    current.lines.push(line);
  }
  flush();
  for (const event of events) event.link ||= links.get(event.title.toLowerCase()) ?? '';
  if (!events.length) throw new TimelineError('No "## [version] - date" heading was found.');
  return events;
}

/**
 * Reads JSON (starting with `[` or `{`) or a changelog.
 *
 * @param {string} source
 * @returns {TimelineEvent[]}
 */
export function readEvents(source) {
  const trimmed = source.trim();
  if (!trimmed) return [];
  if (/^[[{]/.test(trimmed)) {
    /** @type {unknown} */
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch (error) {
      throw new TimelineError(error instanceof Error ? error.message : String(error));
    }
    return readJsonEvents(data);
  }
  return readChangelog(source);
}

/**
 * Events in time order; events without a date keep their place relative to each other.
 *
 * @param {TimelineEvent[]} events
 * @param {"newest" | "oldest"} order
 * @returns {TimelineEvent[]}
 */
export function sortEvents(events, order) {
  const dated = events.every((event) => event.date !== null);
  const sorted = dated
    ? [...events].sort((a, b) => /** @type {number} */ (a.date) - /** @type {number} */ (b.date))
    : [...events];
  // Without dates on every event, the written order is kept and taken as oldest first,
  // except for changelogs, which are written newest first.
  if (!dated && events.some((event) => event.kind === 'release')) sorted.reverse();
  return order === 'newest' ? sorted.reverse() : sorted;
}

/**
 * @param {TimelineEvent[]} events
 * @returns {Record<string, number>}
 */
export function countKinds(events) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const event of events) counts[event.kind] = (counts[event.kind] ?? 0) + 1;
  return counts;
}

/**
 * A duration as a short text: `45 s`, `12 min`, `3 h 20 min`, `5 d`.
 *
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  const s = Math.round(Math.abs(ms) / 1000);
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 48) return min % 60 ? `${hours} h ${min % 60} min` : `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days} d`;
  const months = Math.round(days / 30.44);
  return months < 24 ? `${months} mo` : `${Math.round(days / 365.25)} y`;
}
