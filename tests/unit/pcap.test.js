import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  conversations,
  decode,
  dnsName,
  hostNames,
  ipv6,
  parseCapture,
  toCsv,
} from '../../src/components/pcap/pcap.js';
import { VtPcap } from '../../src/components/pcap/vt-pcap.js';

const FILE = new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', 'security', 'capture.pcap'))); // prettier-ignore

const capture = () => {
  const result = parseCapture(FILE);
  if (!result.ok) throw new Error(result.error);
  return result.capture;
};

/**
 * The same packets as pcapng (big-endian sections are tested by swapping nothing: little).
 *
 * @param {import('../../src/components/pcap/pcap.js').Packet[]} packets
 */
function toPcapng(packets) {
  const parts = [];
  const block = (type, body) => {
    const padded = Math.ceil(body.length / 4) * 4;
    const out = new Uint8Array(12 + padded);
    const v = new DataView(out.buffer);
    v.setUint32(0, type, true);
    v.setUint32(4, out.length, true);
    out.set(body, 8);
    v.setUint32(out.length - 4, out.length, true);
    return out;
  };
  const shb = new Uint8Array(16);
  new DataView(shb.buffer).setUint32(0, 0x1a2b3c4d, true);
  new DataView(shb.buffer).setUint16(4, 1, true);
  new DataView(shb.buffer).setBigInt64(8, -1n, true);
  parts.push(block(0x0a0d0d0a, shb));
  const idb = new Uint8Array(8 + 8 + 4);
  const iv = new DataView(idb.buffer);
  iv.setUint16(0, 1, true);
  iv.setUint32(4, 65535, true);
  iv.setUint16(8, 2, true); // if_name
  iv.setUint16(10, 4, true);
  idb.set([101, 116, 104, 48], 12); // "eth0"
  parts.push(block(1, idb));
  for (const p of packets) {
    const body = new Uint8Array(20 + p.data.length);
    const v = new DataView(body.buffer);
    v.setUint32(4, Math.floor(p.time / 2 ** 32), true);
    v.setUint32(8, p.time % 2 ** 32, true);
    v.setUint32(12, p.data.length, true);
    v.setUint32(16, p.length, true);
    body.set(p.data, 20);
    parts.push(block(6, body));
  }
  const size = parts.reduce((s, x) => s + x.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const x of parts) {
    out.set(x, at);
    at += x.length;
  }
  return out;
}

describe('parseCapture', () => {
  it('reads pcap packets and summaries', () => {
    const c = capture();
    expect(c.format).toBe('pcap');
    expect(c.linkType).toBe(1);
    expect(c.packets).toHaveLength(12);
    expect(c.truncated).toBe(false);
    const rows = c.packets.map((p) => [p.summary.protocol, p.summary.info]);
    expect(rows[0]).toEqual(['ARP', 'Who has 192.168.1.1? Tell 192.168.1.20']);
    expect(rows[2]).toEqual(['DNS', 'Query 0x2a1f A login.shop.example']);
    expect(rows[3][1]).toBe('Response 0x2a1f A login.shop.example → CNAME cdn.shop.example, A 198.51.100.7'); // prettier-ignore
    expect(rows[5]).toEqual(['TCP', '443 → 51514 [SYN, ACK] Seq=0 Ack=1 Win=64240 Len=0']);
    expect(rows[7]).toEqual(['TLS', 'Client Hello (login.shop.example)']);
    expect(rows[9]).toEqual(['HTTP', 'GET /login?next=%2Faccount HTTP/1.1']);
    expect(rows[10]).toEqual(['ICMP', 'Echo request id=4660 seq=1']);
    expect(c.packets[11].summary).toMatchObject({ protocol: 'ICMPv6', src: '2001:db8::1', dst: '2001:db8::2' }); // prettier-ignore
  });

  it('decodes layers with their byte ranges', () => {
    const c = capture();
    const { layers } = decode(c.packets[7], c.state);
    expect(layers.map((l) => l.name)).toEqual(['Ethernet', 'IPv4', 'TCP', 'TLS']);
    const tls = layers[3].fields;
    const sni = tls.find((f) => f.key === 'tlsSni');
    expect(sni?.value).toBe('login.shop.example');
    const bytes = c.packets[7].data.subarray(sni?.start, sni?.end);
    expect(new TextDecoder().decode(bytes)).toBe('login.shop.example');
    expect(tls.find((f) => f.key === 'tlsAlpn')?.value).toBe('h2, http/1.1');
    expect(tls.find((f) => f.key === 'tlsSupportedVersions')?.value).toBe('TLS 1.3, TLS 1.2');
    expect(layers[2].fields.find((f) => f.key === 'tcpSeq')?.value).toBe('1 (1001)');
  });

  it('reads pcapng', () => {
    const result = parseCapture(toPcapng(capture().packets));
    expect(result.ok && result.capture.format).toBe('pcapng');
    expect(result.ok && result.capture.interfaces).toEqual(['eth0']);
    expect(result.ok && result.capture.packets.map((p) => p.summary.protocol)).toEqual(capture().packets.map((p) => p.summary.protocol)); // prettier-ignore
    expect(result.ok && result.capture.packets[4].time).toBe(capture().packets[4].time);
  });

  it('rejects other files and reports cut ones', () => {
    expect(parseCapture(new Uint8Array(0))).toEqual({ ok: false, error: 'empty' });
    expect(parseCapture(new TextEncoder().encode('not a capture at all, sorry'))).toEqual({ ok: false, error: 'format' }); // prettier-ignore
    const cut = parseCapture(FILE.subarray(0, FILE.length - 10));
    expect(cut.ok && cut.capture.truncated).toBe(true);
    expect(cut.ok && cut.capture.packets).toHaveLength(11);
  });

  it('groups conversations and host names', () => {
    const c = capture();
    expect(conversations(c.packets)[0]).toMatchObject({ a: '192.168.1.20:51514', b: '198.51.100.7:443', protocol: 'TLS', packets: 4 }); // prettier-ignore
    expect(hostNames(c.packets)).toEqual([
      { name: 'cdn.shop.example', sources: ['dns'], addresses: ['198.51.100.7'], packets: [4] },
      { name: 'login.shop.example', sources: ['dns', 'http', 'sni'], addresses: ['cdn.shop.example'], packets: [3, 4, 8, 10] }, // prettier-ignore
    ]);
  });

  it('reads addresses and names safely', () => {
    expect(ipv6(Uint8Array.from([0xfe, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]), 0)).toBe('fe80::1'); // prettier-ignore
    // A compression pointer to itself stops instead of looping.
    expect(dnsName(Uint8Array.from([0xc0, 0]), 0, 0, 2)).toBeNull();
    expect(dnsName(Uint8Array.from([3, 0x41, 0x0a, 0x42, 0]), 0, 0, 5)?.name).toBe('a\\x0ab');
  });

  it('writes CSV without formulas', () => {
    const c = capture();
    const csv = toCsv(c.packets.slice(0, 1), c.packets[0].time).split('\n');
    expect(csv[0]).toBe('No.,Time,Source,Destination,Protocol,Length,Info');
    expect(csv[1]).toContain('0.000000');
  });
});

describe('<vt-pcap>', () => {
  if (!customElements.get('vt-pcap')) customElements.define('vt-pcap', VtPcap);

  it('lists packets, filters them and opens one', () => {
    const el = /** @type {VtPcap} */ (document.createElement('vt-pcap'));
    el.setAttribute('variant', 'full');
    el.setAttribute('lang-ui', 'en');
    el.bytes = FILE;
    document.body.append(el);
    el.render();
    const root = el.root;
    expect(root.querySelectorAll('.pcap-row')).toHaveLength(12);
    /** @type {HTMLButtonElement} */ (root.querySelector('[data-focus-key="filter-DNS"]')).click();
    expect(el.root.querySelectorAll('.pcap-row')).toHaveLength(2);
    /** @type {HTMLButtonElement} */ (
      el.root.querySelector('[data-focus-key="filter-all"]')
    ).click();
    /** @type {HTMLButtonElement} */ (el.root.querySelector('[data-focus-key="packet-8"]')).click();
    expect(el.root.querySelector('.pcap-packet h3')?.textContent).toBe('Packet 8');
    const field = /** @type {HTMLButtonElement} */ ([...el.root.querySelectorAll('.pcap-field')].find((b) => b.textContent === 'Server name (SNI)')); // prettier-ignore
    field.click();
    const marked = [...el.root.querySelectorAll('.pcap-ascii .b.mark')].map((x) => x.textContent).join(''); // prettier-ignore
    expect(marked).toBe('login.shop.example');
    /** @type {HTMLButtonElement} */ (el.root.querySelector('[data-tab="names"]')).click();
    expect(el.root.querySelectorAll('.pcap-names tbody tr')).toHaveLength(2);
    el.remove();
  });

  it('reads base64 text and shows a drop zone when empty', () => {
    const el = /** @type {VtPcap} */ (document.createElement('vt-pcap'));
    document.body.append(el);
    el.render();
    expect(el.root.querySelector('.pcap-zone')).not.toBeNull();
    el.content = Buffer.from(FILE).toString('base64');
    el.render();
    expect(el.root.querySelectorAll('.pcap-row')).toHaveLength(12);
    el.remove();
  });
});
