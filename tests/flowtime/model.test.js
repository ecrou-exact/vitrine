import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  timestamp,
  normalizeEvents,
  filterEvents,
  packEvents,
  extent,
} from '../../src/components/flowtime/engine/model.js';

test('dates are deterministic across clients and reject overflowing calendar dates', () => {
  assert.equal(timestamp('2026-11-12 08:15:00'), Date.UTC(2026, 10, 12, 8, 15));
  assert.equal(timestamp('2026-11-12T10:15:00+02:00'), Date.UTC(2026, 10, 12, 8, 15));
  assert.equal(timestamp('2026-11-12'), Date.UTC(2026, 10, 12));
  for (const invalid of ['', 'tomorrow', '2026-02-30', '2026-13-01', '2025-02-29', null])
    assert.ok(Number.isNaN(timestamp(invalid)), String(invalid));
  assert.ok(Number.isFinite(timestamp('2024-02-29')));
});
test('normalization is chronological and rejects duplicate identifiers and invalid intervals', () => {
  const events = normalizeEvents([
    { id: 'b', start: '2026-11-13' },
    { id: 'a', start: '2026-11-12' },
  ]);
  assert.equal(events[0].id, 'a');
  assert.throws(
    () =>
      normalizeEvents([
        { id: 1, start: '2026-01-01' },
        { id: '1', start: '2026-01-02' },
      ]),
    /Duplicate/,
  );
  assert.throws(() => normalizeEvents([{ start: 'not-a-date' }]), /Invalid start/);
  assert.throws(() => normalizeEvents([{ start: '2026-01-02', end: '2026-01-01' }]), /Invalid end/);
  assert.throws(() => normalizeEvents({}), /array/);
});
test('search and source filtering intersect, including an empty source selection', () => {
  const events = normalizeEvents([
    {
      id: 1,
      start: '2026-01-01',
      title: 'Suspicious login',
      group: 'events',
    },
    { id: 2, start: '2026-01-01', description: 'login logs', group: 'attachments' },
  ]);
  assert.deepEqual(
    filterEvents(events, 'LOGIN', new Set(['attachments'])).map((event) => event.id),
    ['2'],
  );
  assert.equal(filterEvents(events, '', new Set()).length, 0);
});
test('coincident events occupy distinct rows and a later event reuses space', () => {
  const events = normalizeEvents([
    { id: 1, start: 1000 },
    { id: 2, start: 1000 },
    { id: 3, start: 9000 },
  ]);
  const packed = packEvents(events, 0, 10000, 1000);
  assert.deepEqual(
    packed.map((item) => item.row),
    [0, 1, 0],
  );
});
test('extent includes durations and provides space for single instants', () => {
  const events = normalizeEvents([{ start: 100000, end: 900000 }]);
  const [from, to] = extent(events);
  assert.ok(from < 100000 && to > 900000);
  assert.ok(extent(normalizeEvents([{ start: 0 }]))[1] > 0);
});
test('cards clamped against the viewport edge never overlap in one row', () => {
  const events = normalizeEvents([
    { id: 1, start: 7000 },
    { id: 2, start: 9900 },
  ]);
  const packed = packEvents(events, 0, 10000, 400);
  assert.deepEqual(
    packed.map((item) => item.row),
    [0, 1],
  );
  assert.ok(packed.every((item) => item.x + 172 <= 400));
});
test('time ticks use readable rounded intervals within the viewport', async () => {
  const { timeTicks } = await import('../../src/components/flowtime/engine/model.js');
  const from = Date.UTC(2026, 10, 12, 7, 53),
    to = Date.UTC(2026, 10, 12, 12, 31);
  const ticks = timeTicks(from, to, 560);
  assert.deepEqual(
    ticks.map((value) => new Date(value).getUTCMinutes()),
    [0, 0, 0, 0, 0],
  );
  assert.ok(ticks.every((time) => time >= from && time < to));
  assert.ok(timeTicks(0, 1000, 500).length <= 5);
});

test('date ranges include boundaries and interval overlaps while intersecting text and groups', async () => {
  const { normalizeDateRange } = await import('../../src/components/flowtime/engine/model.js');
  const events = normalizeEvents([
    {
      id: 'before',
      start: '2026-11-18T23:59:59Z',
      title: 'Evidence',
      group: 'attachments',
    },
    {
      id: 'start',
      start: '2026-11-19T00:00:00Z',
      title: 'Evidence',
      group: 'attachments',
    },
    {
      id: 'last',
      start: '2026-11-19T23:59:59.999Z',
      title: 'Evidence',
      group: 'attachments',
    },
    {
      id: 'after',
      start: '2026-11-20T00:00:00Z',
      title: 'Evidence',
      group: 'attachments',
    },
    {
      id: 'overlap',
      start: '2026-11-18T12:00:00Z',
      end: '2026-11-20T12:00:00Z',
      title: 'Evidence',
      group: 'attachments',
    },
    {
      id: 'wrong-group',
      start: '2026-11-19',
      title: 'Evidence',
      group: 'notes',
    },
    { id: 'wrong-text', start: '2026-11-19', title: 'Note', group: 'attachments' },
  ]);
  const range = normalizeDateRange({ start: '2026-11-19', end: '2026-11-19' });
  assert.deepEqual(
    filterEvents(events, 'evidence', new Set(['attachments']), range).map((event) => event.id),
    ['overlap', 'start', 'last'],
  );
  assert.equal(
    filterEvents(events, '', null, normalizeDateRange({ start: '2026-11-20' })).length,
    2,
  );
  assert.equal(filterEvents(events, '', null, normalizeDateRange({ end: '2026-11-18' })).length, 2);
  assert.equal(filterEvents(events, '', null, normalizeDateRange()).length, events.length);
});
test('invalid ranges are rejected and zero timestamps are valid bounds', async () => {
  const { normalizeDateRange } = await import('../../src/components/flowtime/engine/model.js');
  assert.throws(() => normalizeDateRange({ start: '2026-02-30' }), /valid ISO/);
  assert.throws(() => normalizeDateRange({ start: '2026-11-20', end: '2026-11-19' }), /end must/);
  assert.deepEqual(normalizeDateRange({ start: 0, end: 0 }), {
    start: 0,
    end: 0,
  });
});

test('unclamped timeline rows remain stable while the viewport pans', () => {
  const events = normalizeEvents([
    { id: 1, start: 1000 },
    { id: 2, start: 2000 },
    { id: 3, start: 9000 },
  ]);
  const first = packEvents(events, 0, 10000, 1000, 172, false);
  const shifted = packEvents(events, 4000, 14000, 1000, 172, false);
  assert.deepEqual(
    first.map((item) => item.row),
    shifted.map((item) => item.row),
  );
  assert.ok(shifted[0].x < 0);
  shifted.forEach((item, index) => assert.equal(item.x, first[index].x - 400));
});
