// @ts-check
/**
 * Release cycles and their support: read from endoflife.date (API v1 and v0) or a plain list,
 * each cycle given a status at a date.
 *
 * @module components/lifecycle/cycles
 */
import { MAX_ITEMS, firstText, isObject, safeLink, text, toTime } from '../../core/data.js';

/** @typedef {'upcoming' | 'active' | 'security' | 'extended' | 'eol'} Status */

/**
 * @typedef {object} Cycle
 * @property {string} name - `22`, `3.12`, `5.0`…
 * @property {string} label - A longer name, when given.
 * @property {string} codename
 * @property {number | null} released
 * @property {number | null} activeEnd - End of active support (bug fixes); `null`: unknown.
 * @property {number | null} eol - End of security support; `null`: not set.
 * @property {number | null} extendedEnd - End of paid or extended support.
 * @property {boolean} lts
 * @property {boolean} ended - Said to be ended, without a date.
 * @property {boolean} supported - Said to be supported, without a date.
 * @property {string} latest - Latest version of the cycle.
 * @property {number | null} latestDate
 * @property {string | null} link
 */

export class CycleError extends Error {}

export const STATUSES = /** @type {const} */ (['upcoming', 'active', 'security', 'extended', 'eol']); // prettier-ignore

/**
 * A date, or `true` / `false` as endoflife.date writes "yes, no date" and "no".
 *
 * @param {unknown} value
 * @returns {{ time: number | null, flag: boolean | null }}
 */
function dateOrFlag(value) {
  if (typeof value === 'boolean') return { time: null, flag: value };
  return { time: toTime(value), flag: null };
}

/**
 * @param {Record<string, any>} item
 * @returns {Cycle | null}
 */
function readCycle(item) {
  const name = firstText(item, ['name', 'cycle', 'version', 'release', 'branch'], 60);
  if (!name) return null;
  // API v1: isEol / eolFrom, isEoas / eoasFrom, isEoes / eoesFrom.
  const eol = dateOrFlag(item.eolFrom ?? item.eol ?? item.securitySupport ?? item.security ?? item.end); // prettier-ignore
  const active = dateOrFlag(item.eoasFrom ?? item.support ?? item.activeSupport ?? item.active ?? item.bugfixes); // prettier-ignore
  const extended = dateOrFlag(item.eoesFrom ?? item.extendedSupport ?? item.extended);
  const latest = isObject(item.latest) ? item.latest : null;
  const lts = item.isLts ?? item.lts;
  // v0 writes `eol: true` for ended cycles and `eol: false` for supported ones; v1 `isEol`.
  const ended = item.isEol === true || eol.flag === true;
  const supported = item.supported === true || item.isEol === false || eol.flag === false;
  return {
    name,
    label: text(item.label, 100),
    codename: text(item.codename, 100),
    released: toTime(item.releaseDate ?? item.released ?? item.date),
    activeEnd: active.time,
    eol: eol.time,
    extendedEnd: extended.time,
    lts: lts === true || typeof lts === 'string' || (item.ltsFrom !== undefined && item.ltsFrom !== null), // prettier-ignore
    ended: ended && eol.time === null,
    supported: supported && eol.time === null && item.supported !== false,
    latest: latest ? text(latest.name, 60) : text(item.latest ?? item.latestVersion, 60),
    latestDate: toTime(latest ? latest.date : item.latestReleaseDate),
    link: safeLink(latest?.link ?? item.link ?? item.url),
  };
}

/**
 * Reads cycles from endoflife.date (`/api/v1/products/{name}`: `result.releases`; v0:
 * `/api/{name}.json`, a list) or `[{ version, released, support, eol }]`, newest first.
 *
 * @param {unknown} data
 * @returns {{ name: string, cycles: Cycle[] }}
 */
export function readCycles(data) {
  /** @type {unknown} */
  let list = data;
  let name = '';
  if (isObject(data)) {
    const root = isObject(data.result) ? data.result : data;
    name = firstText(root, ['label', 'name', 'product'], 100);
    list = [root.releases, root.cycles, root.versions, root.items].find(Array.isArray);
  }
  if (!Array.isArray(list)) throw new CycleError('shape');
  const cycles = list
    .filter(isObject)
    .slice(0, MAX_ITEMS)
    .map(readCycle)
    .filter((c) => c !== null);
  return { name, cycles };
}

/**
 * Where a cycle stands at a date.
 *
 * @param {Cycle} cycle
 * @param {number} now
 * @returns {Status}
 */
export function statusOf(cycle, now) {
  if (cycle.released !== null && cycle.released > now) return 'upcoming';
  const ended = cycle.eol !== null ? cycle.eol <= now : cycle.ended;
  if (ended) return cycle.extendedEnd !== null && cycle.extendedEnd > now ? 'extended' : 'eol';
  if (cycle.activeEnd !== null && cycle.activeEnd <= now) return 'security';
  return 'active';
}

/**
 * The cycle a version belongs to: the longest cycle name it starts with (`20.11.1` → `20`).
 *
 * @param {Cycle[]} cycles
 * @param {string} version
 * @returns {Cycle | null}
 */
export function cycleOf(cycles, version) {
  const v = version.trim().replace(/^v/i, '');
  if (!v) return null;
  let best = null;
  for (const cycle of cycles) {
    const name = cycle.name.replace(/^v/i, '');
    if ((v === name || v.startsWith(`${name}.`) || v.startsWith(`${name}-`)) && (!best || name.length > best.name.length)) best = cycle; // prettier-ignore
  }
  return best;
}
