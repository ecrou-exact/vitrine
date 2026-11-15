// @ts-check
/**
 * Licenses of dependencies: read from a CycloneDX or SPDX SBOM, `license-checker`,
 * `pip-licenses` or a plain list; each license expression sorted into permissive, weak
 * copyleft, strong copyleft, other or unknown, and checked against a list of allowed licenses.
 *
 * @module components/licenses/licenses
 */
import { MAX_ITEMS, firstText, isObject, safeLink, text } from '../../core/data.js';

/** @typedef {'permissive' | 'weak' | 'strong' | 'other' | 'unknown'} Category */

/**
 * @typedef {object} Dependency
 * @property {string} name
 * @property {string} version
 * @property {string} license - The license expression, as written (cleaned).
 * @property {Category} category
 * @property {string[]} ids - The licenses named in the expression.
 * @property {string | null} url
 * @property {boolean} guessed - license-checker guessed it from a file (`MIT*`).
 */

export class LicenseError extends Error {}

/** From the most permissive to the least known. */
export const CATEGORIES = /** @type {const} */ (['permissive', 'weak', 'strong', 'other', 'unknown']); // prettier-ignore

/** Common names that are not SPDX ids. */
const ALIASES = /** @type {Record<string, string>} */ ({
  'the mit license': 'MIT', 'mit license': 'MIT', expat: 'MIT', 'mit/x11': 'MIT',
  'apache 2.0': 'Apache-2.0', 'apache-2': 'Apache-2.0', apache2: 'Apache-2.0', 'apache 2': 'Apache-2.0',
  'apache license 2.0': 'Apache-2.0', 'apache license, version 2.0': 'Apache-2.0', 'apache software license': 'Apache-2.0', // prettier-ignore
  'isc license': 'ISC', 'bsd license': 'BSD', 'new bsd license': 'BSD-3-Clause', 'simplified bsd': 'BSD-2-Clause', // prettier-ignore
  gplv2: 'GPL-2.0', gpl2: 'GPL-2.0', 'gpl v2': 'GPL-2.0', gplv3: 'GPL-3.0', gpl3: 'GPL-3.0', 'gpl v3': 'GPL-3.0', // prettier-ignore
  lgplv2: 'LGPL-2.1', lgplv3: 'LGPL-3.0', 'mpl 2.0': 'MPL-2.0', 'mpl-2': 'MPL-2.0', agplv3: 'AGPL-3.0', // prettier-ignore
  'python software foundation license': 'PSF-2.0', psf: 'PSF-2.0', 'public domain': 'Public-Domain', // prettier-ignore
  'eclipse public license 2.0': 'EPL-2.0', 'mozilla public license 2.0 (mpl 2.0)': 'MPL-2.0',
}); // prettier-ignore

const UNKNOWN = /^(?:unknown|noassertion|none|unlicensed|custom|see license in .*|see license.*|other\/proprietary license|proprietary|)$/i; // prettier-ignore

/**
 * @param {string} id - An SPDX id (or a name).
 * @returns {Category}
 */
export function categoryOf(id) {
  const name = id.trim();
  if (UNKNOWN.test(name)) return 'unknown';
  if (/^(?:A?GPL|SSPL|OSL|EUPL|CPAL|RPL|Sleepycat|QPL)/i.test(name)) return 'strong';
  if (/^(?:LGPL|MPL|EPL|CDDL|CPL|MS-RL|CC-BY-SA|Artistic|OFL|EUDatagrid|IPL|SPL)/i.test(name)) return 'weak'; // prettier-ignore
  if (/^(?:MIT|ISC|BSD|Apache|0BSD|Unlicense|CC0|Zlib|BSL-1\.0|Python|PSF|BlueOak|WTFPL|X11|CC-BY-\d|Public-Domain|Unicode|Ruby|PostgreSQL|NCSA|curl|Beerware|AFL|MS-PL|Libpng|bzip2|HPND|W3C|UPL|JSON)/i.test(name)) return 'permissive'; // prettier-ignore
  // Long names, as package metadata often gives them.
  if (/affero|general public license|(?:^|[^a-z])gpl(?:[^a-z]|$)/i.test(name) && !/lesser|library/i.test(name)) return 'strong'; // prettier-ignore
  if (/lesser|library general|mozilla|eclipse|common development/i.test(name)) return 'weak';
  if (/(?:^|[^a-z])(?:mit|bsd|apache|isc|zlib)(?:[^a-z]|$)|public domain/i.test(name)) return 'permissive'; // prettier-ignore
  return 'other';
}

/**
 * An SPDX id for a name that may not be one.
 *
 * @param {string} name
 * @returns {string}
 */
export function normalize(name) {
  const clean = name.trim().replace(/\*$/, '').trim();
  return ALIASES[clean.toLowerCase()] ?? clean;
}

/**
 * Evaluates an SPDX expression: `OR` keeps the most permissive choice, `AND` the least,
 * `WITH` an exception (a GPL with the Classpath or GCC exception is a weak copyleft).
 *
 * @param {string} expression
 * @param {(id: string) => number} rank - Lower is better.
 * @returns {{ rank: number, ids: string[] }}
 */
export function evaluate(expression, rank) {
  const tokens = expression.replace(/[()]/g, ' $& ').split(/\s+/).filter(Boolean);
  let at = 0;
  /** @type {string[]} */
  const ids = [];
  /** @returns {number} */
  const primary = () => {
    const token = tokens[at++] ?? '';
    if (token === '(') {
      const value = or();
      if (tokens[at] === ')') at += 1;
      return value;
    }
    // A license name may have spaces ("Apache License 2.0"): read up to an operator.
    const words = [token];
    while (at < tokens.length && !/^(?:AND|OR|WITH|\(|\))$/i.test(tokens[at])) words.push(tokens[at++]); // prettier-ignore
    const id = normalize(words.join(' '));
    ids.push(id);
    let value = rank(id);
    if (/^WITH$/i.test(tokens[at] ?? '')) {
      const exception = tokens[at + 1] ?? '';
      at += 2;
      if (/classpath|gcc|llvm|autoconf|bison|font|openjdk/i.test(exception)) value = Math.min(value, rank('LGPL-2.1')); // prettier-ignore
    }
    return value;
  };
  /** @returns {number} */
  const and = () => {
    let value = primary();
    while (/^AND$/i.test(tokens[at] ?? '')) {
      at += 1;
      value = Math.max(value, primary());
    }
    return value;
  };
  /** @returns {number} */
  const or = () => {
    let value = and();
    while (/^OR$/i.test(tokens[at] ?? '')) {
      at += 1;
      value = Math.min(value, and());
    }
    return value;
  };
  if (!tokens.length) return { rank: rank(''), ids: [] };
  return { rank: or(), ids: [...new Set(ids)] };
}

/** @param {string} id */
const categoryRank = (id) => CATEGORIES.indexOf(categoryOf(id));

/**
 * @param {string} name
 * @param {string} version
 * @param {string} license
 * @param {string | null} url
 * @returns {Dependency}
 */
function dependency(name, version, license, url) {
  const guessed = /\*\)?$/.test(license.trim());
  let clean = license.replace(/\*/g, '').trim();
  // Without an operator it is one name, even with parentheses: "Mozilla Public License 2.0 (MPL 2.0)".
  if (clean && !/\s(?:AND|OR|WITH)\s/i.test(clean))
    clean = normalize(clean.replace(/^\((.*)\)$/, '$1'));
  const { rank, ids } = /\s(?:AND|OR|WITH)\s/i.test(clean) ? evaluate(clean, categoryRank) : { rank: categoryRank(clean), ids: clean ? [clean] : [] }; // prettier-ignore
  return { name, version, license: clean || 'UNKNOWN', category: CATEGORIES[rank] ?? 'unknown', ids, url, guessed }; // prettier-ignore
}

/**
 * A license field: a string, a list (one of them applies), or `{ type }` of old package.json.
 *
 * @param {unknown} value
 * @param {string} join
 * @returns {string}
 */
function licenseText(value, join = ' OR ') {
  if (Array.isArray(value)) {
    const parts = value.map((v) => licenseText(v, join)).filter(Boolean);
    return parts.length > 1 ? parts.map((p) => (/\s/.test(p) ? `(${p})` : p)).join(join) : (parts[0] ?? ''); // prettier-ignore
  }
  if (isObject(value)) {
    if (isObject(value.license)) return text(value.license.id, 100) || text(value.license.name, 100); // prettier-ignore
    return text(value.expression, 300) || text(value.type, 100) || text(value.id, 100) || text(value.name, 100); // prettier-ignore
  }
  // pip-licenses joins several classifiers with "; ".
  return text(value, 300)
    .split(/\s*;\s*/)
    .filter(Boolean)
    .join(' OR ');
}

/**
 * @param {Record<string, any>[]} components
 * @param {Dependency[]} out
 * @param {number} depth
 */
function readCycloneDx(components, out, depth = 0) {
  for (const c of components.filter(isObject)) {
    if (out.length >= MAX_ITEMS) return;
    const group = text(c.group, 200);
    const name = text(c.name, 200);
    if (name) {
      const refs = (Array.isArray(c.externalReferences) ? c.externalReferences : []).filter(
        isObject,
      );
      const ref = refs.find((r) => r.type === 'website') ?? refs.find((r) => r.type === 'vcs');
      // Several license entries all apply.
      out.push(dependency(group ? `${group}/${name}` : name, text(c.version, 60), licenseText(c.licenses, ' AND '), safeLink(ref?.url))); // prettier-ignore
    }
    if (Array.isArray(c.components) && depth < 4) readCycloneDx(c.components, out, depth + 1);
  }
}

/**
 * Reads dependencies and their licenses.
 *
 * @param {unknown} data
 * @returns {Dependency[]}
 */
export function readLicenses(data) {
  /** @type {Dependency[]} */
  const out = [];
  if (isObject(data) && (data.bomFormat === 'CycloneDX' || Array.isArray(data.components))) {
    readCycloneDx(Array.isArray(data.components) ? data.components : [], out);
  } else if (isObject(data) && Array.isArray(data.packages) && (data.spdxVersion || data.SPDXID)) {
    for (const p of data.packages.filter(isObject).slice(0, MAX_ITEMS)) {
      const concluded = text(p.licenseConcluded, 300);
      const license = concluded && !/^NOASSERTION$/i.test(concluded) ? concluded : text(p.licenseDeclared, 300); // prettier-ignore
      out.push(dependency(text(p.name, 200), text(p.versionInfo, 60), license, safeLink(p.homepage) ?? safeLink(p.downloadLocation))); // prettier-ignore
    }
  } else if (
    isObject(data) &&
    !Array.isArray(data) &&
    Object.values(data).some((v) => isObject(v) && 'licenses' in v)
  ) {
    // prettier-ignore
    // license-checker: { "name@version": { licenses, repository, url } }.
    for (const [key, v] of Object.entries(data).slice(0, MAX_ITEMS)) {
      if (!isObject(v)) continue;
      const at = key.lastIndexOf('@');
      const name = at > 0 ? key.slice(0, at) : key;
      out.push(dependency(name.slice(0, 200), at > 0 ? key.slice(at + 1, at + 61) : '', licenseText(v.licenses), safeLink(v.repository) ?? safeLink(v.url))); // prettier-ignore
    }
  } else {
    const list = Array.isArray(data) ? data : isObject(data) ? [data.dependencies, data.packages, data.items].find(Array.isArray) : null; // prettier-ignore
    if (!list) throw new LicenseError('shape');
    for (const item of list.filter(isObject).slice(0, MAX_ITEMS)) {
      const name = firstText(item, ['name', 'Name', 'package', 'module'], 200);
      if (!name) continue;
      const license = licenseText(item.license ?? item.License ?? item.licenses ?? item.License_Expression ?? item.licence); // prettier-ignore
      out.push(dependency(name, firstText(item, ['version', 'Version'], 60), license, safeLink(item.url ?? item.URL ?? item.homepage ?? item.repository))); // prettier-ignore
    }
  }
  return out;
}

/**
 * Whether a dependency's license is allowed: an `OR` needs one allowed choice, an `AND` all.
 * Allowed entries are SPDX ids (`MIT`, `Apache-2.0`) or categories (`permissive`).
 *
 * @param {Dependency} dep
 * @param {string[]} allowed
 * @returns {boolean}
 */
export function isAllowed(dep, allowed) {
  if (!allowed.length) return true;
  const set = new Set(allowed.map((a) => normalize(a).toLowerCase()));
  const ok = (/** @type {string} */ id) => set.has(id.toLowerCase()) || set.has(categoryOf(id)) || set.has(id.replace(/-(?:only|or-later)$|\+$/i, '').toLowerCase()); // prettier-ignore
  return evaluate(dep.license, (id) => (ok(id) ? 0 : 1)).rank === 0;
}

/**
 * Dependencies grouped by license expression, the most used first.
 *
 * @param {Dependency[]} deps
 * @returns {{ license: string, category: Category, deps: Dependency[] }[]}
 */
export function byLicense(deps) {
  /** @type {Map<string, { license: string, category: Category, deps: Dependency[] }>} */
  const groups = new Map();
  for (const dep of deps) {
    const group = groups.get(dep.license) ?? { license: dep.license, category: dep.category, deps: [] }; // prettier-ignore
    group.deps.push(dep);
    groups.set(dep.license, group);
  }
  return [...groups.values()].sort((a, b) => b.deps.length - a.deps.length || a.license.localeCompare(b.license)); // prettier-ignore
}
