// @ts-check
/**
 * Reader for configuration files: dotenv (`.env`), INI and Java `.properties`.
 *
 * Every line is kept with its number. Values lose their quotes, and the escapes of
 * double-quoted values are decoded. `${VAR}` and `$VAR` references are listed so they
 * can be shown apart. Nothing is ever expanded or evaluated.
 *
 * @module components/env/parser
 */

/** @typedef {"dotenv" | "ini" | "properties"} EnvFormat */

/**
 * @typedef {object} EnvEntry
 * @property {number} line - First line (1-based).
 * @property {number} lines - Number of lines the entry spans.
 * @property {string} section - INI section (`''` outside any section).
 * @property {string} key
 * @property {string} value - The value without quotes, escapes decoded.
 * @property {'"' | "'" | '`' | ''} quote - Quote around the value.
 * @property {boolean} exported - Written with `export`.
 * @property {string} comment - Comment written before the entry, or at the end of its line.
 */

/**
 * @typedef {object} EnvResult
 * @property {EnvFormat} format
 * @property {EnvEntry[]} entries
 * @property {string[]} sections - Section names, in order.
 * @property {{ line: number, text: string }[]} invalid - Lines that could not be read.
 */

export const FORMATS = /** @type {const} */ (['dotenv', 'ini', 'properties']);

/** Most entries read from one document. */
export const MAX_ENTRIES = 20_000;

/** `${NAME}`, `${NAME:-default}` and `$NAME`. */
const REFERENCE = /\$\{([A-Za-z_][\w.]*)(?:[:?+-][^}]*)?\}|\$([A-Za-z_]\w*)/g;

/**
 * Guesses the format of a document.
 *
 * @param {string} text
 * @returns {EnvFormat}
 */
export function detectFormat(text) {
  const lines = text.split('\n', 400).map((line) => line.trim());
  if (lines.some((line) => /^\[[^\]]+\]$/.test(line) || /^;/.test(line))) return 'ini';
  if (lines.some((line) => /^export\s/.test(line))) return 'dotenv';
  const assignments = lines.filter((line) => line && !/^[#!;]/.test(line));
  if (assignments.some((line) => /^[\w.-]+\s*:\s*/.test(line) && !line.includes('='))) {
    return 'properties';
  }
  if (assignments.length && assignments.every((line) => /^[A-Z_][A-Z0-9_]*=/.test(line))) {
    return 'dotenv';
  }
  return assignments.some((line) => /^[a-z][\w-]*(\.[\w-]+)+\s*=/.test(line))
    ? 'properties'
    : 'dotenv';
}

/**
 * Reads a configuration file.
 *
 * @param {string} text
 * @param {EnvFormat | "auto"} [format]
 * @returns {EnvResult}
 */
export function parseEnv(text, format = 'auto') {
  const source = text.replace(/\r\n?/g, '\n');
  const kind = format === 'auto' ? detectFormat(source) : format;
  const lines = source.split('\n');
  /** @type {EnvResult} */
  const result = { format: kind, entries: [], sections: [], invalid: [] };
  let section = '';
  /** @type {string[]} */
  let comments = [];
  for (let i = 0; i < lines.length && result.entries.length < MAX_ENTRIES; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      comments = [];
      continue;
    }
    if (/^[#;]/.test(trimmed) || (kind === 'properties' && trimmed.startsWith('!'))) {
      comments.push(trimmed.replace(/^[#;!]+\s?/, ''));
      continue;
    }
    if (kind === 'ini' && /^\[[^\]]*\]/.test(trimmed)) {
      section = trimmed.slice(1, trimmed.indexOf(']')).trim();
      if (!result.sections.includes(section)) result.sections.push(section);
      comments = [];
      continue;
    }
    const read = kind === 'properties' ? readProperty(lines, i) : readAssignment(lines, i, kind);
    if (!read) {
      result.invalid.push({ line: i + 1, text: trimmed });
      comments = [];
      continue;
    }
    result.entries.push({
      line: i + 1,
      lines: read.end - i + 1,
      section,
      key: read.key,
      value: read.value,
      quote: read.quote,
      exported: read.exported,
      comment: [...comments, read.comment].filter(Boolean).join('\n'),
    });
    comments = [];
    i = read.end;
  }
  return result;
}

/**
 * @typedef {object} Read
 * @property {string} key
 * @property {string} value
 * @property {'"' | "'" | '`' | ''} quote
 * @property {boolean} exported
 * @property {string} comment
 * @property {number} end - Index of the last line read.
 */

/**
 * `KEY=value` (dotenv, INI): quotes, multi-line quoted values, `export`, end comments.
 *
 * @param {string[]} lines
 * @param {number} index
 * @param {EnvFormat} kind
 * @returns {Read | null}
 */
function readAssignment(lines, index, kind) {
  const match = /^\s*(export\s+)?([^=\s][^=]*?)\s*[=]\s?(.*)$/.exec(lines[index]);
  const ini = kind === 'ini' ? /^\s*([^:\s][^:]*?)\s*:\s?(.*)$/.exec(lines[index]) : null;
  if (!match && !ini) return null;
  const exported = Boolean(match?.[1]);
  const key = (match ? match[2] : /** @type {RegExpExecArray} */ (ini)[1]).trim();
  if (!key || (kind === 'dotenv' && /\s/.test(key))) return null;
  let rest = (match ? match[3] : /** @type {RegExpExecArray} */ (ini)[2]).trimStart();
  const quote = /** @type {'"' | "'" | '`' | ''} */ (/^["'`]/.test(rest) ? rest[0] : '');
  if (!quote) {
    const comment = /\s[#;]\s?(.*)$/.exec(rest);
    const value = (comment ? rest.slice(0, comment.index) : rest).trim();
    return { key, value, quote, exported, comment: comment?.[1].trim() ?? '', end: index };
  }
  // A quoted value may continue on the next lines until its closing quote.
  let end = index;
  rest = rest.slice(1);
  let close = closingQuote(rest, quote);
  while (close < 0 && end + 1 < lines.length && end - index < 200) {
    end += 1;
    rest += `\n${lines[end]}`;
    close = closingQuote(rest, quote);
  }
  if (close < 0) return null;
  const raw = rest.slice(0, close);
  const after = rest.slice(close + 1);
  const comment = /^\s*[#;]\s?(.*)$/.exec(after);
  return {
    key,
    value: quote === '"' ? unescapeDouble(raw) : raw,
    quote,
    exported,
    comment: comment?.[1].trim() ?? '',
    end,
  };
}

/**
 * @param {string} text
 * @param {string} quote
 * @returns {number}
 */
function closingQuote(text, quote) {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\\' && quote !== "'") i += 1;
    else if (text[i] === quote) return i;
  }
  return -1;
}

/**
 * @param {string} text
 * @returns {string}
 */
function unescapeDouble(text) {
  return text.replace(/\\([nrt"\\$`])/g, (_, c) =>
    c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c,
  );
}

/**
 * Java `.properties`: `key=value`, `key: value` or `key value`, lines continued with `\`.
 *
 * @param {string[]} lines
 * @param {number} index
 * @returns {Read | null}
 */
function readProperty(lines, index) {
  let text = lines[index].trimStart();
  let end = index;
  while (/(^|[^\\])(\\\\)*\\$/.test(text) && end + 1 < lines.length && end - index < 500) {
    end += 1;
    text = text.slice(0, -1) + lines[end].trimStart();
  }
  let i = 0;
  while (i < text.length && !/[=:\s]/.test(text[i])) i += text[i] === '\\' ? 2 : 1;
  const key = unescapeProperty(text.slice(0, i));
  if (!key) return null;
  const rest = text.slice(i).replace(/^\s*[=:]?\s*/, '');
  return { key, value: unescapeProperty(rest), quote: '', exported: false, comment: '', end };
}

/**
 * @param {string} text
 * @returns {string}
 */
function unescapeProperty(text) {
  return text.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c) => {
    if (c.length === 5) return String.fromCharCode(parseInt(c.slice(1), 16));
    return c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c;
  });
}

/**
 * Splits a value into text and `${VAR}` references.
 *
 * @param {string} value
 * @returns {{ text: string, ref: string | null }[]}
 */
export function splitReferences(value) {
  /** @type {{ text: string, ref: string | null }[]} */
  const parts = [];
  let last = 0;
  for (const match of value.matchAll(REFERENCE)) {
    const at = match.index ?? 0;
    if (at > 0 && value[at - 1] === '\\') continue;
    if (at > last) parts.push({ text: value.slice(last, at), ref: null });
    parts.push({ text: match[0], ref: match[1] ?? match[2] });
    last = at + match[0].length;
  }
  if (last < value.length) parts.push({ text: value.slice(last), ref: null });
  return parts;
}
