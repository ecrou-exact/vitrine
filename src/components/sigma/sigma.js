// @ts-check
/**
 * Reads Sigma rules (the YAML already parsed): metadata, ATT&CK and CVE tags, log source,
 * detection items with their field modifiers, and the condition as a tree. Checks what
 * `sigma check` and reviewers flag: missing fields, a condition naming unknown searches,
 * searches never used, unknown modifiers, levels and statuses outside the specification.
 *
 * @module components/sigma/sigma
 */

/** Most rules read from a file. */
export const MAX_RULES = 200;

export const LEVELS = Object.freeze(['informational', 'low', 'medium', 'high', 'critical']);
export const STATUSES = Object.freeze(['stable', 'test', 'experimental', 'deprecated', 'unsupported']); // prettier-ignore

/** Value modifiers of Sigma 2 (`|contains`, `|re|i`…). */
export const MODIFIERS = new Set([
  'contains', 'startswith', 'endswith', 'all', 'base64', 'base64offset', 'utf16le', 'utf16be',
  'utf16', 'wide', 'windash', 're', 'i', 'm', 's', 'cidr', 'exists', 'expand', 'fieldref',
  'gt', 'gte', 'lt', 'lte', 'cased', 'minute', 'hour', 'day', 'week', 'month', 'year',
]); // prettier-ignore

/** ATT&CK tactics as Sigma tags name them, with their ATT&CK identifiers. */
export const TACTICS = Object.freeze({
  reconnaissance: 'TA0043',
  resource_development: 'TA0042',
  initial_access: 'TA0001',
  execution: 'TA0002',
  persistence: 'TA0003',
  privilege_escalation: 'TA0004',
  defense_evasion: 'TA0005',
  credential_access: 'TA0006',
  discovery: 'TA0007',
  lateral_movement: 'TA0008',
  collection: 'TA0009',
  command_and_control: 'TA0011',
  exfiltration: 'TA0010',
  impact: 'TA0040',
});

/**
 * @typedef {{ field: string, modifiers: string[], values: (string | number | boolean | null)[] }} Item
 *   `field` is empty for keywords.
 * @typedef {{ name: string, kind: "map" | "list" | "keywords", groups: Item[][], used: boolean }} Search
 *   A map is one group (every item must match); a list of maps is several groups (one must match).
 * @typedef {{ type: "and" | "or", children: Node[] } | { type: "not", child: Node } | { type: "search", name: string } | { type: "of", quantity: "1" | "all", pattern: string, names: string[] }} Node
 * @typedef {{ raw: string, label: string, kind: "tactic" | "technique" | "group" | "software" | "cve" | "other", url: string }} Tag
 * @typedef {{ id: string, level: "danger" | "warning" | "info", params: Record<string, string | number> }} Finding
 * @typedef {object} SigmaRule
 * @property {"rule" | "correlation" | "filter" | "global"} type
 * @property {string} title
 * @property {string} id
 * @property {string} status
 * @property {string} level
 * @property {string} description
 * @property {string} author
 * @property {string} date
 * @property {string} modified
 * @property {string} license
 * @property {string[]} references
 * @property {Tag[]} tags
 * @property {Record<string, string>} logsource
 * @property {Search[]} searches
 * @property {string[]} conditions - As written.
 * @property {(Node | null)[]} trees - Each condition read, `null` when it cannot be read.
 * @property {string} timeframe
 * @property {string[]} falsepositives
 * @property {string[]} fields
 * @property {{ id: string, type: string }[]} related
 * @property {Record<string, unknown> | null} correlation
 * @property {Finding[]} findings
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value
 * @returns {string}
 */
const str = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10); // prettier-ignore
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''; // prettier-ignore
};

/**
 * @param {unknown} value
 * @returns {string[]}
 */
const strings = (value) =>
  (Array.isArray(value) ? value : value == null ? [] : [value]).map(str).filter(Boolean);

/**
 * Reads a tag: `attack.t1059.001`, `attack.execution`, `attack.g0016`, `cve.2021-44228`.
 *
 * @param {string} raw
 * @returns {Tag}
 */
export function readTag(raw) {
  const tag = raw.trim();
  const lower = tag.toLowerCase();
  let m = /^attack\.t(\d{4})(?:\.(\d{3}))?$/.exec(lower);
  if (m)
    return { raw: tag, label: `T${m[1]}${m[2] ? `.${m[2]}` : ''}`, kind: 'technique', url: `https://attack.mitre.org/techniques/T${m[1]}/${m[2] ? `${m[2]}/` : ''}` }; // prettier-ignore
  m = /^attack\.([a-z_]+)$/.exec(lower);
  if (m && Object.hasOwn(TACTICS, m[1])) {
    const id = TACTICS[/** @type {keyof typeof TACTICS} */ (m[1])];
    const label = m[1].split('_').map((w) => (w === 'and' ? w : w[0].toUpperCase() + w.slice(1))).join(' '); // prettier-ignore
    return { raw: tag, label, kind: 'tactic', url: `https://attack.mitre.org/tactics/${id}/` };
  }
  m = /^attack\.([gs])(\d{4})$/.exec(lower);
  if (m)
    return { raw: tag, label: `${m[1].toUpperCase()}${m[2]}`, kind: m[1] === 'g' ? 'group' : 'software', url: `https://attack.mitre.org/${m[1] === 'g' ? 'groups' : 'software'}/${m[1].toUpperCase()}${m[2]}/` }; // prettier-ignore
  m = /^cve\.(\d{4})[.-](\d{4,7})$/.exec(lower);
  if (m)
    return { raw: tag, label: `CVE-${m[1]}-${m[2]}`, kind: 'cve', url: `https://nvd.nist.gov/vuln/detail/CVE-${m[1]}-${m[2]}` }; // prettier-ignore
  return { raw: tag, label: tag, kind: 'other', url: '' };
}

/**
 * @param {unknown} value
 * @returns {Item["values"]}
 */
function values(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.map(
    (v) =>
    v === null || typeof v === 'number' || typeof v === 'boolean' ? v : v instanceof Date ? str(v) : typeof v === 'string' ? v : JSON.stringify(v), // prettier-ignore
  );
}

/**
 * @param {Record<string, unknown>} map
 * @returns {Item[]}
 */
function items(map) {
  return Object.entries(map).map(([key, value]) => {
    const [field, ...modifiers] = key.split('|');
    return { field, modifiers, values: values(value) };
  });
}

/**
 * @param {string} name
 * @param {unknown} value
 * @returns {Search}
 */
export function readSearch(name, value) {
  if (isObject(value)) return { name, kind: 'map', groups: [items(value)], used: false };
  if (Array.isArray(value) && value.length && value.every(isObject))
    return { name, kind: 'list', groups: value.map((v) => items(/** @type {Record<string, unknown>} */ (v))), used: false }; // prettier-ignore
  return { name, kind: 'keywords', groups: [[{ field: '', modifiers: [], values: values(value) }]], used: false }; // prettier-ignore
}

/**
 * Reads a condition: `selection and not 1 of filter_*`, with `and` binding tighter than `or`.
 *
 * @param {string} text
 * @param {string[]} names - The searches of the rule.
 * @returns {Node}
 */
export function parseCondition(text, names) {
  const tokens = text.match(/\(|\)|[^\s()]+/g) ?? [];
  let i = 0;
  const peek = () => tokens[i]?.toLowerCase();
  const fail = (/** @type {string} */ what) => {
    throw new Error(what);
  };
  /** @returns {Node} */
  const or = () => {
    const children = [and()];
    while (peek() === 'or') {
      i += 1;
      children.push(and());
    }
    return children.length > 1 ? { type: 'or', children } : children[0];
  };
  /** @returns {Node} */
  const and = () => {
    const children = [not()];
    while (peek() === 'and') {
      i += 1;
      children.push(not());
    }
    return children.length > 1 ? { type: 'and', children } : children[0];
  };
  /** @returns {Node} */
  const not = () => {
    if (peek() === 'not') {
      i += 1;
      return { type: 'not', child: not() };
    }
    return atom();
  };
  /** @returns {Node} */
  const atom = () => {
    const t = tokens[i];
    if (t === undefined) fail('end');
    if (t === '(') {
      i += 1;
      const node = or();
      if (tokens[i] !== ')') fail(')');
      i += 1;
      return node;
    }
    if (
      (t === '1' || t.toLowerCase() === 'all' || t.toLowerCase() === 'any') &&
      tokens[i + 1]?.toLowerCase() === 'of'
    ) {
      const pattern = tokens[i + 2];
      if (!pattern || pattern === '(' || pattern === ')') fail('of');
      i += 3;
      const quantity = t.toLowerCase() === 'all' ? 'all' : '1';
      return { type: 'of', quantity, pattern, names: matchNames(pattern, names) };
    }
    if (/^(and|or|not|of|\))$/i.test(t)) fail(t);
    i += 1;
    return { type: 'search', name: t };
  };
  const node = or();
  if (i < tokens.length) fail(tokens[i]);
  return node;
}

/**
 * @param {string} pattern - `them`, `selection_*` or a name.
 * @param {string[]} names
 * @returns {string[]}
 */
export function matchNames(pattern, names) {
  if (pattern.toLowerCase() === 'them') return names.filter((n) => !n.startsWith('_'));
  if (!pattern.includes('*')) return names.filter((n) => n === pattern);
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  return names.filter((n) => re.test(n));
}

/**
 * @param {Node} node
 * @returns {string[]} Names of the searches a condition refers to.
 */
function referenced(node) {
  if (node.type === 'search') return [node.name];
  if (node.type === 'of') return node.names;
  if (node.type === 'not') return referenced(node.child);
  return node.children.flatMap(referenced);
}

/**
 * @param {Node} node
 * @param {Set<string>} known
 * @param {(f: Finding) => void} add
 */
function checkNode(node, known, add) {
  if (node.type === 'search' && !known.has(node.name)) add({ id: 'unknownSearch', level: 'danger', params: { name: node.name } }); // prettier-ignore
  else if (node.type === 'of' && !node.names.length) add({ id: 'emptyPattern', level: 'danger', params: { pattern: node.pattern } }); // prettier-ignore
  else if (node.type === 'not') checkNode(node.child, known, add);
  else if (node.type === 'and' || node.type === 'or') node.children.forEach((c) => checkNode(c, known, add)); // prettier-ignore
}

/**
 * Reads one Sigma document.
 *
 * @param {unknown} doc
 * @returns {SigmaRule | null} `null` when it is not a mapping.
 */
export function readRule(doc) {
  if (!isObject(doc)) return null;
  /** @type {Finding[]} */
  const findings = [];
  const add = (/** @type {Finding} */ f) => findings.push(f);
  const detection = isObject(doc.detection) ? doc.detection : null;
  const action = str(doc.action);
  /** @type {SigmaRule["type"]} */
  const type = isObject(doc.correlation) ? 'correlation' : isObject(doc.filter) ? 'filter' : action === 'global' ? 'global' : 'rule'; // prettier-ignore
  const logsource = isObject(doc.logsource)
    ? Object.fromEntries(Object.entries(doc.logsource).map(([k, v]) => [k, str(v)]).filter(([, v]) => v)) // prettier-ignore
    : {};
  /** @type {Search[]} */
  const searches = [];
  /** @type {string[]} */
  let conditions = [];
  let timeframe = str(doc.timeframe);
  const source = detection ?? (type === 'filter' && isObject(doc.filter) ? doc.filter : null);
  if (source) {
    for (const [name, value] of Object.entries(source)) {
      if (name === 'condition') conditions = strings(value);
      else if (name === 'timeframe') timeframe = str(value);
      else if (type !== 'filter' || name !== 'rules') searches.push(readSearch(name, value));
    }
  }
  const names = searches.map((s) => s.name);
  /** @type {(Node | null)[]} */
  const trees = conditions.map((c) => {
    try {
      const tree = parseCondition(c, names);
      checkNode(tree, new Set(names), add);
      for (const name of referenced(tree)) {
        const s = searches.find((x) => x.name === name);
        if (s) s.used = true;
      }
      return tree;
    } catch (error) {
      add({ id: 'badCondition', level: 'danger', params: { condition: c, near: error instanceof Error ? error.message : '' } }); // prettier-ignore
      return null;
    }
  });

  const title = str(doc.title);
  const id = str(doc.id);
  const status = str(doc.status);
  const level = str(doc.level);
  const date = str(doc.date);
  if (!title) add({ id: 'noTitle', level: 'danger', params: {} });
  if (type === 'rule' || type === 'global') {
    if (!Object.keys(logsource).length && type === 'rule') add({ id: 'noLogsource', level: 'danger', params: {} }); // prettier-ignore
    if (!detection && type === 'rule') add({ id: 'noDetection', level: 'danger', params: {} });
    else if (detection && !conditions.length) add({ id: 'noCondition', level: 'danger', params: {} }); // prettier-ignore
    for (const s of searches) if (!s.used && conditions.length) add({ id: 'unusedSearch', level: 'warning', params: { name: s.name } }); // prettier-ignore
  }
  for (const s of searches)
    for (const group of s.groups)
      for (const item of group) {
        for (const m of item.modifiers) if (!MODIFIERS.has(m)) add({ id: 'unknownModifier', level: 'warning', params: { field: item.field, modifier: m } }); // prettier-ignore
        if (item.modifiers.includes('re'))
          for (const v of item.values) {
            try {
              if (typeof v === 'string') new RegExp(v);
            } catch {
              add({ id: 'badRegex', level: 'warning', params: { field: item.field } });
            }
          }
        if (
          item.modifiers.some((m) => ['contains', 'startswith', 'endswith'].includes(m)) &&
          item.values.some((v) => typeof v === 'string' && /^\*|(?<!\\)\*$/.test(v))
        )
          // prettier-ignore
          add({ id: 'wildcardModifier', level: 'info', params: { field: item.field } });
        if (item.modifiers.includes('all') && item.values.length < 2) add({ id: 'allSingle', level: 'info', params: { field: item.field } }); // prettier-ignore
      }
  if (level && !LEVELS.includes(level)) add({ id: 'badLevel', level: 'warning', params: { level } }); // prettier-ignore
  if (status && !STATUSES.includes(status)) add({ id: 'badStatus', level: 'warning', params: { status } }); // prettier-ignore
  if (status === 'deprecated' || status === 'unsupported') add({ id: 'deprecated', level: 'warning', params: { status } }); // prettier-ignore
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) add({ id: 'badId', level: 'warning', params: { id } }); // prettier-ignore
  if (date && /^\d{4}\/\d{2}\/\d{2}$/.test(date)) add({ id: 'oldDate', level: 'info', params: { date } }); // prettier-ignore
  else if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) add({ id: 'badDate', level: 'warning', params: { date } }); // prettier-ignore
  const tags = strings(doc.tags).map(readTag);
  for (const t of tags) if (t.raw !== t.raw.toLowerCase()) add({ id: 'tagCase', level: 'info', params: { tag: t.raw } }); // prettier-ignore

  return {
    type,
    title,
    id,
    status,
    level,
    description: str(doc.description),
    author: strings(doc.author).join(', '),
    date,
    modified: str(doc.modified),
    license: str(doc.license),
    references: strings(doc.references),
    tags,
    logsource,
    searches,
    conditions,
    trees,
    timeframe,
    falsepositives: strings(doc.falsepositives),
    fields: strings(doc.fields),
    related: (Array.isArray(doc.related) ? doc.related : []).filter(isObject).map((r) => ({ id: str(r.id), type: str(r.type) })), // prettier-ignore
    correlation: isObject(doc.correlation) ? doc.correlation : null,
    findings,
  };
}

/**
 * Reads the documents of a YAML stream as rules; a `global` document (action: global) is
 * merged into the documents after it, as Sigma 1 collections do.
 *
 * @param {unknown[]} docs
 * @returns {{ rules: SigmaRule[], capped: boolean }}
 */
export function readRules(docs) {
  /** @type {SigmaRule[]} */
  const rules = [];
  /** @type {Record<string, unknown> | null} */
  let global = null;
  for (const doc of docs) {
    if (rules.length >= MAX_RULES) return { rules, capped: true };
    if (!isObject(doc)) continue;
    if (doc.action === 'global') {
      global = doc;
      continue;
    }
    if (doc.action === 'reset') {
      global = null;
      continue;
    }
    const merged = global ? merge(global, doc) : doc;
    const rule = readRule(merged);
    if (rule) rules.push(rule);
  }
  return { rules, capped: false };
}

/**
 * @param {Record<string, unknown>} base
 * @param {Record<string, unknown>} over
 * @returns {Record<string, unknown>}
 */
function merge(base, over) {
  /** @type {Record<string, unknown>} */
  const out = { ...base };
  delete out.action;
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = isObject(b) && isObject(v) ? merge(b, v) : v;
  }
  return out;
}

/**
 * Worst level of a rule.
 *
 * @param {SigmaRule} rule
 * @returns {"danger" | "warning" | "none"}
 */
export function verdict(rule) {
  if (rule.findings.some((f) => f.level === 'danger')) return 'danger';
  if (rule.findings.some((f) => f.level === 'warning')) return 'warning';
  return 'none';
}
