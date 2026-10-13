import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DerError, MAX_DEPTH, oid, parseDer } from '../../src/components/cert/der.js';
import {
  issuerIndex,
  nameText,
  parseCertificates,
  pemBlocks,
  toPem,
  validity,
} from '../../src/components/cert/x509.js';
import { VtCert } from '../../src/components/cert/vt-cert.js';

const fixture = (/** @type {string} */ name) =>
  readFileSync(join(import.meta.dirname, 'fixtures', 'cert', name), 'utf8');

const leaf = fixture('leaf.pem');
const root = fixture('root.pem');

describe('parseDer', () => {
  it('reads nested values and object identifiers', () => {
    const node = parseDer(Uint8Array.from([0x30, 0x05, 0x06, 0x03, 0x55, 0x1d, 0x11]));
    expect(node.children).toHaveLength(1);
    expect(oid(/** @type {any} */ (node.children)[0])).toBe('2.5.29.17');
  });

  it('refuses lengths past the end, indefinite and non-minimal lengths', () => {
    expect(() => parseDer(Uint8Array.from([0x30, 0x05, 0x02, 0x01]))).toThrow(DerError);
    expect(() => parseDer(Uint8Array.from([0x30, 0x80, 0x00, 0x00]))).toThrow(/Indefinite/);
    expect(() => parseDer(Uint8Array.from([0x04, 0x81, 0x01, 0x00]))).toThrow(/minimally/);
    expect(() => parseDer(Uint8Array.from([0x04, 0x85, 1, 0, 0, 0, 0]))).toThrow(/too large/);
    expect(() => parseDer(Uint8Array.from([0x02, 0x01, 0x00, 0xff]))).toThrow(/after the value/);
  });

  it('limits the depth', () => {
    const depth = MAX_DEPTH + 5;
    /** @type {number[]} */
    let bytes = [0x05, 0x00];
    for (let i = 0; i < depth; i += 1) {
      const len = bytes.length;
      bytes = [0x30, ...(len < 128 ? [len] : [0x81, len]), ...bytes];
      if (bytes.length > 250) break;
    }
    expect(() => parseDer(Uint8Array.from(bytes))).toThrow(/deeply/);
  });

  it('survives random bytes without hanging', () => {
    let seed = 7;
    for (let n = 0; n < 300; n += 1) {
      const bytes = new Uint8Array(64);
      for (let i = 0; i < bytes.length; i += 1) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        bytes[i] = seed & 0xff;
      }
      bytes[0] = 0x30;
      try {
        parseDer(bytes);
      } catch (error) {
        expect(error).toBeInstanceOf(DerError);
      }
    }
  });
});

describe('parseCertificates', () => {
  it('reads a leaf certificate and its extensions', () => {
    const { certificates, errors } = parseCertificates(leaf);
    expect(errors).toEqual([]);
    const [cert] = certificates;
    expect(cert.kind).toBe('certificate');
    expect(cert.version).toBe(3);
    expect(cert.serial).toBe('0A:1B:2C:3D:4E:5F');
    expect(nameText(cert.subject)).toBe('CN=shop.example.com, O=Example Shop, C=LU');
    expect(nameText(cert.issuer)).toBe('CN=Vitrine Test Root CA, O=Vitrine Test, C=LU');
    expect(cert.signatureAlgorithm).toBe('ECDSA with SHA-256');
    expect(cert.publicKey).toEqual({ algorithm: 'RSA', bits: 2048, curve: null });
    const san = cert.extensions.find((e) => e.name === 'Subject Alternative Name');
    expect(san?.entries).toEqual([
      { label: 'DNS', value: 'shop.example.com' },
      { label: 'DNS', value: 'www.shop.example.com' },
      { label: 'IP', value: '192.0.2.10' },
      { label: 'IP', value: '2001:db8::1' },
      { label: 'Email', value: 'admin@example.com' },
      { label: 'URI', value: 'https://shop.example.com/' },
    ]);
    const usage = cert.extensions.find((e) => e.name === 'Key Usage');
    expect(usage?.critical).toBe(true);
    expect(usage?.entries.map((e) => e.value)).toEqual(['digitalSignature', 'keyEncipherment']);
    const aia = cert.extensions.find((e) => e.name === 'Authority Information Access');
    expect(aia?.entries).toEqual([
      { label: 'OCSP', value: 'http://ocsp.example.com' },
      { label: 'CA issuers', value: 'http://ca.example.com/root.crt' },
    ]);
    const crl = cert.extensions.find((e) => e.name === 'CRL Distribution Points');
    expect(crl?.entries[0].value).toBe('http://crl.example.com/root.crl');
  });

  it('links a chain and marks the self-signed root', () => {
    const { certificates } = parseCertificates(`${leaf}\n${root}`);
    expect(certificates).toHaveLength(2);
    expect(certificates[1].selfSigned).toBe(true);
    expect(certificates[1].publicKey).toMatchObject({ algorithm: 'EC', curve: 'P-256' });
    expect(issuerIndex(certificates[0], certificates)).toBe(1);
    expect(issuerIndex(certificates[1], certificates)).toBe(-1);
    const basic = certificates[1].extensions.find((e) => e.name === 'Basic Constraints');
    expect(basic?.entries).toEqual([
      { label: 'CA', value: 'true' },
      { label: 'pathLen', value: '1' },
    ]);
  });

  it('reads certificate requests and Ed25519 keys', () => {
    const [request] = parseCertificates(fixture('leaf.csr')).certificates;
    expect(request.kind).toBe('request');
    expect(request.issuer).toEqual([]);
    expect(request.extensions[0].name).toBe('Subject Alternative Name');
    const [ed] = parseCertificates(fixture('ed25519.pem')).certificates;
    expect(ed.publicKey).toEqual({ algorithm: 'Ed25519', bits: 255, curve: null });
  });

  it('flags SHA-1 signatures and small RSA keys', () => {
    const [weak] = parseCertificates(fixture('weak.pem')).certificates;
    expect(weak.weaknesses).toEqual(['sha1', 'rsa-small']);
  });

  it('reads base64 DER and hex DER, and gives back the same PEM', () => {
    const [cert] = parseCertificates(leaf).certificates;
    const body = toPem(cert).split('\n').slice(1, -2).join('');
    expect(parseCertificates(body).certificates[0].serial).toBe(cert.serial);
    const hexText = Array.from(cert.der, (b) => b.toString(16).padStart(2, '0')).join('');
    expect(parseCertificates(hexText).certificates[0].serial).toBe(cert.serial);
    expect(toPem(cert).replace(/\s/g, '')).toBe(leaf.replace(/\s/g, ''));
  });

  it('never keeps private keys and reports broken blocks', () => {
    const key =
      '-----BEGIN PRIVATE KEY-----\nMIIBVQIBADANBgkqhkiG9w0BAQEFAAS\n-----END PRIVATE KEY-----';
    const broken = '-----BEGIN CERTIFICATE-----\nMIIBIjAN\n-----END CERTIFICATE-----';
    const result = parseCertificates(`${key}\n${broken}\n${root}`);
    expect(result.privateKeys).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.certificates).toHaveLength(1);
    expect(pemBlocks(key).blocks).toEqual([]);
  });
});

describe('validity', () => {
  const [cert] = parseCertificates(leaf).certificates;
  const day = 86400000;
  const after = /** @type {Date} */ (cert.notAfter).getTime();
  it('reports valid, expiring, expired and not yet valid', () => {
    expect(validity(cert, new Date(after - 100 * day)).state).toBe('valid');
    expect(validity(cert, new Date(after - 10 * day))).toMatchObject({
      state: 'expiring',
      days: 10,
    });
    expect(validity(cert, new Date(after + 3 * day))).toMatchObject({ state: 'expired', days: 3 });
    const before = /** @type {Date} */ (cert.notBefore).getTime();
    expect(validity(cert, new Date(before - 2 * day))).toMatchObject({ state: 'future', days: 2 });
  });
});

describe('<vt-cert>', () => {
  if (!customElements.get('vt-cert')) customElements.define('vt-cert', VtCert);

  it('renders one card per certificate with names as text', () => {
    const el = /** @type {VtCert} */ (document.createElement('vt-cert'));
    el.setAttribute('now', '2027-01-01T00:00:00Z');
    el.content = `${leaf}\n${root}`;
    document.body.append(el);
    el.render();
    const cards = el.shadowRoot?.querySelectorAll('.cert-card') ?? [];
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('.cert-cn')?.textContent).toBe('shop.example.com');
    expect(cards[0].querySelector('.cert-status')?.textContent).toMatch(/days left/);
    expect(cards[0].querySelector('.cert-link')?.textContent).toBe('Issued by certificate 2');
    expect(el.certificates[1].selfSigned).toBe(true);
    el.remove();
  });

  it('never shows a private key, and speaks French', () => {
    const el = /** @type {VtCert} */ (document.createElement('vt-cert'));
    el.content = '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----';
    el.setAttribute('lang-ui', 'fr');
    document.body.append(el);
    el.render();
    expect(el.shadowRoot?.textContent).toContain('clé privée');
    expect(el.shadowRoot?.textContent).not.toContain('AAAA');
    el.remove();
  });
});
