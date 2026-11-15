// @ts-check
/**
 * Contributors and sponsors: read from the GitHub API (`/contributors`), an All Contributors
 * file (`.all-contributorsrc`), Open Collective members, GitHub Sponsors (GraphQL) or a plain
 * list, into people and groups.
 *
 * @module components/contributors/people
 */
import {
  MAX_ITEMS,
  firstText,
  isObject,
  safeImage,
  safeLink,
  text,
  toNumber,
} from '../../core/data.js';

/**
 * @typedef {object} Person
 * @property {string} name
 * @property {string} login
 * @property {string | null} avatar
 * @property {string | null} url
 * @property {number | null} contributions - Commits (GitHub), or contributions counted.
 * @property {string[]} types - All Contributors types: `code`, `doc`, `bug`…
 * @property {string | null} group - Tier or group name, as given.
 * @property {string | null} role - Open Collective role, lowercase: `backer`, `admin`…
 * @property {number | null} amount - What a sponsor gives (or gave in all).
 * @property {boolean} sponsor
 * @property {boolean} bot
 */

/**
 * @typedef {object} Group
 * @property {string} name - Empty for people without a group.
 * @property {string | null} role
 * @property {"small" | "medium" | "large" | null} size - Avatar size given for the group.
 * @property {Person[]} people
 */

export class PeopleError extends Error {}

/** All Contributors types, in the order of their emoji key, with their emoji. */
export const TYPES = Object.freeze({
  code: '💻', doc: '📖', bug: '🐛', ideas: '🤔', review: '👀', test: '⚠️', design: '🎨',
  translation: '🌍', infra: '🚇', maintenance: '🚧', a11y: '♿️', security: '🛡️',
  question: '💬', example: '💡', tutorial: '✅', content: '🖋', blog: '📝', talk: '📢',
  video: '📹', audio: '🔊', data: '🔣', tool: '🔧', plugin: '🔌', platform: '📦',
  mentoring: '🧑‍🏫', projectManagement: '📆', eventOrganizing: '📋', promotion: '📣',
  research: '🔬', userTesting: '📓', business: '💼', financial: '💵', fundingFinding: '🔍',
}); // prettier-ignore

/** Open Collective roles not shown: they did not contribute. */
const HIDDEN_ROLES = new Set(['follower', 'host']);
const SIZES = /** @type {const} */ (['small', 'medium', 'large']);

/** Keys that may hold the list of people. */
const LIST_KEYS = ['contributors', 'sponsors', 'backers', 'people', 'members', 'items', 'nodes'];

/**
 * @param {unknown} value
 * @returns {string[]} Known types of an All Contributors list (`["code", { type: "doc" }]`).
 */
function typesOf(value) {
  if (!Array.isArray(value)) return [];
  const names = value.map((v) => (isObject(v) ? text(v.type, 40) : text(v, 40)));
  return [...new Set(names.filter((n) => Object.hasOwn(TYPES, n)))];
}

/**
 * @param {Record<string, any>} raw
 * @param {{ group?: string | null }} [context]
 * @returns {Person | null}
 */
export function readPerson(raw, context = {}) {
  // GitHub Sponsors (GraphQL): the sponsor is in `sponsorEntity`, the tier next to it.
  const item = isObject(raw.sponsorEntity) ? { ...raw.sponsorEntity, tier: raw.tier ?? raw.sponsorEntity.tier } : raw; // prettier-ignore
  const login = firstText(item, ['login', 'github', 'username', 'handle', 'slug'], 100);
  const name = firstText(item, ['name', 'displayName', 'full_name'], 200) || login;
  if (!name) return null;
  const role = text(item.role, 40).toLowerCase() || null;
  if (role && HIDDEN_ROLES.has(role)) return null;
  const tier = isObject(item.tier) ? item.tier : null;
  const amount = toNumber(item.totalAmountDonated ?? item.amount ?? item.monthly ?? tier?.monthlyPriceInDollars); // prettier-ignore
  const groupName = (tier ? text(tier.name, 100) : text(item.tier, 100)) || text(item.group, 100) || context.group || null; // prettier-ignore
  const contributions = item.contributions;
  return {
    name,
    login,
    avatar: safeImage(
      item.avatar_url ?? item.avatarUrl ?? item.avatar ?? item.image ?? item.picture,
    ),
    url: safeLink(item.profile ?? item.html_url ?? item.website ?? item.url ?? item.link),
    contributions: toNumber(contributions) ?? toNumber(item.count ?? item.commits),
    types: typesOf(contributions ?? item.types),
    group: groupName,
    role,
    amount,
    sponsor: amount !== null || Boolean(tier) || role === 'backer' || raw !== item || item.sponsor === true, // prettier-ignore
    bot: item.type === 'Bot' || /\[bot\]$/i.test(login) || /\[bot\]$/i.test(name),
  };
}

/**
 * Finds the list in a value: a list, an object holding one, or GitHub Sponsors GraphQL
 * (`data.user.sponsorshipsAsMaintainer.nodes`).
 *
 * @param {unknown} value
 * @param {number} depth
 * @returns {unknown[] | null}
 */
function findList(value, depth = 0) {
  if (Array.isArray(value)) return value;
  if (!isObject(value) || depth > 4) return null;
  for (const key of LIST_KEYS) if (Array.isArray(value[key])) return value[key];
  for (const key of [
    'data',
    'user',
    'organization',
    'viewer',
    'sponsorshipsAsMaintainer',
    'sponsors',
  ]) {
    // prettier-ignore
    const found = findList(value[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Reads people, in groups when they have a tier, a group or a role.
 *
 * @param {unknown} data
 * @returns {Group[]}
 */
export function readPeople(data) {
  /** @type {Group[]} */
  const groups = [];
  /** @type {Map<string, Group>} */
  const byName = new Map();
  /** @param {string} name @param {string | null} role */
  const groupFor = (name, role) => {
    const key = `${name}\u0000${name ? '' : (role ?? '')}`;
    let group = byName.get(key);
    if (!group) {
      group = { name, role: name ? null : role, size: null, people: [] };
      byName.set(key, group);
      groups.push(group);
    }
    return group;
  };
  const seen = new Set();
  let count = 0;
  /** @param {unknown[]} list @param {string | null} context */
  const add = (list, context) => {
    for (const raw of list) {
      if (!isObject(raw) || count >= MAX_ITEMS) continue;
      const person = readPerson(raw, { group: context });
      if (!person) continue;
      const key = (person.login || person.name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      count += 1;
      groupFor(person.group ?? '', person.group ? null : person.role).people.push(person);
    }
  };
  if (isObject(data) && Array.isArray(data.groups)) {
    for (const g of data.groups.filter(isObject)) {
      const name = text(g.name ?? g.title, 100);
      const list = findList(g) ?? [];
      add(list, name || null);
      const group = byName.get(`${name}\u0000`);
      const size = text(g.size, 10);
      if (group && SIZES.includes(/** @type {any} */ (size))) group.size = /** @type {Group['size']} */ (size); // prettier-ignore
    }
  } else {
    const list = findList(data);
    if (!list) throw new PeopleError('shape');
    add(list, null);
  }
  // Tiers of sponsors: the most generous first.
  const top = (/** @type {Group} */ g) => Math.max(...g.people.map((p) => p.amount ?? 0));
  if (groups.some((g) => g.people.some((p) => p.amount !== null))) groups.sort((a, b) => top(b) - top(a)); // prettier-ignore
  return groups.filter((g) => g.people.length);
}

/**
 * A GitHub avatar at the size it is shown (twice, for sharp screens), instead of 460 pixels.
 *
 * @param {string} url
 * @param {number} pixels
 * @returns {string}
 */
export function sizedAvatar(url, pixels) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'avatars.githubusercontent.com' || parsed.searchParams.has('s')) return url; // prettier-ignore
    parsed.searchParams.set('s', String(pixels));
    return parsed.href;
  } catch {
    return url;
  }
}

/**
 * People as a Markdown list, for release notes.
 *
 * @param {Person[]} people
 * @returns {string}
 */
export function peopleToMarkdown(people) {
  const escape = (/** @type {string} */ s) => s.replace(/[\\`*_[\]()<>#|!]/g, '\\$&');
  return people
    .map((p) => {
      const name = escape(p.name);
      const login = p.login && p.login !== p.name ? ` (@${escape(p.login)})` : '';
      return p.url ? `- [${name}](<${p.url.replace(/[<>]/g, encodeURIComponent)}>)${login}` : `- ${name}${login}`; // prettier-ignore
    })
    .join('\n');
}
