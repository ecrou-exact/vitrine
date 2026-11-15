// @ts-check
/**
 * Changelogs: Keep a Changelog and conventional-changelog Markdown, GitHub releases, or a
 * list of releases in JSON, read into releases with groups of changes of known kinds; links,
 * code and references of the text of a change read into safe tokens; and comparison of
 * versions for "what changed since".
 *
 * @module components/changelog/changelog
 */
import { isObject, safeLink, text, toTime } from '../../core/data.js';

/** Kinds of changes, in the order they are shown. */
export const KINDS = /** @type {const} */ (['breaking', 'security', 'added', 'changed', 'deprecated', 'removed', 'fixed', 'other']); // prettier-ignore

/** @typedef {typeof KINDS[number]} Kind */

/**
 * @typedef {object} Change
 * @property {Kind} kind
 * @property {string} text - Inline Markdown.
 * @property {string} scope - Scope of a conventional commit, such as `parser`.
 * @property {boolean} breaking
 * @property {number} depth - 0, or 1 for a nested item.
 */

/**
 * @typedef {object} Group
 * @property {Kind} kind
 * @property {string} label - The heading as written, such as "Bug Fixes".
 * @property {Change[]} items
 */

/**
 * @typedef {object} Release
 * @property {string} version - Without a leading "v"; empty when unreleased.
 * @property {string} title - The name of a GitHub release, when it says more than the version.
 * @property {number | null} date
 * @property {boolean} unreleased
 * @property {boolean} yanked
 * @property {boolean} prerelease
 * @property {string | null} url - The release page.
 * @property {string | null} compare - The diff with the release before.
 * @property {string} notes - Text before the first group.
 * @property {Group[]} groups
 */

/** Headings, lower case and without emoji, and the kind they hold. */
const HEADINGS = /** @type {Record<string, Kind>} */ ({
  added: 'added', features: 'added', feature: 'added', new: 'added', 'new features': 'added',
  changed: 'changed', changes: 'changed', improvements: 'changed', enhancements: 'changed',
  'performance improvements': 'changed', performance: 'changed', refactor: 'changed',
  'code refactoring': 'changed', updated: 'changed', "what's changed": 'changed',
  deprecated: 'deprecated', deprecations: 'deprecated', deprecation: 'deprecated',
  removed: 'removed', removals: 'removed', removal: 'removed',
  fixed: 'fixed', fixes: 'fixed', 'bug fixes': 'fixed', bugfixes: 'fixed', 'bug fix': 'fixed',
  security: 'security', 'security fixes': 'security',
  'breaking changes': 'breaking', breaking: 'breaking', 'breaking change': 'breaking',
}); // prettier-ignore

/**
 * @param {unknown} value
 * @returns {string | null} A web address (`http:` or `https:`), for release and compare links.
 */
function webLink(value) {
  const url = safeLink(value);
  return url && /^https?:\/\/[^\s&]+$/i.test(url) ? url : null;
}

const VERSION = /\bv?(\d+(?:\.\d+){0,3}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?![\d.])/;
const DATE = /(\d{4}-\d{2}-\d{2})(?:[T ][\d:.]+Z?)?/;
const MAX_RELEASES = 2000;
const MAX_ITEMS = 2000;

/**
 * @param {string} heading
 * @returns {{ kind: Kind, label: string }}
 */
export function kindOf(heading) {
  const label = heading.replace(/[*_`]/g, '').trim().slice(0, 100);
  const key = label
    .toLowerCase()
    .replace(/^[^\p{L}]+/u, '')
    .replace(/[:\s]+$/, '');
  return { kind: HEADINGS[key] ?? (/breaking/i.test(key) ? 'breaking' : 'other'), label: label.replace(/^[^\p{L}\p{N}]+/u, '') || label }; // prettier-ignore
}

/**
 * @param {string} line
 * @returns {{ level: number, text: string } | null}
 */
function heading(line) {
  const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
  return m ? { level: m[1].length, text: m[2] } : null;
}

/**
 * Reads a release heading: `[1.2.0] - 2026-11-01`, `[1.2.0](compare-url) (2026-11-01)`,
 * `v1.2.0 / 2026-11-01`, `Unreleased`.
 *
 * @param {string} title
 * @returns {Release | null}
 */
export function releaseHeading(title) {
  const linked = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(title);
  const plain = title.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[[\]]/g, '');
  const unreleased = /\bunreleased\b/i.test(plain);
  const version = unreleased ? null : VERSION.exec(plain);
  if (!unreleased && !version) return null;
  const date = DATE.exec(plain.slice(version ? version.index + version[0].length : 0));
  return {
    version: version ? version[1] : '',
    title: '',
    date: date ? toTime(`${date[1]}T00:00:00Z`) : null,
    unreleased,
    yanked: /\byanked\b/i.test(plain),
    prerelease: Boolean(version && /-/.test(version[1])),
    url: null,
    compare: linked ? webLink(linked[2]) : null,
    notes: '',
    groups: [],
  };
}

/**
 * Reads the groups of changes of a release: headings, then items.
 *
 * @param {string[]} lines
 * @param {Release} release
 */
function readBody(lines, release) {
  /** @type {Group | null} */
  let group = null;
  /** @type {Change | null} */
  let last = null;
  /** @type {string[]} */
  const notes = [];
  let count = 0;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const head = heading(line);
    if (head) {
      group = { ...kindOf(head.text), items: [] };
      release.groups.push(group);
      last = null;
      continue;
    }
    const item = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (item && count < MAX_ITEMS) {
      if (!group) {
        group = { kind: 'other', label: '', items: [] };
        release.groups.push(group);
      }
      last = readItem(item[2], group.kind, item[1].replace(/\t/g, '  ').length >= 2 ? 1 : 0);
      group.items.push(last);
      count += 1;
      continue;
    }
    if (!line.trim()) {
      last = null;
      continue;
    }
    // GitHub release notes end with "**Full Changelog**: …/compare/a...b".
    const full = /full changelog\W*(https:\/\/\S+\/compare\/\S+)/i.exec(line);
    if (full) {
      release.compare ??= webLink(full[1]);
      continue;
    }
    // A line under an item continues it; text before any group is notes.
    if (last && /^\s+\S/.test(line)) last.text = `${last.text} ${line.trim()}`.slice(0, 4000);
    else if (!group && release.groups.length === 0) notes.push(line.trim());
  }
  release.notes = notes.join(' ').slice(0, 4000);
  release.groups = release.groups.filter((g) => g.items.length);
}

/**
 * @param {string} body
 * @param {Kind} kind
 * @param {number} depth
 * @returns {Change}
 */
function readItem(body, kind, depth) {
  let value = body.trim();
  let scope = '';
  const scoped = /^\*\*([^*:]{1,60}):\*\*\s*/.exec(value);
  if (scoped) {
    scope = scoped[1].trim();
    value = value.slice(scoped[0].length);
  }
  const breaking = kind === 'breaking' || /^(\*\*)?BREAKING( CHANGE)?\b|⚠/.test(value) || /^[a-z]+(\([^)]*\))?!:/.test(value); // prettier-ignore
  return { kind, text: value.slice(0, 4000), scope, breaking, depth };
}

/**
 * Reads a Markdown changelog.
 *
 * @param {string} markdown
 * @returns {Release[]}
 */
export function readMarkdown(markdown) {
  const lines = String(markdown ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  /** @type {Record<string, string>} Link references: `[1.2.0]: https://…`. */
  const references = {};
  /** @type {{ release: Release, lines: string[] }[]} */
  const found = [];
  /** @type {{ release: Release, lines: string[] } | null} */
  let current = null;
  let fence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const reference = !fence && /^\s{0,3}\[([^\]]+)\]:\s*(\S+)/.exec(line);
    if (reference) {
      references[reference[1].toLowerCase().replace(/^v/, '')] = reference[2];
      continue;
    }
    const head = !fence ? heading(line) : null;
    // Releases are headings of level 1 or 2 with a version; deeper headings are groups.
    const release = head && head.level <= 2 ? releaseHeading(head.text) : null;
    if (release && found.length < MAX_RELEASES) {
      current = { release, lines: [] };
      found.push(current);
    } else if (current && !(head && head.level === 1)) current.lines.push(line);
  }
  return found.map(({ release, lines: body }) => {
    readBody(body, release);
    const key = release.unreleased ? 'unreleased' : release.version.toLowerCase();
    release.compare ??= webLink(references[key]);
    return release;
  });
}

/**
 * Reads GitHub releases (`/repos/{owner}/{repo}/releases`), GitLab releases, or releases of
 * your own: `[{ version, date, url, changes: { added: [], fixed: [] } }]`.
 *
 * @param {unknown} value
 * @returns {Release[]}
 */
export function readJson(value) {
  const list = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.releases) ? value.releases : null; // prettier-ignore
  if (!list) throw new ChangelogError('shape');
  /** @type {Release[]} */
  const out = [];
  for (const item of list.slice(0, MAX_RELEASES)) {
    if (!isObject(item) || item.draft === true) continue;
    const tag = text(item.version ?? item.tag_name ?? item.tag, 100);
    const name = text(item.name ?? item.title, 300);
    const head = releaseHeading(tag || name) ?? { version: tag.replace(/^v/, ''), title: '', date: null, unreleased: false, yanked: false, prerelease: false, url: null, compare: null, notes: '', groups: [] }; // prettier-ignore
    if (!head.version && !head.unreleased) continue;
    const release = {
      ...head,
      title: name && name.replace(/^v/, '') !== head.version ? name : '',
      date: toTime(item.date ?? item.published_at ?? item.released_at ?? item.created_at) ?? head.date, // prettier-ignore
      prerelease: item.prerelease === true || item.upcoming_release === true || head.prerelease,
      yanked: item.yanked === true || head.yanked,
      url: webLink(item.url ?? item.html_url ?? item._links?.self),
      compare: webLink(item.compare),
    };
    if (isObject(item.changes)) {
      for (const [key, items] of Object.entries(item.changes)) {
        if (!Array.isArray(items)) continue;
        const { kind, label } = kindOf(key);
        const group = { kind, label, items: items.slice(0, MAX_ITEMS).map((i) => readItem(text(i), kind, 0)).filter((i) => i.text) }; // prettier-ignore
        if (group.items.length) release.groups.push(group);
      }
    } else {
      const body = text(item.body ?? item.description ?? item.notes, 100000);
      readBody(body.replace(/\r\n?/g, '\n').split('\n'), release);
    }
    out.push(release);
  }
  return out;
}

export class ChangelogError extends Error {}

/**
 * @param {string} source - Markdown or JSON.
 * @returns {Release[]}
 */
export function readChangelog(source) {
  const trimmed = String(source ?? '').trim();
  if (/^[[{]/.test(trimmed)) return readJson(JSON.parse(trimmed));
  return readMarkdown(trimmed);
}

// ---------------------------------------------------------------- versions

/**
 * Compares two versions loosely: numbers part by part, a pre-release before its release.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareLoose(a, b) {
  const split = (/** @type {string} */ v) => {
    const [main, pre = ''] = v.replace(/^v/i, '').split('+')[0].split(/-(.*)/s);
    return { parts: main.split('.').map((n) => Number(n) || 0), pre };
  };
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < Math.max(x.parts.length, y.parts.length); i += 1) {
    const d = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);
    if (d) return d;
  }
  if (!x.pre || !y.pre) return x.pre ? -1 : y.pre ? 1 : 0;
  return x.pre.localeCompare(y.pre, 'en', { numeric: true });
}

/**
 * @param {Release} release
 * @returns {string} The id of a release, for links: `v1.2.0` or `unreleased`.
 */
export function anchorOf(release) {
  return release.unreleased ? 'unreleased' : `v${release.version.replace(/[^0-9A-Za-z.+-]/g, '')}`;
}

// ---------------------------------------------------------------- inline text

/**
 * @typedef {{ type: 'text' | 'code' | 'strong' | 'em', text: string } | { type: 'link', text: string, url: string, code?: boolean }} Token
 */

/**
 * Reads the inline Markdown of a change: code, bold, italic, links, bare URLs, and with a
 * repository, `#123` issues, `@user` mentions and commit hashes in brackets.
 *
 * @param {string} source
 * @param {string | null} [repo] - Repository address, such as `https://github.com/owner/name`.
 * @returns {Token[]}
 */
export function inlineTokens(source, repo = null) {
  const base = repo ? repo.replace(/\/+$/, '') : null;
  const host = base ? (/^https:\/\/[^/]+/.exec(base)?.[0] ?? null) : null;
  const gitlab = Boolean(base && /gitlab/.test(base));
  /** @type {Token[]} */
  const out = [];
  const pattern =
    /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|(?<![\w*])\*([^*\s][^*]*)\*(?!\w)|(?<!\w)_([^_\s][^_]*)_(?!\w)|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(?<![\w/&])#(\d{1,7})\b|(?<![\w/])@([A-Za-z0-9][A-Za-z0-9-]{0,38})\b|\b([0-9a-f]{7,40})\b/g;
  let at = 0;
  const push = (/** @type {Token} */ token) => {
    const prev = out.at(-1);
    if (token.type === 'text' && prev?.type === 'text') prev.text += token.text;
    else if (token.text) out.push(token);
  };
  for (const m of String(source ?? '').matchAll(pattern)) {
    const index = m.index ?? 0;
    if (index > at) push({ type: 'text', text: source.slice(at, index) });
    at = index + m[0].length;
    const [all, code, strong1, strong2, em1, em2, label, href, bare, issue, user, sha] = m;
    if (code !== undefined) push({ type: 'code', text: code });
    else if (strong1 !== undefined || strong2 !== undefined) push({ type: 'strong', text: strong1 ?? strong2 }); // prettier-ignore
    else if (em1 !== undefined || em2 !== undefined) push({ type: 'em', text: em1 ?? em2 });
    else if (label !== undefined && /&#|&colon;/i.test(href)) push({ type: 'text', text: label });
    else if (label !== undefined) {
      // Character references are not decoded here, so a link that has some is not trusted.
      // A link with a scheme is checked as is; a relative one points into the repository.
      const url = safeLink(/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/') || !base ? href : `${base}/${href}`); // prettier-ignore
      push(url ? { type: 'link', text: label.replace(/[`*]/g, ''), url } : { type: 'text', text: label }); // prettier-ignore
    } else if (bare !== undefined) {
      const url = safeLink(bare);
      push(url ? { type: 'link', text: shortUrl(bare, base), url } : { type: 'text', text: bare });
    } else if (issue !== undefined)
      push(base ? { type: 'link', text: `#${issue}`, url: `${base}/${gitlab ? '-/issues' : 'issues'}/${issue}` } : { type: 'text', text: all }); // prettier-ignore
    else if (user !== undefined) push(host && !gitlab ? { type: 'link', text: `@${user}`, url: `${host}/${user}` } : { type: 'text', text: all }); // prettier-ignore
    else if (sha !== undefined)
      push(base && /\d/.test(sha) && /[a-f]/.test(sha) ? { type: 'link', text: sha.slice(0, 7), url: `${base}/${gitlab ? '-/commit' : 'commit'}/${sha}`, code: true } : { type: 'text', text: all }); // prettier-ignore
  }
  if (at < String(source ?? '').length) push({ type: 'text', text: source.slice(at) });
  return out;
}

/**
 * GitHub release notes write pull requests as full URLs: they are shown as `#123`.
 *
 * @param {string} url
 * @param {string | null} base
 * @returns {string}
 */
function shortUrl(url, base) {
  const pull = /\/(?:pull|issues|merge_requests)\/(\d+)$/.exec(url);
  if (pull && (!base || url.startsWith(base))) return `#${pull[1]}`;
  const compare = /\/compare\/([^/]+)$/.exec(url);
  if (compare) return compare[1];
  return url.replace(/^https?:\/\//, '').slice(0, 60);
}

// ---------------------------------------------------------------- export

/**
 * Writes releases back as Keep a Changelog Markdown.
 *
 * @param {Release[]} releases
 * @param {Record<string, string>} labels - Group heading of each kind.
 * @returns {string}
 */
export function toMarkdown(releases, labels) {
  return releases
    .map((r) => {
      const date = r.date !== null ? ` - ${new Date(r.date).toISOString().slice(0, 10)}` : '';
      const head = `## [${r.unreleased ? 'Unreleased' : r.version}]${date}${r.yanked ? ' [YANKED]' : ''}`; // prettier-ignore
      const groups = r.groups.map((g) => `### ${g.label || labels[g.kind]}\n\n${g.items.map((i) => `${'  '.repeat(i.depth)}- ${i.scope ? `**${i.scope}:** ` : ''}${i.text}`).join('\n')}`); // prettier-ignore
      return [head, r.notes, ...groups].filter(Boolean).join('\n\n');
    })
    .join('\n\n');
}
