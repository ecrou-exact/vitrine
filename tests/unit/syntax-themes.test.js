import { describe, expect, it } from 'vitest';
import { listSyntaxThemes, resolveSyntaxTheme } from '../../src/core/syntax-themes.js';

describe('syntax themes', () => {
  it('lists the converted highlight.js themes', () => {
    const themes = listSyntaxThemes();
    expect(themes.length).toBeGreaterThan(250);
    expect(themes).toContain('github-dark');
    expect(themes).toContain('base16-dracula');
  });
  it('resolves names and refuses anything else', () => {
    expect(resolveSyntaxTheme(' GitHub-Dark ')).toBe('github-dark');
    expect(resolveSyntaxTheme('base16/dracula')).toBe('base16-dracula');
    for (const bad of [
      '../../evil',
      'https://evil.example/x',
      'nope',
      '__proto__',
      '',
      null,
      'a'.repeat(100),
    ]) {
      expect(resolveSyntaxTheme(bad), String(bad)).toBe(null);
    }
  });
});
