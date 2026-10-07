import { describe, expect, it } from 'vitest';
import { linePairs, mapLine } from '../../src/components/diff/sync.js';
import {
  diffSequences,
  diffTexts,
  foldLines,
  parsePatch,
  toPatch,
  wordRanges,
} from '../../src/components/diff/diff.js';

/** Applies an edit script to `a` and returns the result. */
function apply(a, b, ops) {
  const out = [];
  for (const op of ops) {
    if (op.type === 'equal') {
      expect(a[op.a]).toBe(b[op.b]);
      out.push(a[op.a]);
    } else if (op.type === 'insert') out.push(b[op.b]);
  }
  return out;
}

describe('diffSequences', () => {
  it('produces a valid, minimal edit script on random inputs', () => {
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let run = 0; run < 300; run += 1) {
      const a = Array.from({ length: Math.floor(random() * 40) }, () => Math.floor(random() * 6));
      const b = Array.from({ length: Math.floor(random() * 40) }, () => Math.floor(random() * 6));
      const { ops, simplified } = diffSequences(a, b);
      expect(simplified).toBe(false);
      expect(apply(a, b, ops)).toEqual(b);
      // Every element of a is either kept or deleted exactly once.
      expect(ops.filter((op) => op.type !== 'insert').length).toBe(a.length);
      expect(ops.filter((op) => op.type !== 'delete').length).toBe(b.length);
    }
  });
  it('is minimal on a known case', () => {
    const { ops } = diffSequences([...'ABCABBA'], [...'CBABAC']);
    expect(ops.filter((op) => op.type !== 'equal').length).toBe(5);
  });
  it('simplifies beyond the cost limit instead of running forever', () => {
    const a = Array.from({ length: 5000 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 5000 }, (_, i) => `b${i}`);
    const start = performance.now();
    const { ops, simplified } = diffSequences(a, b, 100);
    expect(simplified).toBe(true);
    expect(apply(a, b, ops)).toEqual(b);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe('diffTexts and patches', () => {
  const original =
    'line1\nline2\nfunction area(r) {\n  return 3.14 * r * r;\n}\nline6\nline7\nline8\nline9\nend\n';
  const modified =
    'line1\nline2\nfunction area(r) {\n  return Math.PI * r ** 2;\n}\nline6\nline7\nline8\nline9\nend\nadded\n';

  it('numbers lines on both sides', () => {
    const { lines } = diffTexts(original, modified);
    const changed = lines
      .filter((l) => l.type !== 'context')
      .map((l) => [l.type, l.oldNo, l.newNo]);
    expect(changed).toEqual([
      ['delete', 4, null],
      ['insert', null, 4],
      ['insert', null, 11],
    ]);
  });
  it('writes a unified patch and reads it back', () => {
    const { lines } = diffTexts(original, modified);
    const patch = toPatch(lines, { originalName: 'a/x.js', modifiedName: 'b/x.js' });
    // The changes are 5 lines apart: with 3 lines of context the hunks merge, like git.
    expect(patch.startsWith('--- a/x.js\n+++ b/x.js\n@@ -1,10 +1,11 @@\n')).toBe(true);
    expect(patch.match(/^@@/gm)).toHaveLength(1);
    const back = parsePatch(patch);
    expect(back.originalName).toBe('a/x.js');
    expect(back.lines.filter((l) => l.type !== 'context').map((l) => l.text)).toEqual([
      '  return 3.14 * r * r;',
      '  return Math.PI * r ** 2;',
      'added',
    ]);
  });
  it('returns an empty patch when nothing changed', () => {
    expect(
      toPatch(diffTexts('a\nb\n', 'a\nb\n').lines, { originalName: 'a', modifiedName: 'b' }),
    ).toBe('');
  });
});

describe('word ranges', () => {
  it('marks only changed words of related lines', () => {
    const [left, right] = wordRanges('  return 2 * 3.14 * r;', '  return 2 * Math.PI * r;');
    expect(left.map(([s, e]) => '  return 2 * 3.14 * r;'.slice(s, e))).toEqual(['3', '14']);
    expect(right.map(([s, e]) => '  return 2 * Math.PI * r;'.slice(s, e))).toEqual(['Math', 'PI']);
  });
  it('does not mark unrelated lines', () => {
    expect(wordRanges("import { PI } from './math.js';", 'export function area(radius) {')).toEqual(
      [[], []],
    );
  });
});

describe('foldLines', () => {
  it('keeps context around changes and folds the rest', () => {
    const lines = Array.from({ length: 20 }, (_, i) => ({
      type: i === 10 ? 'insert' : 'context',
      oldNo: i,
      newNo: i,
      text: String(i),
    }));
    const rows = foldLines(lines, 2, new Set());
    expect(rows.map((r) => (r.type === 'fold' ? `[${r.count}]` : r.line.text)).join(' ')).toBe(
      '[8] 8 9 10 11 12 [7]',
    );
    expect(foldLines(lines, -1, new Set()).length).toBe(20);
    expect(foldLines(lines, 2, new Set([0])).filter((r) => r.type === 'fold').length).toBe(1);
  });
});

describe('scroll sync line mapping', () => {
  const lines = diffTexts('a\nb\nc\nd\n', 'a\nx\ny\nz\nb\nd\n').lines;

  it('pairs unchanged lines and both ends', () => {
    expect(linePairs(lines)).toEqual([
      [1, 1],
      [2, 5],
      [4, 6],
      [5, 7],
    ]);
  });

  it('maps unchanged lines exactly, both ways', () => {
    const pairs = linePairs(lines);
    expect(mapLine(pairs, 2, 0)).toBe(5);
    expect(mapLine(pairs, 5, 1)).toBe(2);
    expect(mapLine(pairs, 6, 1)).toBe(4);
  });

  it('spreads a one-sided block over the space it takes on the other side', () => {
    const pairs = linePairs(lines);
    // Added lines 2 to 4 sit between original lines 1 and 2.
    expect(mapLine(pairs, 3, 1)).toBe(1.5);
    // Removed line 3 sits between modified lines 5 and 6.
    expect(mapLine(pairs, 3, 0)).toBe(5.5);
  });
});
