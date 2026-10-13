import { describe, expect, it } from 'vitest';
import { explain } from '../../src/components/regex/explain.js';
import {
  MAX_REGEX_MATCHES,
  cleanFlags,
  compile,
  isRisky,
  parsePattern,
  patternTokens,
  runMatches,
  toLiteral,
} from '../../src/components/regex/pattern.js';
import { VtRegex } from '../../src/components/regex/vt-regex.js';
import { translator } from '../../src/core/i18n.js';

if (!customElements.get('vt-regex')) customElements.define('vt-regex', VtRegex);

describe('cleanFlags and compile', () => {
  it('keeps known flags once, in order, with v over u', () => {
    expect(cleanFlags('gigx')).toBe('gi');
    expect(cleanFlags('uv')).toBe('v');
    expect(cleanFlags(null)).toBe('');
  });

  it('reports invalid patterns without throwing', () => {
    expect(compile('a(', 'g').regex).toBeNull();
    expect(compile('a(', 'g').error).not.toBe('');
    expect(compile('a+', 'g').regex).toBeInstanceOf(RegExp);
  });
});

describe('parsePattern', () => {
  it('reads groups, named groups, classes, quantifiers and anchors', () => {
    const { tree, groups } = parsePattern('^(?<user>[\\w.]+)@(\\w+)\\.(?:com|org)$');
    expect(groups).toBe(2);
    const kinds = patternTokens(tree).map((token) => token.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['anchor', 'group', 'class', 'quant', 'escape', 'alt']),
    );
  });

  it('pairs the parentheses of a group', () => {
    const tokens = patternTokens(parsePattern('(a(b))').tree).filter((t) => t.pair);
    expect(tokens.map((t) => t.pair)).toEqual([1, 2, 2, 1]);
  });

  it('keeps escaped characters apart from plain text', () => {
    const tokens = patternTokens(parsePattern('ab\\.c').tree);
    expect(tokens).toEqual([{ start: 2, end: 4, kind: 'escape' }]);
  });

  it('never throws on broken patterns', () => {
    for (const pattern of ['(', ')', '[', 'a{2', '\\', '(?<', '[a-']) {
      expect(() => parsePattern(pattern)).not.toThrow();
    }
  });
});

describe('isRisky', () => {
  it('flags repeated repetitions only', () => {
    expect(isRisky(parsePattern('(a+)+$').tree)).toBe(true);
    expect(isRisky(parsePattern('(\\w*)*').tree)).toBe(true);
    expect(isRisky(parsePattern('(ab)+c?').tree)).toBe(false);
    expect(isRisky(parsePattern('(a?)+').tree)).toBe(false);
  });
});

describe('runMatches', () => {
  it('returns matches with groups, offsets and names', () => {
    const regex = /** @type {RegExp} */ (compile('(?<k>\\w+)=(\\d+)', 'g').regex);
    const { matches } = runMatches(regex, 'a=1 b=22');
    expect(matches).toHaveLength(2);
    expect(matches[1]).toMatchObject({ index: 4, end: 8, text: 'b=22', groups: ['b', '22'] });
    expect(matches[1].ranges[1]).toEqual([6, 8]);
    expect(matches[0].named).toEqual({ k: 'a' });
  });

  it('stops after one match without g, and steps over empty matches', () => {
    expect(runMatches(/a/, 'aaa').matches).toHaveLength(1);
    expect(runMatches(/x*/g, 'abc').matches).toHaveLength(4);
    expect(runMatches(/(?:)/gu, '😀a').matches).toHaveLength(3);
  });

  it('caps the number of matches', () => {
    const result = runMatches(/./g, 'x'.repeat(MAX_REGEX_MATCHES + 50));
    expect(result.matches).toHaveLength(MAX_REGEX_MATCHES);
    expect(result.capped).toBe(true);
  });
});

describe('toLiteral', () => {
  it('escapes slashes outside classes and line breaks', () => {
    expect(toLiteral('a/b[/]', 'g')).toBe('/a\\/b[/]/g');
    expect(toLiteral('', '')).toBe('/(?:)/');
    expect(toLiteral('a\nb', 'm')).toBe('/a\\nb/m');
  });
});

describe('explain', () => {
  it('describes a pattern in plain words', () => {
    const t = translator('en');
    const lines = explain(parsePattern('^\\d{3}(-x)?$').tree, '^\\d{3}(-x)?$', '', t);
    const texts = lines.map((line) => line.text);
    expect(texts[0]).toBe('Start of the text');
    expect(texts[1]).toBe('A digit, exactly 3 times');
    expect(texts[2]).toBe('Repeated optional:');
    expect(lines[2].children[0].text).toBe('Capturing group 1');
    expect(texts[3]).toBe('End of the text');
  });

  it('speaks French', () => {
    const t = translator('fr');
    const [line] = explain(parsePattern('a+').tree, 'a+', '', t);
    expect(line.text).toBe('Le texte « a », une fois ou plus');
  });
});

describe('<vt-regex>', () => {
  it('marks matches and groups, and fires vt-match', async () => {
    const el = /** @type {VtRegex} */ (document.createElement('vt-regex'));
    el.setAttribute('pattern', '(\\w+)@(\\w+)');
    el.setAttribute('variant', 'full');
    let count = -1;
    el.addEventListener('vt-match', (event) => {
      count = /** @type {CustomEvent} */ (event).detail.count;
    });
    el.content = 'ada@home, alan@work';
    document.body.append(el);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = /** @type {ShadowRoot} */ (el.shadowRoot);
    expect(root.querySelectorAll('mark.re-match')).toHaveLength(2);
    expect(root.querySelectorAll('.re-group.g2')).toHaveLength(2);
    expect(root.querySelectorAll('.re-table tbody tr')).toHaveLength(2);
    expect(count).toBe(2);
    expect(el.results[1].groups).toEqual(['alan', 'work']);
    el.remove();
  });

  it('shows invalid patterns and does not run risky ones', async () => {
    const el = /** @type {VtRegex} */ (document.createElement('vt-regex'));
    el.setAttribute('pattern', '(a+)+$');
    el.content = 'aaaa';
    document.body.append(el);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = /** @type {ShadowRoot} */ (el.shadowRoot);
    expect(root.querySelector('.re-run')).not.toBeNull();
    expect(root.querySelectorAll('mark.re-match')).toHaveLength(0);
    /** @type {HTMLButtonElement} */ (root.querySelector('.re-run')).click();
    expect(root.querySelectorAll('mark.re-match')).toHaveLength(1);
    el.setAttribute('pattern', '(');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.textContent).toContain('Invalid pattern');
    el.remove();
  });
});
