import test from 'node:test';
import assert from 'node:assert/strict';
import { Flowtime } from '../../src/components/flowtime/engine/flowtime.js';

function motion({ reduced = false, duration = 220 } = {}) {
  let id = 0,
    renders = 0,
    paints = [];
  const frames = new Map(),
    classes = new Set();
  const root = new EventTarget(),
    content = new EventTarget();
  const track = { clientWidth: 1000 };
  root.closest = () => track;
  root.classList = {
    add: (value) => classes.add(value),
    remove: (value) => classes.delete(value),
  };
  root.remove = () => {};
  let captured = null;
  content.setPointerCapture = (pointerId) => {
    captured = pointerId;
  };
  content.hasPointerCapture = (pointerId) => captured === pointerId;
  content.releasePointerCapture = () => {
    captured = null;
  };
  const instance = Object.assign(Object.create(Flowtime.prototype), {
    options: { animationDuration: duration },
    from: 0,
    to: 1000,
    view: 'timeline',
    timelineScene: {},
    root,
    content,
    abort: new AbortController(),
    observer: { disconnect() {} },
    requestFrame(callback) {
      frames.set(++id, callback);
      return id;
    },
    cancelFrame(handle) {
      frames.delete(handle);
    },
    motionReduced: () => reduced,
    syncInspectorVisibility() {
      return false;
    },
    renderContent() {
      renders++;
    },
    render() {},
    emit() {},
    paintViewport(repack = false) {
      paints.push({ from: this.from, to: this.to, repack });
    },
  });
  const tick = (time) => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(time));
  };
  function pointer(target, type, x, y = 100) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, {
      clientX: x,
      clientY: y,
      button: 0,
      pointerId: 1,
      isPrimary: true,
    });
    target.dispatchEvent(event);
  }
  return {
    instance,
    root,
    content,
    classes,
    frames,
    paints,
    tick,
    pointer,
    renders: () => renders,
    captured: () => captured,
  };
}

test('pan arrows interpolate through intermediate positions and finish at an exact target without rebuilding', () => {
  const h = motion();
  h.instance.pan(0.3);
  assert.equal(h.instance.from, 0);
  h.tick(0);
  h.tick(80);
  assert.ok(h.instance.from > 0 && h.instance.from < 300);
  assert.equal(h.instance.to - h.instance.from, 1000);
  h.tick(220);
  assert.equal(h.instance.from, 300);
  assert.equal(h.instance.to, 1300);
  assert.equal(h.renders(), 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.paints.at(-1).repack, true);
});
test('combined timeline uses the same animated pan and zoom controls', () => {
  const h = motion();
  h.instance.view = 'combined';
  h.instance.to = 2000;
  h.instance.pan(0.3);
  h.tick(0);
  h.tick(80);
  assert.ok(h.instance.from > 0 && h.instance.from < 600);
  h.tick(220);
  assert.deepEqual([h.instance.from, h.instance.to], [600, 2600]);
  h.instance.zoom(2);
  h.tick(300);
  h.tick(520);
  assert.deepEqual([h.instance.from, h.instance.to], [1100, 2100]);
  assert.equal(h.renders(), 0);
});
test('rapid arrow clicks accumulate distance and interrupt from the displayed position without a jump', () => {
  const h = motion();
  h.instance.pan(0.3);
  h.tick(0);
  h.tick(80);
  const displayed = h.instance.from;
  h.instance.pan(0.3);
  assert.equal(h.instance.from, displayed);
  assert.deepEqual(h.instance.navigationTarget, [600, 1600]);
  h.tick(100);
  assert.equal(h.instance.from, displayed);
  h.tick(320);
  assert.equal(h.instance.from, 600);
  assert.equal(h.frames.size, 0);
});
test('zoom keeps its center and can be interrupted by a pan', () => {
  const h = motion();
  h.instance.to = 4000;
  h.instance.zoom(2);
  h.tick(0);
  h.tick(80);
  assert.equal((h.instance.from + h.instance.to) / 2, 2000);
  h.instance.pan(0.3);
  h.tick(100);
  h.tick(320);
  assert.equal(h.instance.from, 1600);
  assert.equal(h.instance.to, 3600);
});
test('reduced motion and zero duration navigate immediately without scheduling animation', () => {
  for (const options of [{ reduced: true }, { duration: 0 }]) {
    const h = motion(options);
    h.instance.pan(-0.3);
    assert.equal(h.instance.from, -300);
    assert.equal(h.frames.size, 0);
    assert.equal(h.paints.length, 1);
  }
});
test('dragging updates the range before release and coalesces pointer moves into one frame', () => {
  const h = motion();
  h.instance.attachPan();
  h.pointer(h.root, 'pointerdown', 200);
  h.pointer(h.content, 'pointermove', 250);
  h.pointer(h.content, 'pointermove', 300);
  assert.equal(h.instance.from, -100);
  assert.equal(h.frames.size, 1);
  assert.equal(h.captured(), 1);
  h.tick(0);
  assert.equal(h.paints[0].from, -100);
  assert.equal(h.renders(), 0);
  h.pointer(h.content, 'pointerup', 350);
  assert.equal(h.instance.from, -150);
  assert.equal(h.captured(), null);
  assert.equal(h.frames.size, 0);
  assert.equal(h.classes.size, 0);
  const click = new Event('click', { cancelable: true });
  click.detail = 1;
  h.root.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
});
test('small movements preserve event clicks and vertical gestures do not start horizontal dragging', () => {
  const h = motion();
  h.instance.attachPan();
  h.pointer(h.root, 'pointerdown', 200);
  h.pointer(h.content, 'pointermove', 202);
  h.pointer(h.content, 'pointerup', 202);
  assert.equal(h.instance.from, 0);
  assert.equal(h.instance.suppressDragClick, false);
  h.pointer(h.root, 'pointerdown', 200);
  h.pointer(h.content, 'pointermove', 210, 150);
  assert.equal(h.captured(), null);
  assert.equal(h.frames.size, 0);
});
test('pointer cancellation and lost capture clean up without a delayed update', () => {
  for (const type of ['pointercancel', 'lostpointercapture']) {
    const h = motion();
    h.instance.attachPan();
    h.pointer(h.root, 'pointerdown', 200);
    h.pointer(h.content, 'pointermove', 300);
    h.pointer(h.content, type, 400);
    assert.equal(h.instance.from, -100);
    assert.equal(h.frames.size, 0);
    assert.equal(h.captured(), null);
  }
});
test('new gestures, view changes, and destruction cancel pending animation frames', () => {
  const h = motion();
  h.instance.attachPan();
  h.instance.pan(0.3);
  h.tick(0);
  h.tick(80);
  const displayed = h.instance.from;
  h.pointer(h.root, 'pointerdown', 200);
  assert.equal(h.frames.size, 0);
  assert.equal(h.instance.from, displayed);
  h.instance.pan(0.3);
  h.instance.setView('feed');
  assert.equal(h.frames.size, 0);
  h.instance.view = 'timeline';
  h.instance.pan(0.3);
  h.instance.destroy();
  assert.equal(h.frames.size, 0);
  h.tick(1000);
  assert.equal(h.instance.from, displayed);
});

test('feed arrow selection preserves the timeline range and does not rebuild the feed', () => {
  const h = motion();
  Object.assign(h.instance, {
    view: 'feed',
    events: [
      {
        id: 'outside',
        start: 10000,
        group: 'events',
        title: 'Event',
        description: '',
      },
    ],
    query: '',
    activeGroups: new Set(['events']),
    dateRange: {},
    renderDetails() {},
    revealSelectedEvent() {},
  });
  h.content.querySelectorAll = () => [];
  h.instance.select('outside', { reveal: true });
  assert.equal(h.instance.selectedId, 'outside');
  assert.equal(h.instance.from, 0);
  assert.equal(h.instance.to, 1000);
  assert.equal(h.renders(), 0);
});

test('event reveal waits for horizontal navigation, then scrolls smoothly', () => {
  const h = motion();
  let scroll;
  h.content.querySelector = () => ({
    scrollIntoView: (options) => {
      scroll = options;
    },
  });
  h.instance.navigationTarget = [300, 1300];
  h.instance.revealSelectedEvent();
  assert.equal(scroll, undefined);
  assert.equal(h.instance.revealPending, true);
  h.instance.navigationTarget = null;
  h.instance.revealSelectedEvent();
  assert.equal(scroll.behavior, 'smooth');
  assert.equal(h.instance.revealPending, false);
});
