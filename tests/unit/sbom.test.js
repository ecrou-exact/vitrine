import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ecosystemOf, licenseCategory, parseSbom, summary, toCsv } from '../../src/components/sbom/sbom.js'; // prettier-ignore
import { VtSbom } from '../../src/components/sbom/vt-sbom.js';

const read = (name) =>
  readFileSync(join(import.meta.dirname, 'fixtures', 'security', name), 'utf8');
const CDX = read('bom.cdx.json');
const SPDX = read('sbom.spdx.json');

const sbomOf = (text) => {
  const r = parseSbom(text);
  if (!r.ok) throw new Error(r.error);
  return r.sbom;
};

describe('parseSbom', () => {
  it('reads CycloneDX: components, graph and vulnerabilities', () => {
    const s = sbomOf(CDX);
    expect(s).toMatchObject({ format: 'CycloneDX', spec: '1.6', name: 'shop-web', roots: ['app'], graph: true }); // prettier-ignore
    expect(s.tools).toEqual(['anchore syft 1.16.0']);
    const qs = s.components.get('pkg:npm/qs@6.11.0');
    expect(qs).toMatchObject({ depth: 2, ecosystem: 'npm', category: 'permissive', vulns: ['GHSA-hrpp-h998-j3pp'] }); // prettier-ignore
    expect(qs?.path).toEqual(['app', 'pkg:npm/express@4.19.2', 'pkg:npm/qs@6.11.0']);
    expect(s.components.get('pkg:npm/%40img/sharp@0.33.0')).toMatchObject({ name: '@img/sharp', category: 'weak' }); // prettier-ignore
    expect(s.components.get('pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1')?.name).toBe('org.apache.logging.log4j:log4j-core'); // prettier-ignore
    expect(s.components.get('pkg:npm/left-pad@1.3.0')?.depth).toBe(-1);
    expect(s.vulns.map((v) => [v.id, v.severity, v.state])).toEqual([
      ['CVE-2021-44228', 'critical', 'exploitable'],
      ['GHSA-hrpp-h998-j3pp', 'high', ''],
      ['CVE-2024-43796', 'low', 'not_affected'],
    ]);
    expect(s.vulns[1].url).toBe('https://github.com/advisories/GHSA-hrpp-h998-j3pp');
    expect(summary(s)).toMatchObject({ components: 6, direct: 3, transitive: 2, affected: 3 });
  });

  it('reads SPDX: packages and relationships', () => {
    const s = sbomOf(SPDX);
    expect(s).toMatchObject({ format: 'SPDX', spec: '2.3', name: 'tool-cli', roots: ['SPDXRef-root'] }); // prettier-ignore
    expect(s.components.get('SPDXRef-urllib3')).toMatchObject({ depth: 2, license: 'MIT', ecosystem: 'pypi' }); // prettier-ignore
    expect(s.components.get('SPDXRef-pytest')).toMatchObject({ depth: 1, scope: 'dev' });
    expect(s.components.get('SPDXRef-gpl')).toMatchObject({ version: '', category: 'strong' });
    expect(s.components.get('SPDXRef-requests')?.supplier).toBe('PSF');
  });

  it('rejects other content', () => {
    expect(parseSbom('')).toEqual({ ok: false, error: 'empty' });
    expect(parseSbom('{').ok).toBe(false);
    expect(parseSbom('{"a":1}')).toEqual({ ok: false, error: 'format' });
  });

  it('reads licenses and package URLs', () => {
    expect(licenseCategory('MIT OR GPL-3.0')).toBe('permissive');
    expect(licenseCategory('MIT AND GPL-3.0')).toBe('strong');
    expect(licenseCategory('')).toBe('unknown');
    expect(ecosystemOf('pkg:golang/github.com/x/y@v1')).toBe('golang');
  });

  it('survives cycles and writes CSV without formulas', () => {
    const cyclic = JSON.stringify({ bomFormat: 'CycloneDX', metadata: { component: { 'bom-ref': 'a', name: 'a' } }, components: [{ 'bom-ref': 'b', name: '=cmd' }], dependencies: [{ ref: 'a', dependsOn: ['b'] }, { ref: 'b', dependsOn: ['a'] }] }); // prettier-ignore
    const s = sbomOf(cyclic);
    expect(s.components.get('b')?.depth).toBe(1);
    expect(toCsv([...s.components.values()]).split('\n')[2]).toContain(`"'=cmd"`);
  });
});

describe('<vt-sbom>', () => {
  if (!customElements.get('vt-sbom')) customElements.define('vt-sbom', VtSbom);

  it('shows the tree, the components and the vulnerabilities', () => {
    const el = /** @type {VtSbom} */ (document.createElement('vt-sbom'));
    el.setAttribute('variant', 'full');
    el.setAttribute('lang-ui', 'en');
    el.content = CDX;
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelector('.sbom-facts')?.textContent).toContain('6 components');
    expect(root.querySelectorAll('.sbom-tree .sbom-node').length).toBeGreaterThanOrEqual(6);
    // qs comes twice: under express and under body-parser.
    expect(root.querySelector('.sbom-unreachable summary')?.textContent).toBe('Not linked to the root (1)'); // prettier-ignore
    /** @type {HTMLButtonElement} */ (root.querySelector('[data-tab="components"]')).click();
    expect(el.root.querySelectorAll('.sbom-table tbody tr')).toHaveLength(6);
    expect(el.root.querySelector('.sbom-table tbody tr')?.getAttribute('data-ref')).toContain(
      'log4j',
    );
    /** @type {HTMLButtonElement} */ (
      el.root.querySelector('[data-tab="vulnerabilities"]')
    ).click();
    const first = el.root.querySelector('.sbom-vuln');
    expect(first?.getAttribute('data-vuln')).toBe('CVE-2021-44228');
    expect(first?.querySelector('a')?.getAttribute('href')).toBe('https://nvd.nist.gov/vuln/detail/CVE-2021-44228'); // prettier-ignore
    /** @type {HTMLElement | null} */ (document.activeElement)?.blur();
    el.remove();
  });

  it('never links unsafe sources or renders markup', () => {
    const el = /** @type {VtSbom} */ (document.createElement('vt-sbom'));
    el.setAttribute('view', 'vulnerabilities');
    el.content = JSON.stringify({ bomFormat: 'CycloneDX', components: [{ 'bom-ref': 'x', name: '<img src=x onerror=alert(1)>' }], vulnerabilities: [{ id: 'X-1', source: { url: 'javascript:alert(1)' }, description: '<b>bold</b>', affects: [{ ref: 'x' }] }] }); // prettier-ignore
    document.body.append(el);
    el.render();
    expect(el.root.querySelector('img, b')).toBeNull();
    expect(el.root.querySelector('.sbom-vuln a')).toBeNull();
    el.remove();
  });
});
