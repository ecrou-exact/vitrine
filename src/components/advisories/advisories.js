// @ts-check
/**
 * Security advisories: read from OSV (osv.dev, osv-scanner), `npm audit --json`, GitHub
 * security advisories and Dependabot alerts, into one shape, with CVSS 3 scores computed from
 * their vectors.
 *
 * @module components/advisories/advisories
 */
import { MAX_ITEMS, isObject, safeLink, text, toNumber, toTime } from '../../core/data.js';

/** @typedef {'critical' | 'high' | 'moderate' | 'low' | 'unknown'} Severity */

/**
 * @typedef {object} Affected
 * @property {string} name
 * @property {string} ecosystem
 * @property {string} version - The version installed, when known.
 * @property {string} range - The versions affected, as written.
 * @property {string} fixed - The first version fixed, when there is one.
 */

/**
 * @typedef {object} Advisory
 * @property {string} id
 * @property {string[]} aliases - CVE, GHSA… ids.
 * @property {string} title
 * @property {string} details
 * @property {Severity} severity
 * @property {number | null} score - CVSS base score.
 * @property {string} vector - CVSS vector.
 * @property {Affected[]} affected
 * @property {string[]} cwes
 * @property {string | null} url
 * @property {number | null} published
 */

export class AdvisoryError extends Error {}

export const SEVERITIES = /** @type {const} */ (['critical', 'high', 'moderate', 'low', 'unknown']); // prettier-ignore

// ---------------------------------------------------------------- CVSS 3

const METRICS = /** @type {Record<string, Record<string, number>>} */ ({
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  UI: { N: 0.85, R: 0.62 },
  C: { H: 0.56, L: 0.22, N: 0 },
  I: { H: 0.56, L: 0.22, N: 0 },
  A: { H: 0.56, L: 0.22, N: 0 },
});

/**
 * Reads a CVSS vector into its metrics.
 *
 * @param {string} vector
 * @returns {Record<string, string>}
 */
export function cvssMetrics(vector) {
  /** @type {Record<string, string>} */
  const metrics = {};
  for (const part of vector.split('/')) {
    const [key, value] = part.split(':');
    if (key && value && !key.startsWith('CVSS')) metrics[key] = value;
  }
  return metrics;
}

/**
 * The base score of a CVSS 3.0 or 3.1 vector, as the specification computes it.
 *
 * @param {string} vector - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`.
 * @returns {number | null} `null` for another version or an incomplete vector.
 */
export function cvss3Score(vector) {
  if (!/^CVSS:3\.[01]\//.test(vector)) return null;
  const m = cvssMetrics(vector);
  const changed = m.S === 'C';
  const pr = { N: 0.85, L: changed ? 0.68 : 0.62, H: changed ? 0.5 : 0.27 }[m.PR];
  const [av, ac, ui, c, i, a] = ['AV', 'AC', 'UI', 'C', 'I', 'A'].map((k) => METRICS[k][m[k]]);
  if ([av, ac, ui, c, i, a, pr].some((v) => v === undefined) || !['U', 'C'].includes(m.S)) return null; // prettier-ignore
  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15 : 6.42 * iss;
  if (impact <= 0) return 0;
  const exploitability = 8.22 * av * ac * /** @type {number} */ (pr) * ui;
  return roundUp(Math.min((changed ? 1.08 : 1) * (impact + exploitability), 10));
}

/**
 * Rounds up to one decimal as CVSS 3.1 does, without floating point surprises.
 *
 * @param {number} value
 * @returns {number}
 */
function roundUp(value) {
  const n = Math.round(value * 100000);
  return n % 10000 === 0 ? n / 100000 : (Math.floor(n / 10000) + 1) / 10;
}

/**
 * @param {number | null} score
 * @returns {Severity}
 */
export function severityOf(score) {
  if (score === null) return 'unknown';
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'moderate';
  return score > 0 ? 'low' : 'unknown';
}

/**
 * @param {unknown} value - `HIGH`, `moderate`, `medium`, `important`…
 * @returns {Severity | null}
 */
function severityWord(value) {
  const word = text(value, 20).toLowerCase();
  if (word === 'critical') return 'critical';
  if (word === 'high' || word === 'important') return 'high';
  if (word === 'moderate' || word === 'medium') return 'moderate';
  if (word === 'low' || word === 'info' || word === 'informational') return 'low';
  return null;
}

// ---------------------------------------------------------------- reading

/**
 * Score and vector from the `severity` list of OSV, or `cvss` of GitHub and npm.
 *
 * @param {Record<string, any>} item
 * @returns {{ score: number | null, vector: string }}
 */
function scoreOf(item) {
  const list = Array.isArray(item.severity) ? item.severity.filter(isObject) : [];
  const cvss = isObject(item.cvss) ? item.cvss : isObject(item.cvss_severities?.cvss_v3) ? item.cvss_severities.cvss_v3 : null; // prettier-ignore
  const vector = text(cvss?.vector_string ?? cvss?.vectorString, 200) || text(list.find((s) => /^CVSS_V3/.test(text(s.type, 20)))?.score, 200) || text(list[0]?.score, 200); // prettier-ignore
  const given = toNumber(cvss?.score);
  return { score: given !== null && given > 0 ? given : cvss3Score(vector), vector };
}

/**
 * The versions affected and the first fixed one, from OSV ranges.
 *
 * @param {Record<string, any>} affected
 * @returns {{ range: string, fixed: string }}
 */
function osvRange(affected) {
  /** @type {string[]} */
  const parts = [];
  let fixed = '';
  for (const range of (Array.isArray(affected.ranges) ? affected.ranges : []).filter(isObject)) {
    if (range.type === 'GIT') continue;
    let introduced = '';
    for (const event of (Array.isArray(range.events) ? range.events : []).filter(isObject)) {
      if (event.introduced !== undefined) introduced = text(event.introduced, 60);
      const end = text(event.fixed, 60) || text(event.last_affected, 60);
      if (!end && !event.limit) continue;
      parts.push(`${introduced && introduced !== '0' ? `>=${introduced} ` : ''}${event.fixed ? '<' : '<='}${end}`); // prettier-ignore
      if (event.fixed && !fixed) fixed = text(event.fixed, 60);
      introduced = '';
    }
    if (introduced) parts.push(introduced === '0' ? '*' : `>=${introduced}`);
  }
  return { range: parts.join(' || '), fixed };
}

/**
 * @param {Record<string, any>} osv
 * @param {{ name?: string, version?: string, ecosystem?: string }} [installed]
 * @returns {Advisory | null}
 */
function readOsv(osv, installed = {}) {
  const id = text(osv.id, 100);
  if (!id) return null;
  const { score, vector } = scoreOf(osv);
  const word = severityWord(osv.database_specific?.severity) ?? severityWord((Array.isArray(osv.affected) ? osv.affected : []).find((a) => isObject(a) && a.ecosystem_specific?.severity)?.ecosystem_specific?.severity); // prettier-ignore
  /** @type {Affected[]} */
  const affected = (Array.isArray(osv.affected) ? osv.affected : [])
    .filter(isObject)
    .slice(0, 50)
    .map((a) => {
      const pkg = isObject(a.package) ? a.package : {};
      return { name: text(pkg.name, 200), ecosystem: text(pkg.ecosystem, 60), version: '', ...osvRange(a) }; // prettier-ignore
    });
  // osv-scanner gives the package installed: keep its entry, with its version.
  const mine = installed.name ? affected.filter((a) => a.name === installed.name) : affected;
  const list = (mine.length ? mine : affected).map((a) => ({
    ...a,
    version: installed.version ?? '',
  }));
  const references = (Array.isArray(osv.references) ? osv.references : []).filter(isObject);
  const advisory = references.find((r) => r.type === 'ADVISORY') ?? references.find((r) => r.type === 'WEB') ?? references[0]; // prettier-ignore
  return {
    id,
    aliases: (Array.isArray(osv.aliases) ? osv.aliases : []).map((a) => text(a, 100)).filter(Boolean).slice(0, 20), // prettier-ignore
    title: text(osv.summary, 500) || id,
    details: text(osv.details, 20000),
    severity: word ?? severityOf(score),
    score,
    vector,
    affected: list,
    cwes: cwesOf(osv.database_specific?.cwe_ids),
    url:
      safeLink(advisory?.url) ??
      safeLink(`https://osv.dev/vulnerability/${encodeURIComponent(id)}`),
    published: toTime(osv.published),
  };
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function cwesOf(value) {
  if (!Array.isArray(value)) return [];
  return value.map((c) => (isObject(c) ? text(c.cwe_id, 20) : text(c, 20))).filter((c) => /^CWE-\d+$/.test(c)).slice(0, 10); // prettier-ignore
}

/**
 * A GitHub security advisory (`/advisories`, a repository's advisories) or a Dependabot alert.
 *
 * @param {Record<string, any>} item
 * @returns {Advisory | null}
 */
function readGithub(item) {
  const alert = isObject(item.security_advisory) ? item : null;
  const adv = alert ? item.security_advisory : item;
  const id = text(adv.ghsa_id, 100);
  if (!id) return null;
  const { score, vector } = scoreOf(adv);
  const vulnerable = alert && isObject(alert.security_vulnerability) ? [alert.security_vulnerability] : Array.isArray(adv.vulnerabilities) ? adv.vulnerabilities : []; // prettier-ignore
  /** @type {Affected[]} */
  const affected = vulnerable
    .filter(isObject)
    .slice(0, 50)
    .map((/** @type {Record<string, any>} */ v) => {
      const pkg = isObject(v.package) ? v.package : {};
      const first = v.first_patched_version;
      return {
        name: text(pkg.name, 200),
        ecosystem: text(pkg.ecosystem, 60),
        version: '',
        range: text(v.vulnerable_version_range, 200),
        fixed: isObject(first) ? text(first.identifier, 60) : text(first ?? v.patched_versions, 60),
      };
    });
  const cve = text(adv.cve_id, 40);
  const identifiers = (Array.isArray(adv.identifiers) ? adv.identifiers : []).filter(isObject).map((/** @type {Record<string, any>} */ i) => text(i.value, 100)); // prettier-ignore
  return {
    id,
    aliases: [...new Set([cve, ...identifiers].filter((a) => a && a !== id))],
    title: text(adv.summary, 500) || id,
    details: text(adv.description, 20000),
    severity: severityWord(alert?.security_vulnerability?.severity ?? adv.severity) ?? severityOf(score), // prettier-ignore
    score,
    vector,
    affected,
    cwes: cwesOf(adv.cwes),
    url: safeLink(alert?.html_url ?? adv.html_url),
    published: toTime(adv.published_at),
  };
}

/**
 * `npm audit --json` (npm 7 and later): one advisory per source, with the packages it reaches.
 *
 * @param {Record<string, any>} vulnerabilities
 * @returns {Advisory[]}
 */
function readNpmAudit(vulnerabilities) {
  /** @type {Map<string, Advisory>} */
  const found = new Map();
  for (const entry of Object.values(vulnerabilities).filter(isObject)) {
    const fix = entry.fixAvailable;
    for (const via of (Array.isArray(entry.via) ? entry.via : []).filter(isObject)) {
      const url = safeLink(via.url);
      const id = text(url?.match(/GHSA-[\w-]+$/i)?.[0] ?? via.source, 100) || `npm-${text(via.source, 40)}`; // prettier-ignore
      const { score, vector } = scoreOf(via);
      const advisory = found.get(id) ?? {
        id,
        aliases: [],
        title: text(via.title, 500) || id,
        details: '',
        severity: severityWord(via.severity) ?? severityOf(score),
        score,
        vector,
        affected: [],
        cwes: cwesOf(via.cwe),
        url,
        published: null,
      };
      const name = text(via.name ?? via.dependency ?? entry.name, 200);
      if (!advisory.affected.some((a) => a.name === name))
        advisory.affected.push({ name, ecosystem: 'npm', version: '', range: text(via.range ?? entry.range, 200), fixed: isObject(fix) && fix.name === name ? text(fix.version, 60) : '' }); // prettier-ignore
      found.set(id, advisory);
    }
  }
  return [...found.values()];
}

/**
 * Reads advisories: OSV records (a list, `{ vulns }` of osv.dev, or osv-scanner `results`),
 * `npm audit --json`, GitHub advisories or Dependabot alerts.
 *
 * @param {unknown} data
 * @returns {Advisory[]}
 */
export function readAdvisories(data) {
  /** @type {Advisory[]} */
  const out = [];
  if (isObject(data) && isObject(data.vulnerabilities) && !Array.isArray(data.vulnerabilities))
    out.push(...readNpmAudit(data.vulnerabilities)); // prettier-ignore
  else if (isObject(data) && Array.isArray(data.results)) {
    // osv-scanner: results → packages → vulnerabilities.
    for (const result of data.results.filter(isObject))
      for (const p of (Array.isArray(result.packages) ? result.packages : []).filter(isObject)) {
        const pkg = isObject(p.package) ? p.package : {};
        for (const v of (Array.isArray(p.vulnerabilities) ? p.vulnerabilities : []).filter(
          isObject,
        )) {
          const advisory = readOsv(v, {
            name: text(pkg.name, 200),
            version: text(pkg.version, 60),
          });
          if (advisory) out.push(advisory);
        }
      }
  } else {
    const list = Array.isArray(data) ? data : isObject(data) ? [data.vulns, data.advisories, data.alerts, data.items].find(Array.isArray) ?? (data.id || data.ghsa_id ? [data] : null) : null; // prettier-ignore
    if (!list) throw new AdvisoryError('shape');
    for (const item of list.filter(isObject)) {
      const advisory = item.ghsa_id || isObject(item.security_advisory) ? readGithub(item) : readOsv(item); // prettier-ignore
      if (advisory) out.push(advisory);
    }
  }
  // One entry per advisory: the same one may reach several packages.
  /** @type {Map<string, Advisory>} */
  const merged = new Map();
  for (const a of out.slice(0, MAX_ITEMS)) {
    const same = merged.get(a.id);
    if (same)
      same.affected.push(...a.affected.filter((x) => !same.affected.some((y) => y.name === x.name && y.version === x.version))); // prettier-ignore
    else merged.set(a.id, a);
  }
  return [...merged.values()].sort(
    (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || (b.score ?? 0) - (a.score ?? 0), // prettier-ignore
  );
}

/** Words for the metrics of a CVSS 3 vector. */
export const VECTOR_WORDS = /** @type {Record<string, Record<string, string>>} */ ({
  AV: { N: 'network', A: 'adjacent', L: 'local', P: 'physical' },
  AC: { L: 'low', H: 'high' },
  PR: { N: 'none', L: 'low', H: 'high' },
  UI: { N: 'none', R: 'required' },
  S: { U: 'unchanged', C: 'changed' },
});

/**
 * @param {Advisory} advisory
 * @returns {string} Its id, then the first alias (`GHSA-… / CVE-…`).
 */
export function idLine(advisory) {
  return [advisory.id, ...advisory.aliases.filter((a) => a !== advisory.id).slice(0, 2)].join(' · '); // prettier-ignore
}
