// @ts-check
import { afterEach, describe, expect, it } from 'vitest';
import {
  cvss3Score,
  readAdvisories,
  severityOf,
} from '../../src/components/advisories/advisories.js';
import { VtAdvisories, toCsv, toMarkdown } from '../../src/components/advisories/vt-advisories.js';

if (!customElements.get('vt-advisories')) customElements.define('vt-advisories', VtAdvisories);

const OSV = {
  id: 'GHSA-35jh-r3h4-6jhm',
  summary: 'Command Injection in lodash',
  details: 'lodash versions prior to 4.17.21 are vulnerable to Command Injection via the template function.', // prettier-ignore
  aliases: ['CVE-2021-23337'],
  published: '2021-05-06T16:05:51Z',
  severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H' }],
  affected: [{ package: { ecosystem: 'npm', name: 'lodash' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] }], // prettier-ignore
  references: [{ type: 'ADVISORY', url: 'https://nvd.nist.gov/vuln/detail/CVE-2021-23337' }],
  database_specific: { severity: 'HIGH', cwe_ids: ['CWE-77', 'CWE-94'] },
};

const NPM_AUDIT = {
  auditReportVersion: 2,
  vulnerabilities: {
    'nth-check': {
      name: 'nth-check',
      severity: 'high',
      isDirect: false,
      via: [{ source: 1095141, name: 'nth-check', dependency: 'nth-check', title: 'Inefficient Regular Expression Complexity in nth-check', url: 'https://github.com/advisories/GHSA-rp65-9cf3-cjxr', severity: 'high', cwe: ['CWE-1333'], cvss: { score: 7.5, vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H' }, range: '<2.0.1' }], // prettier-ignore
      effects: ['css-select'],
      range: '<2.0.1',
      fixAvailable: { name: 'react-scripts', version: '2.1.3', isSemVerMajor: true },
    },
    'css-select': { name: 'css-select', severity: 'high', via: ['nth-check'], effects: [], range: '<=3.1.0', fixAvailable: true }, // prettier-ignore
    postcss: {
      name: 'postcss',
      severity: 'moderate',
      via: [{ source: 1094544, name: 'postcss', title: 'PostCSS line return parsing error', url: 'https://github.com/advisories/GHSA-7fh5-64p2-3v2j', severity: 'moderate', cvss: { score: 5.3 }, range: '<8.4.31' }], // prettier-ignore
      range: '<8.4.31',
      fixAvailable: { name: 'postcss', version: '8.4.31' },
    },
  },
  metadata: { vulnerabilities: { high: 2, moderate: 1, total: 3 } },
};

const GITHUB = [
  {
    ghsa_id: 'GHSA-xxxx-yyyy-zzzz',
    cve_id: 'CVE-2026-0001',
    summary: 'Prototype pollution in merge()',
    description: 'Merging untrusted objects can set `__proto__`.',
    severity: 'critical',
    cvss: { score: 9.8, vector_string: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' },
    html_url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz',
    published_at: '2026-03-01T00:00:00Z',
    vulnerabilities: [{ package: { ecosystem: 'npm', name: 'deep-merge' }, vulnerable_version_range: '< 2.0.4', first_patched_version: '2.0.4' }], // prettier-ignore
  },
];

/**
 * @param {Record<string, string>} attributes
 * @param {unknown} data
 * @returns {Promise<VtAdvisories>}
 */
async function mount(attributes, data) {
  const el = /** @type {VtAdvisories} */ (document.createElement('vt-advisories'));
  for (const [name, value] of Object.entries({ 'lang-ui': 'en', ...attributes })) el.setAttribute(name, value); // prettier-ignore
  el.data = data;
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));
  el.render();
  return el;
}

afterEach(() => document.body.replaceChildren());

describe('CVSS 3', () => {
  it('computes base scores like the specification', () => {
    expect(cvss3Score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBe(9.8);
    expect(cvss3Score('CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N')).toBe(6.1);
    expect(cvss3Score('CVSS:3.0/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N')).toBe(5.5);
    expect(cvss3Score('CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H')).toBe(7.2);
    expect(cvss3Score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H')).toBe(10);
    expect(cvss3Score('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')).toBe(0);
    expect(
      cvss3Score('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'),
    ).toBeNull();
    expect(cvss3Score('CVSS:3.1/AV:X')).toBeNull();
    expect([9, 7, 4, 0.1, 0, null].map(severityOf)).toEqual(['critical', 'high', 'moderate', 'low', 'unknown', 'unknown']); // prettier-ignore
  });
});

describe('reading advisories', () => {
  it('reads OSV, with ranges, fixes, score and weaknesses', () => {
    const [a] = readAdvisories([OSV]);
    expect(a).toMatchObject({ id: 'GHSA-35jh-r3h4-6jhm', severity: 'high', score: 7.2, cwes: ['CWE-77', 'CWE-94'] }); // prettier-ignore
    expect(a.affected).toEqual([{ name: 'lodash', ecosystem: 'npm', version: '', range: '<4.17.21', fixed: '4.17.21' }]); // prettier-ignore
    expect(a.url).toBe('https://nvd.nist.gov/vuln/detail/CVE-2021-23337');
    expect(readAdvisories({ vulns: [OSV] })).toHaveLength(1);
  });

  it('reads osv-scanner results with the version installed', () => {
    const scan = { results: [{ source: { path: 'package-lock.json' }, packages: [{ package: { name: 'lodash', version: '4.17.15', ecosystem: 'npm' }, vulnerabilities: [OSV] }] }] }; // prettier-ignore
    expect(readAdvisories(scan)[0].affected[0].version).toBe('4.17.15');
  });

  it('reads npm audit, one entry per advisory, most severe first', () => {
    const list = readAdvisories(NPM_AUDIT);
    expect(list.map((a) => [a.id, a.severity, a.score])).toEqual([
      ['GHSA-rp65-9cf3-cjxr', 'high', 7.5],
      ['GHSA-7fh5-64p2-3v2j', 'moderate', 5.3],
    ]);
    expect(list[1].affected[0]).toMatchObject({
      name: 'postcss',
      range: '<8.4.31',
      fixed: '8.4.31',
    });
  });

  it('reads GitHub advisories and Dependabot alerts', () => {
    expect(readAdvisories(GITHUB)[0]).toMatchObject({ severity: 'critical', score: 9.8, aliases: ['CVE-2026-0001'], affected: [{ fixed: '2.0.4' }] }); // prettier-ignore
    const alert = { number: 3, state: 'open', html_url: 'https://github.com/o/r/security/dependabot/3', security_advisory: GITHUB[0], security_vulnerability: { package: { name: 'deep-merge', ecosystem: 'npm' }, severity: 'critical', vulnerable_version_range: '< 2.0.4', first_patched_version: { identifier: '2.0.4' } } }; // prettier-ignore
    expect(readAdvisories([alert])[0]).toMatchObject({ url: 'https://github.com/o/r/security/dependabot/3', affected: [{ fixed: '2.0.4' }] }); // prettier-ignore
    expect(() => readAdvisories({ nothing: 1 })).toThrow();
  });
});

describe('<vt-advisories>', () => {
  it('filters by severity and explains the vector', async () => {
    const el = await mount({ variant: 'full' }, [...GITHUB, OSV]);
    /** @type {any[]} */
    const seen = [];
    el.addEventListener('vt-filter-change', (e) => seen.push(/** @type {CustomEvent} */ (e).detail)); // prettier-ignore
    expect(el.root.querySelectorAll('.adv-item')).toHaveLength(2);
    const high = [...el.root.querySelectorAll('.adv-filter')].find((b) => b.textContent?.startsWith('High')); // prettier-ignore
    /** @type {HTMLElement} */ (high).click();
    expect(seen).toEqual([{ severity: 'high' }]);
    expect(el.root.querySelectorAll('.adv-item')).toHaveLength(1);
    expect(el.root.querySelector('.adv-vector')?.textContent).toContain('Attack: network · complexity low · privileges high'); // prettier-ignore
    expect(el.root.querySelector('.adv-fix')?.textContent).toBe(' → fixed in 4.17.21');
  });

  it('keeps the lowest severity asked, and says when nothing is known', async () => {
    const el = await mount({ severity: 'critical' }, [...GITHUB, OSV]);
    expect(el.advisories.map((a) => a.severity)).toEqual(['critical']);
    const clean = await mount({}, { vulns: [] });
    expect(clean.root.querySelector('.adv-clean')?.textContent).toBe('No known vulnerability.');
  });

  it('exports CSV and Markdown with cells made safe', () => {
    const list = readAdvisories([{ ...OSV, summary: '=HYPERLINK("x") | *bold*' }]);
    expect(toCsv(list).split('\n')[1]).toContain(`"'=HYPERLINK(""x"") | *bold*"`);
    expect(toMarkdown(list).split('\n')[2]).toContain('=HYPERLINK("x") \\| \\*bold\\*');
  });
});
