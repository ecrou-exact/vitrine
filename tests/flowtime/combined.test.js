import test from 'node:test';
import assert from 'node:assert/strict';
import { Flowtime } from '../../src/components/flowtime/engine/flowtime.js';
import { DEFAULT_GROUPS, normalizeEvents } from '../../src/components/flowtime/engine/model.js';

// Minimal DOM boundary; exercise the real renderer, packing and viewport painting.
class Node extends EventTarget {
  constructor(tag = 'div') {
    super();
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.classList = { remove() {} };
    this.style = {
      setProperty(key, value) {
        this[key] = value;
      },
    };
    this.clientWidth = 1000;
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
  }
  append(...nodes) {
    nodes.forEach((node) => {
      node.parent = this;
      this.children.push(node);
    });
  }
  prepend(node) {
    node.parent = this;
    this.children.unshift(node);
  }
  insertBefore(node, next) {
    node.parent = this;
    const index = this.children.indexOf(next);
    this.children.splice(index < 0 ? this.children.length : index, 0, node);
  }
  remove() {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1);
  }
  replaceChildren() {
    this.children = [];
  }
  get firstChild() {
    return this.children[0];
  }
}
const events = normalizeEvents([
  {
    id: 'note',
    title: 'Analyst finding',
    start: '2026-11-19T08:00:00Z',
    group: 'events',
  },
  {
    id: 'object',
    title: 'Observed connection',
    start: '2026-11-19T08:00:00Z',
    end: '2026-11-19T09:00:00Z',
    group: 'notes',
  },
  {
    id: 'attribute',
    title: 'Observed domain',
    start: '2026-11-19T08:30:00Z',
    group: 'milestones',
  },
  {
    id: 'file',
    title: 'Evidence collected',
    start: '2026-11-19T10:00:00Z',
    group: 'attachments',
  },
]);
function render(view, run) {
  const original = globalThis.document;
  globalThis.document = { createElement: (tag) => new Node(tag) };
  try {
    const viewer = Object.assign(Object.create(Flowtime.prototype), {
      view,
      options: { customViews: [] },
      events,
      groups: DEFAULT_GROUPS,
      activeGroups: new Set(DEFAULT_GROUPS.map((group) => group.id)),
      query: '',
      dateRange: {},
      from: Date.UTC(2026, 10, 19, 7),
      to: Date.UTC(2026, 10, 19, 11),
      content: new Node(),
      root: new Node(),
      textScaleSelect: new Node('select'),
      activityFilter: { renderAxis() {} },
      footer: new Node(),
      rangeLabel: new Node(),
      selectedId: null,
      formatDate: (time) => new Date(time).toISOString().slice(0, 10),
      formatTime: (time) => new Date(time).toISOString().slice(11, 16),
      safeColor: (color) => color || '#7c8b92',
      render() {
        this.renderContent();
      },
      emit(name, detail) {
        this.lastEvent = { name, detail };
      },
    });
    viewer.renderContent();
    run(viewer);
  } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
}
function descendants(node, className) {
  return node.children.flatMap((child) => [
    ...(child.className === className ? [child] : []),
    ...descendants(child, className),
  ]);
}

test('text scaling preserves investigation state and repacks dense cards at every size', () => {
  render('combined', (viewer) => {
    viewer.selectedId = 'object';
    const before = {
      from: viewer.from,
      to: viewer.to,
      ids: viewer.visibleEvents.map((event) => event.id),
      groups: [...viewer.activeGroups],
    };
    for (const scale of [0.5, 0.6, 0.7, 0.8, 1.25, 1.5]) {
      viewer.setTextScale(scale);
      assert.equal(viewer.textScale, scale);
      assert.equal(viewer.textScaleSelect.value, String(scale));
      assert.equal(viewer.content.style['--ft-text-scale'], scale);
      assert.equal(viewer.root.style['--ft-text-scale'], undefined);
      assert.deepEqual(viewer.lastEvent, {
        name: 'textscalechange',
        detail: { textScale: scale },
      });
      assert.equal(viewer.selectedId, 'object');
      assert.equal(viewer.from, before.from);
      assert.equal(viewer.to, before.to);
      assert.deepEqual(
        viewer.visibleEvents.map((event) => event.id),
        before.ids,
      );
      assert.deepEqual([...viewer.activeGroups], before.groups);
      const cards = viewer.timelineScene.lanes[0].nodes.map(({ card }) => ({
        x: parseFloat(card.style.transform.slice('translate3d('.length)),
        y: parseFloat(card.style.top),
      }));
      for (let i = 0; i < cards.length; i++)
        for (const other of cards.slice(i + 1))
          assert.ok(
            Math.abs(cards[i].x - other.x) >= 220 * scale ||
              Math.abs(cards[i].y - other.y) >= 86 * scale,
          );
    }
    viewer.setView('feed');
    assert.equal(viewer.textScale, 1.5);
    assert.equal(viewer.content.style['--ft-text-scale'], 1);
    assert.equal(viewer.selectedId, 'object');
    viewer.setView('timeline');
    assert.equal(viewer.content.style['--ft-text-scale'], 1.5);
    assert.equal(viewer.selectedId, 'object');
  });
});

test('feed keeps normal text even when the saved timeline size changes', () => {
  render('feed', (viewer) => {
    for (const scale of [0.5, 1.5]) {
      viewer.setTextScale(scale);
      assert.equal(viewer.textScale, scale);
      assert.equal(viewer.content.style['--ft-text-scale'], 1);
      assert.equal(viewer.content.dataset.view, 'feed');
    }
    viewer.setView('combined');
    assert.equal(viewer.content.style['--ft-text-scale'], 1.5);
    viewer.setView('feed');
    assert.equal(viewer.content.style['--ft-text-scale'], 1);
  });
});

test('invalid text size settings fail before changing the viewer', () => {
  for (const scale of [0.49, 1.51, 0, -1, NaN, Infinity, '1.25', null]) {
    assert.throws(() => new Flowtime({}, { textScale: scale }), /textScale/);
    render('combined', (viewer) => {
      assert.throws(() => viewer.setTextScale(scale), /textScale/);
      assert.equal(viewer.textScale, 1);
      assert.equal(viewer.timelineScene.lanes.length, 1);
    });
  }
});

test('combined timeline packs every source in one chronological track, retaining source labels and colors', () => {
  render('combined', (viewer) => {
    const [lane] = viewer.timelineScene.lanes;
    assert.equal(viewer.timelineScene.lanes.length, 1);
    assert.deepEqual(
      lane.events.map((event) => event.id),
      events.map((event) => event.id),
    );
    assert.equal(
      descendants(viewer.content, 'ft-lane-label')[0].children[1].textContent,
      'All events',
    );
    assert.deepEqual(
      descendants(viewer.content, 'ft-event-source').map((node) => node.textContent),
      DEFAULT_GROUPS.map((group) => group.label),
    );
    lane.nodes.forEach(({ card, marker, duration }, index) => {
      const color = DEFAULT_GROUPS[index].color;
      assert.equal(card.style['--ft-group'], color);
      assert.equal(marker.style['--ft-group'], color);
      if (duration) assert.equal(duration.style['--ft-group'], color);
    });
    // Identical timestamps remain separately reachable rather than overlapping.
    assert.notEqual(lane.nodes[0].card.style.top, lane.nodes[1].card.style.top);
    const nodes = [...lane.nodes];
    viewer.from += 60000;
    viewer.to += 60000;
    viewer.paintViewport();
    assert.deepEqual(lane.nodes, nodes);
    assert.equal(viewer.timelineScene.outside.hidden, true);
  });
});
test('combined view shares search, source and date filters while keeping the viewport on view switches', () => {
  render('timeline', (viewer) => {
    assert.equal(viewer.timelineScene.lanes.length, 4);
    const viewport = [viewer.from, viewer.to];
    viewer.query = 'Observed';
    viewer.activeGroups = new Set(['notes', 'milestones']);
    viewer.dateRange = {
      start: Date.UTC(2026, 10, 19, 8, 20),
      end: Date.UTC(2026, 10, 19, 8, 40),
    };
    viewer.selectedId = 'object';
    viewer.setView('combined');
    assert.deepEqual(
      viewer.timelineScene.lanes[0].events.map((event) => event.id),
      ['object', 'attribute'],
    );
    assert.equal(viewer.timelineScene.lanes[0].nodes[0].card.dataset.selected, 'true');
    assert.deepEqual([viewer.from, viewer.to], viewport);
    assert.equal(viewer.lastEvent.detail.view, 'combined');
    viewer.setView('timeline');
    assert.equal(viewer.timelineScene.lanes.length, 2);
    assert.equal(descendants(viewer.content, 'ft-event-source').length, 0);
    assert.equal(viewer.selectedId, 'object');
    assert.deepEqual([viewer.from, viewer.to], viewport);
  });
});
test('a combined timeline with no matches uses the shared empty state', () => {
  render('combined', (viewer) => {
    viewer.query = 'absent event';
    viewer.renderContent();
    assert.equal(viewer.timelineScene, null);
    assert.equal(descendants(viewer.content, 'ft-empty').length, 1);
  });
});
