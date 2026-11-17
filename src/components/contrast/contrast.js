// @ts-check
/**
 * Color contrast as WCAG 2.2 defines it: relative luminance, contrast ratio, and the success
 * criteria 1.4.3 (AA), 1.4.6 (AAA) and 1.4.11 (non-text). Reads CSS colors (hex, rgb(),
 * hsl(), hwb(), named colors), blends transparent colors over the background, and finds the
 * nearest color that passes.
 *
 * @module components/contrast/contrast
 */

/** Most colors read. */
export const MAX_COLORS = 40;

/** @typedef {{ r: number, g: number, b: number, a: number }} Rgba - Channels 0–255, alpha 0–1. */

/** Thresholds of WCAG 2.2. */
export const LEVELS = Object.freeze({
  aaNormal: 4.5,
  aaLarge: 3,
  aaaNormal: 7,
  aaaLarge: 4.5,
  nonText: 3,
});

/** CSS named colors (CSS Color 4). */
const NAMED = /** @type {Record<string, string>} */ ({
  aliceblue: 'f0f8ff', antiquewhite: 'faebd7', aqua: '00ffff', aquamarine: '7fffd4', azure: 'f0ffff',
  beige: 'f5f5dc', bisque: 'ffe4c4', black: '000000', blanchedalmond: 'ffebcd', blue: '0000ff',
  blueviolet: '8a2be2', brown: 'a52a2a', burlywood: 'deb887', cadetblue: '5f9ea0', chartreuse: '7fff00',
  chocolate: 'd2691e', coral: 'ff7f50', cornflowerblue: '6495ed', cornsilk: 'fff8dc', crimson: 'dc143c',
  cyan: '00ffff', darkblue: '00008b', darkcyan: '008b8b', darkgoldenrod: 'b8860b', darkgray: 'a9a9a9',
  darkgreen: '006400', darkgrey: 'a9a9a9', darkkhaki: 'bdb76b', darkmagenta: '8b008b', darkolivegreen: '556b2f',
  darkorange: 'ff8c00', darkorchid: '9932cc', darkred: '8b0000', darksalmon: 'e9967a', darkseagreen: '8fbc8f',
  darkslateblue: '483d8b', darkslategray: '2f4f4f', darkslategrey: '2f4f4f', darkturquoise: '00ced1',
  darkviolet: '9400d3', deeppink: 'ff1493', deepskyblue: '00bfff', dimgray: '696969', dimgrey: '696969',
  dodgerblue: '1e90ff', firebrick: 'b22222', floralwhite: 'fffaf0', forestgreen: '228b22', fuchsia: 'ff00ff',
  gainsboro: 'dcdcdc', ghostwhite: 'f8f8ff', gold: 'ffd700', goldenrod: 'daa520', gray: '808080',
  green: '008000', greenyellow: 'adff2f', grey: '808080', honeydew: 'f0fff0', hotpink: 'ff69b4',
  indianred: 'cd5c5c', indigo: '4b0082', ivory: 'fffff0', khaki: 'f0e68c', lavender: 'e6e6fa',
  lavenderblush: 'fff0f5', lawngreen: '7cfc00', lemonchiffon: 'fffacd', lightblue: 'add8e6', lightcoral: 'f08080',
  lightcyan: 'e0ffff', lightgoldenrodyellow: 'fafad2', lightgray: 'd3d3d3', lightgreen: '90ee90', lightgrey: 'd3d3d3',
  lightpink: 'ffb6c1', lightsalmon: 'ffa07a', lightseagreen: '20b2aa', lightskyblue: '87cefa', lightslategray: '778899',
  lightslategrey: '778899', lightsteelblue: 'b0c4de', lightyellow: 'ffffe0', lime: '00ff00', limegreen: '32cd32',
  linen: 'faf0e6', magenta: 'ff00ff', maroon: '800000', mediumaquamarine: '66cdaa', mediumblue: '0000cd',
  mediumorchid: 'ba55d3', mediumpurple: '9370db', mediumseagreen: '3cb371', mediumslateblue: '7b68ee',
  mediumspringgreen: '00fa9a', mediumturquoise: '48d1cc', mediumvioletred: 'c71585', midnightblue: '191970',
  mintcream: 'f5fffa', mistyrose: 'ffe4e1', moccasin: 'ffe4b5', navajowhite: 'ffdead', navy: '000080',
  oldlace: 'fdf5e6', olive: '808000', olivedrab: '6b8e23', orange: 'ffa500', orangered: 'ff4500',
  orchid: 'da70d6', palegoldenrod: 'eee8aa', palegreen: '98fb98', paleturquoise: 'afeeee', palevioletred: 'db7093',
  papayawhip: 'ffefd5', peachpuff: 'ffdab9', peru: 'cd853f', pink: 'ffc0cb', plum: 'dda0dd',
  powderblue: 'b0e0e6', purple: '800080', rebeccapurple: '663399', red: 'ff0000', rosybrown: 'bc8f8f',
  royalblue: '4169e1', saddlebrown: '8b4513', salmon: 'fa8072', sandybrown: 'f4a460', seagreen: '2e8b57',
  seashell: 'fff5ee', sienna: 'a0522d', silver: 'c0c0c0', skyblue: '87ceeb', slateblue: '6a5acd',
  slategray: '708090', slategrey: '708090', snow: 'fffafa', springgreen: '00ff7f', steelblue: '4682b4',
  tan: 'd2b48c', teal: '008080', thistle: 'd8bfd8', tomato: 'ff6347', turquoise: '40e0d0',
  violet: 'ee82ee', wheat: 'f5deb3', white: 'ffffff', whitesmoke: 'f5f5f5', yellow: 'ffff00', yellowgreen: '9acd32',
}); // prettier-ignore

const clamp = (/** @type {number} */ x, /** @type {number} */ lo, /** @type {number} */ hi) => Math.min(hi, Math.max(lo, x)); // prettier-ignore

/**
 * @param {string} s - A number, a percentage (of `max`), or `none`.
 * @param {number} max
 * @returns {number}
 */
function channel(s, max) {
  if (s === 'none') return 0;
  if (s.endsWith('%')) return (parseFloat(s) / 100) * max;
  return parseFloat(s);
}

/**
 * @param {string} s - Alpha: number or percentage.
 * @returns {number}
 */
const alpha = (s) => (s === undefined ? 1 : clamp(s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s), 0, 1)); // prettier-ignore

/**
 * @param {string} s - Hue: number (degrees), `deg`, `turn`, `rad`, `grad`.
 * @returns {number}
 */
function hue(s) {
  const n = parseFloat(s);
  if (s.endsWith('turn')) return n * 360;
  if (s.endsWith('rad')) return (n * 180) / Math.PI;
  if (s.endsWith('grad')) return n * 0.9;
  return n;
}

/**
 * @param {number} h - Degrees.
 * @param {number} s - 0–1.
 * @param {number} l - 0–1.
 * @returns {[number, number, number]} 0–255.
 */
export function hslToRgb(h, s, l) {
  const k = (/** @type {number} */ n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (/** @type {number} */ n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {[number, number, number]} Hue in degrees, saturation and lightness 0–1.
 */
export function rgbToHsl(r, g, b) {
  const [x, y, z] = [r / 255, g / 255, b / 255];
  const max = Math.max(x, y, z);
  const min = Math.min(x, y, z);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === x ? (y - z) / d + (y < z ? 6 : 0) : max === y ? (z - x) / d + 2 : (x - y) / d + 4;
  return [h * 60, s, l];
}

/**
 * Reads a CSS color.
 *
 * @param {string} input
 * @returns {Rgba | null}
 */
export function parseColor(input) {
  const text = String(input).trim().toLowerCase();
  if (!text || text.length > 100) return null;
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const named = NAMED[text];
  const hex = named ?? /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)?.[1] ?? null;
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const n = (/** @type {number} */ i) => parseInt(full.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
  }
  const m = /^(rgba?|hsla?|hwb)\(\s*([^)]*)\)$/.exec(text);
  if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  if (parts.some((p) => !/^(-?\d*\.?\d+(%|deg|turn|rad|grad)?|none)$/.test(p))) return null;
  if (m[1].startsWith('rgb')) {
    const [r, g, b] = parts.slice(0, 3).map((p) => clamp(channel(p, 255), 0, 255));
    return { r, g, b, a: alpha(parts[3]) };
  }
  const h = ((hue(parts[0]) % 360) + 360) % 360;
  const second = clamp(channel(parts[1], 100), 0, 100) / 100;
  const third = clamp(channel(parts[2], 100), 0, 100) / 100;
  if (m[1] === 'hwb') {
    const sum = second + third;
    const [w, bl] = sum > 1 ? [second / sum, third / sum] : [second, third];
    const [r, g, b] = hslToRgb(h, 1, 0.5).map((c) => (c / 255) * (1 - w - bl) * 255 + w * 255);
    return { r, g, b, a: alpha(parts[3]) };
  }
  const [r, g, b] = hslToRgb(h, second, third);
  return { r, g, b, a: alpha(parts[3]) };
}

/**
 * Lays a color over another (alpha compositing).
 *
 * @param {Rgba} top
 * @param {Rgba} bottom - Opaque.
 * @returns {Rgba}
 */
export function blend(top, bottom) {
  const a = top.a;
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 }; // prettier-ignore
}

/**
 * Relative luminance (WCAG 2.2, with the 0.04045 threshold of sRGB).
 *
 * @param {Rgba} c - Opaque.
 * @returns {number}
 */
export function luminance(c) {
  const lin = (/** @type {number} */ x) => {
    const s = x / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/**
 * Contrast ratio of a text color over a background. A transparent background is laid over
 * white (the page), then the text over the background.
 *
 * @param {Rgba} fg
 * @param {Rgba} bg
 * @returns {number} 1 to 21.
 */
export function ratio(fg, bg) {
  const back = bg.a < 1 ? blend(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg;
  const front = fg.a < 1 ? blend(fg, back) : fg;
  const [a, b] = [luminance(front), luminance(back)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/**
 * WCAG results. Ratios are not rounded up: 4.49 fails AA.
 *
 * @param {number} value
 * @returns {Record<keyof typeof LEVELS, boolean>}
 */
export function grade(value) {
  return /** @type {Record<keyof typeof LEVELS, boolean>} */ (
    Object.fromEntries(Object.entries(LEVELS).map(([k, min]) => [k, value >= min]))
  );
}

/**
 * @param {Rgba} c
 * @returns {string} `#rrggbb` (or `#rrggbbaa` when transparent).
 */
export function toHex(c) {
  const h = (/** @type {number} */ x) =>
    Math.round(clamp(x, 0, 255))
      .toString(16)
      .padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}${c.a < 1 ? h(c.a * 255) : ''}`;
}

/**
 * The color nearest to `fg` (same hue and saturation, lightness changed) that reaches
 * `target` against `bg`, or `null` when none does.
 *
 * @param {Rgba} fg
 * @param {Rgba} bg
 * @param {number} target
 * @returns {Rgba | null}
 */
export function suggest(fg, bg, target) {
  const back = bg.a < 1 ? blend(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg;
  const front = fg.a < 1 ? blend(fg, back) : fg;
  if (ratio(front, back) >= target) return null;
  const [h, s, l] = rgbToHsl(front.r, front.g, front.b);
  /** @type {Rgba | null} */
  let best = null;
  let bestDistance = Infinity;
  for (const direction of [-1, 1]) {
    // Binary search on lightness, toward black then toward white.
    let lo = l;
    let hi = direction < 0 ? 0 : 1;
    const at = (/** @type {number} */ x) => {
      const [r, g, b] = hslToRgb(h, s, x);
      return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a: 1 };
    };
    if (ratio(at(hi), back) < target) continue;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (ratio(at(mid), back) >= target) hi = mid;
      else lo = mid;
    }
    const color = at(hi);
    // Rounding may land just under: step until it passes.
    let x = hi;
    let c = color;
    while (ratio(c, back) < target && x >= 0 && x <= 1) {
      x += direction * 0.002;
      c = at(clamp(x, 0, 1));
    }
    const distance = Math.abs(x - l);
    if (ratio(c, back) >= target && distance < bestDistance) {
      best = c;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Reads the content: one pair per line (`#333 on #fff`, `#333 / #fff`, `#333, #fff`,
 * `name: #333 #fff`), or single colors (a palette, compared two by two).
 *
 * @param {string} text
 * @returns {{ pairs: { label: string, fg: string, bg: string }[], palette: { label: string, color: string }[], invalid: string[] }}
 */
export function readInput(text) {
  /** @type {{ label: string, fg: string, bg: string }[]} */
  const pairs = [];
  /** @type {{ label: string, color: string }[]} */
  const palette = [];
  /** @type {string[]} */
  const invalid = [];
  const COLOR = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|hwb)\([^)]*\)|\b[a-z]{3,20}\b/gi;
  for (const raw of text.split(/\r?\n/).slice(0, MAX_COLORS * 2)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    let label = '';
    let rest = line;
    const named = /^([^:#()]{1,60}):\s*(.+)$/.exec(line);
    if (named) {
      label = named[1].trim();
      rest = named[2];
    }
    const colors = (rest.match(COLOR) ?? []).filter((c) => c.toLowerCase() !== 'on' && parseColor(c)); // prettier-ignore
    if (colors.length >= 2) pairs.push({ label, fg: colors[0], bg: colors[1] });
    else if (colors.length === 1) palette.push({ label, color: colors[0] });
    else invalid.push(line.slice(0, 80));
  }
  return { pairs: pairs.slice(0, MAX_COLORS), palette: palette.slice(0, MAX_COLORS), invalid };
}
