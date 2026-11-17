import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isRisky, parseScan, toCsv } from '../../src/components/nmap/nmap.js';
import { VtNmap } from '../../src/components/nmap/vt-nmap.js';

/** @param {string} name */
const fixture = (name) => readFileSync(join(import.meta.dirname, 'fixtures', 'security', name), 'utf8'); // prettier-ignore

/** @param {string} name */
const scan = (name) => {
  const result = parseScan(fixture(name));
  if (!result.ok) throw new Error(result.error);
  return result.scan;
};

describe('parseScan', () => {
  it('reads normal output', () => {
    const s = scan('nmap-normal.txt');
    expect(s.summary).toBe('256 IP addresses (2 hosts up) scanned');
    expect(s.elapsed).toBe('12.34');
    const [host] = s.hosts;
    expect(host).toMatchObject({ address: '203.0.113.10', hostnames: ['shop.example.com'], latency: '0.012s', mac: '00:1A:2B:3C:4D:5E', vendor: 'Acme', os: 'Linux 5.0 - 5.14' }); // prettier-ignore
    expect(host.ports.map((p) => `${p.port}/${p.state}/${p.service}/${p.tunnel}`)).toEqual(['22/open/ssh/', '80/open/http/', '443/open/http/ssl', '3306/open/mysql/', '6379/filtered/redis/']); // prettier-ignore
    expect(host.ports[0].scripts).toEqual([{ id: 'ssh-hostkey', output: '256 aa:bb (ECDSA)\n256 cc:dd (ED25519)' }]); // prettier-ignore
    expect(s.hosts).toHaveLength(2);
  });

  it('reads XML output', () => {
    const s = scan('nmap.xml');
    expect(s.command).toBe('nmap -sV -oX - 203.0.113.10');
    expect(s.hosts[0]).toMatchObject({ os: 'Linux 5.4 (96%)', latency: '0.012s' });
    expect(s.hosts[0].ports[0]).toMatchObject({ port: 22, version: 'OpenSSH 8.9p1 (Ubuntu)', reason: 'syn-ack' }); // prettier-ignore
  });

  it('reads grepable output', () => {
    const s = scan('nmap-grep.txt');
    expect(s.elapsed).toBe('5.01');
    expect(s.hosts).toHaveLength(1);
    expect(s.hosts[0].ports.map((p) => p.port)).toEqual([22, 443, 23]);
  });

  it('rejects other text', () => {
    expect(parseScan('')).toEqual({ ok: false, error: 'empty' });
    expect(parseScan('hello')).toEqual({ ok: false, error: 'format' });
    expect(parseScan('<nmaprun><host>').ok).toBe(false);
  });
});

describe('risk and export', () => {
  it('marks risky open services only', () => {
    const ports = scan('nmap-normal.txt').hosts[0].ports;
    expect(ports.filter(isRisky).map((p) => p.port)).toEqual([3306]);
  });

  it('writes CSV without formulas', () => {
    const s = scan('nmap-grep.txt');
    s.hosts[0].ports[0].version = '=cmd';
    expect(toCsv(s.hosts).split('\n')[1]).toBe(
      `203.0.113.10,shop.example.com,22,tcp,open,ssh,"'=cmd"`,
    );
  });
});

describe('<vt-nmap>', () => {
  if (!customElements.get('vt-nmap')) customElements.define('vt-nmap', VtNmap);

  it('shows hosts with open ports and marks risky services', () => {
    const el = /** @type {VtNmap} */ (document.createElement('vt-nmap'));
    el.setAttribute('variant', 'full');
    el.setAttribute('lang-ui', 'en');
    el.content = fixture('nmap-normal.txt');
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelector('.badge')?.textContent).toBe('2 of 2 hosts up');
    expect(root.querySelectorAll('.nmap-table tbody tr:not(.nmap-script-row)')).toHaveLength(4);
    expect(root.querySelector('[part="risky"]')?.textContent).toBe('Exposed');
    /** @type {HTMLButtonElement} */ (root.querySelector('[data-focus-key="all"]')).click();
    expect(el.root.querySelectorAll('.nmap-table tbody tr:not(.nmap-script-row)')).toHaveLength(5);
    el.remove();
  });
});
