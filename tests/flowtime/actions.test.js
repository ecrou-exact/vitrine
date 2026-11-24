import test from 'node:test';
import assert from 'node:assert/strict';
import { Flowtime } from '../../src/components/flowtime/engine/flowtime.js';
import { normalizeEvents } from '../../src/components/flowtime/engine/model.js';

class Node extends EventTarget {
  constructor(tag = 'div') {
    super();
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.classList = { remove() {} };
    this.style = { setProperty() {} };
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
  get childElementCount() {
    return this.children.length;
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...((
        selector === '[data-action-id]'
          ? child.dataset.actionId !== undefined
          : child.tagName === 'button' && child.parent.className === 'ft-detail-actions'
      )
        ? [child]
        : []),
      ...child.querySelectorAll(selector),
    ]);
  }
}
function viewer(options = {}) {
  const original = globalThis.document;
  globalThis.document = { createElement: (tag) => new Node(tag) };
  const source = { case_id: 42 };
  const instance = Object.assign(Object.create(Flowtime.prototype), {
    options: { actions: [], eventActions: [], timeZone: 'UTC', ...options },
    events: normalizeEvents([
      {
        id: 'one',
        start: '2026-11-19T08:00:00Z',
        title: 'First event',
        source,
      },
      { id: 'two', start: '2026-11-19T10:00:00Z', title: 'Second event' },
    ]),
    groups: [{ id: 'events', label: 'Notes', color: '#6575d7' }],
    activeGroups: new Set(['events']),
    selectedId: 'one',
    query: '',
    dateRange: { start: null, end: null },
    view: 'combined',
    pendingActions: new Set(),
    pendingToolbarActions: new Set(),
    toolbarActionError: '',
    root: new Node(),
    workspace: new Node(),
    details: new Node(),
    actionBar: new Node(),
    actionButtons: new Node(),
    toolbarError: new Node(),
    search: new Node(),
    formatDate: (time) => new Date(time).toISOString().slice(0, 10),
    formatTime: (time) => new Date(time).toISOString().slice(11, 16),
    safeColor: (color) => color,
    emitted: [],
    emit(name, detail) {
      this.emitted.push({ name, detail });
    },
    render() {
      this.renderToolbarActions();
      this.renderDetails();
    },
  });
  instance.render();
  return {
    instance,
    source,
    restore() {
      if (original === undefined) delete globalThis.document;
      else globalThis.document = original;
    },
  };
}
const action = (id, extra = {}) => ({ id, label: id, onClick() {}, ...extra });

test('any number of toolbar and event actions render with text labels, including a host modal callback', async () => {
  let opened = false;
  const h = viewer({
    actions: Array.from({ length: 25 }, (_, i) =>
      action(
        `action-${i}`,
        i === 0
          ? {
              label: '<Add event>',
              icon: '+',
              onClick() {
                opened = true;
              },
            }
          : {},
      ),
    ),
    eventActions: Array.from({ length: 12 }, (_, i) => action(`event-${i}`)),
  });
  try {
    assert.equal(h.instance.actionButtons.children.length, 25);
    assert.equal(h.instance.details.querySelectorAll('[data-action-id]').length, 12);
    assert.equal(h.instance.actionButtons.children[0].children[1].textContent, '<Add event>');
    h.instance.actionButtons.children[0].dispatchEvent(new Event('click'));
    assert.equal(opened, true);
    await Promise.resolve();
    assert.equal(h.instance.pendingToolbarActions.size, 0);
  } finally {
    h.restore();
  }
});
test('callbacks receive the current selection, original source and filtered state without sharing mutable top-level records', async () => {
  let received;
  const h = viewer({
    actions: [
      action('inspect', {
        onClick: (context) => {
          received = context;
        },
      }),
    ],
  });
  try {
    h.instance.setFilter({
      query: 'First',
      dateRange: { start: '2026-11-19T07:00:00Z', end: '2026-11-19T09:00:00Z' },
    });
    await h.instance.runCustomAction('inspect', 'toolbar');
    assert.equal(received.viewer, h.instance);
    assert.equal(received.view, 'combined');
    assert.equal(received.event.id, 'one');
    assert.equal(received.event.source, h.source);
    assert.deepEqual(
      received.visibleEvents.map((event) => event.id),
      ['one'],
    );
    assert.equal(received.events.length, 2);
    assert.equal(received.filter.query, 'First');
    received.events[0].title = 'Changed snapshot';
    received.filter.groups.length = 0;
    assert.equal(h.instance.events[0].title, 'First event');
    assert.equal(h.instance.activeGroups.size, 1);
    h.instance.selectedId = null;
    h.instance.renderToolbarActions();
    await h.instance.runCustomAction('inspect', 'toolbar');
    assert.equal(received.event, null);
  } finally {
    h.restore();
  }
});
test('visibility and disabled predicates are rechecked at activation, and configuration updates preserve viewer state', async () => {
  let allowed = false,
    calls = 0;
  const h = viewer({
    actions: [
      action('hidden', { visible: false }),
      action('guarded', {
        disabled: () => !allowed,
        onClick() {
          calls++;
        },
      }),
    ],
  });
  try {
    assert.equal(h.instance.actionButtons.children.length, 1);
    assert.equal(h.instance.actionButtons.children[0].disabled, true);
    await h.instance.runCustomAction('guarded', 'toolbar');
    assert.equal(calls, 0);
    allowed = true;
    h.instance.setActions();
    assert.equal(h.instance.actionButtons.children[0].disabled, false);
    allowed = false;
    await h.instance.runCustomAction('guarded', 'toolbar');
    assert.equal(calls, 0);
    h.instance.setActions({
      actions: [action('new')],
      eventActions: [action('locked', { disabled: ({ event }) => event.id === 'one' })],
    });
    assert.equal(h.instance.selectedId, 'one');
    assert.equal(h.instance.view, 'combined');
    assert.equal(h.instance.events.length, 2);
    assert.equal(h.instance.details.querySelectorAll('[data-action-id]')[0].disabled, true);
    assert.throws(
      () => h.instance.setActions({ actions: [action('same'), action('same')] }),
      /unique/,
    );
    assert.equal(h.instance.options.actions[0].id, 'new');
    h.instance.setActions({ actions: [], eventActions: [] });
    assert.equal(h.instance.actionBar.hidden, true);
  } finally {
    h.restore();
  }
});
test('toolbar actions prevent duplicate submissions while independent actions can run and failures stay recoverable', async () => {
  let done,
    calls = 0,
    other = 0;
  const h = viewer({
    actions: [
      action('save', {
        onClick() {
          calls++;
          return new Promise((resolve) => {
            done = resolve;
          });
        },
      }),
      action('other', {
        onClick() {
          other++;
        },
      }),
    ],
  });
  try {
    const pending = h.instance.runCustomAction('save', 'toolbar');
    assert.equal(h.instance.actionButtons.children[0].disabled, true);
    assert.equal(h.instance.actionButtons.children[1].disabled, false);
    await h.instance.runCustomAction('save', 'toolbar');
    assert.equal(calls, 1);
    await h.instance.runCustomAction('other', 'toolbar');
    assert.equal(other, 1);
    done();
    await pending;
    assert.equal(h.instance.actionButtons.children[0].disabled, false);
    h.instance.setActions({
      actions: [
        action('fail', {
          onClick() {
            throw new Error('offline');
          },
        }),
      ],
    });
    await h.instance.runCustomAction('fail', 'toolbar');
    assert.match(h.instance.toolbarError.textContent, /Unable to fail/);
    assert.equal(h.instance.emitted.at(-1).name, 'actionerror');
    assert.equal(h.instance.pendingToolbarActions.size, 0);
  } finally {
    h.restore();
  }
});
test('custom event actions share the event lock with legacy edit/delete and respect disabled controls after completion', async () => {
  let done,
    calls = 0,
    custom = 0;
  const h = viewer({
    onEdit: () =>
      new Promise((resolve) => {
        done = resolve;
      }),
    onDelete: () => {
      calls++;
    },
    eventActions: [
      action('custom', {
        onClick() {
          custom++;
        },
      }),
      action('locked', { disabled: true }),
    ],
  });
  try {
    const pending = h.instance.runAction('Edit', h.instance.events[0]);
    assert.ok(
      h.instance.details
        .querySelectorAll('.ft-detail-actions button')
        .every((node) => node.disabled),
    );
    await h.instance.runCustomAction('custom', 'event', 'one');
    await h.instance.runAction('Delete', h.instance.events[0]);
    assert.equal(calls, 0);
    assert.equal(custom, 0);
    done();
    await pending;
    assert.equal(h.instance.details.querySelectorAll('[data-action-id]')[1].disabled, true);
    await h.instance.runCustomAction('custom', 'event', 'one');
    assert.equal(custom, 1);
    h.instance.setFilter({ query: 'Second' });
    await h.instance.runCustomAction('custom', 'event', 'one');
    assert.equal(custom, 1);
  } finally {
    h.restore();
  }
});
test('pending actions tolerate action replacement and viewer destruction', async () => {
  let reject;
  const h = viewer({
    actions: [
      action('pending', {
        onClick: () =>
          new Promise((_, fail) => {
            reject = fail;
          }),
      }),
    ],
  });
  try {
    const pending = h.instance.runCustomAction('pending', 'toolbar');
    h.instance.setActions({ actions: [] });
    reject(new Error('offline'));
    await pending;
    assert.equal(h.instance.actionBar.hidden, false);
    assert.match(h.instance.toolbarError.textContent, /pending/);
    h.instance.setActions({
      actions: [
        action('pending', {
          onClick: () =>
            new Promise((_, fail) => {
              reject = fail;
            }),
        }),
      ],
    });
    const destroyed = h.instance.runCustomAction('pending', 'toolbar');
    h.instance.destroyed = true;
    reject(new Error('offline'));
    await destroyed;
    assert.equal(h.instance.pendingToolbarActions.size, 0);
  } finally {
    h.restore();
  }
});
test('invalid action configuration fails before mounting DOM', () => {
  for (const actions of [
    {},
    [action('')],
    [action('duplicate'), action('duplicate')],
    [{ id: 'missing', label: 'Missing callback' }],
    [action('bad', { disabled: 'yes' })],
    [action('bad', { variant: 'unknown' })],
  ])
    assert.throws(() => new Flowtime({}, { actions }), TypeError);
});
