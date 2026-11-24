import test from 'node:test';
import assert from 'node:assert/strict';
import { Flowtime } from '../../src/components/flowtime/engine/flowtime.js';

const events = [
  { id: 'one', start: '2026-11-19T08:00:00Z', title: 'First event' },
  { id: 'two', start: '2026-11-19T10:00:00Z', title: 'Second event' },
];
// Exercise the real constructor and selection lifecycle; only DOM rendering is stubbed.
class InspectorHarness extends Flowtime {
  mount() {
    this.closeButton = {};
    this.search = { value: '' };
    this.root = {
      ownerDocument: { activeElement: null },
      classList: { remove() {} },
      remove() {},
    };
    this.workspace = { dataset: {} };
    this.details = {
      hidden: true,
      contains: (node) => node === this.closeButton,
      querySelectorAll: () => [],
    };
    this.content = {
      clientWidth: 1000,
      querySelectorAll: () => this.cards,
      querySelector: () => this.cards.find((card) => card.dataset.selected === 'true') ?? null,
      contains: (node) => this.cards.includes(node),
      focus() {},
    };
    this.syncInspectorVisibility();
  }
  render() {
    this.syncInspectorVisibility();
    this.renderContent();
    this.renderDetails();
  }
  renderContent() {
    this.cards = this.events.map((event) => ({
      dataset: {
        eventId: event.id,
        selected: String(event.id === this.selectedId),
      },
      style: { visibility: 'visible' },
      setAttribute() {},
      focus() {
        this.focused = true;
      },
    }));
  }
  renderDetails() {
    this.syncInspectorVisibility();
  }
  emit(name, detail) {
    this.lastEvent = { name, detail };
    if (name === 'select') this.options.onSelect?.(detail.event);
  }
}
function inspect(options, run) {
  const original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  let viewer;
  try {
    viewer = new InspectorHarness({}, options);
    run(viewer);
  } finally {
    viewer?.destroy();
    if (original === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = original;
  }
}

test('all views arrive with no selection or inspector, including data loaded later', () => {
  for (const view of ['timeline', 'combined', 'feed'])
    inspect(
      {
        events,
        view,
        onSelect: () => assert.fail('No initial selection callback'),
      },
      (viewer) => {
        assert.equal(viewer.selectedId, null);
        assert.equal(viewer.details.hidden, true);
        assert.equal(viewer.workspace.dataset.inspector, 'closed');
        assert.ok(viewer.cards.every((card) => card.dataset.selected === 'false'));
        viewer.setEvents(events);
        assert.equal(viewer.selectedId, null);
        assert.equal(viewer.details.hidden, true);
      },
    );
  inspect({ events: [] }, (viewer) => {
    viewer.setEvents(events);
    assert.equal(viewer.selectedId, null);
    assert.equal(viewer.details.hidden, true);
  });
});
test('selection opens the inspector; closing clears the highlight and returns focus to the event', () => {
  inspect({ events }, (viewer) => {
    viewer.root.ownerDocument.activeElement = viewer.cards[0];
    viewer.select('one');
    assert.equal(viewer.cards[0].focused, true);
    assert.equal(viewer.selectedId, 'one');
    assert.equal(viewer.details.hidden, false);
    assert.equal(viewer.workspace.dataset.inspector, 'open');
    viewer.root.ownerDocument.activeElement = viewer.closeButton;
    viewer.clearSelection();
    assert.equal(viewer.selectedId, null);
    assert.equal(viewer.details.hidden, true);
    assert.equal(viewer.workspace.dataset.inspector, 'closed');
    assert.ok(viewer.cards.every((card) => card.dataset.selected === 'false'));
    assert.equal(viewer.cards[0].focused, true);
    assert.equal(viewer.lastEvent.name, 'deselect');
    assert.equal(viewer.lastEvent.detail.event.id, 'one');
    viewer.select('two');
    assert.equal(viewer.details.hidden, false);
    assert.equal(viewer.selectedId, 'two');
  });
});
test('filters, view switches and data refreshes keep a dismissed inspector closed', () => {
  inspect({ events }, (viewer) => {
    viewer.select('one');
    viewer.clearSelection();
    viewer.setView('feed');
    viewer.setFilter({ query: 'event' });
    viewer.setEvents(events);
    assert.equal(viewer.selectedId, null);
    assert.equal(viewer.details.hidden, true);
  });
});
test('an explicit selection survives updates, but a filtered or deleted selection closes instead of choosing another event', () => {
  inspect({ events }, (viewer) => {
    viewer.select('one');
    viewer.setEvents([{ ...events[0], title: 'Updated event' }, events[1]]);
    assert.equal(viewer.selectedId, 'one');
    assert.equal(viewer.details.hidden, false);
    viewer.setDateRange({ start: '2026-11-19T09:00:00Z' });
    assert.equal(viewer.selectedId, null);
    assert.equal(viewer.details.hidden, true);
    viewer.setDateRange();
    assert.equal(viewer.selectedId, null);
    viewer.select('one');
    viewer.setEvents([events[1]]);
    assert.equal(viewer.selectedId, null);
    assert.equal(viewer.details.hidden, true);
  });
});
