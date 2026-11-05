// @ts-check
/**
 * Calendar sources: iCalendar (RFC 5545) and JSON are read into one list of events, and events
 * are written back as iCalendar for "Add to calendar" and downloads.
 *
 * Only VEVENT components are read. Text is never interpreted: it is kept as plain text.
 *
 * @module components/calendar/ics
 */
import { isSafeUrl } from '../../core/urls.js';
import { daysInMonth, isTimeZone } from '../cron/cron.js';

/**
 * A date as written in the source: wall-clock fields and what they are relative to.
 *
 * @typedef {object} DateValue
 * @property {number} year
 * @property {number} month - 1 to 12.
 * @property {number} day
 * @property {number} hour
 * @property {number} minute
 * @property {number} second
 * @property {boolean} allDay - A date without a time.
 * @property {string | null} zone - `UTC`, a time zone name, or `null` for floating times.
 */

/**
 * @typedef {object} ByDay
 * @property {number} weekday - 0 (Sunday) to 6.
 * @property {number} ordinal - `1` the first in the period, `-1` the last, `0` all of them.
 */

/**
 * @typedef {object} Rule
 * @property {'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY'} freq
 * @property {number} interval
 * @property {number | null} count
 * @property {DateValue | null} until
 * @property {ByDay[]} byDay
 * @property {number[]} byMonthDay
 * @property {number[]} byMonth
 * @property {number} weekStart - 0 (Sunday) to 6.
 * @property {string} raw - The rule as written, checked to hold only rule characters.
 */

/**
 * @typedef {object} CalendarEvent
 * @property {string} uid
 * @property {string} title
 * @property {string} description
 * @property {string} location
 * @property {string | null} url
 * @property {string[]} categories
 * @property {boolean} cancelled
 * @property {DateValue} start
 * @property {DateValue | null} end
 * @property {number | null} duration - Milliseconds, when given instead of an end.
 * @property {Rule | null} rule
 * @property {DateValue[]} excluded
 * @property {DateValue | null} replaces - The occurrence this event replaces (`RECURRENCE-ID`).
 */

/**
 * @typedef {object} Calendar
 * @property {string} name
 * @property {'ics' | 'json'} format
 * @property {CalendarEvent[]} events
 * @property {number} skipped - Events that could not be read.
 */

/** @typedef {{ ok: true, calendar: Calendar } | { ok: false, error: 'format' | 'json', message: string }} CalendarResult */

/** Limits against oversized sources. */
export const LIMITS = Object.freeze({
  events: 5000,
  excluded: 2000,
  text: 10000,
  title: 500,
  interval: 10000,
});

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const ICS_DATE = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/;
const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,9})?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/;
const DURATION = /^[+-]?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string}
 */
function clean(value, max = LIMITS.text) {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function safeUrl(value) {
  const url = clean(value, 2000);
  return url && isSafeUrl(url) ? url : null;
}

/**
 * Builds a date when its fields exist in the calendar.
 *
 * @param {number[]} fields - Year, month, day, hour, minute, second.
 * @param {boolean} allDay
 * @param {string | null} zone
 * @returns {DateValue | null}
 */
function dateValue([year, month, day, hour, minute, second], allDay, zone) {
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month))
    return null;
  if (hour > 23 || minute > 59 || second > 60) return null;
  return { year, month, day, hour, minute, second: Math.min(second, 59), allDay, zone };
}

/**
 * @param {string} name
 * @returns {string | null} The name when the browser knows this time zone.
 */
function knownZone(name) {
  const zone = name.replace(/^\/+/, '').trim();
  if (/^(?:UTC|GMT|Etc\/UTC|Z)$/i.test(zone)) return 'UTC';
  return zone && isTimeZone(zone) ? zone : null;
}

/**
 * Reads `20261105`, `20261105T090000` and `20261105T090000Z`.
 *
 * @param {string} value
 * @param {string | undefined} tzid
 * @returns {DateValue | null}
 */
export function parseIcsDate(value, tzid) {
  const match = ICS_DATE.exec(value.trim());
  if (!match) return null;
  const allDay = match[4] === undefined;
  const fields = match.slice(1, 7).map((part) => Number(part ?? 0));
  const zone = match[7] ? 'UTC' : tzid ? knownZone(tzid) : null;
  return dateValue(fields, allDay, allDay ? null : zone);
}

/**
 * Reads `2026-11-05` (all day) and `2026-11-05T09:00`, with `Z`, an offset, or neither.
 *
 * @param {unknown} value
 * @param {string | null} zone - Time zone of a time without an offset.
 * @returns {DateValue | null}
 */
export function parseIsoDate(value, zone = null) {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const allDay = match[4] === undefined;
  const fields = match.slice(1, 7).map((part) => Number(part ?? 0));
  const parsed = dateValue(fields, allDay, allDay ? null : zone);
  if (!parsed || !match[7]) return parsed;
  if (match[7] === 'Z') return { ...parsed, zone: 'UTC' };
  // An offset names an instant: it is kept in UTC.
  const sign = match[7][0] === '-' ? -1 : 1;
  const digits = match[7].slice(1).replace(':', '');
  const offset = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || 0);
  const time =
    Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, parsed.second) -
    sign * offset * 60000;
  const date = new Date(time);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    allDay: false,
    zone: 'UTC',
  };
}

/**
 * @param {string} value - `PT1H30M`, `P2D`, `P1W`.
 * @returns {number | null} Milliseconds.
 */
export function parseDuration(value) {
  const match = DURATION.exec(value.trim());
  if (!match || !/\d/.test(value)) return null;
  const [weeks, days, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
  return ((weeks * 7 + days) * 86400 + hours * 3600 + minutes * 60 + seconds) * 1000;
}

/**
 * @param {string} value - `MO`, `1MO`, `-1FR`.
 * @returns {ByDay | null}
 */
function parseByDay(value) {
  const match = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(value.trim());
  if (!match) return null;
  return {
    weekday: WEEKDAYS.indexOf(match[2].toUpperCase()),
    ordinal: match[1] ? Number(match[1]) : 0,
  };
}

/** @param {string | undefined} value */
const numbers = (value) =>
  (value ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n !== 0);

/**
 * Reads a recurrence rule. A rule with parts this reader does not handle (`BYSETPOS`, hours…)
 * returns `null`, and the event then appears once, on its start date.
 *
 * @param {string} source
 * @returns {Rule | null}
 */
export function parseRule(source) {
  const raw = source.trim().replace(/^RRULE:/i, '');
  if (!raw || raw.length > 500 || !/^[A-Za-z0-9=;,+\-:]+$/.test(raw)) return null;
  /** @type {Record<string, string>} */
  const parts = {};
  for (const part of raw.split(';')) {
    const [name, value] = part.split('=');
    if (name && value) parts[name.toUpperCase()] = value.toUpperCase();
  }
  const known = ['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'WKST'];
  if (Object.keys(parts).some((name) => !known.includes(name))) return null;
  const freq = parts.FREQ;
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null;
  const byDay = parts.BYDAY ? parts.BYDAY.split(',').map(parseByDay) : [];
  if (byDay.includes(null)) return null;
  if (freq === 'YEARLY' && byDay.length && !parts.BYMONTH) return null;
  const interval = Number(parts.INTERVAL ?? 1);
  const count = parts.COUNT ? Number(parts.COUNT) : null;
  if (!Number.isInteger(interval) || interval < 1 || interval > LIMITS.interval) return null;
  if (count !== null && (!Number.isInteger(count) || count < 1)) return null;
  const weekStart = WEEKDAYS.indexOf(parts.WKST ?? 'MO');
  return {
    freq,
    interval,
    count,
    until: parts.UNTIL ? (parseIcsDate(parts.UNTIL, undefined) ?? parseIsoDate(parts.UNTIL)) : null,
    byDay: /** @type {ByDay[]} */ (byDay),
    byMonthDay: numbers(parts.BYMONTHDAY),
    byMonth: numbers(parts.BYMONTH),
    weekStart: weekStart < 0 ? 1 : weekStart,
    raw,
  };
}

/**
 * @param {string} value
 * @returns {string}
 */
function unescapeText(value) {
  return value.replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

/**
 * Splits `NAME;PARAM=VALUE;PARAM="A:B":VALUE`.
 *
 * @param {string} line
 * @returns {{ name: string, params: Record<string, string>, value: string } | null}
 */
function parseLine(line) {
  let quoted = false;
  let colon = -1;
  let start = 0;
  /** @type {string[]} */
  const head = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (!quoted && line[i] === ';') {
      head.push(line.slice(start, i));
      start = i + 1;
    } else if (!quoted && line[i] === ':') {
      colon = i;
      break;
    }
  }
  if (colon < 1) return null;
  head.push(line.slice(start, colon));
  /** @type {Record<string, string>} */
  const params = Object.create(null);
  for (const param of head.slice(1)) {
    const equal = param.indexOf('=');
    if (equal > 0)
      params[param.slice(0, equal).toUpperCase()] = param.slice(equal + 1).replace(/^"|"$/g, '');
  }
  return { name: head[0].toUpperCase(), params, value: line.slice(colon + 1) };
}

/**
 * Applies one property of a VEVENT.
 *
 * @param {Partial<CalendarEvent>} event
 * @param {{ name: string, params: Record<string, string>, value: string }} line
 */
function applyProperty(event, { name, params, value }) {
  if (name === 'UID') event.uid = clean(value, 500);
  else if (name === 'SUMMARY') event.title = clean(unescapeText(value), LIMITS.title);
  else if (name === 'DESCRIPTION') event.description = clean(unescapeText(value));
  else if (name === 'LOCATION') event.location = clean(unescapeText(value), LIMITS.title);
  else if (name === 'URL') event.url = safeUrl(value);
  else if (name === 'STATUS') event.cancelled = value.trim().toUpperCase() === 'CANCELLED';
  else if (name === 'DTSTART') event.start = parseIcsDate(value, params.TZID) ?? undefined;
  else if (name === 'DTEND') event.end = parseIcsDate(value, params.TZID);
  else if (name === 'DURATION') event.duration = parseDuration(value);
  else if (name === 'RRULE') event.rule = parseRule(value);
  else if (name === 'RECURRENCE-ID') event.replaces = parseIcsDate(value, params.TZID);
  else if (name === 'CATEGORIES')
    event.categories = [
      ...(event.categories ?? []),
      ...value
        .split(/(?<!\\),/)
        .map((category) => clean(unescapeText(category), 100))
        .filter(Boolean),
    ];
  else if (name === 'EXDATE') {
    event.excluded ??= [];
    for (const date of value.split(',')) {
      const parsed =
        event.excluded.length < LIMITS.excluded ? parseIcsDate(date, params.TZID) : null;
      if (parsed) event.excluded.push(parsed);
    }
  }
}

/**
 * @param {Partial<CalendarEvent>} draft
 * @param {number} index
 * @returns {CalendarEvent | null}
 */
function finishEvent(draft, index) {
  if (!draft.start) return null;
  return {
    uid: draft.uid || `event-${index}`,
    title: draft.title ?? '',
    description: draft.description ?? '',
    location: draft.location ?? '',
    url: draft.url ?? null,
    categories: draft.categories ?? [],
    cancelled: draft.cancelled ?? false,
    start: draft.start,
    end: draft.end ?? null,
    duration: draft.duration ?? null,
    rule: draft.rule ?? null,
    excluded: draft.excluded ?? [],
    replaces: draft.replaces ?? null,
  };
}

/**
 * An event with `RECURRENCE-ID` replaces one occurrence of the event with the same UID.
 *
 * @param {CalendarEvent[]} events
 */
function linkOverrides(events) {
  /** @type {Map<string, CalendarEvent>} */
  const masters = new Map();
  for (const event of events) if (!event.replaces) masters.set(event.uid, event);
  for (const event of events) {
    if (event.replaces) masters.get(event.uid)?.excluded.push(event.replaces);
  }
}

/**
 * @param {string} source
 * @returns {Calendar}
 */
function parseIcs(source) {
  /** @type {CalendarEvent[]} */
  const events = [];
  let name = '';
  let skipped = 0;
  /** @type {Partial<CalendarEvent> | null} */
  let draft = null;
  let nested = 0;
  for (const raw of source.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
    const line = parseLine(raw);
    if (!line) continue;
    if (line.name === 'BEGIN') {
      if (draft) nested++;
      else if (line.value.trim().toUpperCase() === 'VEVENT') {
        draft = {};
        nested = 0;
      }
    } else if (line.name === 'END') {
      if (draft && nested) nested--;
      else if (draft) {
        const event = events.length < LIMITS.events ? finishEvent(draft, events.length) : null;
        if (event) events.push(event);
        else skipped++;
        draft = null;
      }
    } else if (draft && !nested) applyProperty(draft, line);
    else if (!draft && line.name === 'X-WR-CALNAME') name = clean(unescapeText(line.value), 200);
  }
  linkOverrides(events);
  return { name, format: 'ics', events, skipped };
}

/**
 * @param {Record<string, any>} item
 * @param {number} index
 * @returns {CalendarEvent | null}
 */
function readJsonEvent(item, index) {
  const requested = clean(item.timezone ?? item.timeZone, 100);
  const zone = requested ? knownZone(requested) : null;
  const start = parseIsoDate(item.start ?? item.date, zone);
  if (!start) return null;
  const allDay = item.allDay === true;
  const categories = Array.isArray(item.categories) ? item.categories : [item.category];
  const excluded = Array.isArray(item.exclude) ? item.exclude : [];
  return {
    uid: clean(item.uid ?? item.id, 500) || `event-${index}`,
    title: clean(item.title ?? item.name, LIMITS.title),
    description: clean(item.description),
    location: clean(item.location, LIMITS.title),
    url: safeUrl(item.url),
    categories: categories.map((category) => clean(category, 100)).filter(Boolean),
    cancelled: item.cancelled === true || clean(item.status, 20).toLowerCase() === 'cancelled',
    start: allDay ? { ...start, allDay: true, zone: null, hour: 0, minute: 0, second: 0 } : start,
    end: parseIsoDate(item.end, zone),
    duration: typeof item.duration === 'string' ? parseDuration(item.duration) : null,
    rule: typeof item.rrule === 'string' ? parseRule(item.rrule) : null,
    excluded: excluded
      .slice(0, LIMITS.excluded)
      .map((date) => parseIsoDate(date, zone))
      .filter((date) => date !== null),
    replaces: null,
  };
}

/**
 * @param {string} source
 * @returns {CalendarResult}
 */
function parseJsonCalendar(source) {
  /** @type {any} */
  let data;
  try {
    data = JSON.parse(source);
  } catch (error) {
    return { ok: false, error: 'json', message: error instanceof Error ? error.message : '' };
  }
  const items = Array.isArray(data) ? data : isObject(data) ? data.events : null;
  if (!Array.isArray(items)) return { ok: false, error: 'format', message: '' };
  /** @type {CalendarEvent[]} */
  const events = [];
  let skipped = 0;
  for (const item of items) {
    const event =
      isObject(item) && events.length < LIMITS.events ? readJsonEvent(item, events.length) : null;
    if (event) events.push(event);
    else skipped++;
  }
  return {
    ok: true,
    calendar: {
      name: isObject(data) ? clean(data.name, 200) : '',
      format: 'json',
      events,
      skipped,
    },
  };
}

/**
 * Reads iCalendar or JSON.
 *
 * @param {string} source
 * @returns {CalendarResult}
 */
export function parseCalendar(source) {
  if (/^\s*BEGIN:VCALENDAR/i.test(source)) return { ok: true, calendar: parseIcs(source) };
  return parseJsonCalendar(source);
}

// ---------------------------------------------------------------- writing

/** @param {number} n @param {number} [size] */
const pad = (n, size = 2) => String(n).padStart(size, '0');

/**
 * @param {string} value
 * @returns {string} Text with every line break and separator escaped: a value cannot add a
 *   property to the file.
 */
function escapeText(value) {
  return (
    value
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n?|\n/g, '\\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
  );
}

/**
 * Folds a line at 75 octets, never inside a character.
 *
 * @param {string} line
 * @returns {string}
 */
function fold(line) {
  const encoder = new TextEncoder();
  let result = '';
  let size = 0;
  for (const char of line) {
    const length = encoder.encode(char).length;
    if (size + length > 74) {
      result += '\r\n ';
      size = 1;
    }
    result += char;
    size += length;
  }
  return result;
}

/**
 * @param {string} name
 * @param {DateValue} date
 * @returns {string} A `DTSTART`-like property.
 */
function dateProperty(name, date) {
  const day = `${pad(date.year, 4)}${pad(date.month)}${pad(date.day)}`;
  if (date.allDay) return `${name};VALUE=DATE:${day}`;
  const time = `${day}T${pad(date.hour)}${pad(date.minute)}${pad(date.second)}`;
  if (date.zone === 'UTC') return `${name}:${time}Z`;
  return date.zone ? `${name};TZID=${date.zone}:${time}` : `${name}:${time}`;
}

/**
 * @param {number} time
 * @returns {DateValue} The instant in UTC.
 */
export function utcDate(time) {
  const date = new Date(time);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    allDay: false,
    zone: 'UTC',
  };
}

/**
 * The lines of one event.
 *
 * @param {CalendarEvent} event
 * @param {number} stamp - Time the file is written.
 * @returns {string[]}
 */
function eventLines(event, stamp) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}`,
    dateProperty('DTSTAMP', utcDate(stamp)),
    dateProperty('DTSTART', event.start),
  ];
  if (event.end) lines.push(dateProperty('DTEND', event.end));
  if (event.rule) lines.push(`RRULE:${event.rule.raw}`);
  for (const date of event.excluded) lines.push(dateProperty('EXDATE', date));
  if (event.title) lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.url) lines.push(`URL:${event.url.replace(/[\r\n]/g, '')}`);
  if (event.categories.length)
    lines.push(`CATEGORIES:${event.categories.map(escapeText).join(',')}`);
  if (event.cancelled) lines.push('STATUS:CANCELLED');
  lines.push('END:VEVENT');
  return lines;
}

/**
 * Writes events as an iCalendar file.
 *
 * @param {CalendarEvent[]} events
 * @param {number} stamp - Time the file is written.
 * @returns {string}
 */
export function toIcs(events, stamp) {
  return `${[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vitrine//vt-calendar//EN',
    'CALSCALE:GREGORIAN',
    ...events.flatMap((event) => eventLines(event, stamp)),
    'END:VCALENDAR',
  ]
    .map(fold)
    .join('\r\n')}\r\n`;
}
