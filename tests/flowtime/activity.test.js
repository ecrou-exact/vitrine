import test from 'node:test';
import assert from 'node:assert/strict';
import { activityHistogram, normalizeEvents } from '../../src/components/flowtime/engine/model.js';
import { ActivityFilter } from '../../src/components/flowtime/engine/activity.js';

const events = normalizeEvents([
  { id: 'first', start: '2026-11-19T08:00:00Z', group: 'events' },
  { id: 'object', start: '2026-11-19T08:00:00Z', group: 'notes' },
  { id: 'last', start: '2026-11-19T10:00:00Z', group: 'attachments' },
]);

test('activity counts each start once, stacks sources and keeps a stable domain while other filters apply', () => {
  const all = activityHistogram(events);
  assert.equal(
    all.buckets.reduce((total, bucket) => total + bucket.count, 0),
    3,
  );
  const first = all.buckets.find((bucket) => bucket.count === 2);
  assert.deepEqual(
    [...first.groups],
    [
      ['events', 1],
      ['notes', 1],
    ],
  );
  const filtered = activityHistogram([events[2]], events);
  assert.deepEqual([filtered.start, filtered.end, filtered.step], [all.start, all.end, all.step]);
  assert.equal(
    filtered.buckets.reduce((total, bucket) => total + bucket.count, 0),
    1,
  );
  const none = activityHistogram([], events);
  assert.equal(none.buckets.length, all.buckets.length);
  assert.ok(none.buckets.every((bucket) => bucket.count === 0));
});
test('daily and long histories have bounded bins and include the last timestamp, duration end, and empty periods', () => {
  for (const end of ['2026-12-19', '2040-11-19', '9999-12-31']) {
    const items = normalizeEvents([{ start: '2026-11-19', end: '2026-11-21' }, { start: end }]);
    const data = activityHistogram(items);
    assert.ok(data.step >= 86400000);
    assert.ok(data.buckets.length <= 56);
    assert.equal(
      data.buckets.reduce((total, bucket) => total + bucket.count, 0),
      2,
    );
    assert.ok(data.start <= items[0].start);
    assert.ok(data.end > items.at(-1).start);
    assert.ok(data.buckets.some((bucket) => !bucket.count));
  }
  const duration = activityHistogram(normalizeEvents([{ start: '2026-11-19', end: '2026-12-31' }]));
  assert.ok(duration.end > Date.UTC(2026, 11, 31));
  assert.equal(activityHistogram([]), null);
  const instant = activityHistogram([events[0]]);
  assert.equal(instant.buckets.length, 12);
  assert.equal(
    instant.buckets.reduce((total, bucket) => total + bucket.count, 0),
    1,
  );
});

class Node extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.style = {
      setProperty(key, value) {
        this[key] = value;
      },
    };
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
  replaceChildren() {
    this.children = [];
  }
  closest(selector) {
    return selector === '.ft-activity-bar' && this.className === 'ft-activity-bar'
      ? this
      : (this.parent?.closest(selector) ?? null);
  }
  focus() {
    this.focused = true;
  }
  getBoundingClientRect() {
    return { left: 0, width: 500 };
  }
  setPointerCapture(id) {
    this.capture = id;
  }
  hasPointerCapture(id) {
    return this.capture === id;
  }
  releasePointerCapture() {
    this.capture = null;
  }
}
function harness(run) {
  const original = globalThis.document;
  globalThis.document = { createElement: (tag) => new Node(tag) };
  const changes = [];
  const groups = new Set(['events', 'notes', 'attachments']);
  let control;
  try {
    control = new ActivityFilter({
      onChange(range) {
        changes.push(range);
        control.render(events, '', groups, range);
      },
      formatDate: (time) => new Date(time).toISOString().slice(0, 10),
      formatTime: (time) => new Date(time).toISOString().slice(11, 16),
      timeZone: 'UTC',
      colorFor: (group) => group,
      signal: new AbortController().signal,
    });
    control.render(events, '', groups, {});
    run({ control, changes, groups });
  } finally {
    control?.destroy();
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
}
function dispatch(node, type, props = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(props)) Object.defineProperty(event, key, { value });
  node.dispatchEvent(event);
  return event;
}
function pointer(control, type, index, extra = {}) {
  return dispatch(control.plot, type, {
    target: control.buttons[index],
    clientX: ((index + 0.5) * 500) / control.buttons.length,
    clientY: 0,
    button: 0,
    pointerId: 1,
    isPrimary: true,
    ...extra,
  });
}

test('clicking a period toggles it, Shift-click extends it, and reset preserves the histogram', () => {
  harness(({ control, changes }) => {
    const nodes = [...control.buttons];
    dispatch(control.buttons[0], 'click');
    assert.deepEqual(changes.at(-1), control.bounds(0));
    assert.equal(control.buttons[0].attributes['aria-pressed'], 'true');
    dispatch(control.buttons[3], 'click', { shiftKey: true });
    assert.deepEqual(changes.at(-1), control.bounds(0, 3));
    dispatch(control.reset, 'click');
    assert.deepEqual(changes.at(-1), {});
    assert.equal(control.reset.disabled, true);
    assert.deepEqual(control.buttons, nodes);
    dispatch(control.buttons[1], 'click');
    dispatch(control.buttons[1], 'click');
    assert.deepEqual(changes.at(-1), {});
  });
});
test('dragging previews without filtering until release, works in either direction, and suppresses the following click', () => {
  harness(({ control, changes }) => {
    pointer(control, 'pointerdown', 4);
    pointer(control, 'pointermove', 1);
    assert.equal(changes.length, 0);
    assert.equal(control.buttons[2].attributes['aria-pressed'], 'true');
    assert.equal(control.plot.capture, 1);
    pointer(control, 'pointerup', 1);
    assert.deepEqual(changes.at(-1), control.bounds(1, 4));
    assert.equal(control.plot.capture, null);
    assert.equal(control.buttons[1].focused, true);
    dispatch(control.buttons[1], 'click', { detail: 1 });
    assert.equal(changes.length, 1);
    pointer(control, 'pointerdown', 2);
    pointer(control, 'pointermove', 7);
    pointer(control, 'pointerup', 7);
    assert.deepEqual(changes.at(-1), control.bounds(2, 7));
  });
});
test('cancelled drags and vertical touch scrolling do not change the active period', () => {
  harness(({ control, changes }) => {
    dispatch(control.buttons[3], 'click');
    const range = changes.at(-1);
    pointer(control, 'pointerdown', 2);
    pointer(control, 'pointermove', 6);
    dispatch(control.plot, 'pointercancel');
    assert.equal(control.drag, null);
    assert.equal(changes.length, 1);
    assert.equal(control.buttons[3].attributes['aria-pressed'], 'true');
    assert.equal(control.buttons[2].attributes['aria-pressed'], 'false');
    pointer(control, 'pointerdown', 1);
    pointer(control, 'pointermove', 2, { clientY: 100 });
    pointer(control, 'pointerup', 2, { clientY: 100 });
    assert.deepEqual(changes, [range]);
  });
});
test('keyboard arrows move between periods, Shift extends the range, and Escape clears only the date filter', () => {
  harness(({ control, changes }) => {
    dispatch(control.root, 'keydown', {
      target: control.buttons[2],
      key: 'ArrowRight',
    });
    assert.equal(control.buttons[3].focused, true);
    assert.equal(changes.length, 0);
    dispatch(control.root, 'keydown', {
      target: control.buttons[2],
      key: 'ArrowRight',
      shiftKey: true,
    });
    assert.deepEqual(changes.at(-1), control.bounds(2, 3));
    dispatch(control.root, 'keydown', {
      target: control.buttons[3],
      key: 'Escape',
    });
    assert.deepEqual(changes.at(-1), {});
    assert.equal(control.range.start, undefined);
  });
});
