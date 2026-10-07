import { describe, expect, it } from 'vitest';
import {
  filterOptions,
  normalizeList,
  normalizeTag,
  parseTagsJson,
  safeColor,
  serialize,
  slug,
  splitInput,
  tagKey,
} from '../../src/components/tags/model.js';

describe('normalizeTag', () => {
  it('accepts strings, numbers and objects', () => {
    expect(normalizeTag(' design ')).toEqual({ value: 'design', label: 'design' });
    expect(normalizeTag(42)).toEqual({ value: '42', label: '42' });
    expect(normalizeTag({ label: 'Only label' })).toEqual({
      value: 'Only label',
      label: 'Only label',
    });
  });
  it('drops empty and invalid entries', () => {
    for (const bad of [null, undefined, '', '   ', {}, [], { color: 'red' }, true])
      expect(normalizeTag(bad), String(bad)).toBe(null);
  });
  it('validates every optional field', () => {
    const tag = normalizeTag({
      value: 'x\u0000y',
      kind: 'Danger Zone!',
      href: 'javascript:alert(1)',
      count: Infinity,
      disabled: 'yes',
      description: 'd'.repeat(1000),
    });
    expect(tag).toEqual({
      value: 'x y',
      label: 'x y',
      kind: 'danger-zone',
      description: 'd'.repeat(300),
    });
  });
  it('keeps safe links', () => {
    expect(normalizeTag({ value: 'a', href: '/docs' }).href).toBe('/docs');
    expect(normalizeTag({ value: 'a', href: 'https://x.example' }).href).toBe('https://x.example');
  });
});

describe('safeColor', () => {
  it('refuses anything that is not a plain color', () => {
    for (const bad of [
      'red; background: url(x)',
      'url(x)',
      'var(--x)',
      'expression(alert(1))',
      '<script>',
      'x'.repeat(100),
      42,
    ]) {
      expect(safeColor(bad), String(bad)).toBe(undefined);
    }
  });
});

describe('lists and keys', () => {
  it('removes duplicates (case-insensitive by default) and caps lists', () => {
    expect(normalizeList(['A', 'a', 'b'], false).map((t) => t.value)).toEqual(['A', 'b']);
    expect(normalizeList(['A', 'a'], true).length).toBe(2);
    expect(normalizeList('not an array', false)).toEqual([]);
  });
  it('compares values after Unicode normalization', () => {
    // "é" as one character or as "e" + combining accent is the same tag.
    expect(tagKey('Café', false)).toBe(tagKey('Cafe\u0301', false));
  });
  it('makes safe part names', () => {
    expect(slug('Été / Ünïcode Tag!!')).toBe('ete-unicode-tag');
    expect(slug('"><script>')).toBe('script');
  });
});

describe('parseTagsJson', () => {
  it('reads an array or an object with value and options', () => {
    expect(parseTagsJson('["a"]', false).value.map((t) => t.value)).toEqual(['a']);
    const data = parseTagsJson('{"value":["a"],"options":["a","b"]}', false);
    expect(data.options.map((t) => t.value)).toEqual(['a', 'b']);
    expect(parseTagsJson('  ', false)).toEqual({ value: [], options: [] });
  });
  it('throws on invalid JSON or shapes', () => {
    expect(() => parseTagsJson('{oops', false)).toThrow();
    expect(() => parseTagsJson('42', false)).toThrow();
  });
});

describe('splitInput', () => {
  it('splits on separators', () => {
    expect(splitInput('front end, back-end;ops', { separators: ',;', prefix: '' })).toEqual([
      'front end',
      'back-end',
      'ops',
    ]);
  });
  it('handles a prefix: it starts tags and whitespace separates them', () => {
    expect(splitInput('#design #ux, research\n#a11y', { separators: ',;', prefix: '#' })).toEqual([
      'design',
      'ux',
      'research',
      'a11y',
    ]);
  });
  it('escapes regular expression characters in separators', () => {
    expect(splitInput('a]b^c', { separators: ']^', prefix: '' })).toEqual(['a', 'b', 'c']);
  });
});

describe('serialize and filter', () => {
  it('serializes as JSON, CSV or lines', () => {
    const tags = [{ value: 'a,b' }, { value: 'say "hi"' }];
    expect(serialize(tags, 'json')).toBe('["a,b","say \\"hi\\""]');
    expect(serialize(tags, 'csv')).toBe('"a,b","say ""hi"""');
    expect(serialize(tags, 'lines')).toBe('a,b\nsay "hi"');
  });
  it('ranks labels starting with the query first and counts all matches', () => {
    const options = ['preact', 'react', 'vue', 'reactive'].map((v) => ({ value: v, label: v }));
    const { tags, total } = filterOptions(options, 'react', 10);
    expect(tags.map((t) => t.value)).toEqual(['react', 'reactive', 'preact']);
    expect(total).toBe(3);
  });
});
