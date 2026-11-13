// @ts-check
/**
 * Turns a fenced code block of Markdown into a Vitrine element: ```` ```sql ```` becomes
 * `<vt-sql>`, ```` ```mermaid ```` becomes `<vt-diagram>`, any other language `<vt-code>`.
 * Shared by the markdown-it and remark plugins (dist/integrations/). No dependencies.
 *
 * The code is escaped and written in a `<template>`: the element reads it as text, and
 * nothing in it is ever parsed as markup.
 *
 * @module integrations/fences
 */

/** Element of each language of a fence. */
export const ELEMENTS = Object.freeze({
  sql: 'vt-sql', pgsql: 'vt-sql', postgres: 'vt-sql', postgresql: 'vt-sql', psql: 'vt-sql',
  mysql: 'vt-sql', mariadb: 'vt-sql', sqlite: 'vt-sql', duckdb: 'vt-sql', tsql: 'vt-sql', plsql: 'vt-sql',
  mermaid: 'vt-diagram',
  math: 'vt-math', latex: 'vt-math', tex: 'vt-math', katex: 'vt-math',
  json: 'vt-json', jsonc: 'vt-json',
  diff: 'vt-diff', patch: 'vt-diff',
  csv: 'vt-csv', tsv: 'vt-csv',
  yaml: 'vt-yaml', yml: 'vt-yaml',
  toml: 'vt-toml',
  xml: 'vt-xml',
  http: 'vt-http',
  console: 'vt-terminal', 'shell-session': 'vt-terminal', terminal: 'vt-terminal',
  tree: 'vt-tree',
  env: 'vt-env', dotenv: 'vt-env', ini: 'vt-env', properties: 'vt-env',
  log: 'vt-log',
  cron: 'vt-cron', crontab: 'vt-cron',
  jwt: 'vt-jwt',
  regex: 'vt-regex', regexp: 'vt-regex',
  junit: 'vt-test-report', tap: 'vt-test-report',
  ipynb: 'vt-notebook',
  'otel-trace': 'vt-trace',
}); // prettier-ignore

/** Attributes set from the language: the SQL dialect. */
const LANGUAGE_ATTRIBUTES = /** @type {Record<string, Record<string, string>>} */ ({
  pgsql: { dialect: 'postgresql' }, postgres: { dialect: 'postgresql' },
  postgresql: { dialect: 'postgresql' }, psql: { dialect: 'postgresql' },
  mysql: { dialect: 'mysql' }, mariadb: { dialect: 'mysql' }, sqlite: { dialect: 'sqlite' },
  tsql: { dialect: 'mssql' }, plsql: { dialect: 'oracle' }, tsv: { delimiter: '\t' },
}); // prettier-ignore

/**
 * @typedef {object} FenceOptions
 * @property {"simple" | "full"} [variant] - Variant of every element (default: none, so `simple`).
 * @property {Record<string, string | false>} [elements] - Languages to add or change: `{ "sql": "vt-code", "chart": false }`.
 * @property {Record<string, Record<string, string>>} [attributes] - Attributes by element: `{ "vt-code": { "line-numbers": "" } }`.
 * @property {boolean} [code] - Other languages become `<vt-code>` (default `true`); `false` leaves them to the Markdown renderer.
 */

/**
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Reads the info string of a fence: its language, and `title="…"` or `label="…"`.
 *
 * @param {string} info - Such as `sql title="Active users"`.
 * @returns {{ language: string, label: string }}
 */
export function parseInfo(info) {
  const text = String(info ?? '').trim();
  const language = (/^[^\s{]+/.exec(text)?.[0] ?? '').toLowerCase();
  const label = /\b(?:title|label)=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(text);
  return { language, label: (label?.[1] ?? label?.[2] ?? label?.[3] ?? '').slice(0, 200) };
}

/**
 * The element for a fenced block, as HTML; `null` to leave the block to the renderer.
 *
 * @param {string} info - Info string of the fence.
 * @param {string} code - Content of the fence.
 * @param {FenceOptions} [options]
 * @returns {string | null}
 */
export function fenceToHtml(info, code, options = {}) {
  const { language, label } = parseInfo(info);
  const custom = options.elements && Object.prototype.hasOwnProperty.call(options.elements, language)
    ? options.elements[language]
    : undefined; // prettier-ignore
  if (custom === false) return null;
  const known = Object.prototype.hasOwnProperty.call(ELEMENTS, language)
    ? ELEMENTS[/** @type {keyof typeof ELEMENTS} */ (language)]
    : undefined;
  let tag = custom ?? known;
  if (!tag) {
    if (options.code === false) return null;
    tag = 'vt-code';
  }
  if (!/^vt-[a-z][a-z-]*$/.test(tag)) return null;
  /** @type {Record<string, string>} */
  const attrs = {};
  if (options.variant) attrs.variant = options.variant;
  if (tag === 'vt-code' && language) attrs.language = language;
  if (!custom) Object.assign(attrs, LANGUAGE_ATTRIBUTES[language] ?? {});
  if (label) attrs.label = label;
  Object.assign(attrs, options.attributes?.[tag] ?? {});
  const written = Object.entries(attrs)
    .filter(([name]) => /^[a-z][a-z0-9-]*$/.test(name) && !/^on/.test(name))
    .map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${escapeHtml(value)}"`))
    .join('');
  const body = String(code ?? '').replace(/\n$/, '');
  return `<${tag}${written}><template>${escapeHtml(body)}</template></${tag}>\n`;
}
