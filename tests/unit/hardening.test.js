/**
 * Regressions from the security and robustness review: each case froze the page, crashed an
 * element, or produced something dangerous before it was fixed.
 */
import { describe, expect, it } from 'vitest';
import { parseCalendar } from '../../src/components/calendar/ics.js';
import { dayNumber, occurrences } from '../../src/components/calendar/recur.js';
import { snippet } from '../../src/components/http/snippets.js';
import { normalizeStatus } from '../../src/components/job/job.js';
import { isRisky, parsePattern } from '../../src/components/regex/pattern.js';
import { parseStatus, toTime } from '../../src/components/status/model.js';
import { fillTemplate } from '../../src/components/table/cells.js';
import { parseTable, serialize } from '../../src/components/table/model.js';
import { parseDate } from '../../src/components/timeline/events.js';
import { documentsToTree } from '../../src/components/yaml/document.js';
import { highlight, MAX_HIGHLIGHT_LINE } from '../../src/core/highlighter.js';
import { VtCalendar } from '../../src/components/calendar/vt-calendar.js';

/**
 * @param {string} name
 * @param {string} value
 * @returns {import('../../src/components/http/message.js').HttpRequest}
 */
const request = (name, value) => ({
  method: 'POST',
  url: 'https://example.com/a',
  headers: [[name, value]],
  body: '',
});

describe('generated commands', () => {
  it('leaves out header names that are not HTTP tokens', () => {
    for (const language of /** @type {const} */ (['curl', 'httpie', 'fetch', 'python'])) {
      expect(snippet(request('x=@/etc/passwd', '1'), language)).not.toContain('/etc/passwd');
      expect(snippet(request('@/etc/passwd', '1'), language)).not.toContain('/etc/passwd');
    }
    expect(snippet(request('X-Ok', '1'), 'curl')).toContain('X-Ok: 1');
  });

  it('escapes HTTPie header values that would read a local file or JSON', () => {
    expect(snippet(request('x', '@/etc/passwd'), 'httpie')).toContain(String.raw`x:\@/etc/passwd`);
    expect(snippet(request('x', '=@/etc/passwd'), 'httpie')).toContain(
      String.raw`x:\=@/etc/passwd`,
    );
    expect(snippet(request('x', 'plain @ = value'), 'httpie')).toContain('x:plain @ = value');
  });

  it('never lets a URL be read as an option', () => {
    const dashed = { ...request('a', 'b'), url: '-o/tmp/x', headers: [] };
    expect(snippet(dashed, 'curl')).toContain('/-o/tmp/x');
    expect(snippet(dashed, 'curl')).not.toMatch(/\s-o\/tmp/);
    expect(snippet(dashed, 'httpie')).toContain('/-o/tmp/x');
  });

  it('keeps shell metacharacters inside quotes', () => {
    const text = snippet(request('x', "a'; touch /tmp/pwned; '"), 'curl');
    expect(text).toContain(String.raw`'x: a'\''; touch /tmp/pwned; '\'''`);
  });
});

describe('table', () => {
  it('protects TSV and headers from spreadsheet formulas, like CSV', () => {
    const rows = [{ a: '=HYPERLINK("http://evil")', b: '-3.5', c: '@SUM(1)' }];
    const columns = [
      { key: 'a', label: '=head' },
      { key: 'b', label: 'B' },
      { key: 'c', label: 'C' },
    ];
    const tsv = serialize(rows, columns, 'tsv').split('\n');
    expect(tsv[0].split('\t')[0]).toBe("'=head");
    expect(tsv[1].split('\t')).toEqual(['\'=HYPERLINK("http://evil")', '-3.5', "'@SUM(1)"]);
    const csv = serialize(rows, columns, 'csv');
    expect(csv).toContain("'=head");
    expect(csv).toContain("'@SUM(1)");
  });

  it('survives very deep arrays', () => {
    const deep = '['.repeat(20000) + ']'.repeat(20000);
    expect(() => parseTable(deep)).not.toThrow();
  });

  it('fills link templates with the own values of a row only', () => {
    expect(fillTemplate('/u/{id}/{constructor}', { id: 'a b' }, true)).toBe('/u/a%20b/');
    expect(fillTemplate('{toString}{__proto__}', {})).toBe('');
  });
});

describe('YAML', () => {
  it('refuses aliases that expand too far, without expanding them', () => {
    let value = /** @type {unknown} */ ('x');
    for (let i = 0; i < 40; i += 1) value = [value, value, value, value];
    const started = performance.now();
    expect(() => documentsToTree([value], 200)).toThrow(/expand/);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('counts the length of aliased strings', () => {
    const long = 'x'.repeat(1024 * 1024);
    expect(() => documentsToTree([Array.from({ length: 64 }, () => long)], 200)).toThrow(/expand/);
  });

  it('still reads normal documents with aliases', () => {
    const shared = { a: 1 };
    const { result } = documentsToTree([{ one: shared, two: shared }], 200);
    expect(result.ok).toBe(true);
  });
});

describe('regex risk', () => {
  /** @param {string} pattern */
  const risky = (pattern) => isRisky(parsePattern(pattern).tree);

  it('flags what froze the page', () => {
    for (const pattern of [
      '(a|a)*$',
      '(a|aa)+$',
      '(?:a|b|ab)*c',
      '(a+)+$',
      '(.*)*$',
      '(x+x+)+y',
      'a*a*a*a*b',
      '(\\w+\\s?)*$',
    ])
      expect(risky(pattern), pattern).toBe(true);
  });

  it('leaves common safe patterns alone', () => {
    for (const pattern of [
      '(?:foo|bar)+',
      '(cat|dog)s?',
      '^\\d{4}-\\d{2}-\\d{2}$',
      '\\w+@\\w+\\.com',
      'colou?r',
      'foo|foobar',
      '[a-z]+\\s[a-z]+',
    ])
      expect(risky(pattern), pattern).toBe(false);
  });
});

describe('lookups by a value from the content', () => {
  it('does not find members of Object', () => {
    for (const name of ['__proto__', 'constructor', 'toString'])
      expect(normalizeStatus(name)).toBe('queued');
  });
});

describe('dates out of range', () => {
  it('has no date rather than an invalid one', () => {
    for (const value of [1e30, -1e30, 8.64e15 + 1, -8640000000000001])
      expect(parseDate(value), String(value)).toBeNull();
    expect(parseDate(1790000000)).toBe(1790000000000);
    expect(parseDate(1790000000000)).toBe(1790000000000);
    expect(toTime(1e30)).toBeNull();
    expect(toTime(-1e30)).toBeNull();
    expect(toTime(1790000000)).toBe(1790000000000);
  });

  it('reads a status page with such dates', () => {
    const result = parseStatus(
      '{"updated":1e30,"components":[{"name":"a","since":1e30}],"incidents":[{"title":"b","start":1e30}]}',
    );
    expect(result.ok && result.page.updated).toBeNull();
    expect(result.ok && result.page.components[0].since).toBeNull();
    expect(result.ok && result.page.incidents[0].start).toBeNull();
  });
});

describe('highlighting', () => {
  it('skips a line too long to highlight, quickly', () => {
    const started = performance.now();
    const fragment = highlight('['.repeat(MAX_HIGHLIGHT_LINE * 40), 'json');
    expect(performance.now() - started).toBeLessThan(1000);
    expect(fragment.childNodes).toHaveLength(1);
    expect(fragment.firstChild?.nodeType).toBe(3);
  });
});

describe('calendar limits', () => {
  /** @param {string} source */
  function events(source) {
    const result = parseCalendar(source);
    if (!result.ok) throw new Error('not a calendar');
    return result.calendar.events;
  }
  const from = dayNumber(2026, 11, 1);
  const to = dayNumber(2026, 11, 30);

  it('finds today in a daily event that started long ago', () => {
    const list = events('[{"title":"Old","start":"1200-01-01","rrule":"FREQ=DAILY"}]');
    expect(occurrences(list, from, to, 'UTC')).toHaveLength(30);
  });

  it('respects intervals when it skips the past', () => {
    const list = events('[{"start":"1900-01-01","rrule":"FREQ=DAILY;INTERVAL=7"}]');
    const found = occurrences(list, from, to, 'UTC');
    expect(found.length).toBeGreaterThanOrEqual(4);
    for (const item of found) expect((item.startDay - dayNumber(1900, 1, 1)) % 7).toBe(0);
  });

  it('counts COUNT from the first occurrence', () => {
    const list = events('[{"start":"2026-10-01","rrule":"FREQ=DAILY;COUNT=35"}]');
    expect(occurrences(list, from, to, 'UTC')).toHaveLength(4);
  });

  it('is not frozen by thousands of old recurring events', () => {
    const source = `BEGIN:VCALENDAR\n${'BEGIN:VEVENT\nDTSTART:10000101\nRRULE:FREQ=DAILY\nEND:VEVENT\n'.repeat(5000)}END:VCALENDAR`;
    const list = events(source);
    const started = performance.now();
    occurrences(list, from, to, 'UTC');
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it('is not frozen by rules with a huge count', () => {
    const source = `[${Array(5000).fill('{"start":"1000-01-01","rrule":"FREQ=DAILY;COUNT=999999999"}').join(',')}]`;
    const list = events(source);
    const started = performance.now();
    occurrences(list, from, to, 'UTC');
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it('reads a property with a huge number of parameters in linear time', () => {
    const source = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;${';'.repeat(300000)}:20261105\nEND:VEVENT\nEND:VCALENDAR`;
    const started = performance.now();
    expect(events(source)).toHaveLength(1);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('keeps quoted separators in parameters', () => {
    const list = events(
      'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;X="a;b:c";TZID=Europe/Paris:20261105T100000\nEND:VEVENT\nEND:VCALENDAR',
    );
    expect(list[0].start.zone).toBe('Europe/Paris');
  });

  it('caps EXDATE', () => {
    const dates = Array(10000).fill('20261105').join(',');
    const list = events(
      `BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261101\nEXDATE:${dates}\nEND:VEVENT\nEND:VCALENDAR`,
    );
    expect(list[0].excluded.length).toBeLessThanOrEqual(2000);
  });

  it('closes the open event when the content changes', () => {
    if (!customElements.get('vt-calendar')) customElements.define('vt-calendar', VtCalendar);
    const el = /** @type {VtCalendar} */ (document.createElement('vt-calendar'));
    el.openId = '0-1';
    el.contentChanged();
    expect(el.openId).toBeNull();
  });
});
