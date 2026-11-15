// @ts-check
import { afterEach, describe, expect, it } from 'vitest';
import { cycleOf, readCycles, statusOf } from '../../src/components/lifecycle/cycles.js';
import { VtLifecycle } from '../../src/components/lifecycle/vt-lifecycle.js';

if (!customElements.get('vt-lifecycle')) customElements.define('vt-lifecycle', VtLifecycle);

const NOW = Date.parse('2026-11-15T00:00:00Z');

/** endoflife.date API v0 (`/api/nodejs.json`). */
const V0 = [
  { cycle: '24', releaseDate: '2025-05-06', eol: '2028-04-30', support: '2026-10-20', lts: '2025-10-28', latest: '24.11.0', latestReleaseDate: '2026-10-28' }, // prettier-ignore
  { cycle: '23', releaseDate: '2024-10-16', eol: '2025-06-01', support: '2025-04-01', lts: false, latest: '23.11.1' }, // prettier-ignore
  { cycle: '22', releaseDate: '2024-04-24', eol: '2027-04-30', support: '2025-10-21', lts: '2024-10-29', latest: '22.21.0' }, // prettier-ignore
  { cycle: '20', releaseDate: '2023-04-18', eol: '2026-04-30', support: '2024-10-22', lts: '2023-10-24', latest: '20.19.5' }, // prettier-ignore
  { cycle: '26', releaseDate: '2027-04-20', eol: '2030-04-30', support: '2028-10-20', lts: false },
];

/** endoflife.date API v1 (`/api/v1/products/python`). */
const V1 = {
  schema_version: '1.2.0',
  result: {
    name: 'python',
    label: 'Python',
    releases: [
      { name: '3.14', releaseDate: '2025-10-07', isLts: false, isEoas: false, eoasFrom: '2027-10-01', isEol: false, eolFrom: '2030-10-31', latest: { name: '3.14.0', date: '2025-10-07', link: 'https://www.python.org/downloads/release/python-3140/' } }, // prettier-ignore
      { name: '3.12', releaseDate: '2023-10-02', isLts: false, isEoas: true, eoasFrom: '2025-04-02', isEol: false, eolFrom: '2028-10-31', latest: { name: '3.12.12' } }, // prettier-ignore
      { name: '2.7', releaseDate: '2010-07-03', isLts: false, isEol: true, eolFrom: '2020-01-01', latest: { name: '2.7.18' } }, // prettier-ignore
    ],
  },
};

/**
 * @param {Record<string, string>} attributes
 * @param {unknown} data
 * @returns {Promise<VtLifecycle>}
 */
async function mount(attributes, data) {
  const el = /** @type {VtLifecycle} */ (document.createElement('vt-lifecycle'));
  for (const [name, value] of Object.entries({ now: '2026-11-15', 'lang-ui': 'en', ...attributes })) el.setAttribute(name, value); // prettier-ignore
  el.data = data;
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

afterEach(() => document.body.replaceChildren());

describe('cycles', () => {
  it('reads endoflife.date v0 and gives each cycle its status', () => {
    const { cycles } = readCycles(V0);
    expect(cycles.map((c) => [c.name, c.lts, statusOf(c, NOW)])).toEqual([
      ['24', true, 'security'],
      ['23', false, 'eol'],
      ['22', true, 'security'],
      ['20', true, 'eol'],
      ['26', false, 'upcoming'],
    ]);
    expect(cycles[0].latest).toBe('24.11.0');
  });

  it('reads endoflife.date v1, its label and links', () => {
    const { name, cycles } = readCycles(V1);
    expect(name).toBe('Python');
    expect(cycles.map((c) => statusOf(c, NOW))).toEqual(['active', 'security', 'eol']);
    expect(cycles[0].link).toBe('https://www.python.org/downloads/release/python-3140/');
  });

  it('reads flags without dates, and extended support', () => {
    const { cycles } = readCycles([
      { version: '5.x', supported: true },
      { version: '4.x', eol: true },
      { version: '3.x', eol: '2025-01-01', extendedSupport: '2027-01-01' },
    ]);
    expect(cycles.map((c) => statusOf(c, NOW))).toEqual(['active', 'eol', 'extended']);
    expect(() => readCycles({ nothing: 1 })).toThrow();
  });

  it('finds the cycle of a version', () => {
    const { cycles } = readCycles([{ cycle: '3' }, { cycle: '3.12' }, { cycle: '20' }]);
    expect(cycleOf(cycles, '3.12.4')?.name).toBe('3.12');
    expect(cycleOf(cycles, 'v20.11.1')?.name).toBe('20');
    expect(cycleOf(cycles, '200.1')).toBeNull();
  });
});

describe('<vt-lifecycle>', () => {
  it('says whether a version is supported and marks its row', async () => {
    const el = await mount({ version: '20.11.1' }, V0);
    expect(el.root.querySelector('.lc-check')?.textContent).toContain('20.11.1 is no longer supported, since Apr 30, 2026.'); // prettier-ignore
    expect(el.root.querySelector('.lc-check')?.textContent).toContain('The latest release of 20 is 20.19.5.'); // prettier-ignore
    expect(el.root.querySelector('tr.lc-mine')?.getAttribute('aria-current')).toBe('true');
  });

  it('hides old ended cycles behind a button', async () => {
    const el = await mount({ ended: '0' }, V0);
    expect(el.root.querySelectorAll('tbody tr')).toHaveLength(3);
    /** @type {HTMLElement} */ (el.root.querySelector('.lc-more')).click();
    expect(el.root.querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('draws a schedule with a sentence per row, and copies CSV', async () => {
    const el = await mount({ view: 'schedule' }, V1);
    const rows = el.root.querySelectorAll('.lc-row');
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelector('.sr-only')?.textContent).toBe('3.14: Supported. Released: Oct 7, 2025. Active support: until Oct 1, 2027. Security support: until Oct 31, 2030.'); // prettier-ignore
    expect(el.root.querySelectorAll('.lc-row')[0].querySelectorAll('.lc-bar')).toHaveLength(2);
    expect(el.toCsv(el.cycles, NOW).split('\n')[1]).toBe('3.14,active,no,2025-10-07,2027-10-01,2030-10-31,,3.14.0'); // prettier-ignore
  });
});
