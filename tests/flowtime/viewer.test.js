import test from 'node:test';
import assert from 'node:assert/strict';
import { Flowtime } from '../../src/components/flowtime/engine/flowtime.js';
import { normalizeEvents } from '../../src/components/flowtime/engine/model.js';

function viewer(options = {}) {
  const buttons = [{ disabled: false }, { disabled: false }];
  const instance = Object.assign(Object.create(Flowtime.prototype), {
    events: normalizeEvents([
      { id: 'one', start: '2026-11-19T08:00:00Z', group: 'events' },
      { id: 'two', start: '2026-11-19T10:00:00Z', group: 'events' },
    ]),
    options,
    pendingActions: new Set(),
    selectedId: 'one',
    query: '',
    activeGroups: new Set(['events']),
    dateRange: { start: null, end: null },
    actionError: { textContent: '' },
    search: { value: '' },
    details: { querySelectorAll: () => buttons },
    render() {},
    renderContent() {},
    emit(name, detail) {
      this.lastEvent = { name, detail };
    },
  });
  return { instance, buttons };
}
test('inspector actions use the selected source event and suppress duplicate submissions', async () => {
  let resolve,
    calls = 0;
  const { instance, buttons } = viewer({
    onDelete: (event) => {
      calls++;
      assert.equal(event.id, 'one');
      return new Promise((done) => {
        resolve = done;
      });
    },
  });
  const pending = instance.runAction('Delete', instance.events[0]);
  assert.ok(buttons.every((button) => button.disabled));
  await instance.runAction('Delete', instance.events[0]);
  assert.equal(calls, 1);
  resolve();
  await pending;
  assert.ok(buttons.every((button) => !button.disabled));
});
test('action failures leave controls usable and report an error', async () => {
  const { instance, buttons } = viewer({
    onEdit: async () => {
      throw new Error('offline');
    },
  });
  await instance.runAction('Edit', instance.events[0]);
  assert.match(instance.actionError.textContent, /Unable to edit/);
  assert.equal(instance.lastEvent.name, 'actionerror');
  assert.ok(buttons.every((button) => !button.disabled));
});
test('date filtering clears a hidden selection, survives view switching, and clears independently', () => {
  const { instance } = viewer();
  instance.query = '';
  instance.setDateRange({
    start: '2026-11-19T09:00:00Z',
    end: '2026-11-19T11:00:00Z',
  });
  assert.deepEqual(
    instance.visibleEvents.map((event) => event.id),
    ['two'],
  );
  assert.equal(instance.selectedId, null);
  assert.equal(instance.from, Date.UTC(2026, 10, 19, 9));
  assert.equal(instance.to, Date.UTC(2026, 10, 19, 11));
  instance.setView('feed');
  assert.equal(instance.visibleEvents.length, 1);
  instance.setFilter({ query: 'Untitled' });
  assert.equal(instance.visibleEvents.length, 1);
  instance.setDateRange();
  assert.equal(instance.visibleEvents.length, 2);
  assert.equal(instance.query, 'Untitled');
});
test('invalid range updates are atomic and a single-instant range fits to a nonzero viewport', () => {
  const { instance } = viewer();
  instance.setDateRange({ start: 0, end: 0 });
  assert.ok(instance.to > instance.from);
  assert.throws(() => instance.setFilter({ query: 'changed', dateRange: { start: 'bad' } }));
  assert.equal(instance.query, '');
  assert.deepEqual(instance.dateRange, { start: 0, end: 0 });
});

test('fitting the full dataset leaves room for the first and last card labels', () => {
  for (const textScale of [0.5, 0.8, 1, 1.5]) {
    const { instance } = viewer({ textScale });
    instance.fitBounds();
    const width = 390 * textScale,
      span = instance.to - instance.from;
    assert.ok(((instance.events[0].start - instance.from) / span) * width >= 110 * textScale);
    assert.ok(
      ((instance.events.at(-1).start - instance.from) / span) * width <= width - 110 * textScale,
    );
  }
});
