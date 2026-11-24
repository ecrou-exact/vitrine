import { describe, expect, it } from 'vitest';
import {
  compare,
  diff,
  format,
  maxSatisfying,
  parseRange,
  parseVersion,
  readVersions,
  satisfies,
} from '../../src/components/semver/semver.js';
import { VtSemver } from '../../src/components/semver/vt-semver.js';

const sat = (version, range) => satisfies(/** @type {any} */ (parseVersion(version)), parseRange(range)); // prettier-ignore

describe('versions', () => {
  it('reads and orders SemVer 2.0.0 versions', () => {
    expect(parseVersion('v1.2.3-rc.1+build.5')).toMatchObject({ major: 1, minor: 2, patch: 3, pre: ['rc', 1], build: 'build.5' }); // prettier-ignore
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('01.2.3')).toBeNull();
    // The order of section 11 of the specification.
    const order = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0']; // prettier-ignore
    const sorted = [...order].reverse().map((v) => parseVersion(v)).sort((a, b) => compare(/** @type {any} */ (a), /** @type {any} */ (b))); // prettier-ignore
    expect(sorted.map((v) => format(/** @type {any} */ (v)))).toEqual(order);
    expect(diff(/** @type {any} */ (parseVersion('1.2.3')), /** @type {any} */ (parseVersion('1.3.0')))).toBe('minor'); // prettier-ignore
  });
});

describe('ranges', () => {
  it('matches like npm', () => {
    expect(sat('1.9.0', '^1.2.3')).toBe(true);
    expect(sat('2.0.0', '^1.2.3')).toBe(false);
    expect(sat('0.2.9', '^0.2.3')).toBe(true);
    expect(sat('0.3.0', '^0.2.3')).toBe(false);
    expect(sat('0.0.4', '^0.0.3')).toBe(false);
    expect(sat('1.2.9', '~1.2.3')).toBe(true);
    expect(sat('1.3.0', '~1.2.3')).toBe(false);
    expect(sat('3.4.0', '1.x || >=3 <4')).toBe(true);
    expect(sat('2.3.9', '1.2 - 2.3')).toBe(true);
    expect(sat('2.4.0', '1.2 - 2.3')).toBe(false);
    expect(sat('1.2.9', '>1.2')).toBe(false);
    expect(sat('1.2.9', '<=1.2')).toBe(true);
    expect(sat('1.5.0', '>= 1.2, < 2')).toBe(true);
    expect(sat('5.0.0', '*')).toBe(true);
  });

  it('keeps pre-releases out unless the range names one on the same version', () => {
    expect(sat('2.0.0-rc.1', '^1.2.3')).toBe(false);
    expect(sat('1.2.3-beta.3', '>=1.2.3-beta.2 <2')).toBe(true);
    expect(sat('1.2.4-beta', '>=1.2.3-beta.2 <2')).toBe(false);
  });

  it('reads terms in words and warns', () => {
    const range = parseRange('^0.2.3 || >=4');
    expect(range.ok && range.sets.map((s) => s.parts.map((p) => p.kind))).toEqual([['caretMinor'], ['gte']]); // prettier-ignore
    expect(range.ok && range.warnings.map((w) => w.id)).toEqual(['caretZero', 'unbounded']);
    const crossed = parseRange('>2 <1');
    expect(crossed.ok && crossed.sets[0].empty).toBe(true);
    expect(parseRange('^1.2.3 hello')).toEqual({ ok: false, error: 'term', near: 'hello' });
  });

  it('reads version lists and finds the version installed', () => {
    const registry = JSON.stringify({ versions: { '1.0.0': {}, '1.4.2': {}, '1.5.0-rc.1': {}, '2.0.0': {} }, 'dist-tags': { latest: '2.0.0' } }); // prettier-ignore
    const { versions, tags } = readVersions(registry);
    expect(versions.map(format)).toEqual(['1.0.0', '1.4.2', '1.5.0-rc.1', '2.0.0']);
    expect(tags).toEqual({ latest: '2.0.0' });
    expect(format(/** @type {any} */ (maxSatisfying(versions, parseRange('^1'))))).toBe('1.4.2');
    expect(readVersions('1.0.0, 1.1.0 nope').invalid).toEqual(['nope']);
  });
});

describe('<vt-semver>', () => {
  if (!customElements.get('vt-semver')) customElements.define('vt-semver', VtSemver);

  it('explains the range, marks matches and tests a version', () => {
    const el = /** @type {VtSemver} */ (document.createElement('vt-semver'));
    el.setAttribute('lang-ui', 'en');
    el.setAttribute('range', '^1.2.3');
    el.content = '1.0.0 1.2.3 1.4.2 2.0.0';
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelector('.semver-words')?.textContent).toContain(
      'without a new major version',
    );
    expect(root.querySelector('.semver-resolved')?.textContent).toContain('Installs 1.4.2');
    expect([...root.querySelectorAll('.semver-versions li.ok')].map((li) => li.getAttribute('data-version'))).toEqual(['1.2.3', '1.4.2']); // prettier-ignore
    expect(el.matching).toEqual(['1.2.3', '1.4.2']);
    const test = /** @type {HTMLInputElement} */ (root.querySelector('[data-focus-key="test"]'));
    test.value = '2.0.0';
    test.dispatchEvent(new Event('input'));
    expect(root.querySelector('.semver-test-result')?.textContent).toBe('2.0.0 does not match the range.'); // prettier-ignore
    const field = /** @type {HTMLInputElement} */ (root.querySelector('[data-focus-key="range"]'));
    field.value = '>=2';
    field.dispatchEvent(new Event('input'));
    expect(root.querySelector('.semver-resolved')?.textContent).toContain('Installs 2.0.0');
    el.remove();
  });

  it('takes the range from the first line', () => {
    const el = /** @type {VtSemver} */ (document.createElement('vt-semver'));
    el.content = '~1.2\n1.2.0\n1.3.0';
    document.body.append(el);
    el.render();
    expect(el.range).toBe('~1.2');
    expect(el.matching).toEqual(['1.2.0']);
    el.remove();
  });
});
