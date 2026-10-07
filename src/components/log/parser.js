// @ts-check
/**
 * Reads application logs into entries: time, level, message, structured fields, and the
 * continuation lines that belong to them (stack traces, multi-line messages).
 *
 * Each line is read in one of three formats, detected per line:
 *
 * - **JSON lines** (NDJSON): pino, bunyan, winston, Logstash… `level` may be a name or a
 *   pino number (`30` is info);
 * - **logfmt**: `time=… level=warn msg="…" key=value`;
 * - **plain text**: an optional leading timestamp (ISO 8601, syslog `Oct  7 18:00:00`, or a
 *   time of day), then a level written as `ERROR`, `[warn]`, `level=info`, `W/`…
 *
 * Lines that start with white space, `at `, `Caused by` or `Traceback`, and lines without
 * a timestamp that follow an entry with one, are continuations of that entry.
 *
 * @module components/log/parser
 */

/** @typedef {"trace" | "debug" | "info" | "notice" | "warn" | "error" | "fatal"} Level */

/**
 * @typedef {object} LogEntry
 * @property {number} line - 1-based line number of the first line.
 * @property {string} time - Timestamp as written, or `""`.
 * @property {Level | null} level
 * @property {string} message - The message (may contain ANSI escape sequences).
 * @property {[string, string][]} fields - Other fields of structured lines.
 * @property {string[]} more - Continuation lines.
 * @property {"text" | "json" | "logfmt"} format
 */

/** Levels from least to most severe. */
export const LEVELS = /** @type {const} */ ([
  'trace', 'debug', 'info', 'notice', 'warn', 'error', 'fatal',
]); // prettier-ignore

const ALIASES = /** @type {Record<string, Level>} */ ({
  trace: 'trace', verbose: 'trace', vrb: 'trace', trc: 'trace', finest: 'trace', finer: 'trace',
  debug: 'debug', dbg: 'debug', fine: 'debug',
  info: 'info', information: 'info', informational: 'info', inf: 'info',
  notice: 'notice', ntc: 'notice',
  warn: 'warn', warning: 'warn', wrn: 'warn',
  error: 'error', err: 'error', erro: 'error', severe: 'error', failure: 'error',
  fatal: 'fatal', crit: 'fatal', critical: 'fatal', alert: 'fatal', emerg: 'fatal',
  emergency: 'fatal', panic: 'fatal', ftl: 'fatal',
}); // prettier-ignore

/** Single-letter levels of Android logcat and Go's glog (`E/Tag:`, `E1007 …`). */
const LETTERS = /** @type {Record<string, Level>} */ ({
  V: 'trace',
  D: 'debug',
  I: 'info',
  W: 'warn',
  E: 'error',
  F: 'fatal',
});

/** Longest line kept (characters). */
export const MAX_LINE = 20_000;
/** Continuation lines kept per entry. */
const MAX_MORE = 1000;

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
const TIME = new RegExp(
  [
    // 2026-10-07T18:00:00.123Z, 2026-10-07 18:00:00,123 +02:00
    String.raw`\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d{1,9})?)?(?:\s?(?:Z|[+-]\d{2}:?\d{2}|UTC))?`,
    // 07/Oct/2026:18:00:00 +0200 (Apache, nginx)
    String.raw`\d{2}\/(?:${MONTHS})\/\d{4}:\d{2}:\d{2}:\d{2}(?: [+-]\d{4})?`,
    // Oct  7 18:00:00 (syslog)
    String.raw`(?:${MONTHS}) {1,2}\d{1,2} \d{2}:\d{2}:\d{2}`,
    // 18:00:00.123
    String.raw`\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?`,
  ].join('|'),
);
const LEADING_TIME = new RegExp(String.raw`^\[?(${TIME.source})\]?\s*`);

/** SGR escape sequences, ignored when looking for the level. */
// eslint-disable-next-line no-control-regex
const ESCAPES = /\u001b\[[\d;:]*m/g;

/**
 * Removes a leading token from text that may wrap it in color escape sequences.
 *
 * @param {string} text
 * @param {string} token - The token as found in the text without escapes.
 * @returns {string}
 */
function dropLeading(text, token) {
  if (!text.includes('\u001b')) return text.slice(token.length);
  // Only the word itself is matched; the separators after it are trimmed at the end.
  const word = token.replace(/[\s:|-]+$/, '');
  let i = 0;
  let matched = 0;
  // Walk the text, skipping escape sequences, until the token's characters are consumed.
  while (i < text.length && matched < word.length) {
    if (text[i] === '\u001b') {
      const end = text.indexOf('m', i);
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    i += 1;
    matched += 1;
  }
  // Escape sequences right after the token (a color reset) go with it.
  while (text[i] === '\u001b') {
    const end = text.indexOf('m', i);
    if (end < 0) break;
    i = end + 1;
  }
  return text.slice(i).replace(/^[\s:|-]+/, '');
}

/** A level word in plain text: upper case, or any case inside brackets or after `level=`. */
const LEVEL_WORD = new RegExp(
  String.raw`^(?:` +
    String.raw`\[\s*([A-Za-z]{3,13})\s*\]|` + // [error] [WARN]
    String.raw`<([A-Za-z]{3,13})>|` + // <error>
    String.raw`(?:level|lvl|severity)[=:]\s*"?([A-Za-z]{3,13})"?|` + // level=warn
    String.raw`([A-Z]{3,13})(?=[\s:|\]\-]|$)` + // ERROR, WARN:
    String.raw`)\s*[:|\-]?\s*`,
);

/**
 * Normalizes a level name or pino number.
 *
 * @param {unknown} value
 * @returns {Level | null}
 */
export function toLevel(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 60) return 'fatal';
    if (value >= 50) return 'error';
    if (value >= 40) return 'warn';
    if (value >= 30) return 'info';
    if (value >= 20) return 'debug';
    return 'trace';
  }
  if (typeof value !== 'string') return null;
  const lower = value.trim().toLowerCase();
  if (/^\d+$/.test(lower)) return toLevel(Number(lower));
  return ALIASES[lower] ?? null;
}

/**
 * @param {Record<string, unknown>} object
 * @param {string[]} keys
 * @returns {[string, unknown] | null}
 */
function pick(object, keys) {
  for (const key of keys) {
    if (key in object && object[key] !== null && object[key] !== undefined)
      return [key, object[key]];
  }
  return null;
}

/**
 * Field value as one line of text.
 *
 * @param {unknown} value
 * @returns {string}
 */
function fieldText(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Reads a JSON line.
 *
 * @param {string} text
 * @returns {Omit<LogEntry, "line" | "more"> | null}
 */
function fromJson(text) {
  if (!/^\s*\{/.test(text) || !/\}\s*$/.test(text)) return null;
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const object = /** @type {Record<string, unknown>} */ (data);
  const used = new Set();
  const time = pick(object, ['time', 'timestamp', '@timestamp', 'ts', 'date', 'datetime', 't']);
  const level = pick(object, ['level', 'lvl', 'severity', 'levelname', 'log.level', 'loglevel']);
  const message = pick(object, ['msg', 'message', 'event', 'text', 'log']);
  for (const found of [time, level, message]) if (found) used.add(found[0]);
  return {
    time: time ? formatTime(time[1]) : '',
    level: level ? toLevel(level[1]) : null,
    message: message ? fieldText(message[1]) : '',
    fields: Object.entries(object)
      // Bunyan's format version ("v": 0) only adds noise.
      .filter(([key]) => !used.has(key) && !(key === 'v' && object.v === 0))
      .slice(0, 50)
      .map(([key, value]) => [key, fieldText(value)]),
    format: 'json',
  };
}

/**
 * Epoch milliseconds or seconds become ISO strings; other values are kept as written.
 *
 * @param {unknown} value
 * @returns {string}
 */
function formatTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e11 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }
  return fieldText(value);
}

/**
 * Reads a logfmt line (at least two `key=value` pairs, one of them a level or message).
 *
 * @param {string} text
 * @returns {Omit<LogEntry, "line" | "more"> | null}
 */
function fromLogfmt(text) {
  if (!/^\s*[\w.@-]+=/.test(text)) return null;
  /** @type {[string, string][]} */
  const pairs = [];
  const pattern = /([\w.@-]+)=("(?:[^"\\]|\\.)*"|\S*)/g;
  let match;
  let consumed = 0;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[2];
    const value = raw.startsWith('"') ? raw.slice(1, -1).replace(/\\(.)/g, '$1') : raw;
    pairs.push([match[1], value]);
    consumed += match[0].length;
    if (pairs.length > 60) break;
  }
  // Mostly prose with a stray "=": not logfmt.
  if (pairs.length < 2 || consumed < text.replace(/\s/g, '').length * 0.6) return null;
  const find = (/** @type {string[]} */ keys) =>
    pairs.find(([key]) => keys.includes(key.toLowerCase()));
  const time = find(['time', 'ts', 'timestamp', 't', 'date']);
  const level = find(['level', 'lvl', 'severity']);
  const message = find(['msg', 'message', 'event']);
  if (!level && !message) return null;
  return {
    time: time?.[1] ?? '',
    level: level ? toLevel(level[1]) : null,
    message: message?.[1] ?? '',
    fields: pairs.filter((pair) => pair !== time && pair !== level && pair !== message),
    format: 'logfmt',
  };
}

/**
 * Reads a plain text line.
 *
 * @param {string} text
 * @returns {Omit<LogEntry, "line" | "more">}
 */
function fromText(text) {
  let rest = text;
  let time = '';
  const timeMatch = LEADING_TIME.exec(rest);
  if (timeMatch) {
    time = timeMatch[1];
    rest = rest.slice(timeMatch[0].length);
  }
  /** @type {Level | null} */
  let level = null;
  // Colored levels ("\e[32mINFO\e[0m") are read without their escape sequences.
  const plain = rest.includes('\u001b') ? rest.replace(ESCAPES, '') : rest;
  // Logcat: "E/ActivityManager: …"; glog: "E1007 18:00:00.000 …".
  const letter = /^([VDIWEF])(?:\/|(?=\d{4} ))/.exec(plain);
  if (letter) level = LETTERS[letter[1]];
  else {
    // The level may follow a process or thread name: look at the first few words.
    const head = plain.slice(0, 120);
    for (let start = 0, words = 0; start < head.length && words < 4; words += 1) {
      const match = LEVEL_WORD.exec(head.slice(start));
      if (match) {
        const found = toLevel(match[1] ?? match[2] ?? match[3] ?? match[4]);
        if (found) {
          level = found;
          // Drop the level token only when it starts the message.
          if (start === 0) rest = dropLeading(rest, match[0]);
          break;
        }
      }
      const next = head.indexOf(' ', start);
      if (next < 0) break;
      start = next + 1;
    }
  }
  return { time, level, message: rest, fields: [], format: 'text' };
}

/**
 * Is this line a continuation of the previous entry?
 *
 * @param {string} text
 * @param {LogEntry | undefined} previous
 * @param {boolean} timestamped - Entries of this log start with a timestamp.
 */
function isContinuation(text, previous, timestamped) {
  if (!previous) return false;
  if (/^\s+\S/.test(text) && !/^\s*\{/.test(text)) return true;
  if (/^(?:at |Caused by:|Traceback |\.\.\. \d+ more|During handling of)/.test(text)) return true;
  // The exception line that ends a traceback ("ZeroDivisionError: division by zero").
  if (previous.more.length && /^[\w.$]+(?:Error|Exception|Exit|Interrupt)\b/.test(text))
    return true;
  if (!timestamped || previous.time === '' || LEADING_TIME.test(text) || /^\s*\{/.test(text))
    return false;
  // A line with a level of its own starts a new entry, even without a timestamp.
  return !(fromLogfmt(text) ?? fromText(text)).level;
}

/**
 * Incremental log reader: feed it text as it arrives.
 */
export class LogParser {
  constructor() {
    /** @type {LogEntry[]} */
    this.entries = [];
    this.lineNumber = 0;
    /** Unfinished last line, waiting for its line break. */
    this.partial = '';
    /** Lines seen with a leading timestamp, to decide what a continuation is. */
    this.timestamped = 0;
    this.lines = 0;
  }

  /**
   * Adds text; returns the index of the first entry that changed or was added.
   *
   * @param {string} text
   * @param {boolean} [final] - No more text will come: the last line is complete.
   * @returns {number}
   */
  push(text, final = false) {
    const firstChanged = Math.max(0, this.entries.length - 1);
    const lines = (this.partial + text).split(/\r?\n/);
    this.partial = final ? '' : (lines.pop() ?? '');
    for (const raw of lines) this.add(raw.length > MAX_LINE ? raw.slice(0, MAX_LINE) : raw);
    return firstChanged;
  }

  /**
   * @param {string} text
   */
  add(text) {
    this.lineNumber += 1;
    if (!text.trim()) {
      // Blank lines inside a stack trace keep it together; others are dropped.
      const last = this.entries[this.entries.length - 1];
      if (last?.more.length && last.more.length < MAX_MORE) last.more.push('');
      return;
    }
    this.lines += 1;
    if (LEADING_TIME.test(text)) this.timestamped += 1;
    const previous = this.entries[this.entries.length - 1];
    const timestamped = this.timestamped * 2 >= this.lines;
    if (isContinuation(text, previous, timestamped)) {
      if (previous.more.length < MAX_MORE) previous.more.push(text);
      return;
    }
    const parsed = fromJson(text) ?? fromLogfmt(text) ?? fromText(text);
    this.entries.push({ ...parsed, line: this.lineNumber, more: [] });
  }
}

/**
 * Reads a whole log.
 *
 * @param {string} text
 * @returns {LogEntry[]}
 */
export function parseLog(text) {
  const parser = new LogParser();
  parser.push(text, true);
  // Trailing blank lines kept inside the last stack trace are not part of it.
  for (const entry of parser.entries) {
    while (entry.more.length && !entry.more[entry.more.length - 1].trim()) entry.more.pop();
  }
  return parser.entries;
}

/**
 * Number of entries per level (`none` for entries without a level).
 *
 * @param {LogEntry[]} entries
 * @returns {Record<Level | "none", number>}
 */
export function countLevels(entries) {
  const counts = /** @type {Record<Level | "none", number>} */ (
    Object.fromEntries([...LEVELS, 'none'].map((level) => [level, 0]))
  );
  for (const entry of entries) counts[entry.level ?? 'none'] += 1;
  return counts;
}
