import { describe, expect, it } from 'vitest';
import {
  defang,
  extract,
  ipNote,
  isIpv6,
  refang,
  toCsv,
  toMisp,
  toStix,
} from '../../src/components/ioc/ioc.js';
import { VtIoc } from '../../src/components/ioc/vt-ioc.js';
import { iocFromData } from '../../src/core/data-formats.js';

const REPORT = `Phishing from hxxps://login-secure[.]example[.]com/auth?x=1). C2 at 45.33.32[.]156 and 10.0.0.5, also 2001:db8::1.
Payload e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 and d41d8cd98f00b204e9800998ecf8427e.
Contact attacker[@]evil-mail[.]ru. Exploits CVE-2024-3400 via T1566.001, again 45.33.32.156.
Not indicators: readme.md, app.js, window.location, 12:30:45, 00:1a:2b:3c:4d:5e, v1.2.3, 256.1.1.1.`;

/** @param {string} text */
const pairs = (text) => extract(text).indicators.map((i) => `${i.type} ${i.value}`);

describe('extract', () => {
  it('finds every kind of indicator, refanged, once each', () => {
    expect(pairs(REPORT)).toEqual([
      'url https://login-secure.example.com/auth?x=1',
      'ipv4 45.33.32.156',
      'ipv4 10.0.0.5',
      'ipv6 2001:db8::1',
      'email attacker@evil-mail.ru',
      'md5 d41d8cd98f00b204e9800998ecf8427e',
      'sha256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'cve CVE-2024-3400',
      'attack T1566.001',
    ]);
  });

  it('counts repeats and keeps the first line', () => {
    const ip = extract(REPORT).indicators.find((i) => i.value === '45.33.32.156');
    expect(ip).toMatchObject({ count: 2, line: 1, note: null });
  });

  it('reads domains with known endings only', () => {
    expect(pairs('evil.xyz bad.co.uk ok.example.com xn--80ak6aa92e.xn--p1ai report.pdf')).toEqual([
      'domain evil.xyz',
      'domain bad.co.uk',
      'domain ok.example.com',
      'domain xn--80ak6aa92e.xn--p1ai',
    ]);
  });

  it('stops at the limit', () => {
    const text = Array.from({ length: 30 }, (_, i) => `1.1.1.${i}`).join(' ');
    const result = extract(text, { max: 10 });
    expect(result.indicators).toHaveLength(10);
    expect(result.capped).toBe(true);
  });

  it('stays fast on hostile input', () => {
    const start = performance.now();
    extract(
      `${'a-'.repeat(50000)}! ${'1.'.repeat(50000)} ${'a@'.repeat(50000)} ${':'.repeat(50000)}`,
    );
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe('addresses', () => {
  it('validates IPv6 and marks special ranges', () => {
    expect(['::1', 'fe80::1', '2001:db8::', '1:2:3:4:5:6:7:8'].every(isIpv6)).toBe(true);
    expect(['12:30:45', '1::2::3', '1:2:3:4:5:6:7:8:9'].some(isIpv6)).toBe(false);
    expect(ipNote('ipv4', '192.168.1.1')).toBe('private');
    expect(ipNote('ipv4', '100.64.0.1')).toBe('shared');
    expect(ipNote('ipv4', '8.8.8.8')).toBeNull();
    expect(ipNote('ipv6', 'fd00::1')).toBe('private');
  });
});

describe('defang and refang', () => {
  it('round-trips', () => {
    expect(defang('url', 'https://a.example.com/x.y')).toBe('hxxps[://]a[.]example[.]com/x.y');
    expect(defang('email', 'a.b@c.org')).toBe('a.b[@]c[.]org');
    expect(refang('hxxps[://]a[.]example[.]com and a(at)b(dot)org')).toBe('https://a.example.com and a@b.org'); // prettier-ignore
  });
});

describe('exports', () => {
  const { indicators } = extract(REPORT);

  it('writes CSV without formulas', () => {
    const csv = toCsv([{ type: 'domain', value: '=cmd.example.com', count: 1, line: 1, note: null }], false); // prettier-ignore
    expect(csv.split('\n')[1]).toBe(`domain,"'=cmd.example.com",1,1,`);
    expect(toCsv(indicators, true).split('\n')[2]).toBe('ipv4,45[.]33[.]32[.]156,2,1,');
  });

  it('writes a STIX 2.1 bundle', () => {
    const bundle = JSON.parse(toStix(indicators, { now: new Date('2026-11-17T00:00:00Z') }));
    expect(bundle.type).toBe('bundle');
    const patterns = bundle.objects.filter((o) => o.type === 'indicator').map((o) => o.pattern);
    expect(patterns).toContain("[ipv4-addr:value = '45.33.32.156']");
    expect(patterns).toContain("[file:hashes.'SHA-256' = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855']"); // prettier-ignore
    expect(bundle.objects.find((o) => o.type === 'vulnerability').name).toBe('CVE-2024-3400');
    expect(toStix([{ type: 'url', value: "http://a.b/'x", count: 1, line: 1, note: null }])).toContain("http://a.b/\\\\'x"); // prettier-ignore
  });

  it('writes a MISP event', () => {
    const { Event } = JSON.parse(toMisp(indicators, { info: 'Report' }));
    expect(Event.info).toBe('Report');
    expect(Event.Attribute.find((a) => a.value === '10.0.0.5')).toMatchObject({ type: 'ip-dst', to_ids: false, comment: 'private' }); // prettier-ignore
    expect(Event.Attribute.find((a) => a.value === 'CVE-2024-3400').type).toBe('vulnerability');
  });

  it('reads MISP attributes as input', () => {
    expect(iocFromData({ Attribute: [{ value: '1.2.3.4' }, { value: 'evil.xyz' }] })).toEqual({ content: '1.2.3.4\nevil.xyz' }); // prettier-ignore
  });
});

describe('<vt-ioc>', () => {
  if (!customElements.get('vt-ioc')) customElements.define('vt-ioc', VtIoc);

  it('shows indicators defanged, grouped, with filters', () => {
    const el = /** @type {VtIoc} */ (document.createElement('vt-ioc'));
    el.setAttribute('variant', 'full');
    el.setAttribute('lang-ui', 'en');
    el.content = REPORT;
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelector('.badge')?.textContent).toBe('9 indicators');
    expect(root.querySelector('[part="indicator"]')?.textContent).toBe('hxxps[://]login-secure[.]example[.]com/auth?x=1'); // prettier-ignore
    expect(root.querySelector('a')).toBeNull();
    const ipv4 = /** @type {HTMLButtonElement} */ (root.querySelector('[data-focus-key="filter-ipv4"]')); // prettier-ignore
    ipv4.click();
    expect(el.root.querySelectorAll('.ioc-group')).toHaveLength(1);
    expect(el.export('text')).toBe('45[.]33[.]32[.]156\n10[.]0[.]0[.]5');
    el.remove();
  });

  it('keeps only some types and hides special addresses', () => {
    const el = /** @type {VtIoc} */ (document.createElement('vt-ioc'));
    el.setAttribute('types', 'ipv4, ipv6');
    el.setAttribute('private', 'false');
    el.content = REPORT;
    document.body.append(el);
    el.render();
    expect(el.indicators.map((i) => i.value)).toEqual(['45.33.32.156']);
    el.remove();
  });
});
