// @ts-check
import { afterEach, describe, expect, it } from 'vitest';
import {
  allowedChar,
  bump,
  changeOf,
  cleanText,
  compareVersions,
  formatVersion,
  parseFormat,
  parseVersion,
  segmentRanges,
  stepDecimal,
  stepSegment,
  today,
} from '../../src/components/version/versions.js';
import { VtVersion } from '../../src/components/version/vt-version.js';

if (!customElements.get('vt-version')) customElements.define('vt-version', VtVersion);

const SEMVER = parseFormat('semver');

/**
 * @param {string} text
 * @param {import('../../src/components/version/versions.js').Format} [format]
 */
function v(text, format = SEMVER) {
  const parsed = parseVersion(text, format);
  if (!parsed.ok) throw new Error(`${text}: ${parsed.error}`);
  return parsed.version;
}

/**
 * @param {Record<string, string>} attributes
 * @returns {Promise<VtVersion>}
 */
async function mount(attributes = {}) {
  const el = /** @type {VtVersion} */ (document.createElement('vt-version'));
  for (const [name, value] of Object.entries({ 'lang-ui': 'en', ...attributes })) el.setAttribute(name, value); // prettier-ignore
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

afterEach(() => document.body.replaceChildren());

describe('versions', () => {
  it('reads Semantic Versioning as the specification writes it', () => {
    expect(v('1.2.3-beta.1+build.5')).toEqual({ parts: [1, 2, 3], pre: ['beta', '1'], build: ['build', '5'] }); // prettier-ignore
    expect(v('v1.2.3').parts).toEqual([1, 2, 3]);
    expect(parseVersion('01.2.3', SEMVER)).toEqual({ ok: false, error: 'zero', index: 0 });
    expect(parseVersion('1.2', SEMVER)).toEqual({ ok: false, error: 'format' });
    expect(parseVersion('1.2.3-01', SEMVER)).toEqual({ ok: false, error: 'format' });
    expect(parseVersion('1.2.3-', SEMVER).ok).toBe(false);
    expect(formatVersion(v('1.2.3-rc.1+sha.5114f85'), SEMVER)).toBe('1.2.3-rc.1+sha.5114f85');
  });

  it('orders versions by precedence, pre-releases first', () => {
    const order = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '2.0.0']; // prettier-ignore
    const shuffled = [...order].reverse().map((t) => v(t));
    shuffled.sort(compareVersions);
    expect(shuffled.map((x) => formatVersion(x, SEMVER))).toEqual(order);
    expect(compareVersions(v('1.0.0+a'), v('1.0.0+b'))).toBe(0);
  });

  it('bumps as npm version does', () => {
    const b = (/** @type {string} */ t, /** @type {any} */ kind, preid = '') => formatVersion(bump(v(t), kind, preid), SEMVER); // prettier-ignore
    expect(b('1.2.3', 'patch')).toBe('1.2.4');
    expect(b('1.2.3', 'minor')).toBe('1.3.0');
    expect(b('1.2.3', 'major')).toBe('2.0.0');
    expect(b('1.1.0-beta.2', 'minor')).toBe('1.1.0');
    expect(b('2.0.0-rc.1', 'major')).toBe('2.0.0');
    expect(b('1.2.3', 'prerelease', 'beta')).toBe('1.2.4-beta.0');
    expect(b('1.2.4-beta.0', 'prerelease', 'beta')).toBe('1.2.4-beta.1');
    expect(b('1.2.4-beta.3', 'prerelease', 'rc')).toBe('1.2.4-rc.0');
    expect(b('1.2.3', 'preminor', 'alpha')).toBe('1.3.0-alpha.0');
    expect(b('1.2.4-rc.1', 'release')).toBe('1.2.4');
  });

  it('steps a part with carry when parts have a largest value, like an odometer', () => {
    const xy = parseFormat('#.#', { segmentMax: [null, 9] });
    const s = (/** @type {string} */ t, /** @type {number} */ i, /** @type {number} */ d, f = xy) => formatVersion(stepSegment(v(t, f), f, i, d), f); // prettier-ignore
    expect(s('1.0', 1, 1)).toBe('1.1');
    expect(s('1.9', 1, 1)).toBe('2.0');
    expect(s('2.0', 1, -1)).toBe('1.9');
    expect(s('0.0', 1, -1)).toBe('0.0');
    const xyz = parseFormat('x.y.z', { segmentMax: [null, 9, 9] });
    expect(s('1.9.9', 2, 1, xyz)).toBe('2.0.0');
    expect(s('1.4.7', 1, 1, xyz)).toBe('1.5.0');
    expect(s('1.4.7', 1, -1, xyz)).toBe('1.3.7');
    // Without a limit, a part grows as far as needed.
    expect(s('1.2.3.99', 3, 1, parseFormat('x.y.z.w'))).toBe('1.2.3.100');
  });

  it('writes calendar versions from a date', () => {
    const cal = parseFormat('calver');
    const date = new Date('2026-11-15T10:00:00Z');
    expect(formatVersion(today(v('2026.11.3', cal), cal, date), cal)).toBe('2026.11.4');
    expect(formatVersion(today(v('2026.10.3', cal), cal, date), cal)).toBe('2026.11.0');
    expect(parseVersion('2026.1.0', cal)).toEqual({ ok: false, error: 'width', index: 1 });
    const ubuntu = parseFormat('YY.0M');
    expect(formatVersion(today(null, ubuntu, new Date('2026-04-20')), ubuntu)).toBe('26.04');
    expect(formatVersion(stepSegment(v('26.12', ubuntu), ubuntu, 1, 1), ubuntu)).toBe('27.01');
    expect(parseVersion('26.13', ubuntu)).toEqual({ ok: false, error: 'range', index: 1 });
  });

  it('steps decimals without rounding errors, with a comma too', () => {
    const dec = parseFormat('decimal', { precision: 1 });
    expect(v('1,5', dec).parts).toEqual([15]);
    expect(parseVersion('1.25', dec)).toEqual({ ok: false, error: 'precision' });
    let x = v('0.0', dec);
    for (let i = 0; i < 3; i += 1) x = stepDecimal(x, 1, 1);
    expect(formatVersion(x, dec)).toBe('0.3');
    expect(formatVersion(stepDecimal(v('0.1', dec), -5, 1, { min: -2 }), dec)).toBe('-0.2');
    const cents = parseFormat('decimal', { precision: 2 });
    expect(formatVersion(stepDecimal(v('1.99', cents), 1, 5, { max: 200 }), cents)).toBe('2.00');
  });

  it('says what kind of change a version is', () => {
    expect(changeOf(v('1.2.3'), v('2.0.0'), SEMVER).change).toBe('major');
    expect(changeOf(v('1.2.3'), v('1.3.0'), SEMVER).change).toBe('minor');
    expect(changeOf(v('1.2.3'), v('1.2.4'), SEMVER).change).toBe('patch');
    expect(changeOf(v('1.2.3'), v('1.2.4-rc.0'), SEMVER).change).toBe('prerelease');
    expect(changeOf(v('1.2.3'), v('1.2.3+b'), SEMVER).change).toBe('build');
    expect(changeOf(v('1.2.3'), v('1.2.0'), SEMVER).change).toBe('downgrade');
  });

  it('finds the parts in the text and the characters allowed', () => {
    expect(segmentRanges('v1.22.3', SEMVER)).toEqual([{ start: 1, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 7 }]); // prettier-ignore
    expect(segmentRanges('1..3', SEMVER)).toBeNull();
    expect(allowedChar('x', parseFormat('#.#'))).toBe(false);
    expect(allowedChar('-', SEMVER)).toBe(true);
    expect(allowedChar(',', parseFormat('decimal'))).toBe(true);
    expect(cleanText('v1.2a.3-Beta.1+Ex', SEMVER)).toBe('v1.2.3-Beta.1+Ex');
    expect(cleanText('1,5x', parseFormat('decimal'))).toBe('1,5');
    expect(parseFormat('#a#').kind).toBe('semver');
  });
});

describe('<vt-version>', () => {
  it('steps the part under the caret with the arrow keys, and the patch with +', async () => {
    const el = await mount({ value: '1.4.2' });
    /** @type {any[]} */
    const changes = [];
    el.addEventListener('vt-change', (e) => changes.push(/** @type {CustomEvent} */ (e).detail));
    const input = /** @type {HTMLInputElement} */ (el.root.getElementById(el.ids.control));
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(el.value).toBe('1.5.0');
    /** @type {HTMLElement} */ (el.root.querySelector('[data-focus-key="up"]')).click();
    expect(el.value).toBe('1.5.1');
    /** @type {HTMLElement} */ (el.root.querySelector('[data-focus-key="down"]')).click();
    expect(el.value).toBe('1.5.0');
    expect(changes.map((c) => c.change)).toEqual(['minor', 'patch', 'downgrade']);
    expect(el.root.querySelector('[data-focus-key="up"]')?.getAttribute('aria-label')).toBe('Increase Patch'); // prettier-ignore
  });

  it('keeps only the characters of a version and checks min, max and newer', async () => {
    const el = await mount({ value: '1.0.0', min: '1.0.0', max: '2.0.0', current: '1.4.2', newer: '' }); // prettier-ignore
    const input = /** @type {HTMLInputElement} */ (el.root.getElementById(el.ids.control));
    input.value = '1.x2!.0-beta';
    input.dispatchEvent(new Event('input'));
    expect(el.value).toBe('1.2.0-beta');
    expect(el.check().message).toBe('Use a version newer than 1.4.2.');
    expect(el.root.querySelector('.vr-change')?.textContent).toBe('Lower version from 1.4.2');
    el.value = '2.1.0';
    expect(el.check()).toMatchObject({ flags: { rangeOverflow: true }, message: 'Use 2.0.0 or lower.' }); // prettier-ignore
    el.value = '1.5.0';
    expect(el.valid).toBe(true);
    expect(el.root.querySelector('.vr-change')?.textContent).toBe('Minor release from 1.4.2 · new features, compatible'); // prettier-ignore
    el.value = '1.05';
    expect(el.check().message).toBe('Write a version like 1.4.2.');
    el.value = '01.5.0';
    expect(el.check().message).toBe('Major cannot start with 0.');
  });

  it('normalizes on leaving, and puts back the last valid version in strict mode', async () => {
    const el = await mount({ value: '1.0.0', strict: '' });
    const input = /** @type {HTMLInputElement} */ (el.root.getElementById(el.ids.control));
    input.value = 'v2.0.0';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    expect(el.value).toBe('2.0.0');
    const again = /** @type {HTMLInputElement} */ (el.root.getElementById(el.ids.control));
    again.value = '2.0.';
    again.dispatchEvent(new Event('input'));
    again.dispatchEvent(new Event('blur'));
    expect(el.value).toBe('2.0.0');
  });

  it('edits each part as a spin button, with the pre-release and the next versions', async () => {
    const el = await mount({ variant: 'full', value: '1.4.2', current: '1.4.2' });
    const parts = /** @type {HTMLInputElement[]} */ ([
      ...el.root.querySelectorAll('.vr-seg-input'),
    ]);
    expect(parts.map((p) => [p.getAttribute('aria-label'), p.value, p.getAttribute('role')])).toEqual([['Major', '1', 'spinbutton'], ['Minor', '4', 'spinbutton'], ['Patch', '2', 'spinbutton']]); // prettier-ignore
    parts[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(el.value).toBe('1.4.3');
    expect(el.root.querySelector('.vr-change')?.textContent).toBe('Patch release from 1.4.2 · bug fixes, compatible'); // prettier-ignore
    const bumps = [...el.root.querySelectorAll('.vr-bump')].map((b) => b.textContent);
    expect(bumps).toEqual(['Patch: 1.4.4', 'Minor: 1.5.0', 'Major: 2.0.0', 'Pre-release: 1.4.4-alpha.0']); // prettier-ignore
    const select = /** @type {HTMLSelectElement} */ (el.root.querySelector('.vr-pre-id'));
    select.value = 'rc';
    select.dispatchEvent(new Event('change'));
    expect(el.value).toBe('1.4.3-rc.0');
    const preNumber = /** @type {HTMLInputElement} */ (el.root.querySelector('.vr-pre-number'));
    preNumber.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(el.value).toBe('1.4.3-rc.1');
    /** @type {HTMLElement} */ (
      [...el.root.querySelectorAll('.vr-bump')].find((b) => b.textContent === 'Release: 1.4.3')
    ).click();
    expect(el.value).toBe('1.4.3');
    expect(el.root.querySelector('.vr-result-value')?.textContent).toBe('1.4.3');
  });

  it('lets a part only hold digits within its range, and carries past a largest value', async () => {
    const el = await mount({ variant: 'full', format: 'x.y', 'segment-max': '*,9', value: '1.9' });
    const minor = /** @type {HTMLInputElement} */ (el.root.querySelector('[data-focus-key="segment-1"]')); // prettier-ignore
    expect(minor.getAttribute('aria-valuemax')).toBe('9');
    minor.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(el.value).toBe('2.0');
    const again = /** @type {HTMLInputElement} */ (el.root.querySelector('[data-focus-key="segment-1"]')); // prettier-ignore
    again.value = '42';
    again.dispatchEvent(new Event('input'));
    expect(el.value).toBe('2.9');
    // Minor + 1 carries into the major: the same version is offered once.
    expect([...el.root.querySelectorAll('.vr-bump')].map((b) => b.textContent)).toEqual(['Major + 1: 3.0']); // prettier-ignore
  });

  it('steps decimals by their step', async () => {
    const el = await mount({ format: 'decimal', step: '0.5', value: '1.0', max: '2' });
    /** @type {HTMLElement} */ (el.root.querySelector('[data-focus-key="up"]')).click();
    expect(el.value).toBe('1.5');
    /** @type {HTMLElement} */ (el.root.querySelector('[data-focus-key="up"]')).click();
    /** @type {HTMLElement} */ (el.root.querySelector('[data-focus-key="up"]')).click();
    expect(el.value).toBe('2.0');
    expect(el.root.querySelector('[data-focus-key="up"]')?.getAttribute('aria-label')).toBe('Add 0.5'); // prettier-ignore
  });

  it('offers today for calendar versions', async () => {
    const el = await mount({ variant: 'full', format: 'calver', value: '2026.10.2', now: '2026-11-15' }); // prettier-ignore
    const labels = [...el.root.querySelectorAll('.vr-bump')].map((b) => b.textContent);
    expect(labels[0]).toBe('Today: 2026.11.0');
    expect([...el.root.querySelectorAll('.vr-seg-name')].map((n) => n.textContent)).toEqual(['Year', 'Month', 'Micro']); // prettier-ignore
  });
});
