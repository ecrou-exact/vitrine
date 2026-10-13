import { describe, expect, it } from 'vitest';
import {
  asciiChar,
  byteClass,
  decodeText,
  detectType,
  findBytes,
  formatBase64,
  formatHex,
  parseBase64,
  parseHex,
  queryBytes,
} from '../../src/components/hex/bytes.js';

const bytes = (/** @type {number[]} */ list) => Uint8Array.from(list);

describe('parseHex', () => {
  it('reads spaced, 0x and packed hex', () => {
    expect([...parseHex('48 65 6c')]).toEqual([0x48, 0x65, 0x6c]);
    expect([...parseHex('0x48, 0x65')]).toEqual([0x48, 0x65]);
    expect([...parseHex('48656c6c6f')]).toEqual([...new TextEncoder().encode('Hello')]);
  });

  it('reads hexdump -C and xxd output without offsets or text', () => {
    expect([...parseHex('00000000  48 65 6c 6c 6f  |Hello|')]).toEqual([
      0x48, 0x65, 0x6c, 0x6c, 0x6f,
    ]);
    expect([...parseHex('00000000: 4865 6c6c 6f  Hello')]).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  });
});

describe('decodeText', () => {
  it('detects hex and base64', () => {
    expect([...decodeText('de ad be ef')]).toEqual([0xde, 0xad, 0xbe, 0xef]);
    expect(new TextDecoder().decode(decodeText('SGVsbG8gd29ybGQ='))).toBe('Hello world');
    expect([...decodeText('dead', 'hex')]).toEqual([0xde, 0xad]);
  });

  it('rejects invalid base64', () => {
    expect(() => parseBase64('not base64!')).toThrow();
  });
});

describe('byte classes', () => {
  it('sorts bytes by kind', () => {
    expect([0, 0x0a, 0x41, 0x07, 0xff].map(byteClass)).toEqual([
      'null',
      'whitespace',
      'printable',
      'control',
      'high',
    ]);
    expect(asciiChar(0x41)).toBe('A');
    expect(asciiChar(0x00)).toBe('.');
  });
});

describe('detectType', () => {
  it('reads magic bytes', () => {
    expect(detectType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.name).toBe('PNG');
    expect(detectType(new TextEncoder().encode('%PDF-1.7'))?.name).toBe('PDF');
    expect(detectType(bytes([0x7f, 0x45, 0x4c, 0x46, 2]))?.name).toBe('ELF');
    expect(detectType(bytes([0x1f, 0x8b, 8]))?.name).toBe('GZIP');
    expect(detectType(bytes([1, 2, 3]))).toBeNull();
  });
});

describe('search', () => {
  it('turns queries into bytes', () => {
    expect([...queryBytes('de ad')]).toEqual([0xde, 0xad]);
    expect([...queryBytes('0xCAFE')]).toEqual([0xca, 0xfe]);
    expect(new TextDecoder().decode(queryBytes('"dead"'))).toBe('dead');
    expect(new TextDecoder().decode(queryBytes('PK'))).toBe('PK');
  });

  it('finds every occurrence, with a limit and case folding', () => {
    const data = new TextEncoder().encode('abcABCabc');
    expect(findBytes(data, new TextEncoder().encode('abc'))).toEqual([0, 6]);
    expect(findBytes(data, new TextEncoder().encode('abc'), { ignoreCase: true })).toEqual([
      0, 3, 6,
    ]);
    expect(findBytes(data, new TextEncoder().encode('abc'), { limit: 1 })).toEqual([0]);
  });
});

describe('formatting', () => {
  it('writes hex lines and base64', () => {
    expect(formatHex(bytes([1, 2, 3]), 2)).toBe('01 02\n03');
    expect(formatBase64(new TextEncoder().encode('Hello world'))).toBe('SGVsbG8gd29ybGQ=');
  });
});
