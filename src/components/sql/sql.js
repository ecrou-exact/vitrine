// @ts-check
/**
 * Reads SQL for <vt-sql>: a query alone, a terminal session of psql, mysql, MariaDB, sqlite3
 * or DuckDB with its result tables, or JSON (`{ query, columns, rows }`, a node-postgres
 * result, or a list of them). Also puts a query in a readable layout. Nothing is ever run.
 *
 * @module components/sql/sql
 */

/** Rows kept per result. */
export const MAX_ROWS = 100_000;
/** Columns kept per result. */
export const MAX_COLUMNS = 500;
/** Statements kept. */
export const MAX_STATEMENTS = 500;

/** @typedef {string | null} Cell */

/**
 * @typedef {object} Column
 * @property {string} name
 * @property {string} type - Type written by the database (`int4`, `varchar`), or `""`.
 */

/**
 * @typedef {object} ResultSet
 * @property {Column[]} columns
 * @property {Cell[][]} rows
 * @property {number | null} total - Row count given by the database (may exceed `rows`).
 */

/**
 * @typedef {object} Param
 * @property {string} name - `$1`, `:id`, or the position.
 * @property {string} value
 */

/**
 * @typedef {object} Statement
 * @property {string} sql
 * @property {Param[]} params
 * @property {ResultSet | null} result
 * @property {string} message - Command tag or notice (`INSERT 0 1`, `Query OK, 3 rows affected`).
 * @property {string} error
 * @property {number | null} duration - In milliseconds.
 */

/** @returns {Statement} */
const statement = (sql = '') => ({
  sql,
  params: [],
  result: null,
  message: '',
  error: '',
  duration: null,
});

// ------------------------------------------------------------------ reading

/**
 * Reads SQL text, a terminal session or JSON.
 *
 * @param {string} text
 * @returns {Statement[]}
 */
export function parseSql(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (/^[[{]/.test(trimmed)) {
    try {
      return fromJson(JSON.parse(trimmed));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      // Not JSON: read it as SQL.
    }
  }
  return parseSession(text);
}

/** psql (`db=#`, `db->`, `db(#`), mysql / MariaDB (`mysql>`, `->`), sqlite3 and DuckDB prompts. */
const PROMPT =
  /^(?:[\w.$@-]{1,64}[=\-('"*~][#>]|mysql>|MariaDB \[[^\]]{0,64}\]>|sqlite>|D|duckdb>|SQL>|\s*->|\s*\.{3}>|\s*'>|\s*">)[ \t]?/;

/**
 * @param {string} line
 * @returns {string | null} The command after the prompt, or `null` when there is no prompt.
 */
function afterPrompt(line) {
  const match = PROMPT.exec(line);
  // DuckDB's prompt is a lone "D": only with a space after it, and not "D SELECT"-like text
  // inside a query (a session always starts with a prompt line).
  if (!match || (match[0].trim() === 'D' && !/^D [^ ]/.test(line))) return null;
  return line.slice(match[0].length);
}

/**
 * @param {string} text
 * @returns {Statement[]}
 */
function parseSession(text) {
  const lines = text.split('\n');
  const prompted = lines.some((line) => afterPrompt(line) !== null && afterPrompt(line) !== '');
  if (!prompted && !lines.some((_, i) => tableAt(lines, i))) return [statement(text.trim())];

  /** @type {Statement[]} */
  const statements = [];
  /** @type {Statement | null} */
  let current = null;
  /** Whether the current statement is complete (its output follows). */
  let closed = false;
  const hasOutput = (/** @type {Statement} */ s) =>
    Boolean(s.result || s.message || s.error || s.duration !== null);

  for (let i = 0; i < lines.length && statements.length <= MAX_STATEMENTS; i += 1) {
    const line = lines[i];
    const command = prompted ? afterPrompt(line) : null;
    if (command !== null) {
      if (!command.trim() && (!current || closed)) continue;
      if (!current || closed || hasOutput(current)) {
        current = statement();
        statements.push(current);
      }
      current.sql += (current.sql ? '\n' : '') + command;
      closed = isComplete(current.sql);
      continue;
    }
    const table = tableAt(lines, i);
    if (table) {
      if (!current) {
        current = statement();
        statements.push(current);
      }
      if (current.result) {
        // A second table without a query between them: a statement of its own.
        current = statement();
        statements.push(current);
      }
      current.result = table.result;
      closed = true;
      i = table.end - 1;
      continue;
    }
    if (!line.trim()) continue;
    if (current && (closed || prompted) && readFooter(current, line, lines, i)) {
      closed = true;
      continue;
    }
    if (!prompted && current && hasOutput(current)) {
      // No prompts: SQL after a result starts the next statement.
      current = statement(line);
      statements.push(current);
      closed = isComplete(current.sql);
      continue;
    }
    if (!current) {
      current = statement();
      statements.push(current);
    }
    if (prompted && closed) {
      current.message += (current.message ? '\n' : '') + line.trim();
    } else {
      current.sql += (current.sql ? '\n' : '') + line;
      closed = isComplete(current.sql);
    }
  }
  for (const s of statements) s.sql = s.sql.trim();
  return statements.filter((s) => s.sql || hasOutput(s));
}

/**
 * Whether a statement typed at a prompt is complete: it ends with `;` (outside strings),
 * or is a client command (`\d users`, `.tables`).
 *
 * @param {string} sql
 * @returns {boolean}
 */
function isComplete(sql) {
  const text = sql.trim();
  if (/^[\\.][a-z]/i.test(text)) return true;
  if (!text.endsWith(';') && !/\\[gG]$/.test(text)) return false;
  const tokens = tokenize(text);
  const last = tokens[tokens.length - 1];
  return last?.type === 'punct' || /\\[gG]$/.test(text);
}

/**
 * Reads a line printed after a statement: row counts, timings, errors and command tags.
 *
 * @param {Statement} target
 * @param {string} line
 * @param {string[]} lines
 * @param {number} index
 * @returns {boolean} Whether the line was a footer.
 */
function readFooter(target, line, lines, index) {
  const text = line.trim();
  let match;
  if ((match = /^\((\d+) rows?\)$/.exec(text))) {
    if (target.result) target.result.total = Number(match[1]);
    return true;
  }
  if ((match = /^(\d+) rows? in set(?:, \d+ warnings?)? \(([\d.]+) sec\)$/.exec(text))) {
    if (target.result) target.result.total = Number(match[1]);
    target.duration = Number(match[2]) * 1000;
    return true;
  }
  if ((match = /^Empty set(?:, \d+ warnings?)? \(([\d.]+) sec\)$/.exec(text))) {
    target.result ??= { columns: [], rows: [], total: 0 };
    target.duration = Number(match[1]) * 1000;
    return true;
  }
  if ((match = /^(Query OK, .*?)(?: \(([\d.]+) sec\))?$/.exec(text))) {
    target.message = match[1];
    if (match[2]) target.duration = Number(match[2]) * 1000;
    return true;
  }
  if ((match = /^Time: ([\d.,]+) ms/.exec(text))) {
    target.duration = Number(match[1].replace(/,/g, ''));
    return true;
  }
  if ((match = /^Run Time: real ([\d.]+)/.exec(text))) {
    target.duration = Number(match[1]) * 1000;
    return true;
  }
  if (
    (match =
      /^(?:ERROR(?:\s+\d+\s+\([\w]+\))?|(?:Parse |Runtime |Binder |Catalog |Parser )?[Ee]rror(?: near line \d+)?)\s*:\s*(.*)$/.exec(
        text,
      ))
  ) {
    target.error = match[1];
    // psql shows where: "LINE 1: SELECT * FROM userz" and a caret line under it.
    for (let next = index + 1; next < lines.length && next <= index + 4; next += 1) {
      if (!/^(?:LINE \d+:|\s+\^|DETAIL:|HINT:)/.test(lines[next])) break;
      target.error += `\n${lines[next].trimEnd()}`;
      lines[next] = '';
    }
    return true;
  }
  if (
    /^(?:INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+|MERGE \d+|COPY \d+|FETCH \d+|MOVE \d+|(?:CREATE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|COMMENT|SET|RESET|BEGIN|START TRANSACTION|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|PREPARE|EXECUTE|DEALLOCATE|DO|CALL|VACUUM|ANALYZE|EXPLAIN|LISTEN|NOTIFY|LOCK|REFRESH MATERIALIZED VIEW|CLUSTER|REINDEX|DISCARD)(?: [A-Z ]+)?)$/.test(
      text,
    )
  ) {
    target.message = text;
    return true;
  }
  if (/^(?:NOTICE|WARNING|INFO|Warning \(Code \d+\)):/.test(text)) {
    target.message += (target.message ? '\n' : '') + text;
    return true;
  }
  return false;
}

/**
 * Reads a result table starting at a line: MySQL / MariaDB borders (`+----+`), psql
 * (a header, then `----+----`), or box drawing (sqlite3 `.mode box`, DuckDB).
 *
 * @param {string[]} lines
 * @param {number} start
 * @returns {{ result: ResultSet, end: number } | null}
 */
function tableAt(lines, start) {
  const line = lines[start] ?? '';
  if (/^\s*\+(?:-+\+)+\s*$/.test(line)) return borderTable(lines, start, '+', '|', '-');
  if (/^\s*[┌╭]─/.test(line)) return borderTable(lines, start, '┬', '│', '─');
  const separator = lines[start + 1] ?? '';
  if (line.trim() && /^\s*-+(?:\+-+)*\s*$/.test(separator) && separator.includes('-')) {
    return psqlTable(lines, start);
  }
  return null;
}

/**
 * Column bounds from a border or separator line: the positions of its joints.
 *
 * @param {string} border
 * @param {string} joint
 * @returns {[number, number][]}
 */
function bounds(border, joint) {
  /** @type {number[]} */
  const joints = [];
  for (let i = 0; i < border.length; i += 1) if (border[i] === joint) joints.push(i);
  return joints.slice(0, MAX_COLUMNS + 1).map((at, i, all) => [at + 1, all[i + 1] ?? -1]);
}

/**
 * @param {string} line
 * @param {[number, number][]} spans
 * @param {string} bar
 * @returns {string[]}
 */
function slice(line, spans, bar) {
  // Wide characters shift the columns: fall back to splitting on the bars.
  const fits = spans.every(([, to]) => to < 0 || line[to] === bar || line[to] === undefined);
  if (!fits) {
    return line
      .trim()
      .replace(new RegExp(`^\\${bar}|\\${bar}$`, 'g'), '')
      .split(bar)
      .map((cell) => cell.trim());
  }
  return spans.map(([from, to]) => line.slice(from, to < 0 ? undefined : to).trim());
}

/**
 * @param {string[]} lines
 * @param {number} start
 * @param {string} joint
 * @param {string} bar
 * @param {string} dash
 * @returns {{ result: ResultSet, end: number } | null}
 */
function borderTable(lines, start, joint, bar, dash) {
  const top = lines[start];
  const corner = joint === '+' ? '+' : null;
  // Every joint of the top border, including both corners for "+" borders.
  let spans = bounds(top, joint);
  if (corner) spans = spans.slice(0, -1);
  else {
    const first = top.search(/[┌╭]/);
    const last = top.search(/[┐╮]/);
    const inner = bounds(top, joint).map(([from]) => from - 1);
    const edges = [first, ...inner, last];
    spans = edges.slice(0, -1).map((at, i) => [at + 1, edges[i + 1]]);
  }
  if (!spans.length) return null;
  const isRule = (/** @type {string} */ text) =>
    new RegExp(`^\\s*[${dash === '-' ? '+' : '├╞└╰┴┼┤┘╯'}][${dash}+├┼┤┴└┘╞╪╡═╰╯ ]*\\s*$`).test(
      text,
    ) && text.includes(dash === '-' ? '-' : '─');
  /** @type {string[][]} */
  const header = [];
  /** @type {Cell[][]} */
  const rows = [];
  let inBody = false;
  let i = start + 1;
  for (; i < lines.length; i += 1) {
    const text = lines[i];
    if (isRule(text)) {
      if (!inBody) inBody = true;
      else if (/^\s*[+└╰]/.test(text)) {
        i += 1;
        break;
      }
      continue;
    }
    if (!text.trimStart().startsWith(bar)) break;
    const cells = slice(text, spans, bar);
    if (!inBody) header.push(cells);
    else if (rows.length < MAX_ROWS)
      rows.push(cells.map((cell) => (cell === 'NULL' ? null : cell)));
  }
  if (!header.length) return null;
  const [names, types] = header;
  return {
    result: {
      columns: names.map((name, index) => ({ name, type: types?.[index] ?? '' })),
      rows,
      total: null,
    },
    end: i,
  };
}

/**
 * @param {string[]} lines
 * @param {number} start
 * @returns {{ result: ResultSet, end: number }}
 */
function psqlTable(lines, start) {
  const separator = lines[start + 1];
  const joints = [];
  for (let i = 0; i < separator.length; i += 1) if (separator[i] === '+') joints.push(i);
  const edges = [-1, ...joints.slice(0, MAX_COLUMNS), -2];
  /** @type {[number, number][]} */
  const spans = edges
    .slice(0, -1)
    .map((at, i) => [at + 1, edges[i + 1] === -2 ? -1 : edges[i + 1]]);
  const names = slice(lines[start], spans, '|');
  /** @type {Cell[][]} */
  const rows = [];
  let i = start + 2;
  for (; i < lines.length; i += 1) {
    const text = lines[i];
    if (!text.trim() || /^\(\d+ rows?\)$/.test(text.trim())) break;
    if (spans.length > 1 && !text.includes('|')) break;
    if (rows.length < MAX_ROWS) rows.push(slice(text, spans, '|'));
  }
  return {
    result: { columns: names.map((name) => ({ name, type: '' })), rows, total: null },
    end: i,
  };
}

// ------------------------------------------------------------------ JSON

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads JSON: a statement, a list of statements, or `{ statements: [...] }`.
 *
 * @param {unknown} value
 * @returns {Statement[]}
 */
export function fromJson(value) {
  const list = Array.isArray(value)
    ? value
    : isObject(value) && Array.isArray(value.statements)
      ? value.statements
      : [value];
  return list.slice(0, MAX_STATEMENTS).map((item) => {
    if (typeof item === 'string') return statement(item.trim());
    if (!isObject(item)) throw new TypeError('A statement must be an object or a string.');
    return fromObject(item);
  });
}

/**
 * @param {Record<string, unknown>} item
 * @returns {Statement}
 */
function fromObject(item) {
  const sql = item.query ?? item.sql ?? item.text ?? item.statement ?? '';
  const result = statement(typeof sql === 'string' ? sql.trim() : '');
  result.params = readParams(item.params ?? item.parameters ?? item.values ?? item.bindings);
  const rows = Array.isArray(item.rows) ? item.rows : Array.isArray(item.data) ? item.data : null;
  const fields = Array.isArray(item.columns)
    ? item.columns
    : Array.isArray(item.fields)
      ? item.fields
      : null;
  if (rows || fields) result.result = readRows(rows ?? [], fields);
  const total = item.rowCount ?? item.total ?? item.count;
  if (result.result && typeof total === 'number' && Number.isFinite(total))
    result.result.total = total;
  const duration = item.duration ?? item.time ?? item.elapsed;
  if (typeof duration === 'number' && Number.isFinite(duration) && duration >= 0)
    result.duration = duration;
  if (typeof item.message === 'string') result.message = item.message.slice(0, 4000);
  else if (typeof item.command === 'string' && !result.result) result.message = item.command;
  const error = item.error;
  if (typeof error === 'string') result.error = error.slice(0, 4000);
  else if (isObject(error) && typeof error.message === 'string')
    result.error = error.message.slice(0, 4000);
  return result;
}

/**
 * @param {unknown} value
 * @returns {Param[]}
 */
function readParams(value) {
  if (Array.isArray(value))
    return value.slice(0, 200).map((v, index) => ({ name: `$${index + 1}`, value: literal(v) }));
  if (isObject(value))
    return Object.entries(value)
      .slice(0, 200)
      .map(([name, v]) => ({ name: /^[:@$?]/.test(name) ? name : `:${name}`, value: literal(v) }));
  return [];
}

/**
 * A parameter written as SQL would show it: strings quoted, `NULL`, numbers as they are.
 *
 * @param {unknown} value
 * @returns {string}
 */
function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'string') return `'${value.replace(/'/g, "''").slice(0, 2000)}'`;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value).toUpperCase() === 'TRUE' || String(value).toUpperCase() === 'FALSE'
      ? String(value).toUpperCase()
      : String(value);
  return `'${(JSON.stringify(value) ?? '').slice(0, 2000)}'`;
}

/**
 * @param {unknown[]} rows - Arrays of values, or objects by column name.
 * @param {unknown[] | null} fields - Names, or `{ name, type }` / node-postgres fields.
 * @returns {ResultSet}
 */
function readRows(rows, fields) {
  /** @type {Column[]} */
  let columns = (fields ?? []).slice(0, MAX_COLUMNS).map((field) => {
    if (typeof field === 'string') return { name: field, type: '' };
    if (isObject(field)) {
      const type = field.type ?? field.dataType ?? field.format ?? '';
      return { name: String(field.name ?? ''), type: typeof type === 'string' ? type : '' };
    }
    return { name: String(field), type: '' };
  });
  const objects = rows.some(isObject);
  if (!columns.length && objects) {
    /** @type {Set<string>} */
    const names = new Set();
    for (const row of rows.slice(0, 1000))
      if (isObject(row))
        for (const key of Object.keys(row)) if (names.size < MAX_COLUMNS) names.add(key);
    columns = [...names].map((name) => ({ name, type: '' }));
  }
  if (!columns.length && rows.length && Array.isArray(rows[0])) {
    columns = rows[0].slice(0, MAX_COLUMNS).map((_, index) => ({ name: `${index + 1}`, type: '' }));
  }
  const cells = rows.slice(0, MAX_ROWS).map((row) => {
    if (Array.isArray(row)) return columns.map((_, index) => cell(row[index]));
    if (isObject(row)) return columns.map((column) => cell(row[column.name]));
    return columns.map((_, index) => (index === 0 ? cell(row) : null));
  });
  return { columns, rows: cells, total: null };
}

/**
 * @param {unknown} value
 * @returns {Cell}
 */
function cell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value) ?? '';
  return String(value);
}

// ------------------------------------------------------------------ tokens

/**
 * @typedef {object} Token
 * @property {"space"|"comment"|"string"|"ident"|"number"|"word"|"punct"|"open"|"close"|"comma"|"op"} type
 * @property {string} text
 */

/**
 * Splits SQL into tokens. Strings (`'…'`, `E'…'`, `$tag$…$tag$`), quoted names (`"…"`,
 * `` `…` ``, `[…]`) and comments are kept whole.
 *
 * @param {string} sql
 * @returns {Token[]}
 */
export function tokenize(sql) {
  /** @type {Token[]} */
  const tokens = [];
  let i = 0;
  const push = (/** @type {Token['type']} */ type, /** @type {number} */ end) => {
    tokens.push({ type, text: sql.slice(i, end) });
    i = end;
  };
  while (i < sql.length) {
    const c = sql[i];
    const rest = sql.slice(i, i + 2);
    if (/\s/.test(c)) {
      let end = i + 1;
      while (end < sql.length && /\s/.test(sql[end])) end += 1;
      push('space', end);
    } else if (rest === '--' || c === '#') {
      const end = sql.indexOf('\n', i);
      push('comment', end < 0 ? sql.length : end);
    } else if (rest === '/*') {
      const end = sql.indexOf('*/', i + 2);
      push('comment', end < 0 ? sql.length : end + 2);
    } else if (c === "'" || (/[eEnNbBxX]/.test(c) && sql[i + 1] === "'")) {
      push('string', quoted(sql, c === "'" ? i : i + 1, "'"));
    } else if (c === '"' || c === '`') {
      push('ident', quoted(sql, i, c));
    } else if (c === '[' && /^\[[\w\s.$#@-]{1,128}\]/.test(sql.slice(i, i + 131))) {
      push('ident', sql.indexOf(']', i) + 1);
    } else if (c === '$' && /^\$(?:[A-Za-z_]\w*)?\$/.test(sql.slice(i))) {
      const tag = /** @type {RegExpExecArray} */ (/^\$(?:[A-Za-z_]\w*)?\$/.exec(sql.slice(i)))[0];
      const end = sql.indexOf(tag, i + tag.length);
      push('string', end < 0 ? sql.length : end + tag.length);
    } else if (/\d/.test(c) || (c === '.' && /\d/.test(sql[i + 1] ?? ''))) {
      const match = /^(?:0x[\da-f]+|\d*\.?\d+(?:e[+-]?\d+)?)/i.exec(sql.slice(i));
      push('number', i + (match ? match[0].length : 1));
    } else if (/[\p{L}_@$:?]/u.test(c)) {
      const match = /^[:@$?]?[\p{L}\p{N}_$#]*/u.exec(sql.slice(i));
      push('word', i + Math.max(1, match ? match[0].length : 1));
    } else if (c === '(') push('open', i + 1);
    else if (c === ')') push('close', i + 1);
    else if (c === ',') push('comma', i + 1);
    else if (c === ';') push('punct', i + 1);
    else if (c === '.') push('op', i + 1);
    else {
      const match = /^(?:::|->>|->|#>>|#>|<=|>=|<>|!=|\|\||<<|>>|=>|[-+*/%=<>!~^&|])/.exec(
        sql.slice(i),
      );
      push('op', i + (match ? match[0].length : 1));
    }
  }
  return tokens;
}

/**
 * @param {string} sql
 * @param {number} start - Position of the opening quote.
 * @param {string} quote
 * @returns {number} Position after the closing quote.
 */
function quoted(sql, start, quote) {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === '\\' && quote === "'" && sql[start - 1]?.toLowerCase() === 'e') i += 2;
    else if (sql[i] === quote) {
      if (sql[i + 1] === quote) i += 2;
      else return i + 1;
    } else i += 1;
  }
  return sql.length;
}

/** Words shown in capitals by the layout. */
export const KEYWORDS = new Set(
  `select from where and or not in is null like ilike between exists as on join inner left right
  full outer cross natural using group by order having limit offset fetch first next rows only
  union all intersect except distinct insert into values update set delete returning with
  recursive create table view index unique primary key foreign references default check
  constraint drop alter add column rename to if case when then else end asc desc nulls last
  over partition window filter lateral true false begin commit rollback transaction grant revoke
  truncate cascade restrict materialized replace conflict do nothing explain analyze verbose
  temporary temp sequence schema database trigger function procedure returns language
  interval cast collate escape some any similar top percent ties merge matched`.split(/\s+/),
);

/** Clauses that start a line in the layout (by their first word and the words that follow). */
const CLAUSES = [
  'select', 'from', 'where', 'group by', 'order by', 'having', 'limit', 'offset', 'fetch',
  'union all', 'union', 'intersect', 'except', 'values', 'set', 'returning', 'insert into',
  'update', 'delete from', 'with recursive', 'with', 'on conflict', 'window', 'join',
  'inner join', 'left join', 'left outer join', 'right join', 'right outer join', 'full join',
  'full outer join', 'cross join', 'natural join', 'merge into', 'when matched',
  'when not matched', 'partition by',
].map((clause) => clause.split(' ')); // prettier-ignore

/** Clauses whose comma-separated items go on lines of their own. */
const LISTS = new Set(['select', 'group by', 'order by', 'set', 'returning', 'partition by']);

/** Words written with a space before the parenthesis that follows them. */
const SPACED =
  /\b(?:in|from|join|as|exists|any|all|some|values|on|and|or|not|over|using|filter|within|into|table|lateral|then|else|when|select|where|by|is)$/i;

/**
 * Puts a query in a readable layout: keywords in capitals, one clause per line, the items
 * of a select list on lines of their own, conditions after `AND` / `OR` indented, and
 * subqueries indented. Comments, strings and names are kept as they are. Inside the
 * parentheses of a function call or a window (`OVER (PARTITION BY …)`) nothing moves.
 *
 * @param {string} sql
 * @param {{ indent?: string, uppercase?: boolean }} [options]
 * @returns {string}
 */
export function formatSql(sql, options = {}) {
  const unit = options.indent ?? '  ';
  const upper = options.uppercase !== false;
  // Spaces are rebuilt; only blank lines (between statements) are kept.
  const tokens = tokenize(sql).filter(
    (token) => token.type !== 'space' || /\n[^\S\n]*\n/.test(token.text),
  );
  /**
   * @typedef {object} Level
   * @property {number} base - Indent of the clauses at this level.
   * @property {number} close - Indent of the closing parenthesis.
   * @property {boolean} layout - Clauses start lines (top level and subqueries).
   * @property {string} clause - The clause being written.
   * @property {boolean} list - Its comma-separated items go on lines of their own.
   */
  /** @type {Level[]} The open parentheses. */
  const stack = [{ base: 0, close: 0, layout: true, clause: '', list: false }];
  let out = '';
  let lineStart = true;
  const top = () => stack[stack.length - 1];
  /**
   * Starts a line. On a line still empty, only its indent changes, unless `blank` asks
   * for an empty line (between statements).
   */
  const newline = (/** @type {number} */ depth, blank = false) => {
    out = out.replace(/[ \t]+$/, '');
    if (out && (!lineStart || blank)) out += '\n';
    out += unit.repeat(Math.max(0, depth));
    lineStart = true;
  };
  const write = (/** @type {string} */ text, /** @type {boolean} */ space = true) => {
    if (!lineStart && space && !/[\s(]$/.test(out)) out += ' ';
    out += text;
    lineStart = false;
  };
  /** Indent of the line being written, in units. */
  const indent = () => {
    const line = out.slice(out.lastIndexOf('\n') + 1);
    return Math.floor((line.length - line.trimStart().length) / Math.max(1, unit.length));
  };
  const glue = (/** @type {string} */ text) => {
    out = out.replace(/[ \t]+$/, '') + text;
    lineStart = false;
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const lower = token.text.toLowerCase();
    const level = top();
    switch (token.type) {
      case 'space':
        newline(0);
        break;
      case 'word': {
        const match = level.layout ? clauseAt(tokens, i) : null;
        if (match) {
          newline(level.base);
          write(match.words.map((w) => (upper ? w.toUpperCase() : w)).join(' '), false);
          level.clause = match.words.join(' ');
          i = match.end;
          level.list = LISTS.has(level.clause) && countItems(tokens, i + 1) > 1;
          if (level.list) newline(level.base + 1);
          break;
        }
        const condition = /^(?:where|having|on|.*join)$/.test(level.clause);
        if (
          level.layout &&
          condition &&
          (lower === 'and' || lower === 'or') &&
          !inBetween(tokens, i)
        ) {
          newline(level.base + 1);
          write(upper ? lower.toUpperCase() : token.text, false);
          break;
        }
        const keyword = upper && KEYWORDS.has(lower) && !isQualified(tokens, i);
        if (/(?:\.|::)$/.test(out)) glue(keyword ? lower.toUpperCase() : token.text);
        else write(keyword ? lower.toUpperCase() : token.text);
        break;
      }
      case 'open': {
        const next = nextWord(tokens, i);
        const sub = next === 'select' || next === 'with' || next === 'values';
        // A function call keeps its parenthesis against its name: count(*), not count (*).
        const call = /[\p{L}\p{N}_"`\]]$/u.test(out) && !SPACED.test(out);
        if (call && level.clause !== 'insert into') glue('(');
        else write('(');
        const line = indent();
        stack.push({
          base: sub ? line + 1 : level.base,
          close: line,
          layout: sub,
          clause: '',
          list: false,
        });
        break;
      }
      case 'close': {
        const closed = stack.length > 1 ? stack.pop() : null;
        if (closed?.layout) {
          newline(closed.close);
          write(')', false);
        } else glue(')');
        break;
      }
      case 'comma':
        glue(',');
        if (level.layout && level.list) newline(level.base + 1);
        break;
      case 'punct':
        glue(';');
        stack.length = 1;
        stack[0].clause = '';
        stack[0].list = false;
        if (i < tokens.length - 1) {
          newline(0);
          newline(0, true);
        }
        break;
      case 'comment':
        write(token.text);
        if (/^(?:--|#)/.test(token.text) && i < tokens.length - 1)
          newline(level.base + (level.list ? 1 : 0));
        break;
      default:
        if (token.text === '.' || token.text === '::') glue(token.text);
        else write(token.text);
    }
  }
  return out
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Number of comma-separated items of the clause that starts at a token.
 *
 * @param {Token[]} tokens
 * @param {number} from
 * @returns {number}
 */
function countItems(tokens, from) {
  let depth = 0;
  let items = 1;
  for (let i = from; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type === 'open') depth += 1;
    else if (token.type === 'close') {
      if (depth === 0) break;
      depth -= 1;
    } else if (token.type === 'punct') break;
    else if (depth === 0 && token.type === 'comma') items += 1;
    else if (depth === 0 && token.type === 'word' && clauseAt(tokens, i)) break;
  }
  return items;
}

/**
 * The clause starting at a token, if any.
 *
 * @param {Token[]} tokens
 * @param {number} index
 * @returns {{ words: string[], end: number } | null}
 */
function clauseAt(tokens, index) {
  if (isQualified(tokens, index)) return null;
  /** @type {{ words: string[], end: number } | null} */
  let best = null;
  for (const words of CLAUSES) {
    let i = index;
    let ok = true;
    for (let w = 0; w < words.length; w += 1) {
      while (w > 0 && tokens[i]?.type === 'space') i += 1;
      if (tokens[i]?.type !== 'word' || tokens[i].text.toLowerCase() !== words[w]) {
        ok = false;
        break;
      }
      if (w < words.length - 1) i += 1;
    }
    if (ok && (!best || words.length > best.words.length)) best = { words, end: i };
  }
  // "LEFT" and "RIGHT" are also functions: only with JOIN after them.
  return best;
}

/**
 * Whether a word follows a dot (`t.select`) or comes before one (`left.id`): a name.
 *
 * @param {Token[]} tokens
 * @param {number} index
 */
function isQualified(tokens, index) {
  return tokens[index - 1]?.text === '.' || tokens[index + 1]?.text === '.';
}

/**
 * Whether an AND belongs to `BETWEEN … AND …`.
 *
 * @param {Token[]} tokens
 * @param {number} index
 */
function inBetween(tokens, index) {
  for (let i = index - 1, seen = 0; i >= 0 && seen < 6; i -= 1) {
    if (tokens[i].type === 'space') continue;
    seen += 1;
    const lower = tokens[i].text.toLowerCase();
    if (lower === 'between') return true;
    if (lower === 'and' || lower === 'or' || tokens[i].type === 'comma') return false;
  }
  return false;
}

/**
 * @param {Token[]} tokens
 * @param {number} index
 * @returns {string}
 */
function nextWord(tokens, index) {
  for (let i = index + 1; i < tokens.length; i += 1) {
    if (tokens[i].type === 'space' || tokens[i].type === 'comment') continue;
    return tokens[i].type === 'word' ? tokens[i].text.toLowerCase() : '';
  }
  return '';
}

/**
 * The kind of a statement, from its first keyword: `SELECT`, `INSERT`, `WITH`…
 *
 * @param {string} sql
 * @returns {string}
 */
export function statementKind(sql) {
  for (const token of tokenize(sql)) {
    if (token.type === 'space' || token.type === 'comment' || token.type === 'open') continue;
    if (token.type !== 'word') return '';
    const word = token.text.toUpperCase();
    return /^[A-Z]{2,12}$/.test(word) ? word : '';
  }
  return '';
}

/**
 * Turns a result into CSV (or TSV), `NULL` as an empty field.
 *
 * @param {ResultSet} result
 * @param {string} [delimiter]
 * @returns {string}
 */
export function resultToCsv(result, delimiter = ',') {
  const field = (/** @type {Cell} */ value) => {
    const text = value ?? '';
    return new RegExp(`["\\r\\n${delimiter === '\t' ? '\\t' : delimiter}]`).test(text)
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  };
  return [result.columns.map((c) => field(c.name)), ...result.rows.map((row) => row.map(field))]
    .map((row) => row.join(delimiter))
    .join('\n');
}
