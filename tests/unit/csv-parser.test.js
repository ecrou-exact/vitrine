import { describe, expect, it } from 'vitest';
import {
  MAX_COLUMNS,
  detectDelimiter,
  inferType,
  parseCsv,
  sortKey,
  toCsv,
} from '../../src/components/csv/parser.js';

describe('parseCsv', () => {
  it('follows RFC 4180: quotes, doubled quotes, line breaks in quotes, CRLF', () => {
    const { rows, error } = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n"multi\nline",z\n');
    expect(error).toBe(null);
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['multi\nline', 'z'],
    ]);
  });
  it('detects the delimiter', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(detectDelimiter('a|b|c\n1|2|3')).toBe('|');
    expect(detectDelimiter('name;note\nx;"a, b, c, d"')).toBe(';');
  });
  it('reports an unclosed quote with its line, and keeps the rows', () => {
    const { rows, error } = parseCsv('a,b\n1,2\n"open,3\n4,5');
    expect(error).toEqual({ message: 'Unclosed quoted field', line: 3 });
    expect(rows.length).toBe(3);
  });
  it('strips a byte order mark and keeps empty cells', () => {
    expect(parseCsv('﻿a,b\n,\n').rows).toEqual([
      ['a', 'b'],
      ['', ''],
    ]);
  });
  it('caps the number of columns', () => {
    const result = parseCsv(Array.from({ length: MAX_COLUMNS + 50 }, (_, i) => i).join(','));
    expect(result.columns).toBe(MAX_COLUMNS);
    expect(result.truncatedColumns).toBe(true);
  });
  it('parses large files quickly', () => {
    const big = Array.from({ length: 100_000 }, (_, i) => `${i},"name, ${i}",x`).join('\n');
    const start = performance.now();
    expect(parseCsv(big).rows.length).toBe(100_000);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});

describe('types and sorting', () => {
  it('infers column types', () => {
    expect(inferType([['1 000'], ['-2.5'], ['3e2'], ['']], 0)).toBe('number');
    expect(inferType([['2024-01-02'], ['2023-12-31T10:00:00Z']], 0)).toBe('date');
    expect(inferType([['true'], ['No']], 0)).toBe('boolean');
    expect(inferType([['1'], ['x']], 0)).toBe('text');
    expect(inferType([[''], ['']], 0)).toBe('text');
  });
  it('builds sort keys per type', () => {
    expect(sortKey('1,234.5', 'number')).toBe(1234.5);
    expect(sortKey('2024-01-02', 'date')).toBe(Date.parse('2024-01-02'));
    expect(sortKey(' Abc ', 'text')).toBe('abc');
  });
});

describe('toCsv', () => {
  it('quotes only when needed and round-trips', () => {
    const rows = [
      ['a', 'b,c', 'say "hi"'],
      ['multi\nline', '', 'x'],
    ];
    const text = toCsv(rows, ',');
    expect(text).toBe('a,"b,c","say ""hi"""\n"multi\nline",,x');
    expect(parseCsv(text, { delimiter: ',' }).rows).toEqual(rows);
  });
});
