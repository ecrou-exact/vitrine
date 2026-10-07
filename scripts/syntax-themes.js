/**
 * Turns the highlight.js themes into Vitrine syntax themes.
 *
 * For each theme:
 * - the credits comment is kept (author and license information);
 * - layout rules (`pre code.hljs { padding… }`) are dropped: layout belongs to Vitrine;
 * - the `.hljs { color; background }` rule becomes the code area variables
 *   (`--_code-fg`, `--_code-bg`, `--_code-gutter`), so the theme also colors the line
 *   numbers, Markdown code blocks and the JSON tree;
 * - `url(…)` values are removed (no requests from a theme, nothing blocked by a CSP);
 * - only color, background and font style declarations are kept.
 *
 * The contrast of every token color against the background is measured, so the
 * documentation can say which themes meet WCAG AA.
 */
import { readdir, readFile } from 'node:fs/promises';

const DIR = new URL('../node_modules/highlight.js/styles/', import.meta.url);
const KEEP =
  /^(color|background|background-color|background-image|font-style|font-weight|text-decoration)$/;

/**
 * @typedef {object} SyntaxTheme
 * @property {string} name - e.g. "github-dark", "base16-dracula".
 * @property {string} title - Human-readable name.
 * @property {boolean} dark
 * @property {number | null} contrast - Lowest token contrast against the background.
 * @property {string} css - Vitrine stylesheet.
 */

/** @returns {Promise<SyntaxTheme[]>} */
export async function syntaxThemes() {
  /** @type {[string, string][]} */
  const files = [];
  for (const file of await readdir(DIR)) {
    if (file.endsWith('.css') && !file.endsWith('.min.css')) files.push([file.slice(0, -4), file]);
  }
  for (const file of await readdir(new URL('base16/', DIR))) {
    if (file.endsWith('.css') && !file.endsWith('.min.css'))
      files.push([`base16-${file.slice(0, -4)}`, `base16/${file}`]);
  }
  const themes = [];
  for (const [name, file] of files.sort((a, b) => a[0].localeCompare(b[0]))) {
    themes.push(convert(name, await readFile(new URL(file, DIR), 'utf8')));
  }
  return themes;
}

/**
 * @param {string} name
 * @param {string} source
 * @returns {SyntaxTheme}
 */
function convert(name, source) {
  const credits = (/\/\*!?[\s\S]*?\*\//.exec(source)?.[0] ?? '').replace(/^\/\*!?/, '/*!');
  const title = /Theme:\s*(.+)/.exec(credits)?.[1]?.trim() ?? titleCase(name);
  // Remove comments and url(…) first: data URLs contain ";" which would split declarations.
  const css = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/url\((?:[^()'"]|'[^']*'|"[^"]*")*\)/gi, '');
  const rules = [];
  let bg = null;
  let fg = null;
  const tokenColors = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].trim().replace(/\s+/g, ' ');
    if (!selectors || selectors.includes('code.hljs')) continue;
    const declarations = match[2]
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const i = d.indexOf(':');
        return [d.slice(0, i).trim().toLowerCase(), cleanValue(d.slice(i + 1).trim())];
      })
      .filter(([property, value]) => KEEP.test(property) && value);
    if (selectors === '.hljs') {
      for (const [property, value] of declarations) {
        if (property === 'color') fg = value;
        else if (property.startsWith('background'))
          bg = bg && property === 'background-image' ? `${value}, ${bg}` : value;
      }
      continue;
    }
    if (!declarations.length) continue;
    // A token drawn on its own background is not read against the theme background.
    const ownBackground = declarations.some(([property]) => property.startsWith('background'));
    if (!ownBackground)
      for (const [property, value] of declarations)
        if (property === 'color') tokenColors.push(value);
    rules.push(
      `${selectors
        .split(',')
        .map((s) => s.trim())
        .join(',\n')} {\n${declarations.map(([p, v]) => `  ${p}: ${v};`).join('\n')}\n}`,
    );
  }
  const bgColor = parseColor(firstColor(bg ?? ''));
  const fgColor = parseColor(fg ?? '');
  // Equal contrast against black and white is at luminance 0.18.
  const dark = bgColor ? luminance(bgColor) < 0.18 : false;
  const solid = firstColor(bg ?? '');
  const ratios = [fgColor, ...tokenColors.map(parseColor)]
    .filter((c) => c && bgColor)
    .map((c) => contrast(/** @type {number[]} */ (c), /** @type {number[]} */ (bgColor)));
  const variables = [
    bg ? `  --_code-bg: ${bg};` : '',
    solid ? `  --_code-bg-solid: ${solid};` : '',
    fg ? `  --_code-fg: ${fg};` : '',
    fg ? `  --_code-gutter: color-mix(in srgb, ${fg} 55%, transparent);` : '',
    `  --_code-scheme: ${dark ? 'dark' : 'light'};`,
  ].filter(Boolean);
  const header = `${credits}\n/* Vitrine syntax theme "${name}", converted from highlight.js (BSD-3-Clause). */`;
  return {
    name,
    title,
    dark,
    contrast: ratios.length ? Math.round(Math.min(...ratios) * 100) / 100 : null,
    css: `${header}\n.vt {\n${variables.join('\n')}\n}\n${rules.join('\n')}\n`,
  };
}

/** Removes url(…) parts; returns '' when nothing is left. */
function cleanValue(value) {
  const cleaned = value
    .replace(/url\([^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return /^(repeat|no-repeat|repeat-x|repeat-y)?$/i.test(cleaned) ? '' : cleaned;
}

/** @param {string} value */
function firstColor(value) {
  return (
    /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\b[a-z]+\b/i.exec(
      value.replace(/linear-gradient\([^)]*\)/g, ''),
    )?.[0] ?? ''
  );
}

const NAMED = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  navy: [0, 0, 128],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  maroon: [128, 0, 0],
  purple: [128, 0, 128],
  green: [0, 128, 0],
  olive: [128, 128, 0],
  teal: [0, 128, 128],
  blue: [0, 0, 255],
  red: [255, 0, 0],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
  lime: [0, 255, 0],
  aqua: [0, 255, 255],
  cyan: [0, 255, 255],
  fuchsia: [255, 0, 255],
  magenta: [255, 0, 255],
};

/**
 * @param {string} value
 * @returns {number[] | null} [r, g, b]
 */
function parseColor(value) {
  const v = value.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  let m = /^#([0-9a-f]{3,4})$/.exec(v);
  if (m) return [...m[1].slice(0, 3)].map((c) => parseInt(c + c, 16));
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(v);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

/** @param {number[]} rgb */
function luminance([r, g, b]) {
  const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** @param {number[]} a @param {number[]} b */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** @param {string} name */
function titleCase(name) {
  return name
    .replace(/^base16-/, 'Base16 ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
