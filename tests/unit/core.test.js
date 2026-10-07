import { afterEach, describe, expect, it, vi } from 'vitest';
import { configure, getConfig, resetConfig, DEFAULT_CONFIG } from '../../src/core/config.js';
import { readInlineContent, assertSize, VitrineError } from '../../src/core/content.js';
import { dedent } from '../../src/core/dom.js';
import { registerLocale, translator } from '../../src/core/i18n.js';
import { plainLines, splitLines } from '../../src/core/lines.js';
import { parseDiff } from '../../src/core/code-view.js';
import { resolveLanguage } from '../../src/core/highlighter.js';

afterEach(() => resetConfig());

describe('config', () => {
  it('validates and clamps values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    configure({
      maxSize: 10.9,
      theme: ' dark ',
      nope: 1,
      maxDepth: -1,
      highlightLimit: 'x',
      fetchTimeout: Infinity,
    });
    const config = getConfig();
    expect(config.maxSize).toBe(10);
    expect(config.theme).toBe('dark');
    expect(config.maxDepth).toBe(DEFAULT_CONFIG.maxDepth);
    expect(config.highlightLimit).toBe(DEFAULT_CONFIG.highlightLimit);
    expect(config.fetchTimeout).toBe(DEFAULT_CONFIG.fetchTimeout);
    expect(warn).toHaveBeenCalledTimes(4);
    warn.mockRestore();
  });
  it('caps values at hard ceilings', () => {
    configure({ maxSize: 1e12, maxDepth: 1e9 });
    expect(getConfig().maxSize).toBe(50 * 1024 * 1024);
    expect(getConfig().maxDepth).toBe(10_000);
  });
  it('returns frozen snapshots', () => {
    expect(Object.isFrozen(getConfig())).toBe(true);
    expect(configure(null)).toEqual(getConfig());
  });
});

describe('i18n', () => {
  it('translates with fallbacks and placeholders', () => {
    expect(translator('fr')('copy')).toBe('Copier');
    expect(translator('fr-CA')('copy')).toBe('Copier');
    expect(translator('xx')('copy')).toBe('Copy');
    expect(translator('en')('searchCount', { current: 2, total: 9 })).toBe('2 / 9');
    expect(translator('en')('searchCount', {})).toBe('{current} / {total}');
  });
  it('registers locales, ignoring unknown keys and non-strings', () => {
    registerLocale('de', { copy: 'Kopieren', evil: 'x', copied: 42 });
    const t = translator('de');
    expect(t('copy')).toBe('Kopieren');
    expect(t('copied')).toBe('Copied');
    expect(() => registerLocale('../x', {})).toThrow(TypeError);
  });
});

describe('dedent', () => {
  it('removes common indentation and blank edges', () => {
    expect(dedent('\n    a\n      b\n\n    c\n  ')).toBe('a\n  b\n\nc');
    expect(dedent('a\r\n  b')).toBe('a\n  b');
    expect(dedent('   ')).toBe('');
  });
});

describe('readInlineContent', () => {
  const host = (markup) => {
    const el = document.createElement('div');
    el.innerHTML = markup;
    return el;
  };
  it('prefers a template, then a data script, then text', () => {
    expect(readInlineContent(host('<template><b>x</b></template>text'))).toBe('<b>x</b>');
    expect(readInlineContent(host('<template>if (a &lt; b)</template>'))).toBe('if (a < b)');
    expect(readInlineContent(host('<script type="text/plain">a < b && c</script>'))).toBe(
      'a < b && c',
    );
    expect(readInlineContent(host('<script type="application/json">{"a":1}</script>'))).toBe(
      '{"a":1}',
    );
    expect(readInlineContent(host('\n   plain text\n'))).toBe('plain text');
    expect(readInlineContent(host(''))).toBe(null);
  });
  it('ignores executable scripts', () => {
    expect(readInlineContent(host('<script>evil()</script>'))).toBe('evil()');
  });
});

describe('assertSize', () => {
  it('throws a typed error above the limit', () => {
    expect(() => assertSize('abc', 3)).not.toThrow();
    try {
      assertSize('abcd', 3);
    } catch (error) {
      expect(error).toBeInstanceOf(VitrineError);
      expect(error.code).toBe('tooLarge');
      expect(error.params).toEqual({ size: 4, limit: 3 });
    }
  });
});

describe('lines', () => {
  it('splits highlighted code and re-opens spans on each line', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span class="hljs-comment">/* a\nb */</span> x\ny';
    const lines = splitLines(root).map((fragment) => {
      const div = document.createElement('div');
      div.append(fragment);
      return div.innerHTML;
    });
    expect(lines).toEqual([
      '<span class="hljs-comment">/* a</span>',
      '<span class="hljs-comment">b */</span> x',
      'y',
    ]);
  });
  it('splits plain text', () => {
    expect(plainLines('a\n\nb').map((f) => f.textContent)).toEqual(['a', '', 'b']);
  });
});

describe('parseDiff', () => {
  it('classifies unified diff lines', () => {
    const { kinds, code } = parseDiff([
      'diff --git a/x b/x',
      '--- a/x',
      '+++ b/x',
      '@@ -1 +1 @@',
      ' same',
      '-old',
      '+new',
      'raw',
    ]);
    expect(kinds).toEqual([
      'meta',
      'meta',
      'meta',
      'hunk',
      'context',
      'removed',
      'added',
      'context',
    ]);
    expect(code.slice(4)).toEqual(['same', 'old', 'new', 'raw']);
  });
});

describe('resolveLanguage', () => {
  it('maps names and aliases, and rejects anything else', () => {
    expect(resolveLanguage('JS')).toBe('javascript');
    expect(resolveLanguage('html')).toBe('xml');
    expect(resolveLanguage('py')).toBe('python');
    expect(resolveLanguage('text')).toBe('plaintext');
    expect(resolveLanguage('rust')).toBe('rust');
    for (const bad of [
      '../../evil',
      'https://x/y',
      'javascript:alert(1)',
      '',
      'x'.repeat(100),
      null,
      '__proto__',
      'constructor',
    ]) {
      expect(resolveLanguage(bad), String(bad)).toBe(null);
    }
  });
});
