import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  check,
  explain,
  formatDuration,
  parseDns,
  parseTtl,
  txtValue,
} from '../../src/components/dns/dns.js';
import { VtDns } from '../../src/components/dns/vt-dns.js';
import { dnsFromData } from '../../src/core/data-formats.js';

/** @param {string} name */
const fixture = (name) => readFileSync(join(import.meta.dirname, 'fixtures', 'security', name), 'utf8'); // prettier-ignore

describe('parseDns', () => {
  it('reads dig output with its header', () => {
    const zone = parseDns(fixture('dig.txt'));
    expect(zone.dig).toEqual({ status: 'NOERROR', flags: 'qr rd ra ad', server: '1.1.1.1', time: '24 msec', question: 'example.com. ANY' }); // prettier-ignore
    expect(zone.records.map((r) => r.type)).toEqual(['A', 'MX', 'TXT', 'TXT', 'CAA', 'SOA', 'TXT']);
  });

  it('reads zone files: $ORIGIN, $TTL, @, relative names and parentheses', () => {
    const { records } = parseDns(fixture('zone.txt'));
    expect(records.map((r) => `${r.name} ${r.ttl} ${r.type}`)).toEqual([
      'example.org. 3600 SOA',
      'example.org. 3600 NS',
      'example.org. 3600 MX',
      'www.example.org. 300 CNAME',
      'sel._domainkey.example.org. 3600 TXT',
      '_sip._tcp.example.org. 3600 SRV',
    ]);
    expect(records[0].data).toBe('ns1 hostmaster 2026111701 2h 1h 2w 5m');
  });

  it('reads TTLs and TXT strings', () => {
    expect(parseTtl('1d2h')).toBe(93600);
    expect(parseTtl('x')).toBeNull();
    expect(formatDuration(93600)).toBe('1 d 2 h');
    expect(txtValue('"v=spf1 " "-all"')).toBe('v=spf1 -all');
  });
});

describe('explain and check', () => {
  const { records } = parseDns(fixture('dig.txt'));

  it('explains SPF, SOA and CAA', () => {
    expect(explain(records[2])?.map((p) => p.key)).toEqual(['dnsSpf_ip4', 'dnsSpf_include', 'dnsSpf_ptr', 'dnsSpf_all']); // prettier-ignore
    expect(explain(records[5])?.[1].value).toBe('host.master@example.com');
    expect(explain(records[4])?.[0].params?.ca).toBe('letsencrypt.org');
  });

  it('checks SPF, DMARC and DKIM', () => {
    expect(check(records).map((f) => f.id)).toEqual(['spfMultiple', 'spfNeutralAll', 'spfPtr', 'dmarcNone', 'dmarcPct', 'dmarcNoRua']); // prettier-ignore
    expect(check(parseDns('a. IN TXT "v=spf1 +all"').records).map((f) => f.id)).toEqual(['spfPassAll']); // prettier-ignore
    const many = Array.from({ length: 11 }, (_, i) => `include:s${i}.example.com`).join(' ');
    expect(check(parseDns(`a. IN TXT "v=spf1 ${many} -all"`).records)[0]).toMatchObject({ id: 'spfLookups', params: { count: 11 } }); // prettier-ignore
    expect(check(parseDns(fixture('zone.txt')).records).map((f) => f.id)).toEqual(['dkimShortKey']);
  });
});

describe('dnsFromData', () => {
  it('reads DNS-over-HTTPS JSON', () => {
    expect(
      dnsFromData({
        Status: 0,
        Answer: [
          { name: 'a.example.', type: 16, TTL: 60, data: 'v=spf1 "x" -all' },
          { name: 'a.example.', type: 1, TTL: 60, data: '192.0.2.1\nevil' },
        ],
      }).content,
    ).toBe(
      // prettier-ignore
      'a.example.\t60\tIN\tTXT\t"v=spf1 \\"x\\" -all"\na.example.\t60\tIN\tA\t192.0.2.1 evil',
    );
  });
});

describe('<vt-dns>', () => {
  if (!customElements.get('vt-dns')) customElements.define('vt-dns', VtDns);

  it('shows the query, findings, filters and explained records', () => {
    const el = /** @type {VtDns} */ (document.createElement('vt-dns'));
    el.setAttribute('variant', 'full');
    el.setAttribute('lang-ui', 'en');
    el.content = fixture('dig.txt');
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelector('.badge')?.textContent).toBe('7 records');
    expect(root.querySelector('.dns-finding.bad')?.textContent).toContain('2 SPF records');
    expect(root.querySelector('.dns-explain')?.textContent).toContain('Preference');
    /** @type {HTMLButtonElement} */ (root.querySelector('[data-focus-key="filter-TXT"]')).click();
    expect(el.root.querySelectorAll('.dns-table tbody tr')).toHaveLength(3);
    el.remove();
  });
});
