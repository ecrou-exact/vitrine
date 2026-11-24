import test from 'node:test';
import assert from 'node:assert/strict';
import { Flowtime } from '../../src/components/flowtime/engine/flowtime.js';
import { CustomViewHost, normalizeViews } from '../../src/components/flowtime/engine/views.js';

class Node extends EventTarget {
  constructor(tag = 'div') {
    super();
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.clientWidth = 900;
    this.style = {
      setProperty(key, value) {
        this[key] = value;
      },
    };
    this.classList = { add() {}, remove() {} };
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
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
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
  }
  get firstChild() {
    return this.children[0];
  }
  get lastChild() {
    return this.children.at(-1);
  }
  get childElementCount() {
    return this.children.length;
  }
  contains(node) {
    return node === this || this.children.some((child) => child.contains(node));
  }
  closest(selectors) {
    return selectors
      .split(',')
      .some(
        (selector) =>
          selector.trim().startsWith('.') &&
          this.className?.split(' ').includes(selector.trim().slice(1)),
      )
      ? this
      : (this.parent?.closest(selectors) ?? null);
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...((
        selector === '[data-event-id]'
          ? child.dataset.eventId !== undefined
          : selector === '[data-selected="true"]'
            ? child.dataset.selected === 'true'
            : false
      )
        ? [child]
        : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  focus() {}
  scrollIntoView() {}
}
function env(run) {
  const before = {
    document: globalThis.document,
    CSS: globalThis.CSS,
    ResizeObserver: globalThis.ResizeObserver,
  };
  globalThis.document = {
    createElement: (tag) => new Node(tag),
    activeElement: null,
  };
  globalThis.CSS = { supports: () => true };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  const restore = () => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  };
  try {
    const result = run();
    if (result?.then) return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const definition = (id, mount) => ({ id, label: id, mount });

test('custom view definitions validate before mounting and cannot replace built-in views', () => {
  for (const views of [
    {},
    [definition('timeline', () => {})],
    [definition('', () => {})],
    [{ id: 'x', label: 'x' }],
    [definition('x', () => {}), definition('x', () => {})],
    [{ ...definition('x', () => {}), filters: 'no' }],
  ])
    assert.throws(() => normalizeViews(views), TypeError);
  assert.equal(normalizeViews([definition('graph', () => {})])[0].id, 'graph');
});
test('custom renderers stay mounted across updates and release resources and signals once on exit', () =>
  env(() => {
    let mounts = 0,
      destroys = 0,
      context;
    const updates = [],
      errors = [],
      state = { query: 'first' };
    const host = new CustomViewHost(
      () => ({ ...state }),
      (error) => errors.push(error),
    );
    const parent = new Node();
    const view = definition('graph', (container, current) => {
      mounts++;
      context = current;
      container.append(new Node('canvas'));
      return {
        update: (next) => updates.push(next),
        destroy: () => {
          destroys++;
        },
      };
    });
    host.render(view, parent);
    const child = parent.firstChild;
    state.query = 'second';
    host.render(view, parent);
    host.update();
    assert.equal(mounts, 1);
    assert.equal(parent.firstChild, child);
    assert.equal(context.signal.aborted, false);
    assert.equal(updates.at(-1).query, 'second');
    assert.equal(updates.at(-1).container, child);
    host.stop();
    host.stop();
    assert.equal(destroys, 1);
    assert.equal(context.signal.aborted, true);
    assert.deepEqual(errors, []);
  }));
test('async mounts dispose late instances without replacing a newer view and receive the latest queued state', () =>
  env(async () => {
    const pending = deferred();
    let staleDestroyed = 0,
      context;
    const updates = [];
    let state = 1;
    const host = new CustomViewHost(
      () => ({ state }),
      () => assert.fail('No error expected'),
    );
    const parent = new Node();
    host.render(
      definition('slow', (container, current) => {
        context = current;
        return pending.promise;
      }),
      parent,
    );
    host.render(
      definition('new', () => {}),
      parent,
    );
    const newer = parent.firstChild;
    pending.resolve(() => {
      staleDestroyed++;
    });
    await tick();
    assert.equal(staleDestroyed, 1);
    assert.equal(context.signal.aborted, true);
    assert.equal(parent.firstChild, newer);
    const ready = deferred();
    host.render(
      definition('queued', () => ready.promise),
      parent,
    );
    state = 2;
    host.update();
    state = 3;
    host.update();
    ready.resolve({ update: (ctx) => updates.push(ctx.state) });
    await tick();
    assert.deepEqual(updates, [3]);
    host.stop();
  }));
test('async view updates are serialized and coalesced to the latest state', () =>
  env(async () => {
    let state = 0;
    const calls = [];
    const pending = deferred();
    const host = new CustomViewHost(
      () => ({ state }),
      () => assert.fail('No error expected'),
    );
    const parent = new Node();
    host.render(
      definition('async', () => ({
        update(ctx) {
          calls.push(ctx.state);
          if (calls.length === 1) return pending.promise;
        },
      })),
      parent,
    );
    state = 1;
    host.update();
    state = 2;
    host.update();
    state = 3;
    host.update();
    assert.deepEqual(calls, [1]);
    pending.resolve();
    await tick();
    assert.deepEqual(calls, [1, 3]);
    host.stop();
  }));
test('mount/update errors are recoverable and cleanup errors do not block switching', () =>
  env(async () => {
    let attempts = 0,
      destroys = 0;
    const errors = [];
    const host = new CustomViewHost(
      () => ({}),
      (error) => errors.push(error),
    );
    const parent = new Node();
    const view = definition('retry', () => {
      attempts++;
      if (attempts === 1) throw new Error('Unavailable');
      return {
        update() {
          return Promise.reject(new Error('Failed update'));
        },
        destroy() {
          destroys++;
        },
      };
    });
    host.render(view, parent);
    assert.equal(errors[0].phase, 'mount');
    assert.equal(parent.firstChild.firstChild.attributes.role, 'alert');
    parent.firstChild.firstChild.children[1].dispatchEvent(new Event('click'));
    assert.equal(attempts, 2);
    host.update();
    await tick();
    assert.equal(errors.at(-1).phase, 'update');
    assert.equal(destroys, 1);
    host.render(
      definition('cleanup', () => () => {
        throw new Error('Cleanup failed');
      }),
      parent,
    );
    host.stop();
    assert.equal(errors.at(-1).phase, 'destroy');
    host.render(
      definition('working', () => {}),
      parent,
    );
    assert.equal(host.session.definition.id, 'working');
    host.stop();
  }));
test('Flowtime registers a fourth button, renders empty custom views, preserves selection/filter state and cleans up on data replacement', () =>
  env(() => {
    let mounts = 0,
      destroys = 0;
    const updates = [];
    const viewer = new Flowtime(new Node(), {
      view: 'report',
      customViews: [
        {
          ...definition('report', () => {
            mounts++;
            return {
              update: (ctx) => updates.push(ctx),
              destroy: () => {
                destroys++;
              },
            };
          }),
          filters: false,
          inspector: false,
        },
      ],
    });
    try {
      assert.equal(viewer.view, 'report');
      assert.equal(viewer.customViewButtons.get('report').attributes['aria-pressed'], 'true');
      assert.equal(mounts, 1);
      assert.equal(viewer.search.hidden, true);
      assert.equal(viewer.activityFilter.root.hidden, true);
      assert.equal(viewer.footer.hidden, true);
      viewer.setEvents([{ id: 'a', start: '2026-11-19', title: 'Evidence' }]);
      assert.equal(mounts, 2);
      assert.equal(destroys, 1);
      viewer.select('a');
      assert.equal(viewer.details.hidden, true);
      assert.equal(updates.at(-1).event.id, 'a');
      viewer.setFilter({ query: 'Evidence' });
      assert.equal(mounts, 2);
      assert.equal(updates.at(-1).filter.query, 'Evidence');
      viewer.setView('feed');
      assert.equal(destroys, 2);
      assert.equal(viewer.selectedId, 'a');
      assert.equal(viewer.details.hidden, false);
      assert.equal(viewer.search.hidden, false);
      viewer.customViewButtons.get('report').dispatchEvent(new Event('click'));
      assert.equal(viewer.view, 'report');
      assert.equal(mounts, 3);
      assert.equal(viewer.query, 'Evidence');
      assert.throws(() => viewer.setView('unregistered'), /Unknown view/);
    } finally {
      viewer.destroy();
    }
    assert.equal(destroys, 3);
  }));

test('a view redirected during async mount cannot leave a loading message over its replacement', () =>
  env(async () => {
    const pending = deferred(),
      parent = new Node();
    let destroyed = 0;
    const host = new CustomViewHost(
      () => ({}),
      () => assert.fail('No error expected'),
    );
    host.render(
      definition('redirect', () => {
        host.render(
          definition('replacement', () => {}),
          parent,
        );
        return pending.promise;
      }),
      parent,
    );
    assert.equal(parent.children.length, 1);
    pending.resolve(() => {
      destroyed++;
    });
    await tick();
    assert.equal(host.session.definition.id, 'replacement');
    assert.equal(parent.children.length, 1);
    assert.equal(destroyed, 1);
    host.stop();
  }));
