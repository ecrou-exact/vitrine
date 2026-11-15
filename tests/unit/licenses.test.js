// @ts-check
import { afterEach, describe, expect, it } from 'vitest';
import {
  byLicense,
  categoryOf,
  evaluate,
  isAllowed,
  readLicenses,
} from '../../src/components/licenses/licenses.js';
import { VtLicenses } from '../../src/components/licenses/vt-licenses.js';

if (!customElements.get('vt-licenses')) customElements.define('vt-licenses', VtLicenses);

const CYCLONEDX = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  components: [
    { type: 'library', name: 'react', version: '19.0.0', licenses: [{ license: { id: 'MIT' } }] },
    { type: 'library', group: '@img', name: 'sharp', version: '0.34.0', licenses: [{ license: { id: 'Apache-2.0' } }] }, // prettier-ignore
    { type: 'library', name: 'jszip', version: '3.10.1', licenses: [{ expression: '(MIT OR GPL-3.0-or-later)' }] }, // prettier-ignore
    { type: 'library', name: 'readline-sync', version: '1.4.10', licenses: [{ license: { id: 'GPL-3.0-only' } }] }, // prettier-ignore
    { type: 'library', name: 'axe-core', version: '4.10.0', licenses: [{ license: { id: 'MPL-2.0' } }] }, // prettier-ignore
    { type: 'library', name: 'mystery', version: '1.0.0' },
  ],
};

/**
 * @param {Record<string, string>} attributes
 * @param {unknown} data
 * @returns {Promise<VtLicenses>}
 */
async function mount(attributes, data) {
  const el = /** @type {VtLicenses} */ (document.createElement('vt-licenses'));
  for (const [name, value] of Object.entries({ 'lang-ui': 'en', ...attributes })) el.setAttribute(name, value); // prettier-ignore
  el.data = data;
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

afterEach(() => document.body.replaceChildren());

describe('licenses', () => {
  it('sorts licenses into kinds', () => {
    expect(
      [
        'MIT',
        'BSD-3-Clause',
        'Apache-2.0',
        'LGPL-2.1-only',
        'MPL-2.0',
        'GPL-3.0-or-later',
        'AGPL-3.0',
        'UNKNOWN',
        'NOASSERTION',
        'CC-BY-NC-4.0',
      ].map(categoryOf),
    ).toEqual(
      // prettier-ignore
      ['permissive', 'permissive', 'permissive', 'weak', 'weak', 'strong', 'strong', 'unknown', 'unknown', 'other'], // prettier-ignore
    );
  });

  it('evaluates expressions: OR keeps the best choice, AND the worst', () => {
    const rank = (/** @type {string} */ id) => ['permissive', 'weak', 'strong', 'other', 'unknown'].indexOf(categoryOf(id)); // prettier-ignore
    expect(evaluate('MIT OR GPL-3.0', rank)).toEqual({ rank: 0, ids: ['MIT', 'GPL-3.0'] });
    expect(evaluate('MIT AND GPL-3.0', rank).rank).toBe(2);
    expect(evaluate('(MIT AND BSD-3-Clause) OR GPL-2.0', rank).rank).toBe(0);
    expect(evaluate('GPL-2.0-only WITH Classpath-exception-2.0', rank).rank).toBe(1);
    expect(evaluate('Apache License 2.0', rank)).toEqual({ rank: 0, ids: ['Apache-2.0'] });
  });

  it('reads CycloneDX, with groups and expressions', () => {
    const deps = readLicenses(CYCLONEDX);
    expect(deps.map((d) => [d.name, d.license, d.category])).toEqual([
      ['react', 'MIT', 'permissive'],
      ['@img/sharp', 'Apache-2.0', 'permissive'],
      ['jszip', '(MIT OR GPL-3.0-or-later)', 'permissive'],
      ['readline-sync', 'GPL-3.0-only', 'strong'],
      ['axe-core', 'MPL-2.0', 'weak'],
      ['mystery', 'UNKNOWN', 'unknown'],
    ]);
  });

  it('reads SPDX, license-checker and pip-licenses', () => {
    const spdx = { spdxVersion: 'SPDX-2.3', packages: [{ name: 'zlib', versionInfo: '1.3', licenseConcluded: 'NOASSERTION', licenseDeclared: 'Zlib' }] }; // prettier-ignore
    expect(readLicenses(spdx)[0]).toMatchObject({ name: 'zlib', license: 'Zlib', category: 'permissive' }); // prettier-ignore
    const checker = { '@babel/core@7.26.0': { licenses: 'MIT', repository: 'https://github.com/babel/babel' }, 'left-pad@1.3.0': { licenses: 'WTFPL*' } }; // prettier-ignore
    expect(readLicenses(checker).map((d) => [d.name, d.version, d.license, d.guessed])).toEqual([
      ['@babel/core', '7.26.0', 'MIT', false],
      ['left-pad', '1.3.0', 'WTFPL', true],
    ]);
    const pip = [{ Name: 'requests', Version: '2.32.3', License: 'Apache Software License' }, { Name: 'certifi', Version: '2024.8.30', License: 'Mozilla Public License 2.0 (MPL 2.0)' }]; // prettier-ignore
    expect(readLicenses(pip).map((d) => d.category)).toEqual(['permissive', 'weak']);
    expect(() => readLicenses({ nothing: 1 })).toThrow();
  });

  it('checks a list of allowed licenses and kinds', () => {
    const deps = readLicenses(CYCLONEDX);
    const allowed = ['permissive', 'MPL-2.0'];
    expect(deps.filter((d) => !isAllowed(d, allowed)).map((d) => d.name)).toEqual(['readline-sync', 'mystery']); // prettier-ignore
    expect(deps.every((d) => isAllowed(d, []))).toBe(true);
    expect(isAllowed(deps[3], ['GPL-3.0'])).toBe(true);
    expect(byLicense(deps)[0].deps).toHaveLength(1);
  });
});

describe('<vt-licenses>', () => {
  it('marks what is not allowed and filters it', async () => {
    const el = await mount({ variant: 'full', allow: 'permissive,MPL-2.0' }, CYCLONEDX);
    expect(el.root.querySelector('[part~="badge"]')?.textContent).toBe('2 not allowed');
    /** @type {any[]} */
    const seen = [];
    el.addEventListener('vt-filter-change', (e) => seen.push(/** @type {CustomEvent} */ (e).detail)); // prettier-ignore
    const denied = [...el.root.querySelectorAll('.lic-filter')].find((b) => b.textContent?.startsWith('Not allowed')); // prettier-ignore
    /** @type {HTMLElement} */ (denied).click();
    expect(seen).toEqual([{ category: 'denied' }]);
    expect([...el.root.querySelectorAll('.lic-name')].map((n) => n.textContent)).toEqual(['GPL-3.0-only', 'UNKNOWN']); // prettier-ignore
  });

  it('shows the share of each kind and a table of packages', async () => {
    const el = await mount({ view: 'packages' }, CYCLONEDX);
    expect([...el.root.querySelectorAll('.lic-key')].map((k) => k.textContent)).toEqual([
      'Permissive: 3 (50%)',
      'Weak copyleft: 1 (17%)',
      'Strong copyleft: 1 (17%)',
      'Unknown: 1 (17%)',
    ]);
    expect(el.root.querySelectorAll('tbody tr')).toHaveLength(6);
  });
});
