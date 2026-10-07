import { describe, expect, it, vi } from 'vitest';
import {
  BUILT_IN_THEMES,
  COLOR_TOKENS,
  getTheme,
  isSafeTokenValue,
  listThemes,
  parseThemeCss,
  registerTheme,
  resolveTheme,
} from '../../src/core/themes.js';
import { configure, resetConfig } from '../../src/core/config.js';

/** @param {string} hex */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2 contrast ratio. */
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Text roles and the surfaces they are drawn on. */
const TEXT_ON = {
  'surface-sunken': [
    'fg',
    'fg-muted',
    'syntax-keyword',
    'syntax-string',
    'syntax-number',
    'syntax-function',
    'syntax-type',
    'syntax-comment',
    'syntax-attr',
    'syntax-tag',
    'syntax-meta',
  ],
  surface: ['fg', 'fg-muted', 'accent-fg', 'success', 'warning', 'danger', 'info'],
  bg: ['fg', 'fg-muted'],
};

describe('built-in themes', () => {
  it('ships the documented themes', () => {
    expect(BUILT_IN_THEMES).toEqual(['light', 'dark', 'dim', 'paper', 'high-contrast']);
  });

  for (const name of BUILT_IN_THEMES) {
    describe(name, () => {
      const theme = getTheme(name);

      it('defines every color token', () => {
        expect(Object.keys(theme.tokens).sort()).toEqual([...COLOR_TOKENS].sort());
      });

      for (const [surface, roles] of Object.entries(TEXT_ON)) {
        for (const role of roles) {
          it(`${role} on ${surface} meets WCAG AA (4.5:1)`, () => {
            const ratio = contrast(theme.tokens[role], theme.tokens[surface]);
            expect(
              ratio,
              `${name}: ${role} ${theme.tokens[role]} on ${theme.tokens[surface]}`,
            ).toBeGreaterThanOrEqual(4.5);
          });
        }
      }

      it('on-accent text on accent fills meets WCAG AA', () => {
        expect(contrast(theme.tokens['on-accent'], theme.tokens.accent)).toBeGreaterThanOrEqual(
          4.5,
        );
      });
    });
  }

  it('high-contrast theme reaches AAA (7:1) for body text and code', () => {
    const { tokens } = getTheme('high-contrast');
    for (const role of TEXT_ON['surface-sunken']) {
      expect(contrast(tokens[role], tokens['surface-sunken']), role).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('parseThemeCss', () => {
  it('reads the name, color scheme and tokens', () => {
    const { name, definition } = parseThemeCss(
      "[data-theme='demo'] { color-scheme: dark; --vt-fg: #fff; --vt-bg: rgba(0, 0, 0, 0.5); }",
    );
    expect(name).toBe('demo');
    expect(definition).toEqual({
      colorScheme: 'dark',
      tokens: { fg: '#fff', bg: 'rgba(0, 0, 0, 0.5)' },
    });
  });

  it('rejects a file without a theme selector', () => {
    expect(() => parseThemeCss(':root { --vt-fg: red; }')).toThrow();
  });
});

describe('registerTheme', () => {
  it('extends a base theme and only overrides valid tokens', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerTheme('brand', {
      extends: 'dark',
      tokens: { accent: '#7c9cff', '--vt-fg': '#ffffff', nope: 'red' },
    });
    const theme = getTheme('brand');
    expect(theme.colorScheme).toBe('dark');
    expect(theme.tokens.accent).toBe('#7c9cff');
    expect(theme.tokens.fg).toBe('#ffffff');
    expect(theme.tokens.bg).toBe(getTheme('dark').tokens.bg);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('nope'));
    expect(listThemes()).toContain('brand');
    warn.mockRestore();
  });

  it('refuses invalid or reserved names', () => {
    for (const name of ['auto', 'Brand', '1x', 'a b', 'x"]{}', '', 'a'.repeat(41)]) {
      expect(() => registerTheme(name, {}), name).toThrow(TypeError);
    }
  });

  it('refuses an unknown base theme', () => {
    expect(() => registerTheme('orphan', { extends: 'missing' })).toThrow(TypeError);
  });

  it('ignores values that could inject CSS or load resources', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hostile = [
      'red; } :host { display: none',
      'url(https://evil.example/x.png)',
      'image-set("x.png" 1x)',
      '@import "x"',
      'red</style><script>',
      'expression(alert(1))',
      'x'.repeat(201),
      '',
    ];
    registerTheme('hostile', {
      tokens: Object.fromEntries(hostile.map((v, i) => [COLOR_TOKENS[i], v])),
    });
    const { tokens } = getTheme('hostile');
    hostile.forEach((value, i) => expect(tokens[COLOR_TOKENS[i]]).not.toBe(value));
    warn.mockRestore();
  });
});

describe('isSafeTokenValue', () => {
  it('accepts colors and shadows', () => {
    for (const value of [
      '#fff',
      'rgb(1 2 3 / 50%)',
      'rgba(0,0,0,.4)',
      'oklch(70% 0.1 200)',
      '0 8px 24px rgba(0,0,0,.4)',
      'transparent',
    ]) {
      expect(isSafeTokenValue(value), value).toBe(true);
    }
  });
});

describe('resolveTheme', () => {
  it('uses the attribute when it names a known theme', () => {
    expect(resolveTheme('paper')).toBe('paper');
    expect(resolveTheme(' DARK ')).toBe('dark');
  });

  it('falls back to the configured theme, then auto', () => {
    configure({ theme: 'dim' });
    expect(resolveTheme('unknown')).toBe('dim');
    expect(resolveTheme(null)).toBe('dim');
    resetConfig();
    expect(['light', 'dark']).toContain(resolveTheme('unknown'));
  });

  it('auto uses the configured light / dark pair', () => {
    configure({ lightTheme: 'paper', darkTheme: 'high-contrast' });
    expect(['paper', 'high-contrast']).toContain(resolveTheme('auto'));
    resetConfig();
  });
});
