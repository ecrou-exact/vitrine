// @ts-nocheck
// Migrated Flowtime engine. The public contract is typed in flowtime.d.ts;
// behavior is covered by tests/flowtime and the vt-flowtime integration tests.
import { english } from '../strings.js';
const BUILTIN_VIEWS = new Set(['timeline', 'combined', 'feed']);

export function normalizeViews(views) {
  if (!Array.isArray(views)) throw new TypeError('customViews must be an array.');
  const ids = new Set(BUILTIN_VIEWS);
  return views.map((view) => {
    if (!view || typeof view.id !== 'string' || !view.id.trim() || ids.has(view.id))
      throw new TypeError('Custom views need unique IDs distinct from built-in views.');
    if (typeof view.label !== 'string' || !view.label.trim() || typeof view.mount !== 'function')
      throw new TypeError(`Custom view ${view.id} needs a label and mount callback.`);
    if (view.icon !== undefined && typeof view.icon !== 'string')
      throw new TypeError(`Custom view ${view.id}: icon must be text.`);
    for (const key of ['filters', 'inspector'])
      if (view[key] !== undefined && typeof view[key] !== 'boolean')
        throw new TypeError(`Custom view ${view.id}: ${key} must be a boolean.`);
    ids.add(view.id);
    return { ...view };
  });
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function instance(value) {
  if (typeof value === 'function') return { destroy: value };
  if (value == null) return {};
  if (
    typeof value !== 'object' ||
    ['update', 'destroy'].some(
      (key) => value[key] !== undefined && typeof value[key] !== 'function',
    )
  )
    throw new TypeError('A custom view must return an instance, a cleanup function, or nothing.');
  return value;
}

/** Keeps host renderers stable across filter/selection/size updates and owns teardown. */
export class CustomViewHost {
  constructor(getContext, onError, s = english) {
    this.s = s;
    this.getContext = getContext;
    this.onError = onError;
  }
  context(session) {
    return {
      ...this.getContext(),
      container: session.container,
      signal: session.abort.signal,
    };
  }
  render(definition, parent) {
    const current = this.session;
    if (current?.definition.id === definition.id && current.parent === parent) {
      this.update();
      return;
    }
    this.stop();
    const container = el('div', 'ft-custom-view');
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', definition.label);
    const session = {
      definition,
      parent,
      container,
      abort: new AbortController(),
      instance: null,
      updating: false,
      pending: null,
      failed: false,
    };
    this.session = session;
    parent.replaceChildren(container);
    try {
      const result = definition.mount(container, this.context(session));
      if (result && typeof result.then === 'function') {
        if (this.session === session) {
          container.setAttribute('aria-busy', 'true');
          session.loading = el('p', 'ft-view-loading', `Loading ${definition.label}…`);
          session.loading.setAttribute('role', 'status');
          parent.prepend(session.loading);
        }
        Promise.resolve(result).then(
          (value) => this.accept(session, value),
          (error) => this.fail(session, error, 'mount'),
        );
      } else this.accept(session, result);
    } catch (error) {
      this.fail(session, error, 'mount');
    }
  }
  accept(session, value) {
    let mounted;
    try {
      mounted = instance(value);
    } catch (error) {
      this.fail(session, error, 'mount');
      return;
    }
    if (this.session !== session || session.failed) {
      session.loading?.remove();
      this.dispose(session, mounted);
      return;
    }
    session.instance = mounted;
    session.loading?.remove();
    session.container.setAttribute('aria-busy', 'false');
    if (session.pending) this.flush(session);
  }
  update() {
    const session = this.session;
    if (!session || session.failed) return;
    session.pending = this.context(session);
    this.flush(session);
  }
  flush(session) {
    if (this.session !== session || session.failed || !session.instance || session.updating) return;
    const context = session.pending;
    session.pending = null;
    if (!context || !session.instance.update) return;
    session.updating = true;
    const finish = () => {
      session.updating = false;
      if (session.pending) this.flush(session);
    };
    try {
      const result = session.instance.update(context);
      if (result && typeof result.then === 'function')
        Promise.resolve(result).then(finish, (error) => this.fail(session, error, 'update'));
      else finish();
    } catch (error) {
      this.fail(session, error, 'update');
    }
  }
  dispose(session, mounted) {
    try {
      const result = mounted?.destroy?.();
      if (result && typeof result.then === 'function')
        Promise.resolve(result).catch((error) =>
          this.onError({
            view: session.definition.id,
            phase: 'destroy',
            error,
          }),
        );
    } catch (error) {
      this.onError({ view: session.definition.id, phase: 'destroy', error });
    }
  }
  fail(session, error, phase) {
    if (this.session !== session || session.failed) return;
    session.failed = true;
    session.loading?.remove();
    session.pending = null;
    session.abort.abort();
    this.dispose(session, session.instance);
    session.instance = null;
    session.container.setAttribute('aria-busy', 'false');
    const message = el('p', '', this.s('flowtimeViewFailed', { view: session.definition.label }));
    const retry = el('button', 'ft-view-retry', this.s('flowtimeRetry'));
    retry.type = 'button';
    retry.addEventListener('click', () => {
      if (this.session !== session) return;
      this.stop();
      this.render(session.definition, session.parent);
    });
    const box = el('div', 'ft-view-error');
    box.setAttribute('role', 'alert');
    box.append(message, retry);
    session.container.replaceChildren(box);
    this.onError({ view: session.definition.id, phase, error });
  }
  stop() {
    const session = this.session;
    this.session = null;
    if (!session) return;
    session.loading?.remove();
    session.abort.abort();
    session.pending = null;
    this.dispose(session, session.instance);
    session.instance = null;
  }
}
