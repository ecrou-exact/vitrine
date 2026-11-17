import { describe, expect, it } from 'vitest';
import {
  digestAll,
  formatDigest,
  md5,
  parseAlgorithms,
  parseFingerprint,
  toHex,
  verify,
} from '../../src/components/hash/hash.js';
import { VtHash } from '../../src/components/hash/vt-hash.js';
import { hashFromData } from '../../src/core/data-formats.js';

const bytes = (/** @type {string} */ text) => new TextEncoder().encode(text);
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('digests', () => {
  it('computes MD5 (RFC 1321 vectors)', () => {
    expect(toHex(md5(bytes('')))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(toHex(md5(bytes('abc')))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(toHex(md5(bytes('12345678901234567890123456789012345678901234567890123456789012345678901234567890')))).toBe('57edf4a22be3c955ac49da2e2107b67a'); // prettier-ignore
  });

  it('computes SHA digests and formats them', async () => {
    const d = await digestAll(bytes('abc'), ['sha1', 'sha256', 'sha384']);
    expect(toHex(/** @type {Uint8Array} */ (d.sha1))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d'); // prettier-ignore
    expect(toHex(/** @type {Uint8Array} */ (d.sha256))).toBe(ABC_SHA256);
    expect(formatDigest('sha384', /** @type {Uint8Array} */ (d.sha384), 'sri')).toBe('sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn'); // prettier-ignore
    expect(formatDigest('sha256', /** @type {Uint8Array} */ (d.sha256), 'upper')).toBe(ABC_SHA256.toUpperCase()); // prettier-ignore
  });
});

describe('fingerprints', () => {
  it('reads the usual forms', () => {
    expect(parseFingerprint(ABC_SHA256)?.algorithms).toEqual(['sha256']);
    expect(parseFingerprint(`sha256:${ABC_SHA256}`)?.algorithms).toEqual(['sha256']);
    expect(parseFingerprint(`${ABC_SHA256}  file.txt`)?.algorithms).toEqual(['sha256']);
    expect(parseFingerprint(`SHA256 (abc.txt) = ${ABC_SHA256}`)?.algorithms).toEqual(['sha256']);
    expect(parseFingerprint('BA:78:16:BF:8F:01:CF:EA:41:41:40:DE:5D:AE:22:23:B0:03:61:A3:96:17:7A:9C:B4:10:FF:61:F2:00:15:AD')?.bytes.length).toBe(32); // prettier-ignore
    expect(parseFingerprint('sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=')?.algorithms).toEqual(['sha256']); // prettier-ignore
    expect(parseFingerprint('hello')).toBeNull();
    expect(parseFingerprint(`md5:${ABC_SHA256}`)).toBeNull();
  });

  it('compares with the computed digests', async () => {
    const d = await digestAll(bytes('abc'), ['md5', 'sha256']);
    expect(verify(ABC_SHA256, d)).toEqual({ state: 'match', algorithm: 'sha256' });
    expect(verify(ABC_SHA256.replace(/d$/, 'e'), d)).toEqual({ state: 'mismatch', algorithm: 'sha256' }); // prettier-ignore
    expect(verify('a'.repeat(128), d)).toEqual({ state: 'unknown', algorithm: 'sha512' });
    expect(verify('zz', d)).toEqual({ state: 'invalid' });
    expect(verify(' ', d)).toEqual({ state: 'empty' });
  });

  it('reads the algorithms attribute and JSON', () => {
    expect(parseAlgorithms('SHA-256, sha512')).toEqual(['sha256', 'sha512']);
    expect(parseAlgorithms('nope')).toHaveLength(5);
    expect(hashFromData({ text: 'abc', sha256: ABC_SHA256 })).toEqual({ content: 'abc', attributes: { expected: ABC_SHA256 } }); // prettier-ignore
  });
});

describe('<vt-hash>', () => {
  if (!customElements.get('vt-hash')) customElements.define('vt-hash', VtHash);

  /** @param {VtHash} el */
  const settled = (el) => new Promise((resolve) => el.addEventListener('vt-hash', resolve, { once: true })); // prettier-ignore

  it('hashes the text and compares it', async () => {
    const el = /** @type {VtHash} */ (document.createElement('vt-hash'));
    el.setAttribute('lang-ui', 'en');
    el.setAttribute('expected', ABC_SHA256);
    el.content = 'abc';
    const done = settled(el);
    /** @type {string[]} */
    const states = [];
    el.addEventListener('vt-verify', (e) => states.push(/** @type {CustomEvent} */ (e).detail.state)); // prettier-ignore
    document.body.append(el);
    await done;
    expect(el.hashes?.sha256).toBe(ABC_SHA256);
    const root = el.root;
    expect(root.querySelector('[data-algorithm="md5"] .hash-value')?.textContent).toBe('900150983cd24fb0d6963f7d28e17f72'); // prettier-ignore
    expect(root.querySelector('.hash-result')?.textContent).toBe('Matches the SHA-256.');
    expect(states).toEqual(['match']);
    const input = /** @type {HTMLInputElement} */ (root.querySelector('.hash-input'));
    input.value = 'f'.repeat(64);
    input.dispatchEvent(new Event('input'));
    expect(root.querySelector('.hash-result')?.textContent).toContain('Does not match');
    el.remove();
  });

  it('hashes a file', async () => {
    const el = /** @type {VtHash} */ (document.createElement('vt-hash'));
    el.setAttribute('algorithms', 'sha256');
    document.body.append(el);
    const done = settled(el);
    el.file = new File(['abc'], 'abc.txt', { type: 'text/plain' });
    const detail = /** @type {CustomEvent} */ (await done).detail;
    expect(detail).toMatchObject({ source: 'file', name: 'abc.txt', size: 3, hashes: { sha256: ABC_SHA256 } }); // prettier-ignore
    expect(el.root.querySelector('.hash-name')?.textContent).toBe('abc.txt');
    el.remove();
  });
});
