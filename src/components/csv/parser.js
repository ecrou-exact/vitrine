// @ts-check
/**
 * CSV / TSV parser following RFC 4180: quoted fields, doubled quotes ("") inside quotes,
 * line breaks inside quoted fields, CRLF or LF line endings.
 *
 * It never recurses, reads the text once, and stops adding columns past a limit so a
 * hostile file cannot create millions of cells in one row.
 *
 * @module components/csv/parser
 */

/** Columns kept per row; extra cells are dropped (and reported). */
export const MAX_COLUMNS = 1000;

/** Delimiters recognized by detection. */
export const DELIMITERS = Object.freeze([',', ';', '\t', '|']);

/**
 * @typedef {object} CsvError
 * @property {string} message
 * @property {number} line - 1-based line where the problem starts.
 */

/**
 * @typedef {object} CsvResult
 * @property {string[][]} rows - All rows, header included.
 * @property {string} delimiter
 * @property {number} columns - Widest row.
 * @property {boolean} truncatedColumns - `true` when some rows had more than MAX_COLUMNS cells.
 * @property {CsvError | null} error - Unclosed quote, for example. Rows are still returned.
 */

/**
 * Guesses the delimiter from the first lines: the candidate that gives the most
 * consistent, greater-than-one number of fields per line wins.
 *
 * @param {string} text
 * @returns {string}
 */
export function detectDelimiter(text) {
  const sample = text
    .slice(0, 20_000)
    .split(/\r?\n/)
    .slice(0, 20)
    .filter((line) => line.trim());
  let best = ',';
  let bestScore = 0;
  for (const delimiter of DELIMITERS) {
    const counts = sample.map((line) => countOutsideQuotes(line, delimiter));
    if (!counts.length || counts[0] === 0) continue;
    const consistent = counts.filter((c) => c === counts[0]).length / counts.length;
    const score = consistent * 10 + Math.min(counts[0], 10);
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

/**
 * @param {string} line
 * @param {string} delimiter
 * @returns {number}
 */
function countOutsideQuotes(line, delimiter) {
  let count = 0;
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) count += 1;
  }
  return count;
}

/**
 * Parses CSV text.
 *
 * @param {string} text
 * @param {{ delimiter?: string }} [options] - Detected when omitted.
 * @returns {CsvResult}
 */
export function parseCsv(text, options = {}) {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = options.delimiter ?? detectDelimiter(source);
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = '';
  let quoted = false;
  let quoteLine = 0;
  let line = 1;
  let columns = 0;
  let truncatedColumns = false;
  let i = 0;
  const n = source.length;

  const endField = () => {
    if (row.length < MAX_COLUMNS) row.push(field);
    else truncatedColumns = true;
    field = '';
  };
  const endRow = () => {
    endField();
    columns = Math.max(columns, row.length);
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      // Copy everything up to the next quote at once (line breaks included).
      const next = source.indexOf('"', i);
      const end = next === -1 ? n : next;
      const chunk = source.slice(i, end);
      line += countNewlines(chunk);
      field += chunk;
      i = end;
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
      quoteLine = line;
      i += 1;
    } else if (char === delimiter) {
      endField();
      i += 1;
    } else if (char === '\n' || char === '\r') {
      endRow();
      i += char === '\r' && source[i + 1] === '\n' ? 2 : 1;
      line += 1;
    } else {
      field += char;
      i += 1;
    }
  }
  if (field !== '' || row.length) endRow();
  /** @type {CsvError | null} */
  const error = quoted ? { message: 'Unclosed quoted field', line: quoteLine } : null;
  return { rows, delimiter, columns, truncatedColumns, error };
}

/**
 * @param {string} text
 * @returns {number}
 */
function countNewlines(text) {
  let count = 0;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) count += 1;
  return count;
}

/** @typedef {"number" | "date" | "boolean" | "text"} ColumnType */

const NUMBER = /^[+-]?(?:\d{1,3}(?:[ ,]\d{3})+|\d+)?(?:[.]\d+)?(?:e[+-]?\d+)?%?$/i;
const DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const BOOLEAN = /^(?:true|false|yes|no)$/i;

/**
 * Infers a column type from its non-empty cells (sampled).
 *
 * @param {string[][]} rows - Data rows (header excluded).
 * @param {number} column
 * @returns {ColumnType}
 */
export function inferType(rows, column) {
  let seen = 0;
  const counts = { number: 0, date: 0, boolean: 0 };
  for (let r = 0; r < rows.length && seen < 500; r += 1) {
    const value = (rows[r][column] ?? '').trim();
    if (!value) continue;
    seen += 1;
    if (NUMBER.test(value) && /\d/.test(value)) counts.number += 1;
    else if (DATE.test(value)) counts.date += 1;
    else if (BOOLEAN.test(value)) counts.boolean += 1;
  }
  if (!seen) return 'text';
  if (counts.number === seen) return 'number';
  if (counts.date === seen) return 'date';
  if (counts.boolean === seen) return 'boolean';
  return 'text';
}

/**
 * Sort key of a cell for its column type. Empty cells always sort last.
 *
 * @param {string} value
 * @param {ColumnType} type
 * @returns {number | string}
 */
export function sortKey(value, type) {
  const v = value.trim();
  if (type === 'number') return Number(v.replace(/[ ,%]/g, ''));
  if (type === 'date') return Date.parse(v);
  return v.toLowerCase();
}

/**
 * Serializes rows back to CSV (fields quoted when needed).
 *
 * @param {string[][]} rows
 * @param {string} delimiter
 * @returns {string}
 */
export function toCsv(rows, delimiter) {
  /** @param {string} cell */
  const needsQuotes = (cell) =>
    cell.includes('"') || cell.includes('\r') || cell.includes('\n') || cell.includes(delimiter);
  return rows
    .map((row) =>
      row
        .map((cell) => (needsQuotes(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(delimiter),
    )
    .join('\n');
}
