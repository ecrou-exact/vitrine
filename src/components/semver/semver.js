// @ts-check
/**
 * Semantic versions (SemVer 2.0.0) and version ranges as npm, Cargo and Composer write them:
 * `^1.2.3`, `~1.2`, `1.x`, `>=1.2 <2`, `1.2.3 - 2.3`, `||`. Ranges are read into sets of
 * bounds, explained in words, and tested against versions with npm's rule for pre-releases.
 *
 * @module components/semver/semver
 */

/** Longest version or range read (characters). */
export const MAX_LENGTH = 1024;
/** Most versions tested. */
export const MAX_VERSIONS = 5000;

/**
 * @typedef {object} Version
 * @property {number} major
 * @property {number} minor
 * @property {number} patch
 * @property {(string | number)[]} pre - Pre-release identifiers (`rc.1` → `['rc', 1]`).
 * @property {string} build
 * @property {string} raw - As written, cleaned (`v` and `=` removed).
 */

/**
 * @typedef {"<" | "<=" | ">" | ">=" | "="} Operator
 * @typedef {{ op: Operator, version: Version }} Comparator
 * @typedef {{ kind: string, text: string, params: Record<string, string> }} Part - One term of the range as written, with its reading.
 * @typedef {{ comparators: Comparator[], parts: Part[], text: string, empty: boolean }} RangeSet
 *   Comparators that must all hold. `empty` when no version can match.
 * @typedef {{ ok: true, sets: RangeSet[], warnings: { id: string, params: Record<string, string> }[] } | { ok: false, error: string, near: string }} Range
 */

const NUM = '0|[1-9]\\d*';
const IDENT = '(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)';
const VERSION = new RegExp(`^v?=?\\s*(${NUM})\\.(${NUM})\\.(${NUM})(?:-(${IDENT}(?:\\.${IDENT})*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$`); // prettier-ignore
/** A partial version: `1`, `1.2`, `1.x`, `*`, with optional pre-release. */
const PARTIAL = /^v?=?\s*(\d+|[xX*])(?:\.(\d+|[xX*])(?:\.(\d+|[xX*])(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?)?)?$/; // prettier-ignore

/**
 * @param {string} input
 * @returns {Version | null}
 */
export function parseVersion(input) {
  const text = String(input).trim();
  if (!text || text.length > 256) return null;
  const m = VERSION.exec(text);
  if (!m) return null;
  const nums = [m[1], m[2], m[3]].map(Number);
  if (nums.some((n) => !Number.isSafeInteger(n))) return null;
  const pre = m[4] ? m[4].split('.').map((x) => (/^\d+$/.test(x) ? Number(x) : x)) : [];
  return { major: nums[0], minor: nums[1], patch: nums[2], pre, build: m[5] ?? '', raw: text.replace(/^v?=?\s*/, '') }; // prettier-ignore
}

/**
 * Orders two versions (build metadata ignored), as SemVer 2.0.0 section 11 says.
 *
 * @param {Version} a
 * @param {Version} b
 * @returns {number}
 */
export function compare(a, b) {
  for (const key of /** @type {const} */ (['major', 'minor', 'patch'])) if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1; // prettier-ignore
  if (!a.pre.length || !b.pre.length) return a.pre.length ? -1 : b.pre.length ? 1 : 0;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i += 1) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1;
    if (typeof x === 'number') return -1;
    if (typeof y === 'number') return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * @param {number} major
 * @param {number} minor
 * @param {number} patch
 * @param {(string | number)[]} [pre]
 * @returns {Version}
 */
const v = (major, minor, patch, pre = []) => ({ major, minor, patch, pre, build: '', raw: `${major}.${minor}.${patch}${pre.length ? `-${pre.join('.')}` : ''}` }); // prettier-ignore

/**
 * @param {Version} version
 * @returns {string}
 */
export const format = (version) => `${version.major}.${version.minor}.${version.patch}${version.pre.length ? `-${version.pre.join('.')}` : ''}`; // prettier-ignore

/**
 * @param {string} text
 * @returns {{ major: number | null, minor: number | null, patch: number | null, pre: (string | number)[] } | null}
 *   `null` parts are wildcards.
 */
function partial(text) {
  const m = PARTIAL.exec(text);
  if (!m) return null;
  const num = (/** @type {string | undefined} */ s) => (s === undefined || /^[xX*]$/.test(s) ? null : Number(s)); // prettier-ignore
  const pre = m[4] ? m[4].split('.').map((x) => (/^\d+$/.test(x) ? Number(x) : x)) : [];
  const major = num(m[1]);
  const minor = major === null ? null : num(m[2]);
  const patch = minor === null ? null : num(m[3]);
  return { major, minor, patch, pre };
}

/**
 * Reads one term into comparators and its reading.
 *
 * @param {string} term - `^1.2.3`, `~1.2`, `>=1.0.0`, `1.x`, `*`.
 * @returns {{ comparators: Comparator[], part: Part } | null}
 */
function readTerm(term) {
  const m = /^(\^|~>|~|>=|<=|>|<|=)?\s*(.*)$/.exec(term);
  if (!m) return null;
  const op = m[1] ?? '';
  const p = partial(m[2]);
  if (!p) return null;
  const { major, minor, patch, pre } = p;
  const low = v(major ?? 0, minor ?? 0, patch ?? 0, pre);
  const text = term;
  /** @type {(c: Comparator[], kind: string, params?: Record<string, string>) => { comparators: Comparator[], part: Part }} */
  const out = (comparators, kind, params = {}) => ({ comparators, part: { kind, text, params: { from: format(low), ...params } } }); // prettier-ignore
  if (major === null) return out([], 'any');
  if (op === '^') {
    if (major > 0 || minor === null) return out([{ op: '>=', version: low }, { op: '<', version: v(major + 1, 0, 0, [0]) }], 'caretMajor', { major: String(major), below: `${major + 1}.0.0` }); // prettier-ignore
    if (minor > 0 || patch === null) return out([{ op: '>=', version: low }, { op: '<', version: v(0, minor + 1, 0, [0]) }], 'caretMinor', { minor: `0.${minor}`, below: `0.${minor + 1}.0` }); // prettier-ignore
    return out([{ op: '>=', version: low }, { op: '<', version: v(0, 0, patch + 1, [0]) }], 'caretPatch', { below: `0.0.${patch + 1}` }); // prettier-ignore
  }
  if (op === '~' || op === '~>') {
    if (minor === null) return out([{ op: '>=', version: low }, { op: '<', version: v(major + 1, 0, 0, [0]) }], 'tildeMajor', { major: String(major), below: `${major + 1}.0.0` }); // prettier-ignore
    return out([{ op: '>=', version: low }, { op: '<', version: v(major, minor + 1, 0, [0]) }], 'tilde', { minor: `${major}.${minor}`, below: `${major}.${minor + 1}.0` }); // prettier-ignore
  }
  if (op === '' || op === '=') {
    if (minor === null) return out([{ op: '>=', version: low }, { op: '<', version: v(major + 1, 0, 0, [0]) }], 'xMajor', { major: String(major) }); // prettier-ignore
    if (patch === null) return out([{ op: '>=', version: low }, { op: '<', version: v(major, minor + 1, 0, [0]) }], 'xMinor', { minor: `${major}.${minor}` }); // prettier-ignore
    return out([{ op: '=', version: low }], 'exact');
  }
  // Comparison with a partial version: `>1.2` means `>=1.3.0`, `<=1.2` means `<1.3.0`.
  const next = minor === null ? v(major + 1, 0, 0, [0]) : patch === null ? v(major, minor + 1, 0, [0]) : null; // prettier-ignore
  if (op === '>') return next ? out([{ op: '>=', version: next }], 'gt', { version: format(next).replace(/-0$/, '') }) : out([{ op: '>', version: low }], 'gt', { version: format(low) }); // prettier-ignore
  if (op === '<=') return next ? out([{ op: '<', version: next }], 'lte', { version: format(next).replace(/-0$/, ''), strict: 'yes' }) : out([{ op: '<=', version: low }], 'lte', { version: format(low) }); // prettier-ignore
  if (op === '>=') return out([{ op: '>=', version: low }], 'gte', { version: format(low) });
  return out([{ op: '<', version: low }], 'lt', { version: format(low) });
}

/**
 * Reads a range.
 *
 * @param {string} input
 * @returns {Range}
 */
export function parseRange(input) {
  const text = String(input).trim();
  if (text.length > MAX_LENGTH) return { ok: false, error: 'long', near: '' };
  /** @type {RangeSet[]} */
  const sets = [];
  for (const raw of (text || '*').split('||')) {
    const setText = raw.trim() || '*';
    /** @type {Comparator[]} */
    const comparators = [];
    /** @type {Part[]} */
    const parts = [];
    const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(setText);
    if (hyphen) {
      const a = partial(hyphen[1]);
      const b = partial(hyphen[2]);
      if (!a || !b || a.major === null) return { ok: false, error: 'term', near: setText };
      const low = v(a.major, a.minor ?? 0, a.patch ?? 0, a.pre);
      comparators.push({ op: '>=', version: low });
      /** @type {Record<string, string>} */
      const params = { from: format(low) };
      if (b.major !== null) {
        if (b.minor === null) comparators.push({ op: '<', version: v(b.major + 1, 0, 0, [0]) });
        else if (b.patch === null)
          comparators.push({ op: '<', version: v(b.major, b.minor + 1, 0, [0]) }); // prettier-ignore
        else comparators.push({ op: '<=', version: v(b.major, b.minor, b.patch, b.pre) });
        params.to = hyphen[2].replace(/^v/, '');
      }
      parts.push({ kind: b.major === null ? 'gte' : 'hyphen', text: setText, params: { version: params.from, ...params } }); // prettier-ignore
    } else {
      // Operators may be separated from their version by spaces (`>= 1.2`); commas also join.
      const terms = setText.replace(/(\^|~>|~|>=|<=|>|<|=)\s+/g, '$1').split(/[\s,]+/).filter(Boolean); // prettier-ignore
      for (const term of terms) {
        const read = readTerm(term);
        if (!read) return { ok: false, error: 'term', near: term };
        comparators.push(...read.comparators);
        parts.push(read.part);
      }
    }
    sets.push({ comparators, parts, text: setText, empty: isEmpty(comparators) });
  }
  return { ok: true, sets, warnings: warnings(sets) };
}

/**
 * Whether no version can satisfy every comparator.
 *
 * @param {Comparator[]} comparators
 * @returns {boolean}
 */
function isEmpty(comparators) {
  const { low, high } = bounds(comparators);
  if (!low || !high) return false;
  const c = compare(low.version, high.version);
  return c > 0 || (c === 0 && (low.op === '>' || high.op === '<'));
}

/**
 * The tightest lower and upper bounds of a set.
 *
 * @param {Comparator[]} comparators
 * @returns {{ low: Comparator | null, high: Comparator | null }}
 */
export function bounds(comparators) {
  /** @type {Comparator | null} */
  let low = null;
  /** @type {Comparator | null} */
  let high = null;
  for (const c of comparators) {
    if (c.op === '=') {
      const eq = { op: /** @type {Operator} */ ('>='), version: c.version };
      const le = { op: /** @type {Operator} */ ('<='), version: c.version };
      if (!low || compare(c.version, low.version) > 0) low = eq;
      if (!high || compare(c.version, high.version) < 0) high = le;
    } else if (c.op === '>' || c.op === '>=') {
      const d = low ? compare(c.version, low.version) : 1;
      if (d > 0 || (d === 0 && c.op === '>')) low = c;
    } else {
      const d = high ? compare(c.version, high.version) : -1;
      if (d < 0 || (d === 0 && c.op === '<')) high = c;
    }
  }
  return { low, high };
}

/**
 * @param {RangeSet[]} sets
 * @returns {{ id: string, params: Record<string, string> }[]}
 */
function warnings(sets) {
  /** @type {{ id: string, params: Record<string, string> }[]} */
  const out = [];
  for (const set of sets) {
    const { low, high } = bounds(set.comparators);
    if (set.empty) out.push({ id: 'empty', params: { set: set.text } });
    else if (!set.comparators.length) out.push({ id: 'any', params: { set: set.text } });
    else if (!high) out.push({ id: 'unbounded', params: { set: set.text } });
    else if (!low) out.push({ id: 'noLow', params: { set: set.text } });
    else if (set.comparators.length === 1 && set.comparators[0].op === '=') out.push({ id: 'pinned', params: { set: set.text } }); // prettier-ignore
    if (set.parts.some((p) => p.kind.startsWith('caret') && p.kind !== 'caretMajor')) out.push({ id: 'caretZero', params: { set: set.text } }); // prettier-ignore
    if (set.comparators.some((c) => c.version.pre.length && !(c.version.pre.length === 1 && c.version.pre[0] === 0))) out.push({ id: 'prerelease', params: { set: set.text } }); // prettier-ignore
  }
  return out;
}

/**
 * Whether a version satisfies a set, with npm's rule: a pre-release only matches when a
 * comparator of the set has a pre-release on the same major.minor.patch.
 *
 * @param {Version} version
 * @param {RangeSet} set
 * @param {boolean} [includePrerelease]
 * @returns {boolean}
 */
export function satisfiesSet(version, set, includePrerelease = false) {
  for (const c of set.comparators) {
    const d = compare(version, c.version);
    const ok = c.op === '=' ? d === 0 : c.op === '>' ? d > 0 : c.op === '>=' ? d >= 0 : c.op === '<' ? d < 0 : d <= 0; // prettier-ignore
    if (!ok) return false;
  }
  if (version.pre.length && !includePrerelease) {
    return set.comparators.some(
      (c) =>
        c.version.pre.length &&
        !(c.version.pre.length === 1 && c.version.pre[0] === 0) &&
        c.version.major === version.major &&
        c.version.minor === version.minor &&
        c.version.patch === version.patch,
    );
  }
  return true;
}

/**
 * @param {Version} version
 * @param {Range} range
 * @param {boolean} [includePrerelease]
 * @returns {boolean}
 */
export function satisfies(version, range, includePrerelease = false) {
  return range.ok && range.sets.some((set) => satisfiesSet(version, set, includePrerelease));
}

/**
 * Reads a list of versions: one per line or separated by spaces or commas, a JSON array,
 * or an npm registry document (`versions` object, `dist-tags`).
 *
 * @param {string} text
 * @returns {{ versions: Version[], invalid: string[], tags: Record<string, string>, capped: boolean }}
 */
export function readVersions(text) {
  /** @type {string[]} */
  let list = [];
  /** @type {Record<string, string>} */
  let tags = {};
  const trimmed = text.trim();
  if (/^[[{]/.test(trimmed)) {
    try {
      const value = JSON.parse(trimmed);
      if (Array.isArray(value))
        list = value.map((x) => (typeof x === 'string' ? x : typeof x?.version === 'string' ? x.version : '')); // prettier-ignore
      else if (value && typeof value === 'object') {
        const versions = value.versions;
        list = Array.isArray(versions) ? versions.map(String) : versions && typeof versions === 'object' ? Object.keys(versions) : []; // prettier-ignore
        const dist = value['dist-tags'];
        if (dist && typeof dist === 'object') tags = Object.fromEntries(Object.entries(dist).filter(([, x]) => typeof x === 'string')); // prettier-ignore
      }
    } catch {
      list = trimmed.split(/[\s,]+/);
    }
  } else list = trimmed.split(/[\s,]+/);
  list = list.filter(Boolean);
  const capped = list.length > MAX_VERSIONS;
  /** @type {Version[]} */
  const versions = [];
  /** @type {string[]} */
  const invalid = [];
  const seen = new Set();
  for (const raw of list.slice(0, MAX_VERSIONS)) {
    const version = parseVersion(raw);
    if (!version) invalid.push(raw.slice(0, 80));
    else if (!seen.has(format(version))) {
      seen.add(format(version));
      versions.push(version);
    }
  }
  versions.sort(compare);
  return { versions, invalid, tags, capped };
}

/**
 * The highest version a package manager would install: the highest match that is not a
 * pre-release, or a pre-release when only those match.
 *
 * @param {Version[]} versions - Sorted.
 * @param {Range} range
 * @returns {Version | null}
 */
export function maxSatisfying(versions, range) {
  for (let i = versions.length - 1; i >= 0; i -= 1) if (satisfies(versions[i], range)) return versions[i]; // prettier-ignore
  return null;
}

/**
 * The kind of change from one version to another.
 *
 * @param {Version} a
 * @param {Version} b
 * @returns {"major" | "minor" | "patch" | "prerelease" | "none"}
 */
export function diff(a, b) {
  if (a.major !== b.major) return 'major';
  if (a.minor !== b.minor) return 'minor';
  if (a.patch !== b.patch) return 'patch';
  return compare(a, b) ? 'prerelease' : 'none';
}
