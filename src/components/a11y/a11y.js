// @ts-check
/**
 * Reads axe-core results: from `axe.run()`, `@axe-core/playwright` or `@axe-core/cli` (a list
 * of pages), and Pa11y's JSON. Violations by impact, each with its WCAG success criteria, the
 * elements it was found on and what to fix; incomplete checks to review by hand; passes.
 *
 * @module components/a11y/a11y
 */
import { isObject, safeLink, text } from '../../core/data.js';

/** Most rules and nodes read. */
export const MAX_RULES = 500;
export const MAX_NODES = 200;

export const IMPACTS = /** @type {const} */ (['critical', 'serious', 'moderate', 'minor']);

/**
 * @typedef {typeof IMPACTS[number]} Impact
 * @typedef {{ target: string, html: string, summary: string, impact: Impact | "" }} Node
 * @typedef {object} Rule
 * @property {string} id
 * @property {Impact | ""} impact
 * @property {string} help
 * @property {string} description
 * @property {string | null} helpUrl
 * @property {string[]} criteria - WCAG success criteria (`1.4.3`).
 * @property {string} level - Lowest WCAG level among its tags (`A`, `AA`, `AAA`), or empty.
 * @property {string[]} tags
 * @property {Node[]} nodes
 * @property {number} total - Nodes before the cap.
 * @property {string} page
 * @typedef {object} Results
 * @property {string[]} pages
 * @property {string} engine - `axe-core 4.10.2`.
 * @property {string} timestamp
 * @property {Rule[]} violations - Most severe first.
 * @property {Rule[]} incomplete
 * @property {number} passes
 * @property {number} inapplicable
 * @property {boolean} capped
 * @typedef {{ ok: true, results: Results } | { ok: false, error: "empty" | "json" | "format", detail?: string }} ParseResult
 */

/**
 * WCAG criteria and level from axe tags: `wcag143` → `1.4.3`, `wcag2aa` → AA.
 *
 * @param {string[]} tags
 * @returns {{ criteria: string[], level: string }}
 */
export function wcag(tags) {
  const criteria = tags
    .map((t) => /^wcag(\d)(\d)(\d{1,2})$/.exec(t))
    .filter((m) => m !== null)
    .map((m) => `${m[1]}.${m[2]}.${m[3]}`);
  const levels = tags.map((t) => /^wcag2(?:1|2)?(a{1,3})$/.exec(t)?.[1]).filter(Boolean).map((x) => String(x).toUpperCase()); // prettier-ignore
  const level = ['A', 'AA', 'AAA'].find((l) => levels.includes(l)) ?? '';
  return { criteria: [...new Set(criteria)], level };
}

/**
 * @param {unknown} value
 * @returns {Impact | ""}
 */
const impactOf = (value) => (IMPACTS.includes(/** @type {Impact} */ (value)) ? /** @type {Impact} */ (value) : ''); // prettier-ignore

/**
 * @param {unknown} target - axe target: a list of selectors (frames and shadow roots nest).
 * @returns {string}
 */
function targetText(target) {
  if (typeof target === 'string') return text(target, 500);
  if (!Array.isArray(target)) return '';
  return target.map((t) => (Array.isArray(t) ? t.map((x) => text(x, 300)).join(' >>> ') : text(t, 300))).join(' → '); // prettier-ignore
}

/**
 * @param {unknown} list
 * @param {string} page
 * @returns {Rule[]}
 */
function readRules(list, page) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(isObject)
    .slice(0, MAX_RULES)
    .map((r) => {
      const tags = (Array.isArray(r.tags) ? r.tags : []).map((t) => text(t, 60)).filter(Boolean);
      const nodes = (Array.isArray(r.nodes) ? r.nodes : []).filter(isObject);
      const { criteria, level } = wcag(tags);
      return {
        id: text(r.id, 100),
        impact: impactOf(r.impact),
        help: text(r.help, 300),
        description: text(r.description, 600),
        helpUrl: /^https?:\/\//i.test(text(r.helpUrl, 2000)) ? safeLink(r.helpUrl) : null,
        criteria,
        level,
        tags,
        nodes: nodes.slice(0, MAX_NODES).map((n) => ({ target: targetText(n.target), html: text(n.html, 600), summary: text(n.failureSummary, 1200), impact: impactOf(n.impact) })), // prettier-ignore
        total: nodes.length,
        page,
      };
    });
}

/**
 * Pa11y issues grouped as rules.
 *
 * @param {unknown[]} issues
 * @param {string} page
 * @returns {Rule[]}
 */
function readPa11y(issues, page) {
  /** @type {Map<string, Rule>} */
  const byCode = new Map();
  for (const issue of issues.filter(isObject)) {
    if (text(issue.type, 20) !== 'error') continue;
    const code = text(issue.code, 200);
    let rule = byCode.get(code);
    if (!rule) {
      const sc = /Guideline\d_\d\.(\d_\d_\d{1,2})/.exec(code)?.[1]?.replace(/_/g, '.');
      rule = { id: code, impact: 'serious', help: text(issue.message, 300), description: '', helpUrl: null, criteria: sc ? [sc] : [], level: /WCAG2(A{1,3})/.exec(code)?.[1] ?? '', tags: [], nodes: [], total: 0, page }; // prettier-ignore
      byCode.set(code, rule);
    }
    rule.total += 1;
    if (rule.nodes.length < MAX_NODES) rule.nodes.push({ target: text(issue.selector, 500), html: text(issue.context, 600), summary: '', impact: '' }); // prettier-ignore
  }
  return [...byCode.values()];
}

/**
 * Reads results.
 *
 * @param {string} input
 * @returns {ParseResult}
 */
export function parseA11y(input) {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'empty' };
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(trimmed);
  } catch (error) {
    return { ok: false, error: 'json', detail: error instanceof Error ? error.message.slice(0, 200) : '' }; // prettier-ignore
  }
  const runs = (Array.isArray(data) ? data : [data]).filter(isObject);
  if (!runs.length) return { ok: false, error: 'format' };
  /** @type {Results} */
  const results = { pages: [], engine: '', timestamp: '', violations: [], incomplete: [], passes: 0, inapplicable: 0, capped: false }; // prettier-ignore
  let known = false;
  for (const run of runs) {
    const page = text(run.url ?? run.pageUrl, 500);
    if (page && !results.pages.includes(page)) results.pages.push(page);
    if (Array.isArray(run.violations)) {
      known = true;
      results.violations.push(...readRules(run.violations, page));
      results.incomplete.push(...readRules(run.incomplete, page));
      results.passes += Array.isArray(run.passes) ? run.passes.length : 0;
      results.inapplicable += Array.isArray(run.inapplicable) ? run.inapplicable.length : 0;
      const engine = isObject(run.testEngine) ? run.testEngine : {};
      if (!results.engine && engine.version) results.engine = `${text(engine.name, 30) || 'axe-core'} ${text(engine.version, 20)}`; // prettier-ignore
      if (!results.timestamp) results.timestamp = text(run.timestamp, 40);
      if (run.violations.some((r) => isObject(r) && Array.isArray(r.nodes) && r.nodes.length > MAX_NODES)) results.capped = true; // prettier-ignore
    } else if (Array.isArray(run.issues)) {
      known = true;
      results.violations.push(...readPa11y(run.issues, text(run.pageUrl, 500)));
      if (!results.engine) results.engine = 'Pa11y';
    }
  }
  if (!known) return { ok: false, error: 'format' };
  const rank = (/** @type {Rule} */ r) => (r.impact ? IMPACTS.indexOf(r.impact) : IMPACTS.length);
  results.violations.sort((a, b) => rank(a) - rank(b) || b.total - a.total);
  results.incomplete.sort((a, b) => rank(a) - rank(b) || b.total - a.total);
  return { ok: true, results };
}

/**
 * Counts by impact.
 *
 * @param {Rule[]} rules
 * @returns {Record<Impact | "unknown", { rules: number, nodes: number }>}
 */
export function byImpact(rules) {
  /** @type {Record<Impact | "unknown", { rules: number, nodes: number }>} */
  const out = { critical: { rules: 0, nodes: 0 }, serious: { rules: 0, nodes: 0 }, moderate: { rules: 0, nodes: 0 }, minor: { rules: 0, nodes: 0 }, unknown: { rules: 0, nodes: 0 } }; // prettier-ignore
  for (const r of rules) {
    const k = r.impact || 'unknown';
    out[k].rules += 1;
    out[k].nodes += r.total;
  }
  return out;
}

/**
 * Splits axe's failure summary into its sentences: "Fix any of the following:" and its items.
 *
 * @param {string} summary
 * @returns {{ title: string, items: string[] }[]}
 */
export function fixes(summary) {
  /** @type {{ title: string, items: string[] }[]} */
  const out = [];
  for (const line of summary.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean) continue;
    if (/^Fix (any|all) of the following:?$/i.test(clean) || !out.length)
      out.push({ title: /:$/.test(clean) ? clean : '', items: /:$/.test(clean) ? [] : [clean] }); // prettier-ignore
    else out[out.length - 1].items.push(clean);
  }
  return out;
}
