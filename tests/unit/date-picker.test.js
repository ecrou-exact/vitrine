import { describe, expect, it } from 'vitest';
import {
  addMonths,
  dateOrder,
  dayNumber,
  firstDayOfWeek,
  fromDayNumber,
  isBlocked,
  monthGrid,
  nearestFree,
  parseIso,
  parseRules,
  parseTyped,
  parseValue,
  presetRanges,
  toIso,
  weekdayOf,
} from '../../src/components/date-picker/dates.js';
import { VtDatePicker } from '../../src/components/date-picker/vt-date-picker.js';

const d = (/** @type {string} */ iso) => /** @type {number} */ (parseIso(iso));

describe('<vt-date-picker> dates', () => {
  it('counts days from 1970 and back, years 1 to 9999 included', () => {
    expect(dayNumber(1970, 1, 1)).toBe(0);
    expect(toIso(d('2026-11-22'))).toBe('2026-11-22');
    expect(toIso(dayNumber(1, 1, 1))).toBe('0001-01-01');
    expect(toIso(dayNumber(9999, 12, 31))).toBe('9999-12-31');
    expect(fromDayNumber(dayNumber(2024, 2, 29))).toEqual({ year: 2024, month: 2, day: 29 });
    expect(weekdayOf(d('2026-11-22'))).toBe(0);
  });

  it('reads ISO dates and refuses days that do not exist', () => {
    expect(parseIso('2026-02-29')).toBe(null);
    expect(parseIso('2024-02-29')).not.toBe(null);
    expect(parseIso('2026-13-01')).toBe(null);
    expect(parseIso('22/11/2026')).toBe(null);
    expect(parseIso(undefined)).toBe(null);
  });

  it('reads typed dates in the order of the language', () => {
    const today = d('2026-06-15');
    expect(dateOrder('fr')).toEqual(['day', 'month', 'year']);
    expect(dateOrder('en-US')).toEqual(['month', 'day', 'year']);
    expect(toIso(/** @type {number} */ (parseTyped('22/11/2026', dateOrder('fr'), today)))).toBe('2026-11-22'); // prettier-ignore
    expect(toIso(/** @type {number} */ (parseTyped('11-22-26', dateOrder('en-US'), today)))).toBe('2026-11-22'); // prettier-ignore
    expect(toIso(/** @type {number} */ (parseTyped('22.11', dateOrder('de'), today)))).toBe('2026-11-22'); // prettier-ignore
    expect(toIso(/** @type {number} */ (parseTyped('2026/11/22', dateOrder('fr'), today)))).toBe('2026-11-22'); // prettier-ignore
    expect(parseTyped('31/02/2026', dateOrder('fr'), today)).toBe(null);
    expect(parseTyped('tomorrow', dateOrder('fr'), today)).toBe(null);
    expect(parseTyped('1'.repeat(100), dateOrder('fr'), today)).toBe(null);
  });

  it('knows the first day of the week', () => {
    expect(firstDayOfWeek('fr-FR')).toBe(1);
    expect(firstDayOfWeek('en-US')).toBe(0);
  });

  it('moves by months and keeps the end of shorter months', () => {
    expect(toIso(addMonths(d('2026-01-31'), 1))).toBe('2026-02-28');
    expect(toIso(addMonths(d('2026-12-15'), 1))).toBe('2027-01-15');
    expect(toIso(addMonths(d('2026-01-15'), -13))).toBe('2024-12-15');
  });

  it('builds six weeks from the first day of the week', () => {
    const grid = monthGrid(d('2026-11-10'), 1);
    expect(grid).toHaveLength(6);
    expect(toIso(grid[0][0])).toBe('2026-10-26');
    expect(weekdayOf(grid[0][0])).toBe(1);
    expect(grid.flat()).toContain(d('2026-11-30'));
  });

  it('blocks dates, periods and days of the week', () => {
    const rules = parseRules('2026-12-25, 2026-12-30/2026-12-31 sat sun');
    expect(isBlocked(d('2026-12-25'), rules)).toBe(true);
    expect(isBlocked(d('2026-12-31'), rules)).toBe(true);
    expect(isBlocked(d('2026-11-21'), rules)).toBe(true);
    expect(isBlocked(d('2026-11-23'), rules)).toBe(false);
    expect(isBlocked(d('2026-11-23'), rules, d('2026-12-01'))).toBe(true);
    const json = parseRules(
      '["2026-01-01", { "start": "2026-02-10", "end": "2026-02-01" }, "junk"]',
    );
    expect(isBlocked(d('2026-02-05'), json)).toBe(true);
    expect(json.days.size).toBe(1);
    expect(nearestFree(d('2026-11-21'), 1, rules, 0, d('2099-01-01'))).toBe(d('2026-11-23'));
  });

  it('reads values and puts periods in order', () => {
    expect(parseValue('2026-11-22', false)).toEqual({ start: d('2026-11-22'), end: null });
    expect(parseValue('2026-11-29/2026-11-22', true)).toEqual({ start: d('2026-11-22'), end: d('2026-11-29') }); // prettier-ignore
    expect(parseValue('{"start":"2026-11-22","end":"2026-11-23"}', true).end).toBe(d('2026-11-23'));
    expect(parseValue('nope', true)).toEqual({ start: null, end: null });
  });

  it('gives usual periods around today', () => {
    const presets = Object.fromEntries(
      presetRanges(d('2026-11-18'), 1).map((p) => [p.key, [toIso(p.start), toIso(p.end)]]),
    );
    expect(presets.last7).toEqual(['2026-11-12', '2026-11-18']);
    expect(presets.thisMonth).toEqual(['2026-11-01', '2026-11-30']);
    expect(presets.lastMonth).toEqual(['2026-10-01', '2026-10-31']);
    expect(presetRanges(d('2026-11-18'), 1, ['thisWeek'])[0].start).toBe(d('2026-11-16'));
  });

  it('reads JSON settings', () => {
    const result = VtDatePicker.fromData({ mode: 'range', value: { start: '2026-11-22', end: '2026-11-29' }, disabledDates: ['sat'] }); // prettier-ignore
    expect(result.attributes).toMatchObject({ mode: 'range', value: '2026-11-22/2026-11-29', 'disabled-dates': '["sat"]' }); // prettier-ignore
    expect(VtDatePicker.fromData('2026-11-22').attributes).toEqual({ value: '2026-11-22' });
  });
});
