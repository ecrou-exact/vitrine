import { describe, expect, it, vi } from 'vitest';
import { EditHistory } from '../../src/core/history.js';

const snap = (value) => ({ value, start: value.length, end: value.length });

describe('EditHistory', () => {
  it('undoes and redoes', () => {
    const history = new EditHistory('');
    history.record(snap('a'), 'insertFromPaste');
    history.record(snap('ab'), 'insertFromPaste');
    expect(history.undo().value).toBe('a');
    expect(history.undo().value).toBe('');
    expect(history.undo()).toBe(null);
    expect(history.redo().value).toBe('a');
    expect(history.canRedo).toBe(true);
  });
  it('groups fast typing into one step', () => {
    vi.useFakeTimers();
    const history = new EditHistory('');
    history.record(snap('h'), 'insertText');
    history.record(snap('he'), 'insertText');
    history.record(snap('hey'), 'insertText');
    vi.advanceTimersByTime(1000);
    history.record(snap('hey!'), 'insertText');
    expect(history.undo().value).toBe('hey');
    expect(history.undo().value).toBe('');
    vi.useRealTimers();
  });
  it('drops the redo branch after a new change', () => {
    const history = new EditHistory('');
    history.record(snap('a'), 'other');
    history.undo();
    history.record(snap('b'), 'other');
    expect(history.canRedo).toBe(false);
  });
  it('caps the number of steps', () => {
    const history = new EditHistory('');
    for (let i = 0; i < 1000; i += 1) history.record(snap(`v${i}`), 'other');
    expect(history.steps.length).toBeLessThanOrEqual(300);
    expect(history.current.value).toBe('v999');
  });
  it('notifies listeners', () => {
    const history = new EditHistory('');
    const listener = vi.fn();
    const stop = history.subscribe(listener);
    history.record(snap('a'), 'other');
    stop();
    history.record(snap('b'), 'other');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
