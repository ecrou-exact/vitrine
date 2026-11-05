// @ts-check
/**
 * Calendar dates as day numbers, recurrence expansion and occurrences in a time zone.
 *
 * Recurrences are worked out in the wall-clock time of the event, so a 09:00 meeting stays at
 * 09:00 on both sides of a daylight saving change.
 *
 * @module components/calendar/recur
 */
import { civil, daysInMonth, instantOf } from '../cron/cron.js';

/** @typedef {import('./ics.js').CalendarEvent} CalendarEvent */
/** @typedef {import('./ics.js').DateValue} DateValue */
/** @typedef {import('./ics.js').Rule} Rule */

/**
 * @typedef {object} Occurrence
 * @property {string} id - Unique in a calendar: event and day.
 * @property {CalendarEvent} event
 * @property {boolean} allDay
 * @property {number} start - Instant (timed), or midnight UTC of the first day (all day).
 * @property {number} end - Instant (timed), or midnight UTC after the last day (all day).
 * @property {number} startDay - First day, as a day number in the display time zone.
 * @property {number} endDay - Last day (inclusive), as a day number in the display time zone.
 */

const DAY_MS = 864e5;
/** Periods walked for one event before giving up. */
const MAX_PERIODS = 40000;
/** Occurrences returned for one range. */
export const MAX_OCCURRENCES = 2000;

/**
 * @param {number} year
 * @param {number} month - 1 to 12.
 * @param {number} day
 * @returns {number} Days since 1970-01-01.
 */
export function dayNumber(year, month, day) {
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

/**
 * @param {number} day - A day number.
 * @returns {{ year: number, month: number, day: number }}
 */
export function fromDayNumber(day) {
  const date = new Date(day * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * @param {number} day - A day number.
 * @returns {number} 0 (Sunday) to 6.
 */
export function weekdayOf(day) {
  return (((day + 4) % 7) + 7) % 7;
}

/**
 * @param {number} time
 * @param {string} timeZone
 * @returns {number} The day number of an instant in a time zone.
 */
export function dayOf(time, timeZone) {
  const { year, month, day } = civil(time, timeZone);
  return dayNumber(year, month, day);
}

/**
 * The instant of a date. A time skipped by a daylight saving change moves one hour later.
 *
 * @param {DateValue} date
 * @param {string} timeZone - Used for floating times.
 * @returns {number}
 */
export function toInstant(date, timeZone) {
  const { year, month, day, hour, minute, second } = date;
  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  if (date.allDay || date.zone === 'UTC') return utc;
  const zone = date.zone ?? timeZone;
  return (
    instantOf(year, month, day, hour, minute, second, zone) ??
    instantOf(year, month, day, hour + 1, minute, second, zone) ??
    utc
  );
}

/**
 * The days of a month a rule selects, ascending.
 *
 * @param {Rule} rule
 * @param {number} year
 * @param {number} month
 * @param {number} startDayOfMonth
 * @returns {number[]} Day numbers.
 */
function monthDays(rule, year, month, startDayOfMonth) {
  const size = daysInMonth(year, month);
  const first = dayNumber(year, month, 1);
  const byMonthDay = new Set(rule.byMonthDay.map((n) => (n < 0 ? size + n + 1 : n)));
  if (!rule.byDay.length) {
    const wanted = byMonthDay.size ? [...byMonthDay] : [startDayOfMonth];
    return wanted
      .filter((n) => n >= 1 && n <= size)
      .sort((a, b) => a - b)
      .map((n) => first + n - 1);
  }
  /** @type {Set<number>} */
  const days = new Set();
  for (const { weekday, ordinal } of rule.byDay) {
    /** @type {number[]} */
    const matches = [];
    for (let n = 0; n < size; n++) if (weekdayOf(first + n) === weekday) matches.push(first + n);
    if (!ordinal) for (const day of matches) days.add(day);
    else {
      const pick = ordinal > 0 ? matches[ordinal - 1] : matches[matches.length + ordinal];
      if (pick !== undefined) days.add(pick);
    }
  }
  return [...days]
    .filter((day) => !byMonthDay.size || byMonthDay.has(day - first + 1))
    .sort((a, b) => a - b);
}

/**
 * @param {Rule} rule
 * @param {number} start
 * @param {number} weekStart - Day number of the first day of a week.
 * @returns {number[]} The days of the week a rule selects, ascending.
 */
function weekDays(rule, start, weekStart) {
  const weekdays = rule.byDay.length ? rule.byDay.map((d) => d.weekday) : [weekdayOf(start)];
  const offsets = weekdays.map((weekday) => (weekday - rule.weekStart + 7) % 7);
  return [...new Set(offsets)].sort((a, b) => a - b).map((offset) => weekStart + offset);
}

/**
 * @param {Rule} rule
 * @param {number} day
 * @returns {boolean} Whether a day of a daily rule passes its filters.
 */
function dailyMatch(rule, day) {
  const date = fromDayNumber(day);
  if (rule.byDay.length && !rule.byDay.some((d) => d.weekday === weekdayOf(day))) return false;
  if (!rule.byMonthDay.length) return true;
  const size = daysInMonth(date.year, date.month);
  return rule.byMonthDay.some((n) => (n < 0 ? size + n + 1 : n) === date.day);
}

/**
 * The days of the period at some index, ascending.
 *
 * @param {Rule} rule
 * @param {number} start
 * @param {number} index
 * @returns {{ days: number[], from: number }} `from`: first day of the period.
 */
function periodDays(rule, start, index) {
  const date = fromDayNumber(start);
  const step = index * rule.interval;
  if (rule.freq === 'DAILY') {
    const day = start + step;
    return { days: dailyMatch(rule, day) ? [day] : [], from: day };
  }
  if (rule.freq === 'WEEKLY') {
    const firstWeek = start - ((weekdayOf(start) - rule.weekStart + 7) % 7);
    const week = firstWeek + step * 7;
    return { days: weekDays(rule, start, week), from: week };
  }
  if (rule.freq === 'MONTHLY') {
    const months = date.year * 12 + date.month - 1 + step;
    const year = Math.floor(months / 12);
    const month = (months % 12) + 1;
    return { days: monthDays(rule, year, month, date.day), from: dayNumber(year, month, 1) };
  }
  const year = date.year + step;
  const months = rule.byMonth.length ? [...rule.byMonth].sort((a, b) => a - b) : [date.month];
  return {
    days: months.flatMap((month) => monthDays(rule, year, month, date.day)),
    from: dayNumber(year, 1, 1),
  };
}

/**
 * The days an event happens on, up to a last day. `COUNT` counts from the first occurrence,
 * including those excluded later, as RFC 5545 says.
 *
 * @param {CalendarEvent} event
 * @param {number} lastDay
 * @param {string} timeZone
 * @returns {number[]} Day numbers, ascending.
 */
export function eventDays(event, lastDay, timeZone) {
  const { start, rule } = event;
  const first = dayNumber(start.year, start.month, start.day);
  if (!rule) return first <= lastDay ? [first] : [];
  // An end without a time includes that whole day.
  const until = rule.until
    ? toInstant(rule.until, timeZone) + (rule.until.allDay ? DAY_MS - 1 : 0)
    : null;
  /** @type {number[]} */
  const result = [];
  let count = 0;
  for (let index = 0; index < MAX_PERIODS; index++) {
    const { days, from } = periodDays(rule, first, index);
    if (from > lastDay) break;
    for (const day of days) {
      if (day < first) continue;
      if (rule.byMonth.length && !rule.byMonth.includes(fromDayNumber(day).month)) continue;
      if (rule.count !== null && count >= rule.count) return result;
      if (until !== null && toInstant(withDay(start, day), timeZone) > until) return result;
      if (day > lastDay) return result;
      count++;
      result.push(day);
    }
  }
  return result;
}

/**
 * @param {DateValue} date
 * @param {number} day - A day number.
 * @returns {DateValue} The same time on another day.
 */
function withDay(date, day) {
  return { ...date, ...fromDayNumber(day) };
}

/**
 * Length of an event: whole days when all day, else milliseconds.
 *
 * @param {CalendarEvent} event
 * @param {string} timeZone
 * @returns {number}
 */
function lengthOf(event, timeZone) {
  const { start, end, duration } = event;
  if (start.allDay) {
    if (end) {
      const days =
        dayNumber(end.year, end.month, end.day) - dayNumber(start.year, start.month, start.day);
      return Math.max(1, days);
    }
    return duration ? Math.max(1, Math.round(duration / DAY_MS)) : 1;
  }
  if (end) return Math.max(0, toInstant(end, timeZone) - toInstant(start, timeZone));
  return duration ?? 0;
}

/**
 * The occurrences of one event that touch a range of days.
 *
 * @param {CalendarEvent} event
 * @param {number} index - Position of the event in the calendar.
 * @param {number} fromDay
 * @param {number} toDay
 * @param {string} timeZone
 * @returns {Occurrence[]}
 */
function eventOccurrences(event, index, fromDay, toDay, timeZone) {
  const length = lengthOf(event, timeZone);
  const lengthDays = event.start.allDay ? length : Math.ceil(length / DAY_MS);
  const excluded = new Set(event.excluded.map((date) => toInstant(date, timeZone)));
  const excludedDays = new Set(
    event.excluded.map((date) => dayNumber(date.year, date.month, date.day)),
  );
  /** @type {Occurrence[]} */
  const result = [];
  // A time zone moves a day by at most one in either direction.
  for (const day of eventDays(event, toDay + 1, timeZone)) {
    // Long past occurrences are left out before the costly time zone work.
    if (day + lengthDays + 1 < fromDay) continue;
    const date = withDay(event.start, day);
    const start = toInstant(date, timeZone);
    if (event.start.allDay ? excludedDays.has(day) : excluded.has(start)) continue;
    const allDay = event.start.allDay;
    const end = allDay ? start + length * DAY_MS : start + length;
    const startDay = allDay ? day : dayOf(start, timeZone);
    const endDay = allDay ? day + length - 1 : length ? dayOf(end - 1, timeZone) : startDay;
    if (endDay < fromDay || startDay > toDay) continue;
    result.push({ id: `${index}-${day}`, event, allDay, start, end, startDay, endDay });
  }
  return result;
}

/**
 * The occurrences of some events that touch a range of days, in the order they happen: all-day
 * events first on each day.
 *
 * @param {CalendarEvent[]} events
 * @param {number} fromDay
 * @param {number} toDay
 * @param {string} timeZone
 * @returns {Occurrence[]}
 */
export function occurrences(events, fromDay, toDay, timeZone) {
  return events
    .flatMap((event, index) => eventOccurrences(event, index, fromDay, toDay, timeZone))
    .sort(
      (a, b) =>
        a.startDay - b.startDay ||
        Number(b.allDay) - Number(a.allDay) ||
        a.start - b.start ||
        a.event.title.localeCompare(b.event.title),
    )
    .slice(0, MAX_OCCURRENCES);
}
