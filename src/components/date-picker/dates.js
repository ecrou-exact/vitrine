// @ts-check
/**
 * Dates of <vt-date-picker>: days counted from 1970-01-01 (UTC), so a date never moves with
 * time zones or summer time; ISO 8601 and typed dates; month grids; rules that block days;
 * and ranges such as "Last 7 days".
 *
 * @module components/date-picker/dates
 */

export const DAY_MS = 864e5;

/** Earliest and latest days a picker accepts: years 1 to 9999. */
export const FIRST_DAY = dayNumber(1, 1, 1);
export const LAST_DAY = dayNumber(9999, 12, 31);

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * @param {number} year
 * @param {number} month - 1 to 12.
 * @param {number} day
 * @returns {number} Days since 1970-01-01.
 */
export function dayNumber(year, month, day) {
  // setUTCFullYear() keeps years 0 to 99 as they are, where Date.UTC() adds 1900.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return Math.round(date.getTime() / DAY_MS);
}

/**
 * @param {number} day
 * @returns {{ year: number, month: number, day: number }}
 */
export function fromDayNumber(day) {
  const date = new Date(day * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * @param {number} day
 * @returns {number} 0 (Sunday) to 6.
 */
export function weekdayOf(day) {
  return (((day + 4) % 7) + 7) % 7;
}

/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {number | null} The day, or `null` when it does not exist (February 30).
 */
function validDay(year, month, day) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const n = dayNumber(year, month, day);
  return fromDayNumber(n).day === day ? n : null;
}

/**
 * @param {unknown} text - `YYYY-MM-DD`.
 * @returns {number | null}
 */
export function parseIso(text) {
  const match = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(String(text ?? ''));
  return match ? validDay(Number(match[1]), Number(match[2]), Number(match[3])) : null;
}

/**
 * @param {number} day
 * @returns {string} `YYYY-MM-DD`.
 */
export function toIso(day) {
  const { year, month, day: d } = fromDayNumber(day);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** @typedef {'day' | 'month' | 'year'} DatePart */

/**
 * The order of day, month and year in the numeric dates of a language.
 *
 * @param {string} locale
 * @returns {DatePart[]}
 */
export function dateOrder(locale) {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'UTC',
    }).formatToParts(Date.UTC(2000, 10, 22));
    const order = /** @type {DatePart[]} */ (
      parts.map((p) => p.type).filter((t) => t === 'day' || t === 'month' || t === 'year')
    );
    if (order.length === 3) return order;
  } catch {
    // An unknown language: the order of most of the world.
  }
  return ['day', 'month', 'year'];
}

/**
 * A date as typed by a person: ISO 8601, or the numeric order of their language with any
 * separator (`22/11/2026`, `22.11.26`, `11-22-2026`). Without a year, the year of `today`.
 *
 * @param {string} text
 * @param {DatePart[]} order
 * @param {number} today
 * @returns {number | null}
 */
export function parseTyped(text, order, today) {
  const value = String(text ?? '').trim();
  if (!value || value.length > 40) return null;
  const iso = parseIso(value);
  if (iso !== null) return iso;
  if (/^\d{4}[^\d]\d{1,2}[^\d]\d{1,2}$/.test(value)) {
    const [y, m, d] = value.split(/[^\d]/).map(Number);
    return validDay(y, m, d);
  }
  const numbers = value.split(/[^\d]+/).filter(Boolean);
  if (numbers.length < 2 || numbers.length > 3 || numbers.some((n) => n.length > 4)) return null;
  const parts = order.filter((part) => numbers.length === 3 || part !== 'year');
  /** @type {Record<DatePart, number>} */
  const read = { day: 0, month: 0, year: fromDayNumber(today).year };
  parts.forEach((part, index) => {
    const raw = numbers[index];
    let n = Number(raw);
    if (part === 'year' && raw.length <= 2) n += 2000;
    read[part] = n;
  });
  return validDay(read.year, read.month, read.day);
}

/**
 * The first day of the week of a language: 0 (Sunday) to 6.
 *
 * @param {string} locale
 * @returns {number}
 */
export function firstDayOfWeek(locale) {
  try {
    const info =
      /** @type {{ getWeekInfo?: () => { firstDay: number }, weekInfo?: { firstDay: number } }} */ (
        /** @type {unknown} */ (new Intl.Locale(locale))
      );
    const week = info.getWeekInfo?.() ?? info.weekInfo;
    if (week && Number.isInteger(week.firstDay)) return week.firstDay % 7;
  } catch {
    // Older browsers: guessed from the region below.
  }
  const region =
    /-([A-Z]{2})\b/.exec(locale)?.[1] ?? (/^(en|ja|he|zh|ko|pt)\b/.test(locale) ? 'US' : '');
  return ['US', 'CA', 'JP', 'IL', 'BR', 'MX', 'PH', 'KR', 'TW', 'IN', 'SA', 'ZA', 'AU', 'HK'].includes(region) ? 0 : 1; // prettier-ignore
}

/**
 * @param {number} day
 * @returns {number} The first day of its month.
 */
export function monthStart(day) {
  const { year, month } = fromDayNumber(day);
  return dayNumber(year, month, 1);
}

/**
 * @param {number} day
 * @param {number} count - Months to add, negative to go back.
 * @returns {number} The same day of the month, or the last day of a shorter month.
 */
export function addMonths(day, count) {
  const { year, month, day: d } = fromDayNumber(day);
  const index = year * 12 + (month - 1) + count;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const last = fromDayNumber(dayNumber(y, m + 1, 1) - 1).day;
  return dayNumber(y, m, Math.min(d, last));
}

/**
 * The six weeks shown for a month.
 *
 * @param {number} start - Any day of the month.
 * @param {number} firstDay - First day of the week, 0 to 6.
 * @returns {number[][]} Six rows of seven days.
 */
export function monthGrid(start, firstDay) {
  const first = monthStart(start);
  const offset = (weekdayOf(first) - firstDay + 7) % 7;
  const begin = first - offset;
  return Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: 7 }, (_, col) => begin + row * 7 + col),
  );
}

/**
 * @typedef {object} DayRules
 * @property {Set<number>} days - Days that cannot be chosen.
 * @property {[number, number][]} ranges - Periods that cannot be chosen.
 * @property {Set<number>} weekdays - Days of the week that cannot be chosen (0 is Sunday).
 */

/**
 * Days that cannot be chosen: a JSON list, or words separated by commas or spaces. Each one is
 * a date (`2026-12-25`), a period (`2026-12-24/2026-12-31`) or a day of the week (`sat`, `sun`).
 *
 * @param {unknown} source
 * @returns {DayRules}
 */
export function parseRules(source) {
  /** @type {DayRules} */
  const rules = { days: new Set(), ranges: [], weekdays: new Set() };
  /** @type {unknown[]} */
  let items = [];
  if (Array.isArray(source)) items = source;
  else if (typeof source === 'string') {
    const text = source.trim();
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        items = [];
      }
    } else items = text.split(/[\s,;]+/);
  }
  for (const item of items.slice(0, 5000)) {
    if (item && typeof item === 'object') {
      const record = /** @type {Record<string, unknown>} */ (item);
      const from = parseIso(record.start ?? record.from);
      const to = parseIso(record.end ?? record.to);
      if (from !== null && to !== null) rules.ranges.push(from <= to ? [from, to] : [to, from]);
      continue;
    }
    const word = String(item ?? '')
      .trim()
      .toLowerCase();
    if (!word) continue;
    const weekday = WEEKDAYS.indexOf(word.slice(0, 3));
    if (weekday >= 0 && /^[a-z]+$/.test(word)) {
      rules.weekdays.add(weekday);
      continue;
    }
    const [a, b] = word.split('/');
    const from = parseIso(a);
    const to = b === undefined ? from : parseIso(b);
    if (from === null || to === null) continue;
    if (from === to) rules.days.add(from);
    else rules.ranges.push(from <= to ? [from, to] : [to, from]);
  }
  return rules;
}

/**
 * @param {number} day
 * @param {DayRules} rules
 * @param {number} min
 * @param {number} max
 * @returns {boolean} Whether the day cannot be chosen.
 */
export function isBlocked(day, rules, min = FIRST_DAY, max = LAST_DAY) {
  if (day < min || day > max) return true;
  if (rules.days.has(day) || rules.weekdays.has(weekdayOf(day))) return true;
  return rules.ranges.some(([from, to]) => day >= from && day <= to);
}

/**
 * The first day from `day` in the direction of `step` that can be chosen.
 *
 * @param {number} day
 * @param {number} step - 1 or -1.
 * @param {DayRules} rules
 * @param {number} min
 * @param {number} max
 * @returns {number | null}
 */
export function nearestFree(day, step, rules, min, max) {
  for (let n = 0, d = day; n < 400; n += 1, d += step) {
    if (d < min || d > max) return null;
    if (!isBlocked(d, rules, min, max)) return d;
  }
  return null;
}

/**
 * @typedef {object} Selection
 * @property {number | null} start
 * @property {number | null} end
 */

/**
 * A value: one ISO date, or a period `start/end` (also `start,end`, or JSON with `start` and
 * `end`). The two ends of a period are put in order.
 *
 * @param {unknown} value
 * @param {boolean} range
 * @returns {Selection}
 */
export function parseValue(value, range) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = /** @type {Record<string, unknown>} */ (value);
    return order(parseIso(record.start ?? record.from), range ? parseIso(record.end ?? record.to) : null); // prettier-ignore
  }
  const text = String(value ?? '').trim();
  if (text.startsWith('{')) {
    try {
      return parseValue(JSON.parse(text), range);
    } catch {
      return { start: null, end: null };
    }
  }
  // One character on each side of a dash, and the parts trimmed after: no pattern that could
  // backtrack on long runs of spaces. A value is never longer than two dates.
  const [a, b] = text
    .slice(0, 100)
    .split(/[/,]|\s[–—-]\s/)
    .map((part) => part.trim());
  const start = parseIso(a);
  return order(start, range ? parseIso(b) : null);
}

/**
 * @param {number | null} start
 * @param {number | null} end
 * @returns {Selection}
 */
function order(start, end) {
  if (start !== null && end !== null && end < start) return { start: end, end: start };
  return { start, end };
}

/**
 * @typedef {object} Preset
 * @property {string} key - `today`, `yesterday`, `last7`, `last30`, `thisWeek`, `lastWeek`,
 *   `thisMonth`, `lastMonth`, `thisYear` or `nextWeek`, `next30`.
 * @property {number} start
 * @property {number} end
 */

/**
 * Usual periods, around `today`.
 *
 * @param {number} today
 * @param {number} firstDay - First day of the week.
 * @param {string[]} keys
 * @returns {Preset[]}
 */
export function presetRanges(today, firstDay, keys = PRESETS) {
  const week = today - ((weekdayOf(today) - firstDay + 7) % 7);
  const month = monthStart(today);
  const { year } = fromDayNumber(today);
  /** @type {Record<string, [number, number]>} */
  const all = {
    today: [today, today],
    yesterday: [today - 1, today - 1],
    last7: [today - 6, today],
    last30: [today - 29, today],
    thisWeek: [week, week + 6],
    lastWeek: [week - 7, week - 1],
    nextWeek: [week + 7, week + 13],
    next30: [today, today + 29],
    thisMonth: [month, addMonths(month, 1) - 1],
    lastMonth: [addMonths(month, -1), month - 1],
    thisYear: [dayNumber(year, 1, 1), dayNumber(year, 12, 31)],
  };
  return keys
    .filter((key) => all[key])
    .map((key) => ({ key, start: all[key][0], end: all[key][1] }));
}

/** The periods offered by default. */
export const PRESETS = ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth', 'thisYear']; // prettier-ignore
