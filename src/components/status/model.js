// @ts-check
/**
 * Status page data: reads the native JSON format and Atlassian Statuspage summaries into one
 * model, works out the overall state, the days of each component and their uptime.
 *
 * @module components/status/model
 */
import { isSafeUrl } from '../../core/urls.js';

/** @typedef {'operational'|'degraded'|'partial'|'major'|'maintenance'|'unknown'} State */

/**
 * @typedef {object} StatusDay
 * @property {string} date - `YYYY-MM-DD` (UTC).
 * @property {State | 'none'} state - `none` when nothing is known about the day.
 * @property {number | null} minutes - Minutes of downtime, when given.
 * @property {string} note
 */

/**
 * @typedef {object} StatusComponent
 * @property {string} name
 * @property {string} description
 * @property {string} group - Group name, empty when none.
 * @property {State} state
 * @property {string | null} url
 * @property {number | null} uptime - Uptime given by the source (0 to 100).
 * @property {string | null} since - `YYYY-MM-DD`: days after it that are not listed were fine.
 * @property {Map<string, Omit<StatusDay, 'date'>>} history
 */

/**
 * @typedef {object} StatusUpdate
 * @property {number | null} time
 * @property {string} state
 * @property {string} text
 */

/**
 * @typedef {object} StatusIncident
 * @property {string} title
 * @property {string} state - Workflow state (`investigating`, `resolved`…), in lower case.
 * @property {State} impact
 * @property {number | null} start
 * @property {number | null} end
 * @property {string | null} url
 * @property {string[]} components
 * @property {StatusUpdate[]} updates - Newest first.
 */

/**
 * @typedef {object} StatusPage
 * @property {string} title
 * @property {string | null} url
 * @property {number | null} updated
 * @property {State | null} state - Overall state given by the source.
 * @property {string} message
 * @property {StatusComponent[]} components
 * @property {StatusIncident[]} incidents - Newest first.
 * @property {StatusIncident[]} maintenances - Soonest first.
 */

/** @typedef {{ ok: true, page: StatusPage } | { ok: false, error: 'json' | 'shape', message: string }} StatusResult */

/** Limits against oversized sources. */
export const LIMITS = Object.freeze({
  components: 200,
  incidents: 200,
  updates: 50,
  history: 1000,
  days: 365,
  text: 4000,
});

const DAY = 864e5;
/** The largest time a Date holds, in milliseconds. */
const MAX_TIME = 8.64e15;

/** @type {Record<string, State>} */
const ALIASES = {
  operational: 'operational',
  ok: 'operational',
  up: 'operational',
  none: 'operational',
  degraded: 'degraded',
  degraded_performance: 'degraded',
  minor: 'degraded',
  partial: 'partial',
  partial_outage: 'partial',
  major: 'major',
  major_outage: 'major',
  outage: 'major',
  down: 'major',
  critical: 'major',
  maintenance: 'maintenance',
  under_maintenance: 'maintenance',
};

/** From the least to the most serious. */
const SEVERITY = ['unknown', 'operational', 'maintenance', 'degraded', 'partial', 'major'];

/** Statuspage impacts: a "major" incident is a partial outage, a "critical" one a major outage. */
const INDICATORS = { none: 'operational', minor: 'degraded', major: 'partial', critical: 'major' };

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
function text(value, max = LIMITS.text) {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * @param {unknown} value
 * @returns {State}
 */
export function normalizeState(value) {
  const key = text(value, 40)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return Object.hasOwn(ALIASES, key) ? ALIASES[key] : 'unknown';
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function safeUrl(value) {
  const url = text(value, 2000);
  return url && isSafeUrl(url) ? url : null;
}

/**
 * Seconds or milliseconds since 1970, or a date string.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function toTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const time = Math.abs(value) > 1e11 ? value : value * 1000;
    return Math.abs(time) <= MAX_TIME ? time : null;
  }
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/**
 * @param {number} time
 * @returns {string} `YYYY-MM-DD` in UTC.
 */
export function dayKey(time) {
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function dateOnly(value) {
  const time = toTime(value);
  return time === null ? null : dayKey(time);
}

/**
 * Reads `[{ date, status, minutes, note }]` or `{ "2026-10-01": "major" }`.
 *
 * @param {unknown} source
 * @returns {Map<string, Omit<StatusDay, 'date'>>}
 */
function readHistory(source) {
  /** @type {unknown[]} */
  let entries = [];
  if (Array.isArray(source)) entries = source;
  else if (isObject(source))
    entries = Object.entries(source).map(([date, status]) =>
      isObject(status) ? { ...status, date } : { date, status },
    );
  /** @type {Map<string, Omit<StatusDay, 'date'>>} */
  const history = new Map();
  for (const item of entries.slice(0, LIMITS.history)) {
    if (!isObject(item)) continue;
    const date = dateOnly(item.date);
    if (!date) continue;
    const minutes = Number(item.minutes);
    history.set(date, {
      state: normalizeState(item.status ?? item.state),
      minutes: item.minutes !== undefined && minutes >= 0 ? minutes : null,
      note: text(item.note, 300),
    });
  }
  return history;
}

/**
 * @param {Record<string, any>} item
 * @param {string} group
 * @returns {StatusComponent}
 */
function readComponent(item, group) {
  const uptime = Number(item.uptime);
  return {
    name: text(item.name, 200),
    description: text(item.description, 500),
    group: text(item.group, 200) || group,
    state: normalizeState(item.status ?? item.state),
    url: safeUrl(item.url),
    uptime: item.uptime !== undefined && uptime >= 0 && uptime <= 100 ? uptime : null,
    since: dateOnly(item.since),
    history: readHistory(item.history),
  };
}

/**
 * Components, with the groups of a Statuspage summary (`group: true`, `group_id`) as names.
 *
 * @param {unknown} source
 * @returns {StatusComponent[]}
 */
function readComponents(source) {
  if (!Array.isArray(source)) return [];
  const items = source.filter(isObject);
  const groups = new Map(items.filter((c) => c.group === true).map((c) => [c.id, text(c.name)]));
  return items
    .filter((item) => item.group !== true)
    .slice(0, LIMITS.components)
    .map((item) => readComponent(item, groups.get(item.group_id) ?? ''))
    .filter((component) => component.name);
}

/**
 * @param {unknown} value
 * @returns {State}
 */
function readImpact(value) {
  const key = text(value, 40).toLowerCase();
  return Object.hasOwn(INDICATORS, key)
    ? /** @type {State} */ (INDICATORS[/** @type {keyof typeof INDICATORS} */ (key)])
    : normalizeState(key);
}

/**
 * @param {unknown} source
 * @returns {StatusUpdate[]}
 */
function readUpdates(source) {
  if (!Array.isArray(source)) return [];
  return source
    .filter(isObject)
    .slice(0, LIMITS.updates)
    .map((item) => ({
      time: toTime(item.time ?? item.display_at ?? item.created_at),
      state: text(item.status ?? item.state, 40).toLowerCase(),
      text: text(item.text ?? item.body),
    }))
    .sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
}

/**
 * @param {Record<string, any>} item
 * @returns {StatusIncident}
 */
function readIncident(item) {
  const components = Array.isArray(item.components) ? item.components : [];
  return {
    title: text(item.title ?? item.name, 300),
    state: text(item.status ?? item.state, 40).toLowerCase(),
    impact: readImpact(item.impact),
    start: toTime(item.start ?? item.started ?? item.scheduled_for ?? item.created_at),
    end: toTime(item.end ?? item.resolved ?? item.scheduled_until ?? item.resolved_at),
    url: safeUrl(item.url ?? item.shortlink),
    components: components
      .slice(0, LIMITS.components)
      .map((c) => text(isObject(c) ? c.name : c, 200))
      .filter(Boolean),
    updates: readUpdates(item.updates ?? item.incident_updates),
  };
}

/**
 * @param {unknown} source
 * @returns {StatusIncident[]}
 */
function readIncidents(source) {
  if (!Array.isArray(source)) return [];
  return source
    .filter(isObject)
    .slice(0, LIMITS.incidents)
    .map(readIncident)
    .filter((incident) => incident.title);
}

/**
 * @param {unknown} status - A word, or a Statuspage `{ indicator }`.
 * @returns {State | null}
 */
function readPageState(status) {
  if (status === undefined || status === null) return null;
  const state = isObject(status) ? readImpact(status.indicator) : normalizeState(status);
  return state === 'unknown' ? null : state;
}

/**
 * Parses the text of a status page.
 *
 * @param {string} source
 * @returns {StatusResult}
 */
export function parseStatus(source) {
  /** @type {any} */
  let data;
  try {
    data = JSON.parse(source);
  } catch (error) {
    return { ok: false, error: 'json', message: error instanceof Error ? error.message : '' };
  }
  if (Array.isArray(data)) data = { components: data };
  if (!isObject(data) || !(Array.isArray(data.components) || Array.isArray(data.services)))
    return { ok: false, error: 'shape', message: '' };
  const page = isObject(data.page) ? data.page : {};
  return {
    ok: true,
    page: {
      title: text(data.title ?? page.name, 200),
      url: safeUrl(data.url ?? page.url),
      updated: toTime(data.updated ?? page.updated_at),
      state: readPageState(data.status),
      message: text(data.message ?? (isObject(data.status) ? data.status.description : '')),
      components: readComponents(data.components ?? data.services),
      incidents: readIncidents(data.incidents).sort((a, b) => (b.start ?? 0) - (a.start ?? 0)),
      maintenances: readIncidents(data.maintenances ?? data.scheduled_maintenances).sort(
        (a, b) => (a.start ?? 0) - (b.start ?? 0),
      ),
    },
  };
}

/**
 * The most serious of some states.
 *
 * @param {State[]} states
 * @returns {State}
 */
export function worstState(states) {
  return states.reduce(
    (worst, state) => (SEVERITY.indexOf(state) > SEVERITY.indexOf(worst) ? state : worst),
    /** @type {State} */ ('unknown'),
  );
}

/**
 * @param {StatusIncident} incident
 * @returns {boolean} Whether the incident is still open.
 */
export function isOpen(incident) {
  return incident.end === null && !['resolved', 'postmortem', 'completed'].includes(incident.state);
}

/**
 * @param {StatusIncident} maintenance
 * @param {number} now
 * @returns {'active' | 'upcoming' | 'past'}
 */
export function maintenancePhase(maintenance, now) {
  if (maintenance.state === 'completed') return 'past';
  if (maintenance.end !== null && maintenance.end <= now) return 'past';
  if (maintenance.state === 'in_progress') return 'active';
  return maintenance.start !== null && maintenance.start > now ? 'upcoming' : 'active';
}

/**
 * The overall state: the one the source gives, else the worst of the components, open
 * incidents and maintenance in progress.
 *
 * @param {StatusPage} page
 * @param {number} now
 * @returns {State}
 */
export function overallState(page, now) {
  if (page.state) return page.state;
  return worstState([
    ...page.components.map((component) => component.state),
    ...page.incidents.filter(isOpen).map((incident) => incident.impact),
    ...page.maintenances
      .filter((maintenance) => maintenancePhase(maintenance, now) === 'active')
      .map(() => /** @type {State} */ ('maintenance')),
  ]);
}

/**
 * The last days of a component, oldest first.
 *
 * A day not listed in `history` is `none`, unless the component has a `since` date: from
 * then on such a day was fine, and today is the current state of the component.
 *
 * @param {StatusComponent} component
 * @param {number} count
 * @param {number} now
 * @returns {StatusDay[]}
 */
export function componentDays(component, count, now) {
  const today = dayKey(now);
  /** @type {StatusDay[]} */
  const days = [];
  for (let back = count - 1; back >= 0; back--) {
    const date = dayKey(now - back * DAY);
    const listed = component.history.get(date);
    /** @type {StatusDay['state']} */
    let state = 'none';
    if (component.since && date >= component.since)
      state = date === today ? component.state : 'operational';
    days.push(listed ? { date, ...listed } : { date, state, minutes: null, note: '' });
  }
  return days;
}

/**
 * Share of a day the component was up, `null` when the day does not count.
 *
 * @param {StatusDay} day
 * @returns {number | null}
 */
function dayUptime(day) {
  if (day.state === 'none' || day.state === 'unknown' || day.state === 'maintenance') return null;
  if (day.minutes !== null) return Math.max(0, 1 - day.minutes / 1440);
  if (day.state === 'major') return 0;
  return day.state === 'partial' ? 0.7 : 1;
}

/**
 * Uptime in percent: the one the source gives, else worked out from the days. Maintenance
 * and days without data do not count; without `minutes`, a degraded day counts as up, a
 * partial outage as 70% and a major outage as 0.
 *
 * @param {StatusComponent} component
 * @param {StatusDay[]} days
 * @returns {number | null}
 */
export function uptimePercent(component, days) {
  if (component.uptime !== null) return component.uptime;
  const shares = days.map(dayUptime).filter((share) => share !== null);
  if (!shares.length) return null;
  return (shares.reduce((sum, share) => sum + share, 0) / shares.length) * 100;
}
