// @ts-check
/**
 * Version numbers: Semantic Versioning 2.0.0, dotted numbers of any length (`#.#`,
 * `#.#.#.#`), calendar versions (`YYYY.0M.MICRO`, `YY.0M`) and decimal numbers with a step.
 * Parsing and printing, comparison by precedence, bumps as npm does them, steps of one
 * segment with carry when segments have a largest value, and the kind of change from one
 * version to the next.
 *
 * @module components/version/versions
 */

/**
 * @typedef {object} Segment
 * @property {string} token - `#`, `MAJOR`, `MINOR`, `PATCH`, `MICRO`, `YYYY`, `YY`, `0Y`, `MM`, `0M`, `WW`, `0W`, `DD` or `0D`.
 * @property {number} min
 * @property {number} max - `Infinity` when unbounded.
 * @property {number} width - Digits with leading zeros, 0 for none.
 * @property {boolean} date - Set from the date by "today".
 */

/**
 * @typedef {object} Format
 * @property {'semver' | 'pattern' | 'decimal'} kind
 * @property {string} source - The format as given.
 * @property {Segment[]} segments
 * @property {string[]} separators - Text before the first segment, between each and after the last.
 * @property {boolean} prerelease - `-pre` and `+build` allowed (Semantic Versioning).
 * @property {number} precision - Decimals of a decimal format.
 * @property {boolean} calendar - Has date segments.
 */

/**
 * @typedef {object} Version
 * @property {number[]} parts - One number per segment; a decimal is its value times 10^precision.
 * @property {string[]} pre - Pre-release identifiers, such as `['beta', '2']`.
 * @property {string[]} build - Build metadata.
 */

/** Names of formats and what they mean. */
export const FORMATS = Object.freeze({
  semver: 'MAJOR.MINOR.PATCH',
  calver: 'YYYY.0M.MICRO',
  'x.y': '#.#',
  'x.y.z': '#.#.#',
  'x.y.z.w': '#.#.#.#',
});

/**
 * @template T
 * @param {T[]} list
 * @param {(item: T) => boolean} test
 * @returns {number} The index of the last item that passes, or -1.
 */
function lastIndex(list, test) {
  for (let i = list.length - 1; i >= 0; i -= 1) if (test(list[i])) return i;
  return -1;
}

/** Largest number of a segment without a limit: beyond, numbers lose precision. */
const LARGEST = Number.MAX_SAFE_INTEGER;

/** @type {Record<string, Omit<Segment, 'token'>>} */
const TOKENS = {
  YYYY: { min: 1000, max: 9999, width: 4, date: true },
  YY: { min: 0, max: 999, width: 0, date: true },
  '0Y': { min: 0, max: 99, width: 2, date: true },
  MM: { min: 1, max: 12, width: 0, date: true },
  '0M': { min: 1, max: 12, width: 2, date: true },
  WW: { min: 1, max: 53, width: 0, date: true },
  '0W': { min: 1, max: 53, width: 2, date: true },
  DD: { min: 1, max: 31, width: 0, date: true },
  '0D': { min: 1, max: 31, width: 2, date: true },
  MAJOR: { min: 0, max: Infinity, width: 0, date: false },
  MINOR: { min: 0, max: Infinity, width: 0, date: false },
  PATCH: { min: 0, max: Infinity, width: 0, date: false },
  MICRO: { min: 0, max: Infinity, width: 0, date: false },
  '#': { min: 0, max: Infinity, width: 0, date: false },
};

const TOKEN = /YYYY|0Y|YY|0M|MM|0W|WW|0D|DD|MAJOR|MINOR|PATCH|MICRO|#/g;
const PRE_ID = /^(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)$/;
const BUILD_ID = /^[0-9A-Za-z-]+$/;

/**
 * @param {string | null | undefined} name - `semver` (default), `calver`, `x.y`, `x.y.z`,
 *   `x.y.z.w`, `decimal`, or a pattern of tokens such as `#.#` or `YY.0M.MICRO`.
 * @param {{ segmentMax?: (number | null)[], precision?: number }} [options]
 * @returns {Format}
 */
export function parseFormat(name, options = {}) {
  const source = String(name ?? '').trim() || 'semver';
  const lower = source.toLowerCase();
  if (lower === 'decimal' || lower === 'number') {
    const precision = Math.max(0, Math.min(10, Math.round(options.precision ?? 1)));
    return { kind: 'decimal', source: 'decimal', segments: [{ token: '#', min: -LARGEST, max: LARGEST, width: 0, date: false }], separators: ['', ''], prerelease: false, precision, calendar: false }; // prettier-ignore
  }
  const pattern = /** @type {Record<string, string>} */ (FORMATS)[lower] ?? source;
  /** @type {Segment[]} */
  const segments = [];
  /** @type {string[]} */
  const separators = [];
  let last = 0;
  for (const m of pattern.matchAll(TOKEN)) {
    separators.push(pattern.slice(last, m.index));
    segments.push({ token: m[0], ...TOKENS[m[0]] });
    last = m.index + m[0].length;
  }
  separators.push(pattern.slice(last));
  // Separators are punctuation; letters would make versions ambiguous.
  if (
    !segments.length ||
    segments.length > 8 ||
    separators.some((s) => /[\dA-Za-z]/.test(s) || s.length > 3) ||
    separators.slice(1, -1).some((s) => !s)
  )
    // prettier-ignore
    return parseFormat('semver', options);
  (options.segmentMax ?? []).forEach((max, i) => {
    if (segments[i] && typeof max === 'number' && Number.isFinite(max) && max >= segments[i].min) segments[i].max = Math.min(max, segments[i].max); // prettier-ignore
  });
  return {
    kind: lower === 'semver' ? 'semver' : 'pattern',
    source: lower in FORMATS ? lower : source,
    segments,
    separators,
    prerelease: lower === 'semver',
    precision: 0,
    calendar: segments.some((s) => s.date),
  };
}

/**
 * @param {string} text
 * @returns {string}
 */
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/**
 * @typedef {{ ok: true, version: Version } | { ok: false, error: 'empty' | 'format' | 'range' | 'zero' | 'width' | 'precision', index?: number }} Parsed
 */

/**
 * @param {string} text
 * @param {Format} format
 * @returns {Parsed}
 */
export function parseVersion(text, format) {
  let value = String(text ?? '').trim();
  if (!value) return { ok: false, error: 'empty' };
  if (format.kind === 'decimal') return parseDecimal(value, format.precision);
  // A leading "v", as in Git tags, is not part of the version.
  if (/^[vV]\d/.test(value) && !/^[vV]/.test(format.separators[0])) value = value.slice(1);
  const body = format.segments.map((_, i) => `${escape(format.separators[i])}(\\d+)`).join('') + escape(format.separators.at(-1) ?? ''); // prettier-ignore
  const extra = format.prerelease ? '(?:-([0-9A-Za-z.-]+))?(?:\\+([0-9A-Za-z.-]+))?' : '';
  const m = new RegExp(`^${body}${extra}$`).exec(value);
  if (!m) return { ok: false, error: 'format' };
  /** @type {number[]} */
  const parts = [];
  for (let i = 0; i < format.segments.length; i += 1) {
    const digits = m[i + 1];
    const segment = format.segments[i];
    if (segment.width ? digits.length !== segment.width : digits.length > 1 && digits[0] === '0') return { ok: false, error: segment.width ? 'width' : 'zero', index: i }; // prettier-ignore
    const n = Number(digits);
    if (!Number.isSafeInteger(n) || n < segment.min || n > segment.max) return { ok: false, error: 'range', index: i }; // prettier-ignore
    parts.push(n);
  }
  const pre = format.prerelease && m[format.segments.length + 1] !== undefined ? m[format.segments.length + 1].split('.') : []; // prettier-ignore
  const build = format.prerelease && m[format.segments.length + 2] !== undefined ? m[format.segments.length + 2].split('.') : []; // prettier-ignore
  if (pre.some((id) => !PRE_ID.test(id)) || build.some((id) => !BUILD_ID.test(id))) return { ok: false, error: 'format' }; // prettier-ignore
  return { ok: true, version: { parts, pre, build } };
}

/**
 * @param {string} text
 * @param {number} precision
 * @returns {Parsed}
 */
function parseDecimal(text, precision) {
  // A comma is a decimal separator in many languages.
  const m = /^([-+]?)(\d+)(?:[.,](\d*))?$/.exec(text.replace(/\s/g, ''));
  if (!m) return { ok: false, error: 'format' };
  const decimals = (m[3] ?? '').replace(/0+$/, '');
  if (decimals.length > precision) return { ok: false, error: 'precision' };
  const units = Number(m[2] + (m[3] ?? '').padEnd(precision, '0').slice(0, precision));
  if (!Number.isSafeInteger(units)) return { ok: false, error: 'range' };
  return { ok: true, version: { parts: [m[1] === '-' && units ? -units : units], pre: [], build: [] } }; // prettier-ignore
}

/**
 * @param {Version} version
 * @param {Format} format
 * @returns {string}
 */
export function formatVersion(version, format) {
  if (format.kind === 'decimal') {
    const units = version.parts[0] ?? 0;
    const digits = String(Math.abs(units)).padStart(format.precision + 1, '0');
    const whole = format.precision ? digits.slice(0, -format.precision) : digits;
    const decimals = format.precision ? `.${digits.slice(-format.precision)}` : '';
    return `${units < 0 ? '-' : ''}${whole}${decimals}`;
  }
  let out = '';
  format.segments.forEach((segment, i) => {
    out += format.separators[i] + String(version.parts[i] ?? segment.min).padStart(segment.width, '0'); // prettier-ignore
  });
  out += format.separators.at(-1) ?? '';
  if (version.pre.length) out += `-${version.pre.join('.')}`;
  if (version.build.length) out += `+${version.build.join('.')}`;
  return out;
}

/**
 * Precedence of two versions, as Semantic Versioning defines it: numbers first, then a
 * pre-release comes before its release, identifiers compared one by one. Build metadata
 * does not count.
 *
 * @param {Version} a
 * @param {Version} b
 * @returns {-1 | 0 | 1}
 */
export function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.parts.length, b.parts.length); i += 1) {
    const d = (a.parts[i] ?? 0) - (b.parts[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1; // prettier-ignore
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i += 1) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) return Number(x) < Number(y) ? -1 : 1;
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Adds `delta` to one segment. A segment past its largest value goes back to its smallest
 * and carries one into the segment before, like an odometer: with `#.#` and 9 as largest,
 * 1.9 + 1 is 2.0, and 2.0 − 1 is 1.9. Without room to carry, the version does not change.
 * Going up resets the segments after (1.4.7 → 1.5.0) unless `reset` is false; going down
 * keeps them. A step drops pre-release and build.
 *
 * @param {Version} version
 * @param {Format} format
 * @param {number} index
 * @param {number} delta
 * @param {{ reset?: boolean }} [options]
 * @returns {Version}
 */
export function stepSegment(version, format, index, delta, options = {}) {
  const segments = format.segments;
  if (!segments[index] || !delta) return version;
  if (format.kind === 'semver' && delta > 0 && options.reset !== false && index < 3)
    return bump(version, /** @type {const} */ (['major', 'minor', 'patch'])[index]);
  const parts = segments.map((s, i) => version.parts[i] ?? s.min);
  let i = index;
  let next = parts[i] + delta;
  for (;;) {
    const s = segments[i];
    if (next > s.max) {
      if (i === 0 || !Number.isFinite(s.max)) return version;
      parts[i] = s.min + (next - s.max - 1);
      if (parts[i] > s.max) parts[i] = s.min;
      i -= 1;
      next = parts[i] + 1;
      continue;
    }
    if (next < s.min) {
      if (i === 0 || !Number.isFinite(s.max)) return version;
      parts[i] = s.max - (s.min - next - 1);
      if (parts[i] < s.min) parts[i] = s.max;
      i -= 1;
      next = parts[i] - 1;
      continue;
    }
    break;
  }
  parts[i] = next;
  if (delta > 0 && options.reset !== false) for (let j = index + 1; j < parts.length; j += 1) parts[j] = segments[j].min; // prettier-ignore
  return { parts, pre: [], build: [] };
}

/** Bumps of Semantic Versioning, as `npm version` names them. */
export const BUMPS = /** @type {const} */ (['major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', 'prerelease', 'release']); // prettier-ignore

/**
 * The next version of a kind, as `npm version` makes it: a pre-release of the next version
 * becomes that version (1.1.0-beta.2 → minor → 1.1.0).
 *
 * @param {Version} version
 * @param {typeof BUMPS[number]} kind
 * @param {string} [preid] - Pre-release name, such as `beta`.
 * @returns {Version}
 */
export function bump(version, kind, preid = '') {
  const [major = 0, minor = 0, patch = 0] = version.parts;
  const pre = version.pre;
  const id = preid && PRE_ID.test(preid) && !/^\d+$/.test(preid) ? preid : '';
  const start = id ? [id, '0'] : ['0'];
  /** @param {number[]} parts @param {string[]} [p] @returns {Version} */
  const make = (parts, p = []) => ({ parts, pre: p, build: [] });
  switch (kind) {
    case 'major':
      return make(pre.length && minor === 0 && patch === 0 ? [major, 0, 0] : [major + 1, 0, 0]);
    case 'minor':
      return make(pre.length && patch === 0 ? [major, minor, 0] : [major, minor + 1, 0]);
    case 'patch':
      return make(pre.length ? [major, minor, patch] : [major, minor, patch + 1]);
    case 'premajor':
      return make([major + 1, 0, 0], start);
    case 'preminor':
      return make([major, minor + 1, 0], start);
    case 'prepatch':
      return make([major, minor, patch + 1], start);
    case 'prerelease': {
      if (!pre.length) return make([major, minor, patch + 1], start);
      if (id && pre[0] !== id) return make([major, minor, patch], start);
      const next = [...pre];
      const at = lastIndex(next, (p) => /^\d+$/.test(p));
      if (at >= 0) next[at] = String(Number(next[at]) + 1);
      else next.push('0');
      return make([major, minor, patch], next);
    }
    default:
      return make([major, minor, patch]);
  }
}

/**
 * A calendar version for a date: date segments from the date (UTC); the other segments
 * count up when the date is the same as the version's, and start again otherwise.
 *
 * @param {Version | null} version
 * @param {Format} format
 * @param {Date} date
 * @returns {Version}
 */
export function today(version, format, date) {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const day = Math.floor((date.getTime() - start) / 86400000);
  const week = Math.min(53, Math.floor((day + new Date(start).getUTCDay()) / 7) + 1);
  /** @type {Record<string, number>} */
  const values = { YYYY: year, YY: year - 2000, '0Y': (year - 2000) % 100, MM: date.getUTCMonth() + 1, '0M': date.getUTCMonth() + 1, WW: week, '0W': week, DD: date.getUTCDate(), '0D': date.getUTCDate() }; // prettier-ignore
  const parts = format.segments.map((s) => (s.date ? values[s.token] : s.min));
  const same = version && format.segments.every((s, i) => !s.date || version.parts[i] === parts[i]);
  if (same) {
    const counter = lastIndex(format.segments, (s) => !s.date);
    if (counter >= 0) {
      format.segments.forEach((s, i) => {
        if (!s.date && i < counter) parts[i] = version.parts[i];
      });
      parts[counter] = Math.min(format.segments[counter].max, (version.parts[counter] ?? 0) + 1);
    }
  }
  return { parts, pre: [], build: [] };
}

/**
 * Steps a decimal by `steps` times its step, kept between `min` and `max`.
 *
 * @param {Version} version
 * @param {number} steps
 * @param {number} stepUnits - The step, in units of 10^-precision.
 * @param {{ min?: number | null, max?: number | null }} [limits] - In units too.
 * @returns {Version}
 */
export function stepDecimal(version, steps, stepUnits, limits = {}) {
  let units = (version.parts[0] ?? 0) + steps * stepUnits;
  if (typeof limits.min === 'number') units = Math.max(limits.min, units);
  if (typeof limits.max === 'number') units = Math.min(limits.max, units);
  return { parts: [units], pre: [], build: [] };
}

/**
 * @typedef {'major' | 'minor' | 'patch' | 'segment' | 'date' | 'prerelease' | 'build' | 'same' | 'downgrade' | 'up'} Change
 */

/**
 * What changed from one version to the next.
 *
 * @param {Version} from
 * @param {Version} to
 * @param {Format} format
 * @returns {{ change: Change, index: number }} `index`: the first segment that changed.
 */
export function changeOf(from, to, format) {
  const order = compareVersions(to, from);
  const index = to.parts.findIndex((p, i) => p !== from.parts[i]);
  if (order < 0) return { change: 'downgrade', index };
  if (order === 0) return { change: from.build.join('.') === to.build.join('.') ? 'same' : 'build', index: -1 }; // prettier-ignore
  if (format.kind === 'decimal') return { change: 'up', index };
  if (index < 0) return { change: 'prerelease', index };
  if (to.pre.length) return { change: 'prerelease', index };
  if (format.segments[index].date) return { change: 'date', index };
  if (format.kind === 'semver') return { change: /** @type {Change} */ (['major', 'minor', 'patch'][index]), index }; // prettier-ignore
  return { change: 'segment', index };
}

/**
 * Where each segment is in the text, for the arrow keys of a text field.
 *
 * @param {string} text
 * @param {Format} format
 * @returns {{ start: number, end: number }[] | null}
 */
export function segmentRanges(text, format) {
  if (format.kind === 'decimal') return null;
  /** @type {{ start: number, end: number }[]} */
  const ranges = [];
  let at = /^[vV]\d/.test(text) && !/^[vV]/.test(format.separators[0]) ? 1 : 0;
  for (let i = 0; i < format.segments.length; i += 1) {
    const sep = format.separators[i];
    if (!text.startsWith(sep, at)) return null;
    at += sep.length;
    const m = /^\d+/.exec(text.slice(at));
    if (!m) return null;
    ranges.push({ start: at, end: at + m[0].length });
    at += m[0].length;
  }
  return ranges;
}

/**
 * Keeps the characters a version of this format may have, in their places: letters of a
 * semantic version only after `-` or `+` (and a leading `v`).
 *
 * @param {string} text
 * @param {Format} format
 * @returns {string}
 */
export function cleanText(text, format) {
  let out = '';
  for (const char of text) {
    if (!allowedChar(char, format)) continue;
    if (format.prerelease && /[A-Za-z]/.test(char) && !/[-+]/.test(out) && !(/[vV]/.test(char) && !out)) continue; // prettier-ignore
    out += char;
  }
  return out;
}

/**
 * @param {string} char
 * @param {Format} format
 * @returns {boolean} Whether the character may be typed in a version of this format.
 */
export function allowedChar(char, format) {
  if (/\d/.test(char)) return true;
  if (format.kind === 'decimal') return /[.,+-]/.test(char);
  if (format.prerelease && /[0-9A-Za-z.+-]/.test(char)) return true;
  return /[vV]/.test(char) || format.separators.some((s) => s.includes(char));
}
