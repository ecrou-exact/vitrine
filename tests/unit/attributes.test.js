import { describe, expect, it } from 'vitest';
import {
  cleanFileName,
  cleanLabel,
  inRanges,
  parseBoolean,
  parseCssLength,
  parseEnum,
  parseInteger,
  parseList,
  parseRanges,
} from '../../src/core/attributes.js';

describe('parseBoolean', () => {
  it('maps absent to null and common spellings to booleans', () => {
    expect(parseBoolean(null)).toBe(null);
    for (const v of ['', 'true', 'on', 'yes', 'line-numbers', 'anything'])
      expect(parseBoolean(v), v).toBe(true);
    for (const v of ['false', 'FALSE', ' off ', 'no', '0']) expect(parseBoolean(v), v).toBe(false);
  });
});

describe('parseInteger', () => {
  const opts = { min: -10, max: 100, fallback: 1 };
  it('parses and clamps integers', () => {
    expect(parseInteger('42', opts)).toBe(42);
    expect(parseInteger(' +7 ', opts)).toBe(7);
    expect(parseInteger('-50', opts)).toBe(-10);
    expect(parseInteger('1000', opts)).toBe(100);
  });
  it('falls back on garbage, floats, huge and unsafe values', () => {
    for (const v of [
      null,
      '',
      'abc',
      '1.5',
      '1e3',
      '0x10',
      '9'.repeat(40),
      '99999999999999999999',
      'NaN',
      'Infinity',
    ]) {
      expect(parseInteger(v, opts), String(v)).toBe(1);
    }
  });
});

describe('parseEnum / parseList', () => {
  it('accepts only allowed values', () => {
    expect(parseEnum(' FULL ', ['simple', 'full'], 'simple')).toBe('full');
    expect(parseEnum('evil', ['simple', 'full'], 'simple')).toBe('simple');
    expect(parseEnum(null, ['a'], 'a')).toBe('a');
  });
  it('keeps order, drops unknown and duplicates', () => {
    expect(parseList('source, preview,source, evil', ['preview', 'source', 'split'])).toEqual([
      'source',
      'preview',
    ]);
    expect(parseList('evil', ['a'])).toBe(null);
    expect(parseList('a,'.repeat(10_000), ['a'])).toBe(null);
  });
});

describe('parseRanges / inRanges', () => {
  it('parses, sorts and merges ranges', () => {
    expect(parseRanges('8-5, 2,3, 10-12,11-20')).toEqual([
      [2, 3],
      [5, 8],
      [10, 20],
    ]);
  });
  it('ignores invalid parts', () => {
    expect(parseRanges('a, -3, 1--2, 4-, , 7')).toEqual([[7, 7]]);
  });
  it('never expands huge ranges', () => {
    const ranges = parseRanges('1-999999999');
    expect(ranges).toEqual([[1, 999999999]]);
    expect(inRanges(123456789, ranges)).toBe(true);
    expect(inRanges(0, ranges)).toBe(false);
  });
  it('caps the number of ranges', () => {
    const many = Array.from({ length: 5000 }, (_, i) => String(i * 3)).join(',');
    expect(parseRanges(many).length).toBeLessThanOrEqual(500);
  });
  it('finds membership with binary search', () => {
    const ranges = parseRanges('2,5-8,20');
    expect([1, 2, 3, 5, 8, 9, 20, 21].map((n) => inRanges(n, ranges))).toEqual([
      false,
      true,
      false,
      true,
      true,
      false,
      true,
      false,
    ]);
  });
});

describe('parseCssLength', () => {
  it('accepts plain lengths only', () => {
    expect(parseCssLength('400px')).toBe('400px');
    expect(parseCssLength(' 50VH ')).toBe('50vh');
    expect(parseCssLength('12.5rem')).toBe('12.5rem');
    for (const v of [
      '400',
      'calc(100% - 1px)',
      'var(--x)',
      'red',
      '1px; color: red',
      'url(x)',
      '-10px',
      '9999999px',
      null,
    ]) {
      expect(parseCssLength(v), String(v)).toBe(null);
    }
  });
});

describe('cleanLabel / cleanFileName', () => {
  it('removes control characters, collapses spaces and caps length', () => {
    // Control characters are removed; other invisible characters (U+202E) are kept as text.
    expect(cleanLabel(' a\u0000b \n\t c\u202e ')).toBe('ab c\u202e');
    expect(cleanLabel('x'.repeat(1_000_000)).length).toBe(200);
    expect(cleanLabel(null)).toBe('');
  });
  it('produces safe file names', () => {
    expect(cleanFileName('../../etc/passwd', 'f.txt')).toBe('passwd');
    expect(cleanFileName('C:\\Windows\\evil.bat', 'f.txt')).toBe('evil.bat');
    expect(cleanFileName('a<b>:c"|?*.js', 'f.txt')).toBe('abc.js');
    expect(cleanFileName('...', 'f.txt')).toBe('f.txt');
    expect(cleanFileName('.hidden', 'f.txt')).toBe('hidden');
    expect(cleanFileName(null, 'f.txt')).toBe('f.txt');
    expect(cleanFileName('x'.repeat(500) + '.js', 'f.txt').length).toBe(120);
  });
});
