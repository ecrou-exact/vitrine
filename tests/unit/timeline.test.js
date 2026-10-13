import { describe, expect, it } from 'vitest';
import {
  TimelineError,
  countKinds,
  formatDuration,
  normalizeKind,
  parseDate,
  readEvents,
  safeLink,
  sortEvents,
} from '../../src/components/timeline/events.js';

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- Something new

## [1.1.0] - 2026-03-02

### Fixed

- A bug

## [1.0.0] - 2026-01-15

### Added

- First release

[1.1.0]: https://example.com/compare/v1.0.0...v1.1.0
[1.0.0]: javascript:alert(1)
`;

describe('readEvents (JSON)', () => {
  it('reads an array of events with aliases', () => {
    const events = readEvents(
      JSON.stringify([
        { time: '2026-10-01T10:00:00Z', title: 'Alert', status: 'critical', tags: ['db'] },
        {
          date: '2026-10-01 10:30',
          name: 'Fix deployed',
          kind: 'resolved',
          url: 'https://x.test/',
        },
      ]),
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ title: 'Alert', kind: 'danger', tags: ['db'] });
    expect(events[1]).toMatchObject({
      title: 'Fix deployed',
      kind: 'success',
      link: 'https://x.test/',
    });
    expect(events[1].date).not.toBeNull();
  });

  it('reads an object with "events"', () => {
    expect(readEvents('{"events":[{"title":"a"}]}')).toHaveLength(1);
  });

  it('rejects other JSON and invalid JSON', () => {
    expect(() => readEvents('{"a":1}')).toThrow(TimelineError);
    expect(() => readEvents('[1,')).toThrow(TimelineError);
  });

  it('returns nothing for empty content', () => {
    expect(readEvents('  ')).toEqual([]);
  });
});

describe('readEvents (changelog)', () => {
  it('turns versions into events, sections into tags', () => {
    const events = readEvents(CHANGELOG);
    expect(events.map((e) => e.title)).toEqual(['Unreleased', '1.1.0', '1.0.0']);
    expect(events[0].kind).toBe('neutral');
    expect(events[1]).toMatchObject({ kind: 'release', time: '2026-03-02', tags: ['Fixed'] });
    expect(events[1].description).toContain('- A bug');
  });

  it('keeps only http(s) link references', () => {
    const events = readEvents(CHANGELOG);
    expect(events[1].link).toBe('https://example.com/compare/v1.0.0...v1.1.0');
    expect(events[2].link).toBe('');
  });

  it('rejects Markdown without versions', () => {
    expect(() => readEvents('# Title\n\nText')).toThrow(TimelineError);
  });
});

describe('helpers', () => {
  it('normalizes kinds', () => {
    expect(normalizeKind('WARN')).toBe('warning');
    expect(normalizeKind('')).toBe('info');
    expect(normalizeKind('whatever')).toBe('neutral');
  });

  it('accepts only http(s) links', () => {
    expect(safeLink('javascript:alert(1)')).toBe('');
    expect(safeLink('data:text/html,x')).toBe('');
    expect(safeLink('/relative')).toBe('');
    expect(safeLink('http://a.test')).toBe('http://a.test/');
  });

  it('parses dates in seconds, milliseconds and ISO', () => {
    expect(parseDate(1_700_000_000)).toBe(1_700_000_000_000);
    expect(parseDate('1700000000000')).toBe(1_700_000_000_000);
    expect(parseDate('2026-01-01T00:00:00Z')).toBe(Date.UTC(2026, 0, 1));
    expect(parseDate('soon')).toBeNull();
  });

  it('sorts by date, and keeps changelogs newest first', () => {
    const events = readEvents(
      '[{"title":"b","time":"2026-01-02"},{"title":"a","time":"2026-01-01"}]',
    );
    expect(sortEvents(events, 'oldest').map((e) => e.title)).toEqual(['a', 'b']);
    expect(sortEvents(events, 'newest').map((e) => e.title)).toEqual(['b', 'a']);
    const log = readEvents(CHANGELOG);
    expect(sortEvents(log, 'newest')[0].title).toBe('Unreleased');
    expect(sortEvents(log, 'oldest')[0].title).toBe('1.0.0');
  });

  it('counts kinds', () => {
    expect(countKinds(readEvents(CHANGELOG))).toEqual({ neutral: 1, release: 2 });
  });

  it('formats durations', () => {
    expect(formatDuration(30_000)).toBe('30 s');
    expect(formatDuration(-12 * 60_000)).toBe('12 min');
    expect(formatDuration(200 * 60_000)).toBe('3 h 20 min');
    expect(formatDuration(5 * 86_400_000)).toBe('5 d');
  });
});
