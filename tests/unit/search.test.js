import { describe, expect, it } from 'vitest';
import {
  MAX_MATCHES,
  TextSearch,
  combineSearches,
  escapeRegExp,
  findMatches,
} from '../../src/core/search.js';

const container = (markup) => {
  const div = document.createElement('div');
  // Test fixture only: trusted, static markup.
  div.innerHTML = markup;
  return div;
};

describe('findMatches', () => {
  it('finds literal, case-insensitive matches', () => {
    expect(findMatches('a.b A.B axb', 'a.b').starts).toEqual([0, 4]);
    expect(findMatches('((((', '((').starts).toEqual([0, 2]);
  });
  it('caps the number of matches', () => {
    const result = findMatches('a'.repeat(MAX_MATCHES + 10), 'a');
    expect(result.starts.length).toBe(MAX_MATCHES);
    expect(result.capped).toBe(true);
  });
  it('escapes regular expression syntax', () => {
    expect(escapeRegExp('a+b*(c)[d]{e}|^$\\')).toBe('a\\+b\\*\\(c\\)\\[d\\]\\{e\\}\\|\\^\\$\\\\');
  });
});

describe('TextSearch', () => {
  it('wraps matches spanning several text nodes and restores the DOM', () => {
    const root = container('<span class="k">con</span><span>st</span> x = 1; const');
    const original = root.innerHTML;
    const search = new TextSearch(root);
    const result = search.run('const');
    expect(result).toEqual({ total: 2, capped: false });
    expect(root.querySelectorAll('mark').length).toBe(3);
    expect(search.go(0).textContent).toBe('con');
    expect(root.querySelectorAll('mark.current').length).toBe(2);
    search.go(1);
    expect(root.querySelectorAll('mark.current').length).toBe(1);
    search.clear();
    expect(root.innerHTML).toBe(original);
  });
  it('wraps around when navigating', () => {
    const search = new TextSearch(container('a a a'));
    search.run('a');
    search.go(5);
    expect(search.current).toBe(2);
    search.go(-1);
    expect(search.current).toBe(2);
  });
  it('treats queries as text, never as markup or patterns', () => {
    const root = container('<b>x</b> .* <i>');
    const search = new TextSearch(root);
    expect(search.run('.*').total).toBe(1);
    expect(search.run('<b>').total).toBe(0);
  });
  it('skips excluded subtrees', () => {
    const search = new TextSearch(container('<span class="skip">hit</span> hit'), {
      skip: '.skip',
    });
    expect(search.run('hit').total).toBe(1);
  });
});

describe('combineSearches', () => {
  it('numbers matches pane after pane', () => {
    const a = container('x x');
    const b = container('x');
    const searches = [new TextSearch(a), new TextSearch(b)];
    const revealed = [];
    const combined = combineSearches(searches, (mark) => revealed.push(mark));
    expect(combined.run('x').total).toBe(3);
    combined.go(2);
    expect(b.querySelector('mark.current')).not.toBe(null);
    expect(a.querySelector('mark.current')).toBe(null);
    combined.clear();
    expect(a.querySelector('mark')).toBe(null);
  });
});
