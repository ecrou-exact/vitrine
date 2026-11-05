import { describe, expect, it } from 'vitest';
import {
  parseCalendar,
  parseDuration,
  parseIcsDate,
  parseIsoDate,
  parseRule,
  toIcs,
} from '../../src/components/calendar/ics.js';
import {
  dayNumber,
  eventDays,
  fromDayNumber,
  occurrences,
  weekdayOf,
} from '../../src/components/calendar/recur.js';
import { VtCalendar } from '../../src/components/calendar/vt-calendar.js';

/** @param {string} body */
const ics = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;

/** @param {string} source */
function events(source) {
  const result = parseCalendar(source);
  if (!result.ok) throw new Error('not a calendar');
  return result.calendar.events;
}

/** @param {number} day */
function iso(day) {
  const { year, month, day: date } = fromDayNumber(day);
  return `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
}

const range = (/** @type {string} */ from, /** @type {string} */ to) => {
  const [a, b] = [from, to].map((date) => {
    const [y, m, d] = date.split('-').map(Number);
    return dayNumber(y, m, d);
  });
  return [a, b];
};

describe('iCalendar', () => {
  it('reads events, folded lines and escaped text', () => {
    const [event] = events(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:1@test',
          'SUMMARY:Launch\\, then drinks',
          'DESCRIPTION:Line one\\nLine',
          '  two',
          'LOCATION:Room 1\\; floor 2',
          'DTSTART;TZID=Europe/Paris:20261105T090000',
          'DTEND;TZID=Europe/Paris:20261105T100000',
          'URL:https://example.com/launch',
          'CATEGORIES:Team,Product',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(event.uid).toBe('1@test');
    expect(event.title).toBe('Launch, then drinks');
    expect(event.description).toBe('Line one\nLine two');
    expect(event.location).toBe('Room 1; floor 2');
    expect(event.start).toMatchObject({ hour: 9, zone: 'Europe/Paris', allDay: false });
    expect(event.url).toBe('https://example.com/launch');
    expect(event.categories).toEqual(['Team', 'Product']);
  });

  it('ignores nested components and other component types', () => {
    const list = events(
      ics(
        [
          'BEGIN:VTIMEZONE',
          'TZID:Europe/Paris',
          'BEGIN:STANDARD',
          'DTSTART:19701025T030000',
          'END:STANDARD',
          'END:VTIMEZONE',
          'BEGIN:VTODO',
          'SUMMARY:Not an event',
          'END:VTODO',
          'BEGIN:VEVENT',
          'SUMMARY:Real',
          'DTSTART:20261105T090000Z',
          'BEGIN:VALARM',
          'SUMMARY:Alarm title',
          'END:VALARM',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(list.map((event) => event.title)).toEqual(['Real']);
  });

  it('counts events it cannot read, and drops unsafe links', () => {
    const result = parseCalendar(
      ics(
        [
          'BEGIN:VEVENT',
          'SUMMARY:No date',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'SUMMARY:Bad link',
          'DTSTART:20261105',
          'URL:javascript:alert(1)',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(result.ok && result.calendar.skipped).toBe(1);
    expect(result.ok && result.calendar.events[0].url).toBeNull();
  });

  it('reads dates, and rejects those that do not exist', () => {
    expect(parseIcsDate('20261105', undefined)).toMatchObject({ day: 5, allDay: true, zone: null });
    expect(parseIcsDate('20261105T010203Z', undefined)).toMatchObject({ hour: 1, zone: 'UTC' });
    expect(parseIcsDate('20260230', undefined)).toBeNull();
    expect(parseIcsDate('20261105T250000', undefined)).toBeNull();
    expect(parseIcsDate('20261105T090000', 'Not/AZone')).toMatchObject({ zone: null });
  });

  it('reads durations', () => {
    expect(parseDuration('PT1H30M')).toBe(90 * 60000);
    expect(parseDuration('P1W')).toBe(7 * 864e5);
    expect(parseDuration('P1DT1S')).toBe(864e5 + 1000);
    expect(parseDuration('nope')).toBeNull();
    expect(parseDuration('P')).toBeNull();
  });
});

describe('JSON', () => {
  it('reads lists and objects with events', () => {
    expect(events('[{"title":"A","start":"2026-11-05"}]')[0].start.allDay).toBe(true);
    expect(events('{"events":[{"title":"A","start":"2026-11-05T09:00:00Z"}]}')[0].start.zone).toBe(
      'UTC',
    );
  });

  it('turns offsets into UTC, and keeps times without one floating', () => {
    expect(parseIsoDate('2026-11-05T09:30:00+02:00')).toMatchObject({
      hour: 7,
      minute: 30,
      zone: 'UTC',
    });
    expect(parseIsoDate('2026-11-05T09:30')).toMatchObject({ hour: 9, zone: null });
    expect(parseIsoDate('2026-11-05T09:30', 'Asia/Tokyo')).toMatchObject({ zone: 'Asia/Tokyo' });
    expect(parseIsoDate('tomorrow')).toBeNull();
  });

  it('rejects other shapes and counts bad events', () => {
    expect(parseCalendar('{"a":1}')).toMatchObject({ ok: false, error: 'format' });
    expect(parseCalendar('{nope')).toMatchObject({ ok: false, error: 'json' });
    const result = parseCalendar('[{"title":"no date"},3,{"start":"2026-11-05"}]');
    expect(result.ok && result.calendar.skipped).toBe(2);
    expect(result.ok && result.calendar.events).toHaveLength(1);
  });
});

describe('recurrence', () => {
  /**
   * @param {string} start
   * @param {string} rule
   * @param {string} until
   */
  const days = (start, rule, until) => {
    const [event] = events(JSON.stringify([{ title: 'E', start, rrule: rule }]));
    const [, last] = range(until, until);
    return eventDays(event, last, 'UTC').map(iso);
  };

  it('repeats daily with an interval and a count', () => {
    expect(days('2026-11-01', 'FREQ=DAILY;INTERVAL=2;COUNT=3', '2027-01-01')).toEqual([
      '2026-11-01',
      '2026-11-03',
      '2026-11-05',
    ]);
  });

  it('repeats weekly on several days, from the first date on', () => {
    expect(days('2026-11-04', 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=3', '2027-01-01')).toEqual([
      '2026-11-04',
      '2026-11-09',
      '2026-11-11',
    ]);
  });

  it('counts weeks from the week of the start with an interval', () => {
    expect(days('2026-11-02', 'FREQ=WEEKLY;INTERVAL=2;COUNT=3', '2027-01-01')).toEqual([
      '2026-11-02',
      '2026-11-16',
      '2026-11-30',
    ]);
  });

  it('skips months without the day', () => {
    expect(days('2027-01-31', 'FREQ=MONTHLY;COUNT=3', '2028-01-01')).toEqual([
      '2027-01-31',
      '2027-03-31',
      '2027-05-31',
    ]);
  });

  it('reads the last Friday and the last day of a month', () => {
    expect(days('2026-11-27', 'FREQ=MONTHLY;BYDAY=-1FR;COUNT=2', '2027-06-01')).toEqual([
      '2026-11-27',
      '2026-12-25',
    ]);
    expect(days('2026-11-30', 'FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=2', '2027-06-01')).toEqual([
      '2026-11-30',
      '2026-12-31',
    ]);
  });

  it('repeats yearly, with 29 February only in leap years', () => {
    expect(days('2028-02-29', 'FREQ=YEARLY;COUNT=2', '2040-01-01')).toEqual([
      '2028-02-29',
      '2032-02-29',
    ]);
  });

  it('stops at UNTIL, an end without a time including its day', () => {
    expect(days('2026-11-01T09:00:00Z', 'FREQ=DAILY;UNTIL=20261103', '2027-01-01')).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
    expect(days('2026-11-01T09:00:00Z', 'FREQ=DAILY;UNTIL=20261102T080000Z', '2027-01-01')).toEqual(
      ['2026-11-01'],
    );
  });

  it('ends on rules that never match', () => {
    expect(days('2026-11-01', 'FREQ=MONTHLY;BYMONTHDAY=31;BYMONTH=2', '2099-01-01')).toEqual([]);
  });

  it('refuses rule parts it does not handle: the event then appears once', () => {
    expect(parseRule('FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO,TU')).toBeNull();
    expect(parseRule('FREQ=HOURLY')).toBeNull();
    expect(parseRule('FREQ=DAILY\r\nATTENDEE:evil')).toBeNull();
    expect(parseRule('FREQ=DAILY;INTERVAL=0')).toBeNull();
    const [event] = events('[{"start":"2026-11-01","rrule":"FREQ=HOURLY"}]');
    expect(event.rule).toBeNull();
  });

  it('knows weekdays before 1970', () => {
    expect(weekdayOf(dayNumber(1969, 12, 31))).toBe(3);
    expect(weekdayOf(dayNumber(2026, 11, 5))).toBe(4);
  });
});

describe('occurrences', () => {
  const [from, to] = range('2026-11-01', '2026-11-30');

  it('keeps wall-clock times across a daylight saving change', () => {
    const list = events(
      JSON.stringify([
        {
          title: 'Standup',
          start: '2026-10-24T09:00:00',
          timezone: 'Europe/Paris',
          rrule: 'FREQ=DAILY;COUNT=3',
        },
      ]),
    );
    const [a, b] = range('2026-10-24', '2026-10-26');
    const times = occurrences(list, a, b, 'UTC').map((o) => new Date(o.start).toISOString());
    // Clocks went back in Paris on 25 October 2026 at 03:00.
    expect(times).toEqual([
      '2026-10-24T07:00:00.000Z',
      '2026-10-25T08:00:00.000Z',
      '2026-10-26T08:00:00.000Z',
    ]);
  });

  it('places events on their day in the display time zone', () => {
    const list = events('[{"title":"Late","start":"2026-11-05T23:30:00Z"}]');
    expect(iso(occurrences(list, from, to, 'UTC')[0].startDay)).toBe('2026-11-05');
    expect(iso(occurrences(list, from, to, 'Asia/Tokyo')[0].startDay)).toBe('2026-11-06');
  });

  it('never moves all-day events between time zones', () => {
    const list = events('[{"title":"Holiday","start":"2026-11-11"}]');
    for (const zone of ['Pacific/Auckland', 'Pacific/Honolulu', 'UTC']) {
      const [occurrence] = occurrences(list, from, to, zone);
      expect(iso(occurrence.startDay)).toBe('2026-11-11');
      expect(occurrence.endDay).toBe(occurrence.startDay);
    }
  });

  it('treats the end of an all-day event as exclusive', () => {
    const [event] = events(
      ics('BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261108\r\nEND:VEVENT'),
    );
    const [occurrence] = occurrences([event], from, to, 'UTC');
    expect(iso(occurrence.endDay)).toBe('2026-11-07');
  });

  it('finds events that started before the range and are still running', () => {
    const list = events('[{"title":"Long","start":"2026-10-30","end":"2026-11-03"}]');
    expect(occurrences(list, from, to, 'UTC')).toHaveLength(1);
  });

  it('leaves out EXDATE, and replaces occurrences with RECURRENCE-ID', () => {
    const list = events(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:r',
          'SUMMARY:Weekly',
          'DTSTART:20261102T100000Z',
          'RRULE:FREQ=WEEKLY;COUNT=4',
          'EXDATE:20261109T100000Z',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'UID:r',
          'SUMMARY:Moved',
          'RECURRENCE-ID:20261116T100000Z',
          'DTSTART:20261117T150000Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    const names = occurrences(list, from, to, 'UTC').map((o) => [iso(o.startDay), o.event.title]);
    expect(names).toEqual([
      ['2026-11-02', 'Weekly'],
      ['2026-11-17', 'Moved'],
      ['2026-11-23', 'Weekly'],
    ]);
  });

  it('sorts all-day events first on a day', () => {
    const list = events(
      '[{"title":"Timed","start":"2026-11-05T08:00:00Z"},{"title":"Day","start":"2026-11-05"}]',
    );
    expect(occurrences(list, from, to, 'UTC').map((o) => o.event.title)).toEqual(['Day', 'Timed']);
  });

  it('stays quick on a daily event of many years', () => {
    const list = events(
      '[{"start":"2000-01-01T09:00:00","timezone":"Europe/Paris","rrule":"FREQ=DAILY"}]',
    );
    const started = performance.now();
    const found = occurrences(list, from, to, 'Europe/Paris');
    expect(found).toHaveLength(30);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('writing iCalendar', () => {
  const STAMP = Date.parse('2026-11-05T12:00:00Z');

  it('writes a file that reads back the same', () => {
    const list = events(
      JSON.stringify([
        {
          uid: 'a',
          title: 'Launch, party; fun',
          description: 'Line one\nLine two',
          location: 'Room 1',
          start: '2026-11-05T09:00:00',
          end: '2026-11-05T10:00:00',
          timezone: 'Europe/Paris',
          rrule: 'FREQ=WEEKLY;COUNT=2',
          url: 'https://example.com',
          categories: ['Team'],
        },
      ]),
    );
    const again = events(toIcs(list, STAMP))[0];
    expect(again).toMatchObject({
      uid: 'a',
      title: 'Launch, party; fun',
      description: 'Line one\nLine two',
      location: 'Room 1',
      url: 'https://example.com',
      categories: ['Team'],
    });
    expect(again.start).toEqual(list[0].start);
    expect(again.rule?.raw).toBe('FREQ=WEEKLY;COUNT=2');
  });

  it('cannot be given extra properties through text', () => {
    const [event] = events(
      JSON.stringify([{ title: 'x\r\nATTENDEE:mailto:evil@example.com', start: '2026-11-05' }]),
    );
    const text = toIcs([event], STAMP);
    expect(text).not.toMatch(/^ATTENDEE/m);
    expect(events(text)[0].title).toBe('x\nATTENDEE:mailto:evil@example.com');
  });

  it('folds long lines at 75 octets without cutting characters', () => {
    const [event] = events(JSON.stringify([{ title: 'é€😀'.repeat(60), start: '2026-11-05' }]));
    const text = toIcs([event], STAMP);
    const encoder = new TextEncoder();
    for (const line of text.split('\r\n'))
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    expect(text).not.toContain('�');
    expect(events(text)[0].title).toBe('é€😀'.repeat(60));
  });
});

describe('<vt-calendar>', () => {
  it('is a documented element', () => {
    expect(VtCalendar.observedAttributes).toEqual(
      expect.arrayContaining(['view', 'date', 'timezone', 'first-day', 'limit', 'views']),
    );
  });
});
