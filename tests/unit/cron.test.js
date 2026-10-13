import { describe as group, expect, it } from 'vitest';
import {
  instantOf,
  isCrontab,
  nextRuns,
  parseCron,
  parseCrontab,
  runsOn,
  weekGrid,
} from '../../src/components/cron/cron.js';
import { describe } from '../../src/components/cron/describe.js';
import { en, fr } from '../../src/components/cron/strings.js';

/** @param {Record<string, string>} table */
const translator =
  (table) =>
  (/** @type {string} */ key, /** @type {Record<string, string | number>} */ params = {}) =>
    (table[key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (m, name) =>
      name in params ? String(params[name]) : m,
    );
const tEn = translator(en);
const tFr = translator({ ...en, ...fr });

const iso = (/** @type {Date[]} */ runs) => runs.map((run) => run.toISOString());

group('parseCron', () => {
  it('reads five fields with names, ranges, lists and steps', () => {
    const s = parseCron('*/15 9-17 * JAN,MAR MON-FRI');
    expect(s.error).toBeNull();
    expect(s.seconds).toBe(false);
    const [sec, min, hour, dom, month, dow] = s.fields;
    expect(sec.values).toEqual([0]);
    expect(min.values).toEqual([0, 15, 30, 45]);
    expect(hour.values).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(dom.any).toBe(true);
    expect(month.values).toEqual([1, 3]);
    expect(dow.values).toEqual([1, 2, 3, 4, 5]);
  });

  it('reads six fields with seconds first, and 7 as Sunday', () => {
    const s = parseCron('30 0 12 * * 7');
    expect(s.seconds).toBe(true);
    expect(s.fields[0].values).toEqual([30]);
    expect(s.fields[5].values).toEqual([0]);
  });

  it('expands macros and knows @reboot', () => {
    expect(parseCron('@daily').fields.map((f) => f.source)).toEqual(['0', '0', '0', '*', '*', '*']);
    expect(parseCron('@reboot').reboot).toBe(true);
    expect(parseCron('@sometimes').error?.code).toBe('macro');
  });

  it('reports errors with the field and column', () => {
    expect(parseCron('0 0 32 * *').error).toMatchObject({ code: 'range', field: 3, column: 5 });
    expect(parseCron('0 0 * * * * *').error?.code).toBe('fields');
    expect(parseCron('0 5-1 * * *').error?.code).toBe('reversed');
    expect(parseCron('*/0 * * * *').error?.code).toBe('step');
    expect(parseCron('0 L * * *').error?.code).toBe('special');
    expect(parseCron('0 0 * * FOO').error).toMatchObject({ code: 'syntax', field: 5, column: 9 });
    expect(parseCron('0 0 1,2,x * *').error).toMatchObject({ field: 3, column: 9 });
  });

  it('reads the Quartz extensions', () => {
    const s = parseCron('0 0 L,15W * ?');
    expect(s.error).toBeNull();
    expect(s.fields[3].items.map((i) => i.kind)).toEqual(['last', 'weekday']);
    expect(parseCron('0 0 ? * 5#3').fields[5].items[0]).toEqual({ kind: 'nth', dow: 5, n: 3 });
    expect(parseCron('0 0 ? * FRIL').fields[5].items[0]).toEqual({ kind: 'lastDow', dow: 5 });
  });
});

group('runsOn', () => {
  it('needs either day field when both are restricted (cron OR rule)', () => {
    const s = parseCron('0 0 13 * 5');
    expect(runsOn(s, 2026, 10, 13)).toBe(true); // Tuesday 13th
    expect(runsOn(s, 2026, 10, 16)).toBe(true); // Friday
    expect(runsOn(s, 2026, 10, 14)).toBe(false);
  });

  it('needs both when one is a star', () => {
    const s = parseCron('0 0 */2 * 5');
    expect(runsOn(s, 2026, 10, 16)).toBe(false); // Friday, but even day
    expect(runsOn(s, 2026, 10, 23)).toBe(true);
  });

  it('knows the last day, the nearest weekday and the nth weekday', () => {
    expect(runsOn(parseCron('0 0 L * *'), 2028, 2, 29)).toBe(true);
    expect(runsOn(parseCron('0 0 L-1 * *'), 2026, 4, 29)).toBe(true);
    // 1 November 2026 is a Sunday: 1W runs on Monday the 2nd.
    expect(runsOn(parseCron('0 0 1W * *'), 2026, 11, 2)).toBe(true);
    // 31 October 2026 is a Saturday: LW runs on Friday the 30th.
    expect(runsOn(parseCron('0 0 LW * *'), 2026, 10, 30)).toBe(true);
    expect(runsOn(parseCron('0 0 ? * 5#2'), 2026, 10, 9)).toBe(true);
    expect(runsOn(parseCron('0 0 ? * 5L'), 2026, 10, 30)).toBe(true);
  });
});

group('nextRuns', () => {
  const from = Date.parse('2026-10-13T10:00:00Z');

  it('lists runs in UTC', () => {
    const runs = nextRuns(parseCron('30 9 * * 1-5'), { from, count: 3, timeZone: 'UTC' });
    expect(iso(runs)).toEqual([
      '2026-10-14T09:30:00.000Z',
      '2026-10-15T09:30:00.000Z',
      '2026-10-16T09:30:00.000Z',
    ]);
  });

  it('counts in a time zone', () => {
    const runs = nextRuns(parseCron('0 9 * * *'), { from, count: 1, timeZone: 'Europe/Paris' });
    expect(iso(runs)).toEqual(['2026-10-14T07:00:00.000Z']);
  });

  it('skips times that do not exist when clocks go forward', () => {
    // 29 March 2026, Europe/Paris: 02:00 → 03:00.
    const start = Date.parse('2026-03-28T12:00:00Z');
    const runs = nextRuns(parseCron('30 2 * * *'), {
      from: start,
      count: 2,
      timeZone: 'Europe/Paris',
    });
    expect(iso(runs)).toEqual(['2026-03-30T00:30:00.000Z', '2026-03-31T00:30:00.000Z']);
    expect(instantOf(2026, 3, 29, 2, 30, 0, 'Europe/Paris')).toBeNull();
  });

  it('runs once when a time happens twice as clocks go back', () => {
    // 25 October 2026, Europe/Paris: 03:00 → 02:00.
    const start = Date.parse('2026-10-24T12:00:00Z');
    const runs = nextRuns(parseCron('30 2 * * *'), {
      from: start,
      count: 2,
      timeZone: 'Europe/Paris',
    });
    expect(iso(runs)).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-26T01:30:00.000Z']);
  });

  it('finds 29 February and gives up on 30 February', () => {
    const runs = nextRuns(parseCron('0 0 29 2 *'), { from, count: 1, timeZone: 'UTC' });
    expect(iso(runs)).toEqual(['2028-02-29T00:00:00.000Z']);
    expect(nextRuns(parseCron('0 0 30 2 *'), { from, timeZone: 'UTC' })).toEqual([]);
  });

  it('counts seconds', () => {
    const runs = nextRuns(parseCron('*/20 * * * * *'), { from, count: 3, timeZone: 'UTC' });
    expect(iso(runs)).toEqual([
      '2026-10-13T10:00:20.000Z',
      '2026-10-13T10:00:40.000Z',
      '2026-10-13T10:01:00.000Z',
    ]);
  });
});

group('describe', () => {
  it('says the schedule in English', () => {
    expect(describe(parseCron('30 9 * * 1-5'), tEn, 'en')).toBe('At 09:30, Monday through Friday');
    expect(describe(parseCron('*/15 * * * *'), tEn, 'en')).toBe('Every 15 minutes');
    expect(describe(parseCron('0 * * * *'), tEn, 'en')).toBe('At minute 0, every hour');
    expect(describe(parseCron('0 9,17 1 * *'), tEn, 'en')).toBe(
      'At 09:00 and 17:00, on day 1 of the month',
    );
    expect(describe(parseCron('*/5 9-17 * * *'), tEn, 'en')).toBe(
      'Every 5 minutes, between 09:00 and 17:59',
    );
    expect(describe(parseCron('0 0 13 * 5'), tEn, 'en')).toBe(
      'At 00:00, on day 13 of the month or on Friday',
    );
    expect(describe(parseCron('0 0 ? * 5#3'), tEn, 'en')).toBe(
      'At 00:00, on the third Friday of the month',
    );
    expect(describe(parseCron('@reboot'), tEn, 'en')).toBe('At startup');
  });

  it('says the schedule in French', () => {
    expect(describe(parseCron('30 9 * * 1-5'), tFr, 'fr')).toBe('À 09:30, du lundi au vendredi');
    expect(describe(parseCron('0 0 1 JAN *'), tFr, 'fr')).toBe('À 00:00, le 1 du mois, en janvier');
  });
});

group('crontab', () => {
  const tab = `# Backups
SHELL=/bin/bash
CRON_TZ=Europe/Paris
0 3 * * * /usr/local/bin/backup --full  # nightly
@reboot   /opt/app/start.sh
61 * * * * broken
*/5 * * * *
`;

  it('reads entries, variables and invalid lines', () => {
    const result = parseCrontab(tab);
    expect(result.variables.map((v) => v.name)).toEqual(['SHELL', 'CRON_TZ']);
    expect(result.entries.map((e) => [e.line, e.schedule, e.command])).toEqual([
      [4, '0 3 * * *', '/usr/local/bin/backup --full  # nightly'],
      [5, '@reboot', '/opt/app/start.sh'],
    ]);
    expect(result.entries[0].timeZone).toBe('Europe/Paris');
    expect(result.entries[0].comment).toBe('');
    expect(result.invalid.map((i) => i.line)).toEqual([6, 7]);
  });

  it('reads the user column of system crontabs', () => {
    const [entry] = parseCrontab('17 * * * * root cd / && run-parts /etc/cron.hourly', {
      system: true,
    }).entries;
    expect(entry.user).toBe('root');
    expect(entry.command).toBe('cd / && run-parts /etc/cron.hourly');
  });

  it('tells an expression from a crontab', () => {
    expect(isCrontab('*/5 * * * *')).toBe(false);
    expect(isCrontab('0 30 9 * * MON')).toBe(false);
    expect(isCrontab('@daily')).toBe(false);
    expect(isCrontab('*/5 * * * * echo hi')).toBe(true);
    expect(isCrontab('@daily echo hi')).toBe(true);
    expect(isCrontab('# x\n0 0 * * * a')).toBe(true);
  });
});

group('weekGrid', () => {
  it('marks the hours of the weekdays it runs', () => {
    const grid = weekGrid(parseCron('*/15 9-10 * * 1-5'));
    expect(grid[1][9]).toBe(4);
    expect(grid[0][9]).toBe(0);
    expect(grid[1][11]).toBe(0);
  });
});
