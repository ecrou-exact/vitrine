/*! Vitrine v0.14.0 | MIT License | https://github.com/ecrou-exact/vitrine */

// src/integrations/fences.js
var ELEMENTS = Object.freeze({
  sql: "vt-sql",
  pgsql: "vt-sql",
  postgres: "vt-sql",
  postgresql: "vt-sql",
  psql: "vt-sql",
  mysql: "vt-sql",
  mariadb: "vt-sql",
  sqlite: "vt-sql",
  duckdb: "vt-sql",
  tsql: "vt-sql",
  plsql: "vt-sql",
  mermaid: "vt-diagram",
  math: "vt-math",
  latex: "vt-math",
  tex: "vt-math",
  katex: "vt-math",
  json: "vt-json",
  jsonc: "vt-json",
  diff: "vt-diff",
  patch: "vt-diff",
  csv: "vt-csv",
  tsv: "vt-csv",
  yaml: "vt-yaml",
  yml: "vt-yaml",
  toml: "vt-toml",
  xml: "vt-xml",
  http: "vt-http",
  console: "vt-terminal",
  "shell-session": "vt-terminal",
  terminal: "vt-terminal",
  tree: "vt-tree",
  env: "vt-env",
  dotenv: "vt-env",
  ini: "vt-env",
  properties: "vt-env",
  log: "vt-log",
  cron: "vt-cron",
  crontab: "vt-cron",
  jwt: "vt-jwt",
  regex: "vt-regex",
  regexp: "vt-regex",
  junit: "vt-test-report",
  tap: "vt-test-report",
  ipynb: "vt-notebook",
  "otel-trace": "vt-trace"
});
var LANGUAGE_ATTRIBUTES = (
  /** @type {Record<string, Record<string, string>>} */
  {
    pgsql: { dialect: "postgresql" },
    postgres: { dialect: "postgresql" },
    postgresql: { dialect: "postgresql" },
    psql: { dialect: "postgresql" },
    mysql: { dialect: "mysql" },
    mariadb: { dialect: "mysql" },
    sqlite: { dialect: "sqlite" },
    tsql: { dialect: "mssql" },
    plsql: { dialect: "oracle" },
    tsv: { delimiter: "	" }
  }
);
function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function parseInfo(info) {
  const text = String(info ?? "").trim();
  const language = (/^[^\s{]+/.exec(text)?.[0] ?? "").toLowerCase();
  const label = /\b(?:title|label)=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(text);
  return { language, label: (label?.[1] ?? label?.[2] ?? label?.[3] ?? "").slice(0, 200) };
}
function fenceToHtml(info, code, options = {}) {
  const { language, label } = parseInfo(info);
  const custom = options.elements && Object.prototype.hasOwnProperty.call(options.elements, language) ? options.elements[language] : void 0;
  if (custom === false) return null;
  const known = Object.prototype.hasOwnProperty.call(ELEMENTS, language) ? ELEMENTS[
    /** @type {keyof typeof ELEMENTS} */
    language
  ] : void 0;
  let tag = custom ?? known;
  if (!tag) {
    if (options.code === false) return null;
    tag = "vt-code";
  }
  if (!/^vt-[a-z][a-z-]*$/.test(tag)) return null;
  const attrs = {};
  if (options.variant) attrs.variant = options.variant;
  if (tag === "vt-code" && language) attrs.language = language;
  if (!custom) Object.assign(attrs, LANGUAGE_ATTRIBUTES[language] ?? {});
  if (label) attrs.label = label;
  Object.assign(attrs, options.attributes?.[tag] ?? {});
  const written = Object.entries(attrs).filter(([name]) => /^[a-z][a-z0-9-]*$/.test(name) && !/^on/.test(name)).map(([name, value]) => value === "" ? ` ${name}` : ` ${name}="${escapeHtml(value)}"`).join("");
  const body = String(code ?? "").replace(/\n$/, "");
  return `<${tag}${written}><template>${escapeHtml(body)}</template></${tag}>
`;
}

// src/integrations/markdown-it.js
function vitrine(md, options = {}) {
  const fallback = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, mdOptions, env, self) => {
    const token = tokens[index];
    return fenceToHtml(token.info, token.content, options) ?? (fallback ? fallback(tokens, index, mdOptions, env, self) : self.renderToken(tokens, index, mdOptions));
  };
}
export {
  ELEMENTS,
  vitrine as default,
  fenceToHtml
};
//# sourceMappingURL=markdown-it.js.map
