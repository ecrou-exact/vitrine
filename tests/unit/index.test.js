import { describe, expect, it } from 'vitest';
import { defineAll, registry, version } from '../../src/index.js';

describe('public API', () => {
  it('exposes a version string', () => {
    expect(typeof version).toBe('string');
  });

  it('defineAll is idempotent', () => {
    class VtTest extends HTMLElement {}
    registry.set('vt-test', VtTest);
    expect(defineAll()).toEqual(['vt-test']);
    expect(defineAll()).toEqual([]);
    registry.delete('vt-test');
  });
});
