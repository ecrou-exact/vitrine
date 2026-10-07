// @ts-check
/**
 * Theme registry.
 *
 * Built-in themes are plain CSS files of `--vt-*` tokens (see `src/styles/themes/`).
 * Each theme becomes a rule on the internal container:
 *
 *     .vt[data-theme="dark"] { --_fg: var(--vt-fg, #e8eae6); … }
 *
 * so a public `--vt-*` variable set by the host page (on the element or any ancestor)
 * always wins over the theme value.
 *
 * @module core/themes
 */
import light from '../styles/themes/light.css?raw';
import dark from '../styles/themes/dark.css?raw';
import dim from '../styles/themes/dim.css?raw';
import paper from '../styles/themes/paper.css?raw';
import highContrast from '../styles/themes/high-contrast.css?raw';
import { getConfig } from './config.js';

/** Color tokens every theme defines. Names are the public `--vt-` names without prefix. */
export const COLOR_TOKENS = Object.freeze([
  'bg', 'surface', 'surface-sunken', 'surface-raised', 'border', 'border-strong', 'fg',
  'fg-muted', 'accent', 'accent-fg', 'on-accent', 'accent-soft', 'highlight',
  'highlight-current', 'line-highlight', 'success', 'warning', 'danger', 'info', 'diff-added',
  'diff-removed', 'shadow', 'syntax-keyword', 'syntax-string', 'syntax-number',
  'syntax-function', 'syntax-type', 'syntax-comment', 'syntax-attr', 'syntax-tag',
  'syntax-meta',
]); // prettier-ignore

/**
 * @typedef {object} ThemeDefinition
 * @property {"light"|"dark"} colorScheme - Native color scheme (scrollbars, form controls).
 * @property {Record<string, string>} tokens - Token values, keyed by name without `--vt-`.
 */

/** @type {Map<string, ThemeDefinition>} */
const themes = new Map();

/** Stylesheet adopted by every Vitrine shadow root. */
export const themeSheet = new CSSStyleSheet();

const THEME_NAME = /^[a-z][a-z0-9-]{0,39}$/;
const RESERVED = new Set(['auto']);

/**
 * Parses a theme file: `[data-theme='name'] { color-scheme: x; --vt-token: value; }`.
 *
 * @param {string} css
 * @returns {{ name: string, definition: ThemeDefinition }}
 */
export function parseThemeCss(css) {
  const name = /\[data-theme='([a-z0-9-]+)'\]/.exec(css)?.[1];
  if (!name) throw new Error('[vitrine] Theme file without a [data-theme] selector.');
  const scheme = /color-scheme:\s*(light|dark)\s*;/.exec(css)?.[1] === 'dark' ? 'dark' : 'light';
  /** @type {Record<string, string>} */
  const tokens = {};
  for (const [, token, value] of css.matchAll(/--vt-([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens[token] = value.trim();
  }
  return { name, definition: { colorScheme: scheme, tokens } };
}

for (const css of [light, dark, dim, paper, highContrast]) {
  const { name, definition } = parseThemeCss(css);
  themes.set(name, definition);
}

/** Names of the themes shipped with Vitrine. */
export const BUILT_IN_THEMES = Object.freeze([...themes.keys()]);

/**
 * Rejects values that could load resources or break out of the declaration.
 * Values are applied with CSSOM `setProperty`, which already prevents injection;
 * this check also refuses external resources (`url()`, `image()`, `@import`).
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isSafeTokenValue(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return false;
  if (/[;{}<>\\]/.test(value)) return false;
  return !/(?:url|image|image-set|cross-fade|element|src)\s*\(|@import|expression/i.test(value);
}

/**
 * Registers a custom theme, or replaces an existing one.
 *
 * Missing tokens are taken from the `extends` theme (default: `"light"`, or `"dark"`
 * when `colorScheme` is `"dark"`). Unknown tokens and unsafe values are ignored with
 * a warning.
 *
 * @since 0.1.0
 * @param {string} name - Lowercase name, e.g. `"brand"`. `"auto"` is reserved.
 * @param {{ extends?: string, colorScheme?: "light"|"dark", tokens?: Record<string, string> }} options
 * @returns {string} The theme name.
 *
 * @example
 * Vitrine.registerTheme('brand', {
 *   extends: 'dark',
 *   tokens: { accent: '#7c9cff', 'accent-fg': '#7c9cff', 'surface-sunken': '#0b1020' },
 * });
 */
export function registerTheme(name, options = {}) {
  if (typeof name !== 'string' || !THEME_NAME.test(name) || RESERVED.has(name)) {
    throw new TypeError(
      `[vitrine] Invalid theme name "${name}". Use lowercase letters, digits, "-".`,
    );
  }
  const scheme =
    options.colorScheme === 'dark' ? 'dark' : options.colorScheme === 'light' ? 'light' : undefined;
  const baseName = options.extends ?? (scheme === 'dark' ? 'dark' : 'light');
  const base = themes.get(baseName);
  if (!base) throw new TypeError(`[vitrine] Unknown base theme "${baseName}".`);
  /** @type {Record<string, string>} */
  const tokens = { ...base.tokens };
  for (const [token, value] of Object.entries(options.tokens ?? {})) {
    const key = token.replace(/^--vt-/, '');
    if (!COLOR_TOKENS.includes(key)) {
      console.warn(`[vitrine] Unknown theme token "${token}" ignored.`);
    } else if (!isSafeTokenValue(value)) {
      console.warn(`[vitrine] Unsafe or invalid value for theme token "${token}" ignored.`);
    } else {
      tokens[key] = value.trim();
    }
  }
  themes.set(name, { colorScheme: scheme ?? base.colorScheme, tokens });
  rebuildSheet();
  notify();
  return name;
}

/**
 * Lists the registered theme names.
 *
 * @returns {string[]}
 */
export function listThemes() {
  return [...themes.keys()];
}

/**
 * Returns a copy of a theme definition.
 *
 * @param {string} name
 * @returns {ThemeDefinition | undefined}
 */
export function getTheme(name) {
  const theme = themes.get(name);
  return theme ? { colorScheme: theme.colorScheme, tokens: { ...theme.tokens } } : undefined;
}

/** Rebuilds the shared theme stylesheet with CSSOM (no string concatenation of values). */
function rebuildSheet() {
  while (themeSheet.cssRules.length) themeSheet.deleteRule(0);
  for (const [name, theme] of themes) {
    const index = themeSheet.insertRule(`.vt[data-theme="${name}"] {}`, themeSheet.cssRules.length);
    const style = /** @type {CSSStyleRule} */ (themeSheet.cssRules[index]).style;
    style.setProperty('color-scheme', theme.colorScheme);
    for (const [token, value] of Object.entries(theme.tokens)) {
      style.setProperty(`--_${token}`, `var(--vt-${token}, ${value})`);
    }
  }
}
rebuildSheet();

const darkQuery =
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

/** @type {Set<() => void>} */
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

darkQuery?.addEventListener?.('change', notify);

/**
 * Subscribes to theme changes (registration or system color scheme switch).
 *
 * @param {() => void} listener
 * @returns {() => void} Unsubscribe function.
 */
export function onThemeChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Resolves the theme to apply: the attribute value if it is a known theme, else the
 * configured default; `"auto"` picks the configured light or dark theme from the
 * user's system preference.
 *
 * @param {string | null} requested
 * @returns {string}
 */
export function resolveTheme(requested) {
  const config = getConfig();
  let name = requested?.trim().toLowerCase() || config.theme;
  if (name !== 'auto' && !themes.has(name)) name = themes.has(config.theme) ? config.theme : 'auto';
  if (name !== 'auto') return name;
  const preferred = darkQuery?.matches ? config.darkTheme : config.lightTheme;
  if (themes.has(preferred)) return preferred;
  return darkQuery?.matches ? 'dark' : 'light';
}
