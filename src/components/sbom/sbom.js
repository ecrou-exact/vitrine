// @ts-check
/**
 * Reads a software bill of materials: CycloneDX JSON (1.2 to 1.6) or SPDX JSON (2.2, 2.3).
 * Components with their version, package URL, license and scope; the dependency graph from
 * the root (direct and transitive, depth, the path that brings each component in); and the
 * vulnerabilities of a CycloneDX VEX or VDR with the components they affect.
 *
 * @module components/sbom/sbom
 */
import { isObject, safeLink, text } from '../../core/data.js';
import { CATEGORIES, categoryOf, evaluate } from '../licenses/licenses.js';

/** Most components read. */
export const MAX_COMPONENTS = 10000;
/** Most vulnerabilities read. */
export const MAX_VULNS = 2000;

export const SEVERITIES = /** @type {const} */ (['critical', 'high', 'medium', 'low', 'info', 'none', 'unknown']); // prettier-ignore

/**
 * @typedef {import('../licenses/licenses.js').Category} Category
 * @typedef {typeof SEVERITIES[number]} Severity
 * @typedef {object} Component
 * @property {string} ref - bom-ref or SPDXID (or a made-up key).
 * @property {string} name - With its group (`@scope/name`, `org.group:name`).
 * @property {string} version
 * @property {string} type - `library`, `application`, `framework`, `container`…
 * @property {string} purl
 * @property {string} ecosystem - Type of the package URL: `npm`, `pypi`, `maven`…
 * @property {string} license - Expression as written.
 * @property {Category} category
 * @property {string} scope - `required`, `optional`, `excluded` or empty.
 * @property {string} supplier
 * @property {string[]} hashes - `SHA-256:…`.
 * @property {number} depth - 0 for the root, 1 for direct dependencies, -1 when unreachable.
 * @property {string[]} path - Refs from the root to it (the shortest).
 * @property {string[]} vulns - Ids of the vulnerabilities that affect it.
 * @typedef {object} Vulnerability
 * @property {string} id
 * @property {string} source
 * @property {string | null} url
 * @property {Severity} severity
 * @property {number | null} score
 * @property {string} method - `CVSSv31`, `CVSSv4`, `OWASP`…
 * @property {string} vector
 * @property {string} description
 * @property {string} recommendation
 * @property {string} state - VEX analysis: `exploitable`, `not_affected`, `resolved`…
 * @property {string} justification
 * @property {string[]} cwes
 * @property {string[]} affects - Refs.
 * @typedef {object} Sbom
 * @property {"CycloneDX" | "SPDX"} format
 * @property {string} spec - Version of the specification.
 * @property {string} name - Name of the document or of the root component.
 * @property {string} created
 * @property {string[]} tools
 * @property {string[]} roots - Refs of the root components.
 * @property {Map<string, Component>} components
 * @property {Map<string, string[]>} edges - Ref → refs it depends on.
 * @property {Vulnerability[]} vulns
 * @property {boolean} capped
 * @property {boolean} graph - The document has dependency information.
 * @typedef {{ ok: true, sbom: Sbom } | { ok: false, error: "empty" | "json" | "format", detail?: string }} ParseResult
 */

/**
 * @param {string} expression
 * @returns {Category}
 */
export function licenseCategory(expression) {
  if (!expression) return 'unknown';
  return CATEGORIES[evaluate(expression, (id) => CATEGORIES.indexOf(categoryOf(id))).rank] ?? 'unknown'; // prettier-ignore
}

/**
 * @param {string} purl
 * @returns {string} The package type (`pkg:npm/…` → `npm`).
 */
export const ecosystemOf = (purl) => /^pkg:([a-z0-9.+-]+)\//i.exec(purl)?.[1].toLowerCase() ?? '';

/**
 * @param {unknown} value - CycloneDX `licenses`.
 * @returns {string}
 */
function cdxLicense(value) {
  if (!Array.isArray(value)) return '';
  const parts = value
    .map((x) =>
      isObject(x)
        ? text(x.expression, 300) ||
          (isObject(x.license) ? text(x.license.id, 100) || text(x.license.name, 100) : '')
        : '',
    ) // prettier-ignore
    .filter(Boolean);
  return parts.length > 1 ? parts.map((p) => (/\s/.test(p) ? `(${p})` : p)).join(' AND ') : parts[0] ?? ''; // prettier-ignore
}

/**
 * @param {string} word
 * @returns {Severity}
 */
function severityWord(word) {
  const w = word.toLowerCase();
  if (w === 'moderate') return 'medium';
  if (w === 'informational') return 'info';
  return /** @type {Severity} */ (SEVERITIES.includes(/** @type {Severity} */ (w)) ? w : 'unknown');
}

/**
 * @param {number} score
 * @returns {Severity}
 */
const severityOfScore = (score) => (score >= 9 ? 'critical' : score >= 7 ? 'high' : score >= 4 ? 'medium' : score > 0 ? 'low' : 'none'); // prettier-ignore

/**
 * Reads an SBOM.
 *
 * @param {string} input
 * @returns {ParseResult}
 */
export function parseSbom(input) {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'empty' };
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(trimmed);
  } catch (error) {
    return { ok: false, error: 'json', detail: error instanceof Error ? error.message.slice(0, 200) : '' }; // prettier-ignore
  }
  if (!isObject(data)) return { ok: false, error: 'format' };
  if (data.bomFormat === 'CycloneDX' || (Array.isArray(data.components) && !data.spdxVersion)) return { ok: true, sbom: readCycloneDx(data) }; // prettier-ignore
  if (typeof data.spdxVersion === 'string' || Array.isArray(data.packages)) return { ok: true, sbom: readSpdx(data) }; // prettier-ignore
  return { ok: false, error: 'format' };
}

/**
 * @returns {Sbom}
 * @param {"CycloneDX" | "SPDX"} format
 */
const emptySbom = (format) => ({ format, spec: '', name: '', created: '', tools: [], roots: [], components: new Map(), edges: new Map(), vulns: [], capped: false, graph: false }); // prettier-ignore

/**
 * @param {Partial<Component> & { ref: string, name: string }} c
 * @returns {Component}
 */
function component(c) {
  const license = c.license ?? '';
  const purl = c.purl ?? '';
  return { version: '', type: 'library', scope: '', supplier: '', hashes: [], ...c, purl, license, ecosystem: ecosystemOf(purl), category: licenseCategory(license), depth: -1, path: [], vulns: [] }; // prettier-ignore
}

/**
 * @param {Record<string, unknown>} data
 * @returns {Sbom}
 */
function readCycloneDx(data) {
  const sbom = emptySbom('CycloneDX');
  sbom.spec = text(data.specVersion, 10);
  const meta = isObject(data.metadata) ? data.metadata : {};
  sbom.created = text(meta.timestamp, 40);
  const tools = meta.tools;
  const toolList = Array.isArray(tools) ? tools : isObject(tools) && Array.isArray(tools.components) ? tools.components : []; // prettier-ignore
  sbom.tools = toolList.filter(isObject).map((t) => [text(t.vendor, 60), text(t.name, 80), text(t.version, 30)].filter(Boolean).join(' ')).filter(Boolean); // prettier-ignore
  let auto = 0;
  /**
   * @param {unknown} value
   * @returns {string | null} Its ref.
   */
  const add = (value) => {
    if (!isObject(value)) return null;
    if (sbom.components.size >= MAX_COMPONENTS) {
      sbom.capped = true;
      return null;
    }
    const group = text(value.group, 120);
    const name = text(value.name, 200);
    const ref = text(value['bom-ref'], 300) || `#${auto++}`;
    const supplier = isObject(value.supplier) ? text(value.supplier.name, 120) : '';
    const hashes = (Array.isArray(value.hashes) ? value.hashes : []).filter(isObject).map((x) => `${text(x.alg, 20)}:${text(x.content, 130)}`); // prettier-ignore
    sbom.components.set(ref, component({ ref, name: group ? `${group}${group.startsWith('@') ? '/' : ':'}${name}` : name, version: text(value.version, 80), type: text(value.type, 40) || 'library', purl: text(value.purl, 400), license: cdxLicense(value.licenses), scope: text(value.scope, 20), supplier, hashes })); // prettier-ignore
    if (Array.isArray(value.components))
      for (const child of value.components) {
        const childRef = add(child);
        // Nested components belong to their parent when no dependency graph says otherwise.
        if (childRef) sbom.edges.set(ref, [...(sbom.edges.get(ref) ?? []), childRef]);
      }
    return ref;
  };
  const root = add(meta.component);
  if (root) {
    sbom.roots.push(root);
    sbom.name = /** @type {Component} */ (sbom.components.get(root)).name;
  }
  const top = (Array.isArray(data.components) ? data.components : []).map(add).filter((r) => r !== null); // prettier-ignore
  if (Array.isArray(data.dependencies) && data.dependencies.length) {
    sbom.graph = true;
    for (const d of data.dependencies) {
      if (!isObject(d)) continue;
      const ref = text(d.ref, 300);
      const on = (Array.isArray(d.dependsOn) ? d.dependsOn : []).map((x) => text(x, 300)).filter(Boolean); // prettier-ignore
      if (ref) sbom.edges.set(ref, [...new Set([...(sbom.edges.get(ref) ?? []), ...on])]);
    }
  } else if (root) {
    // No graph: the top-level components hang from the root, with an unknown depth below.
    sbom.edges.set(root, [...(sbom.edges.get(root) ?? []), ...top]);
  }
  if (!root) sbom.roots.push(...top.filter((r) => ![...sbom.edges.values()].some((list) => list.includes(/** @type {string} */ (r)))).map(String)); // prettier-ignore
  readVulns(data.vulnerabilities, sbom);
  walk(sbom);
  return sbom;
}

/**
 * @param {unknown} value
 * @param {Sbom} sbom
 */
function readVulns(value, sbom) {
  if (!Array.isArray(value)) return;
  for (const v of value.slice(0, MAX_VULNS)) {
    if (!isObject(v)) continue;
    const ratings = (Array.isArray(v.ratings) ? v.ratings : []).filter(isObject);
    // The rating with a score from the newest CVSS first.
    const order = ['CVSSv4', 'CVSSv31', 'CVSSv3', 'CVSSv2'];
    ratings.sort((a, b) => (order.indexOf(text(a.method, 20)) + 1 || 9) - (order.indexOf(text(b.method, 20)) + 1 || 9)); // prettier-ignore
    const rating = ratings.find((r) => typeof r.score === 'number') ?? ratings[0];
    const score = rating && typeof rating.score === 'number' && Number.isFinite(rating.score) ? rating.score : null; // prettier-ignore
    const word = rating ? text(rating.severity, 20) : '';
    const analysis = isObject(v.analysis) ? v.analysis : {};
    const source = isObject(v.source) ? v.source : {};
    const affects = (Array.isArray(v.affects) ? v.affects : []).filter(isObject).map((a) => text(a.ref, 300)).filter(Boolean); // prettier-ignore
    const id = text(v.id, 80);
    /** @type {Vulnerability} */
    const vuln = {
      id,
      source: text(source.name, 60),
      url: (/^https?:\/\//i.test(text(source.url, 2000)) ? safeLink(source.url) : null) ?? (/^CVE-\d{4}-\d+$/.test(id) ? `https://nvd.nist.gov/vuln/detail/${id}` : /^GHSA(-[a-z0-9]{4}){3}$/.test(id) ? `https://github.com/advisories/${id}` : null), // prettier-ignore
      severity: word ? severityWord(word) : score !== null ? severityOfScore(score) : 'unknown',
      score,
      method: rating ? text(rating.method, 20) : '',
      vector: rating ? text(rating.vector, 200) : '',
      description: text(v.description, 2000) || text(v.detail, 2000),
      recommendation: text(v.recommendation, 1000),
      state: text(analysis.state, 30),
      justification: text(analysis.justification, 60),
      cwes: (Array.isArray(v.cwes) ? v.cwes : []).filter((x) => Number.isInteger(x)).map((x) => `CWE-${x}`), // prettier-ignore
      affects,
    };
    sbom.vulns.push(vuln);
    for (const ref of affects) sbom.components.get(ref)?.vulns.push(id);
  }
  sbom.vulns.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || (b.score ?? 0) - (a.score ?? 0)); // prettier-ignore
}

/**
 * @param {Record<string, unknown>} data
 * @returns {Sbom}
 */
function readSpdx(data) {
  const sbom = emptySbom('SPDX');
  sbom.spec = text(data.spdxVersion, 20).replace(/^SPDX-/, '');
  sbom.name = text(data.name, 200);
  const info = isObject(data.creationInfo) ? data.creationInfo : {};
  sbom.created = text(info.created, 40);
  sbom.tools = (Array.isArray(info.creators) ? info.creators : []).map((x) => text(x, 120)).filter((x) => x.startsWith('Tool:')).map((x) => x.slice(5).trim()); // prettier-ignore
  const none = (/** @type {string} */ s) => (/^(NOASSERTION|NONE)$/.test(s) ? '' : s);
  for (const p of Array.isArray(data.packages) ? data.packages : []) {
    if (!isObject(p)) continue;
    if (sbom.components.size >= MAX_COMPONENTS) {
      sbom.capped = true;
      break;
    }
    const ref = text(p.SPDXID, 300) || `#${sbom.components.size}`;
    const purl = (Array.isArray(p.externalRefs) ? p.externalRefs : []).filter(isObject).find((r) => text(r.referenceType, 30) === 'purl'); // prettier-ignore
    const supplier = none(text(p.supplier, 160)).replace(/^(Organization|Person):\s*/, '');
    const hashes = (Array.isArray(p.checksums) ? p.checksums : []).filter(isObject).map((x) => `${text(x.algorithm, 20)}:${text(x.checksumValue, 130)}`); // prettier-ignore
    sbom.components.set(ref, component({ ref, name: text(p.name, 200), version: none(text(p.versionInfo, 80)), type: text(p.primaryPackagePurpose, 40).toLowerCase() || 'library', purl: purl ? text(purl.referenceLocator, 400) : '', license: none(text(p.licenseConcluded, 300)) || none(text(p.licenseDeclared, 300)), supplier, hashes })); // prettier-ignore
  }
  const link = (/** @type {string} */ from, /** @type {string} */ to) => {
    if (!sbom.components.has(from) || !sbom.components.has(to) || from === to) return;
    const list = sbom.edges.get(from) ?? [];
    if (!list.includes(to)) list.push(to);
    sbom.edges.set(from, list);
  };
  const described = (Array.isArray(data.documentDescribes) ? data.documentDescribes : []).map((x) => text(x, 300)); // prettier-ignore
  for (const r of Array.isArray(data.relationships) ? data.relationships : []) {
    if (!isObject(r)) continue;
    const a = text(r.spdxElementId, 300);
    const b = text(r.relatedSpdxElement, 300);
    const type = text(r.relationshipType, 40);
    if (type === 'DESCRIBES' && a === 'SPDXRef-DOCUMENT') described.push(b);
    else if (type === 'DESCRIBED_BY' && b === 'SPDXRef-DOCUMENT') described.push(a);
    else if (
      [
        'DEPENDS_ON',
        'CONTAINS',
        'BUILD_DEPENDENCY_OF',
        'DEV_DEPENDENCY_OF',
        'RUNTIME_DEPENDENCY_OF',
        'OPTIONAL_DEPENDENCY_OF',
        'DEPENDENCY_OF',
      ].includes(type)
    ) {
      // prettier-ignore
      sbom.graph = true;
      if (type === 'DEPENDS_ON' || type === 'CONTAINS') link(a, b);
      else link(b, a);
      if (/^(DEV|BUILD|OPTIONAL)_/.test(type)) {
        const c = sbom.components.get(a);
        if (c && !c.scope) c.scope = type.startsWith('OPTIONAL') ? 'optional' : type.startsWith('DEV') ? 'dev' : 'build'; // prettier-ignore
      }
    }
  }
  sbom.roots = [...new Set(described)].filter((r) => sbom.components.has(r));
  if (!sbom.roots.length) {
    const children = new Set([...sbom.edges.values()].flat());
    sbom.roots = [...sbom.components.keys()].filter((r) => !children.has(r)).slice(0, 50);
  }
  walk(sbom);
  return sbom;
}

/**
 * Depth and shortest path of each component, breadth-first from the roots.
 *
 * @param {Sbom} sbom
 */
function walk(sbom) {
  /** @type {string[]} */
  const queue = [];
  for (const root of sbom.roots) {
    const c = sbom.components.get(root);
    if (c && c.depth < 0) {
      c.depth = 0;
      c.path = [root];
      queue.push(root);
    }
  }
  for (let i = 0; i < queue.length; i += 1) {
    const from = /** @type {Component} */ (sbom.components.get(queue[i]));
    for (const ref of sbom.edges.get(queue[i]) ?? []) {
      const c = sbom.components.get(ref);
      if (!c || c.depth >= 0) continue;
      c.depth = from.depth + 1;
      c.path = [...from.path, ref];
      queue.push(ref);
    }
  }
}

/**
 * @param {Sbom} sbom
 * @returns {{ components: number, direct: number, transitive: number, ecosystems: [string, number][], licenses: Record<Category, number>, vulns: Record<Severity, number>, affected: number }}
 */
export function summary(sbom) {
  const list = [...sbom.components.values()].filter((c) => !sbom.roots.includes(c.ref));
  /** @type {Map<string, number>} */
  const eco = new Map();
  for (const c of list) if (c.ecosystem) eco.set(c.ecosystem, (eco.get(c.ecosystem) ?? 0) + 1);
  const licenses = /** @type {Record<Category, number>} */ (Object.fromEntries(CATEGORIES.map((k) => [k, 0]))); // prettier-ignore
  for (const c of list) licenses[c.category] += 1;
  const vulns = /** @type {Record<Severity, number>} */ (Object.fromEntries(SEVERITIES.map((k) => [k, 0]))); // prettier-ignore
  for (const v of sbom.vulns) vulns[v.severity] += 1;
  return {
    components: list.length,
    direct: list.filter((c) => c.depth === 1).length,
    transitive: list.filter((c) => c.depth > 1).length,
    ecosystems: [...eco].sort((a, b) => b[1] - a[1]),
    licenses,
    vulns,
    affected: list.filter((c) => c.vulns.length).length,
  };
}

/**
 * The components as CSV (formulas neutralized).
 *
 * @param {Component[]} list
 * @returns {string}
 */
export function toCsv(list) {
  const cell = (/** @type {string | number} */ value) => {
    let s = String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) || s !== String(value) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    ['name', 'version', 'type', 'purl', 'license', 'depth', 'scope', 'vulnerabilities'],
  ];
  for (const c of list) rows.push([c.name, c.version, c.type, c.purl, c.license, String(c.depth), c.scope, c.vulns.join(' ')]); // prettier-ignore
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}
