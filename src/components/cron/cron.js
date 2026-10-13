// @ts-check
/**
 * Cron expressions and crontabs: parsing, next runs in a time zone, and the parts used to
 * describe a schedule in words.
 *
 * Fields: `[second] minute hour day-of-month month day-of-week`. Five fields are the
 * standard; six start with seconds. Macros (`@daily`…), names (`JAN`, `MON`), lists, ranges
 * and steps are read, and the Quartz extensions `?`, `L`, `W` and `#` where they make sense.
 *
 * @module components/cron/cron
 */

/**
 * @typedef {{ kind: 'any', step: number }
 *   | { kind: 'value', value: number }
 *   | { kind: 'range', from: number, to: number, step: number }
 *   | { kind: 'last', offset: number }
 *   | { kind: 'weekday', day: number }
 *   | { kind: 'lastWeekday' }
 *   | { kind: 'lastDow', dow: number }
 *   | { kind: 'nth', dow: number, n: number }} CronItem
 */

/**
 * @typedef {object} CronField
 * @property {FieldName} name
 * @property {string} source - The field as written.
 * @property {number} column - 1-based column of the field in the expression.
 * @property {CronItem[]} items
 * @property {number[]} values - Plain values the field allows (sorted, without L, W and #).
 * @property {boolean} any - Every value (`*` or `?`, without a step).
 * @property {boolean} star - Starts with `*` or `?`: for the day fields, the other one decides.
 */

/**
 * @typedef {object} CronError
 * @property {'fields'|'syntax'|'range'|'step'|'reversed'|'special'|'macro'|'empty'} code
 * @property {Record<string, string | number>} params
 * @property {number} field - 0-based index of the field, `-1` for the whole expression.
 * @property {number} column - 1-based column in the expression.
 */

/**
 * @typedef {object} CronSchedule
 * @property {string} source - The expression as written.
 * @property {string | null} macro - `@daily`… when written as a macro.
 * @property {boolean} reboot - `@reboot`: runs at startup, no times.
 * @property {boolean} seconds - Six fields, starting with seconds.
 * @property {CronField[]} fields - Always six: second (`0` when not written) to day-of-week.
 * @property {CronError | null} error
 */

/** @typedef {'second'|'minute'|'hour'|'day'|'month'|'weekday'} FieldName */

/** @type {{ name: FieldName, min: number, max: number }[]} */
export const FIELDS = [
  { name: 'second', min: 0, max: 59 },
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'weekday', min: 0, max: 7 },
];

/** @type {Record<string, string>} */
export const MACROS = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** Longest expression read. */
export const MAX_EXPRESSION = 512;

/**
 * Reads a cron expression.
 *
 * @param {string} input
 * @returns {CronSchedule}
 */
export function parseCron(input) {
  const source = String(input ?? '')
    .slice(0, MAX_EXPRESSION)
    .trim();
  /** @type {CronSchedule} */
  const schedule = {
    source,
    macro: null,
    reboot: false,
    seconds: false,
    fields: [],
    error: null,
  };
  if (!source) {
    schedule.error = { code: 'empty', params: {}, field: -1, column: 1 };
    return schedule;
  }
  let text = source;
  let offset = 0;
  if (text.startsWith('@')) {
    const name = text.toLowerCase();
    if (name === '@reboot') {
      schedule.macro = '@reboot';
      schedule.reboot = true;
      return schedule;
    }
    if (!MACROS[name]) {
      schedule.error = { code: 'macro', params: { name: source }, field: -1, column: 1 };
      return schedule;
    }
    schedule.macro = name;
    text = MACROS[name];
    offset = -1;
  }

  /** @type {{ text: string, column: number }[]} */
  const tokens = [];
  for (const match of text.matchAll(/\S+/g)) {
    tokens.push({ text: match[0], column: offset < 0 ? 1 : (match.index ?? 0) + 1 });
  }
  if (tokens.length !== 5 && tokens.length !== 6) {
    schedule.error = { code: 'fields', params: { count: tokens.length }, field: -1, column: 1 };
    return schedule;
  }
  schedule.seconds = tokens.length === 6;
  if (!schedule.seconds) tokens.unshift({ text: '0', column: 0 });

  for (let i = 0; i < FIELDS.length; i += 1) {
    const result = parseField(i, tokens[i].text, tokens[i].column);
    if ('error' in result) {
      schedule.error = result.error;
      return schedule;
    }
    schedule.fields.push(result.field);
  }
  return schedule;
}

/**
 * @param {number} index
 * @param {string} source
 * @param {number} column
 * @returns {{ field: CronField } | { error: CronError }}
 */
function parseField(index, source, column) {
  const { name, min, max } = FIELDS[index];
  /** @type {CronItem[]} */
  const items = [];
  let at = 0;
  for (const part of source.split(',')) {
    const result = parseItem(index, part);
    if ('code' in result) {
      return {
        error: {
          ...result,
          params: { ...result.params, token: part },
          field: index,
          column: column + at,
        },
      };
    }
    items.push(result);
    at += part.length + 1;
  }
  /** @type {Set<number>} */
  const values = new Set();
  const top = name === 'weekday' ? 6 : max;
  for (const item of items) {
    if (item.kind === 'any') for (let v = min; v <= top; v += item.step) values.add(v);
    else if (item.kind === 'value') values.add(name === 'weekday' ? item.value % 7 : item.value);
    else if (item.kind === 'range') {
      for (let v = item.from; v <= item.to; v += item.step)
        values.add(name === 'weekday' ? v % 7 : v);
    }
  }
  const any = items.length === 1 && items[0].kind === 'any' && items[0].step === 1;
  return {
    field: {
      name,
      source,
      column,
      items,
      values: [...values].sort((a, b) => a - b),
      any,
      star: /^[*?]/.test(source),
    },
  };
}

/**
 * @param {number} index
 * @param {string} part
 * @returns {CronItem | { code: CronError['code'], params: Record<string, string | number> }}
 */
function parseItem(index, part) {
  const { name, min, max } = FIELDS[index];
  const upper = part.toUpperCase();
  if (!upper) return { code: 'syntax', params: {} };

  if (name === 'day') {
    if (upper === 'L') return { kind: 'last', offset: 0 };
    if (upper === 'LW') return { kind: 'lastWeekday' };
    const lastOffset = /^L-(\d{1,2})$/.exec(upper);
    if (lastOffset) {
      const n = Number(lastOffset[1]);
      return n > 30
        ? { code: 'range', params: { value: n, min: 0, max: 30 } }
        : { kind: 'last', offset: n };
    }
    const weekday = /^(\d{1,2})W$/.exec(upper);
    if (weekday) {
      const day = Number(weekday[1]);
      return day < 1 || day > 31
        ? { code: 'range', params: { value: day, min, max } }
        : { kind: 'weekday', day };
    }
  }
  if (name === 'weekday') {
    if (upper === 'L') return { kind: 'value', value: 6 };
    const last = /^(\w+)L$/.exec(upper);
    if (last) {
      const dow = readValue(index, last[1]);
      return typeof dow === 'number' ? { kind: 'lastDow', dow: dow % 7 } : dow;
    }
    const nth = /^(\w+)#(\d)$/.exec(upper);
    if (nth) {
      const dow = readValue(index, nth[1]);
      if (typeof dow !== 'number') return dow;
      const n = Number(nth[2]);
      return n < 1 || n > 5
        ? { code: 'range', params: { value: n, min: 1, max: 5 } }
        : { kind: 'nth', dow: dow % 7, n };
    }
  }
  if (/[LW#]/.test(upper.replace(/[A-Z]{3}/g, ''))) {
    return { code: 'special', params: {} };
  }

  const [base, stepText, ...rest] = upper.split('/');
  if (rest.length) return { code: 'syntax', params: {} };
  let step = 1;
  if (stepText !== undefined) {
    if (!/^\d{1,3}$/.test(stepText) || Number(stepText) < 1) return { code: 'step', params: {} };
    step = Number(stepText);
  }
  if (base === '*' || base === '?') {
    if (base === '?' && name !== 'day' && name !== 'weekday')
      return { code: 'special', params: {} };
    return { kind: 'any', step };
  }
  const range = /^(\w+)-(\w+)$/.exec(base);
  if (range) {
    const from = readValue(index, range[1]);
    if (typeof from !== 'number') return from;
    const to = readValue(index, range[2]);
    if (typeof to !== 'number') return to;
    if (from > to) return { code: 'reversed', params: { from: range[1], to: range[2] } };
    return { kind: 'range', from, to, step };
  }
  const value = readValue(index, base);
  if (typeof value !== 'number') return value;
  // `5/15` means from 5 to the end, every 15.
  if (stepText !== undefined)
    return { kind: 'range', from: value, to: name === 'weekday' ? 6 : max, step };
  return { kind: 'value', value };
}

/**
 * @param {number} index
 * @param {string} text
 * @returns {number | { code: CronError['code'], params: Record<string, string | number> }}
 */
function readValue(index, text) {
  const { name, min, max } = FIELDS[index];
  let value;
  if (/^\d{1,4}$/.test(text)) value = Number(text);
  else if (name === 'month' && MONTHS.includes(text)) value = MONTHS.indexOf(text) + 1;
  else if (name === 'weekday' && DAYS.includes(text)) value = DAYS.indexOf(text);
  else return { code: 'syntax', params: {} };
  if (value < min || value > max) return { code: 'range', params: { value, min, max } };
  return value;
}

// ---------------------------------------------------------------- matching

/**
 * @param {number} year
 * @param {number} month - 1 to 12.
 * @returns {number}
 */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {number} 0 (Sunday) to 6.
 */
function weekdayOf(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * @param {CronField} field
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {boolean}
 */
function dayMatches(field, year, month, day) {
  const last = daysInMonth(year, month);
  for (const item of field.items) {
    if (item.kind === 'any' || item.kind === 'value' || item.kind === 'range') continue;
    if (item.kind === 'last' && day === last - item.offset) return true;
    if (item.kind === 'lastWeekday' && day === nearestWeekday(year, month, last)) return true;
    if (
      item.kind === 'weekday' &&
      item.day <= last &&
      day === nearestWeekday(year, month, item.day)
    )
      return true;
  }
  return field.values.includes(day);
}

/**
 * The weekday (Monday to Friday) nearest a day, without leaving the month.
 *
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {number}
 */
function nearestWeekday(year, month, day) {
  const dow = weekdayOf(year, month, day);
  const last = daysInMonth(year, month);
  if (dow === 6) return day === 1 ? 3 : day - 1;
  if (dow === 0) return day === last ? day - 2 : day + 1;
  return day;
}

/**
 * @param {CronField} field
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {boolean}
 */
function weekdayMatches(field, year, month, day) {
  const dow = weekdayOf(year, month, day);
  for (const item of field.items) {
    if (item.kind === 'lastDow' && dow === item.dow && day + 7 > daysInMonth(year, month))
      return true;
    if (item.kind === 'nth' && dow === item.dow && Math.ceil(day / 7) === item.n) return true;
  }
  return field.values.includes(dow);
}

/**
 * Whether a schedule runs on a date. When both the day of the month and the day of the week
 * are restricted, either one is enough (the cron rule); otherwise both must match.
 *
 * @param {CronSchedule} schedule
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {boolean}
 */
export function runsOn(schedule, year, month, day) {
  const [, , , dom, mon, dow] = schedule.fields;
  if (!mon.values.includes(month)) return false;
  const byDay = dayMatches(dom, year, month, day);
  const byWeekday = weekdayMatches(dow, year, month, day);
  if (dom.star || dow.star) return byDay && byWeekday;
  return byDay || byWeekday;
}

// ---------------------------------------------------------------- time zones

/** @type {Map<string, Intl.DateTimeFormat>} */
const zoneFormats = new Map();

/**
 * @param {string} timeZone
 * @returns {Intl.DateTimeFormat}
 */
function zoneFormat(timeZone) {
  let format = zoneFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    zoneFormats.set(timeZone, format);
  }
  return format;
}

/**
 * Whether a string names a time zone known to the browser.
 *
 * @param {string} timeZone
 * @returns {boolean}
 */
export function isTimeZone(timeZone) {
  try {
    zoneFormat(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** @returns {string} The time zone of the browser. */
export function localTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * Wall-clock time of an instant in a time zone.
 *
 * @param {number} time - Milliseconds since the epoch.
 * @param {string} timeZone
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number }}
 */
export function civil(time, timeZone) {
  /** @type {Record<string, number>} */
  const parts = {};
  for (const part of zoneFormat(timeZone).formatToParts(time)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour % 24,
    minute: parts.minute,
    second: parts.second,
  };
}

/**
 * @param {number} time
 * @param {string} timeZone
 * @returns {number} Offset of the time zone at that instant, in milliseconds.
 */
function offsetAt(time, timeZone) {
  const c = civil(time, timeZone);
  const asUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
  return asUtc - Math.floor(time / 1000) * 1000;
}

/**
 * The instant of a wall-clock time in a time zone: the earlier one when the time happens
 * twice (clocks set back), `null` when it does not exist (clocks set forward).
 *
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @param {number} hour
 * @param {number} minute
 * @param {number} second
 * @param {string} timeZone
 * @returns {number | null}
 */
export function instantOf(year, month, day, hour, minute, second, timeZone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const before = offsetAt(wall - 864e5 / 2, timeZone);
  const after = offsetAt(wall + 864e5 / 2, timeZone);
  const candidates = [...new Set([wall - before, wall - after])].sort((a, b) => a - b);
  for (const time of candidates) {
    const c = civil(time, timeZone);
    if (
      c.year === year &&
      c.month === month &&
      c.day === day &&
      c.hour === hour &&
      c.minute === minute &&
      c.second === second
    ) {
      return time;
    }
  }
  return null;
}

/** Days searched ahead before deciding that a schedule never runs (covers 29 February). */
export const SEARCH_DAYS = 366 * 8 + 2;

/**
 * The next times a schedule runs, after `from`.
 *
 * Times that do not exist because clocks are set forward are skipped, and times that happen
 * twice when clocks are set back run once, at the first.
 *
 * @param {CronSchedule} schedule
 * @param {{ from?: number, count?: number, timeZone?: string }} [options]
 * @returns {Date[]}
 */
export function nextRuns(schedule, { from = Date.now(), count = 5, timeZone = 'UTC' } = {}) {
  if (schedule.error || schedule.reboot || !schedule.fields.length) return [];
  const [sec, min, hour] = schedule.fields;
  /** @type {Date[]} */
  const runs = [];
  const start = civil(from, timeZone);
  let cursor = Date.UTC(start.year, start.month - 1, start.day);
  for (let i = 0; i < SEARCH_DAYS && runs.length < count; i += 1, cursor += 864e5) {
    const date = new Date(cursor);
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    if (!runsOn(schedule, y, m, d)) continue;
    const first = i === 0;
    for (const h of hour.values) {
      if (first && h < start.hour) continue;
      for (const mi of min.values) {
        if (first && h === start.hour && mi < start.minute) continue;
        for (const s of sec.values) {
          const time = instantOf(y, m, d, h, mi, s, timeZone);
          if (time === null || time <= from) continue;
          if (runs.length && time <= runs[runs.length - 1].getTime()) continue;
          runs.push(new Date(time));
          if (runs.length >= count) return runs;
        }
      }
    }
  }
  return runs;
}

/**
 * How many times a schedule runs in each hour of each weekday, from its time fields and the
 * day of the week (`grid[weekday][hour]`, Sunday first). Restrictions on the day of the month
 * and the month are not reflected.
 *
 * @param {CronSchedule} schedule
 * @returns {number[][]}
 */
export function weekGrid(schedule) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  if (schedule.error || schedule.reboot) return grid;
  const [sec, min, hour, dom, , dow] = schedule.fields;
  const perHour = sec.values.length * min.values.length;
  /** @type {Set<number>} */
  const days = new Set(dow.values);
  for (const item of dow.items)
    if (item.kind === 'lastDow' || item.kind === 'nth') days.add(item.dow);
  for (let d = 0; d < 7; d += 1) {
    // With both day fields restricted, any day can run (the day of the month decides).
    if (!dow.any && dom.star && !days.has(d)) continue;
    for (const h of hour.values) grid[d][h] = perHour;
  }
  return grid;
}

// ---------------------------------------------------------------- crontab

/**
 * @typedef {object} CrontabEntry
 * @property {number} line - 1-based line number.
 * @property {string} schedule - The schedule as written (fields or macro).
 * @property {CronSchedule} parsed
 * @property {string} user - The user column (system crontabs), or `""`.
 * @property {string} command
 * @property {string} comment - Comment lines right above the entry.
 * @property {string} timeZone - `CRON_TZ` in effect, or `""`.
 */

/**
 * @typedef {object} Crontab
 * @property {CrontabEntry[]} entries
 * @property {{ line: number, name: string, value: string }[]} variables
 * @property {{ line: number, text: string, error: CronError | null }[]} invalid
 */

/**
 * Reads a crontab: comments, `NAME=value` lines, and entries made of a schedule (five fields
 * or a macro), an optional user column (`system`) and a command.
 *
 * @param {string} text
 * @param {{ system?: boolean, maxLines?: number }} [options]
 * @returns {Crontab}
 */
export function parseCrontab(text, { system = false, maxLines = 5000 } = {}) {
  /** @type {Crontab} */
  const result = { entries: [], variables: [], invalid: [] };
  const lines = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .slice(0, maxLines);
  /** @type {string[]} */
  let comments = [];
  let timeZone = '';
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      comments = [];
      return;
    }
    if (line.startsWith('#')) {
      comments.push(line.replace(/^#+\s?/, ''));
      return;
    }
    const variable = /^([A-Za-z_][\w]*)\s*=\s*(.*)$/.exec(line);
    if (variable) {
      const value = variable[2].replace(/^(['"])(.*)\1$/, '$2');
      result.variables.push({ line: i + 1, name: variable[1], value });
      if (variable[1] === 'CRON_TZ' || variable[1] === 'TZ') timeZone = value;
      comments = [];
      return;
    }
    const words = line.split(/\s+/);
    const scheduleWords = words[0].startsWith('@') ? 1 : 5;
    const schedule = words.slice(0, scheduleWords).join(' ');
    const parsed = parseCron(schedule);
    const rest = words.slice(scheduleWords);
    const user = system ? (rest.shift() ?? '') : '';
    const command = commandOf(raw, scheduleWords + (system ? 1 : 0));
    if (parsed.error || !command) {
      result.invalid.push({ line: i + 1, text: line, error: parsed.error });
    } else {
      result.entries.push({
        line: i + 1,
        schedule,
        parsed,
        user,
        command,
        comment: comments.join('\n'),
        timeZone,
      });
    }
    comments = [];
  });
  return result;
}

/**
 * The text of a line after its first `count` words, spacing kept.
 *
 * @param {string} line
 * @param {number} count
 * @returns {string}
 */
function commandOf(line, count) {
  const match = new RegExp(`^\\s*(?:\\S+\\s+){${count}}`).exec(`${line} `);
  return match ? line.slice(match[0].length).trim() : '';
}

/**
 * Whether a text is a crontab rather than one expression: several lines, comments,
 * variables, or a command after the schedule.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isCrontab(text) {
  const lines = String(text ?? '')
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) return lines.length > 1;
  const line = lines[0];
  if (line.startsWith('#') || /^[A-Za-z_]\w*\s*=/.test(line)) return true;
  const words = line.split(/\s+/);
  if (words[0].startsWith('@')) return words.length > 1;
  if (words.length <= 5) return false;
  // Six words: seconds and five fields, or five fields and a command.
  return words.length > 6 || parseCron(line).error !== null;
}
