// @ts-check
/**
 * Icon sets of <vt-icon-picker>: the built-in sets, loaded on demand from dist/vendor/icons/,
 * sets registered by the page, search, and drawing with an allow-list of SVG elements and
 * attributes (no markup is parsed).
 *
 * @module components/icon-picker/icons
 */
import { defaultVendorUrl } from '../../core/asset-urls.js';
import { getConfig } from '../../core/config.js';
import { isObject, text } from '../../core/data.js';

/**
 * @typedef {object} Icon
 * @property {string} name
 * @property {string} label - Shown name (a country for a flag).
 * @property {string | any[]} body - Path data, or `[tag, attributes, ...children]` trees.
 * @property {string} keywords - Lowercase words searched.
 * @property {string} viewBox - When it differs from the set's.
 */

/**
 * @typedef {object} IconSet
 * @property {string} id
 * @property {string} label
 * @property {string} license
 * @property {string | null} licenseUrl
 * @property {string} code - How a page writes an icon of the set: `fa-solid fa-{name}`.
 * @property {string} attribution - Credit kept as a comment in the SVG copied (CC BY sets).
 * @property {string} viewBox
 * @property {Record<string, string>} attrs - Attributes of every `<svg>` of the set.
 * @property {Icon[]} icons
 * @property {Map<string, Icon>} byName
 */

/** The sets built into dist/vendor/icons/, in their order. */
export const BUILT_IN = Object.freeze([
  { id: 'fa-solid', label: 'Font Awesome Solid' },
  { id: 'fa-regular', label: 'Font Awesome Regular' },
  { id: 'fa-brands', label: 'Font Awesome Brands' },
  { id: 'lucide', label: 'Lucide' },
  { id: 'bootstrap', label: 'Bootstrap Icons' },
  { id: 'flags', label: 'Flags' },
]);

const SVG_NS = 'http://www.w3.org/2000/svg';

/** SVG elements an icon may hold. */
const TAGS = new Set(['g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'use', 'marker', 'symbol']); // prettier-ignore

/** Attributes an icon may set. Anything else (event handlers, `style`, external links) is dropped. */
const ATTRS = new Set([
  'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'fill-rule', 'clip-rule', 'fill-opacity',
  'opacity', 'transform', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width',
  'height', 'points', 'id', 'clip-path', 'mask', 'href', 'gradientUnits', 'gradientTransform', 'offset',
  'stop-color', 'stop-opacity', 'fx', 'fy', 'markerWidth', 'markerHeight', 'marker-start', 'marker-mid',
  'marker-end', 'viewBox', 'refX', 'refY', 'orient',
]); // prettier-ignore

/** Icons in one set. */
const MAX_ICONS = 20000;

/** @type {Map<string, IconSet>} */
const sets = new Map();
/** @type {Map<string, Promise<IconSet>>} */
const loading = new Map();

/**
 * Whether an attribute value is safe: references stay inside the icon (`#id`, `url(#id)`).
 *
 * @param {string} name
 * @param {string} value
 * @returns {boolean}
 */
function safeValue(name, value) {
  if (name === 'href') return /^#[\w.-]+$/.test(value);
  if (/url\s*\(/i.test(value)) return /^url\(#[\w.-]+\)$/.test(value.trim());
  return !/[<>]/.test(value) && value.length < 100000;
}

/**
 * Reads a set: from dist/vendor/icons/ or given by the page.
 *
 * @param {unknown} value - `{ id, label, viewBox, attrs, icons: [[name, body, keywords?, viewBox?, label?]] }`.
 * @returns {IconSet}
 */
export function readIconSet(value) {
  if (!isObject(value)) throw new TypeError('An icon set is an object.');
  const id = text(value.id, 40);
  if (!/^[a-z][\w-]*$/i.test(id)) throw new TypeError('An icon set needs an id of letters, digits and dashes.'); // prettier-ignore
  /** @type {Record<string, string>} */
  const attrs = {};
  if (isObject(value.attrs))
    for (const [k, v] of Object.entries(value.attrs)) if (ATTRS.has(k) && typeof v === 'string' && safeValue(k, v)) attrs[k] = v; // prettier-ignore
  /** @type {Icon[]} */
  const icons = [];
  for (const entry of (Array.isArray(value.icons) ? value.icons : []).slice(0, MAX_ICONS)) {
    // `[name, body, keywords, viewBox, label]`, or `{ name, body, keywords, viewBox, label }`.
    const [name, body, keywords, viewBox, label] = Array.isArray(entry) ? entry : isObject(entry) ? [entry.name, entry.body ?? entry.d, entry.keywords, entry.viewBox, entry.label] : []; // prettier-ignore
    const n = text(name, 100);
    if (!n || (typeof body !== 'string' && !Array.isArray(body))) continue;
    icons.push({
      name: n,
      label: text(label, 100) || n,
      body,
      keywords: (Array.isArray(keywords) ? keywords.join(' ') : text(keywords, 2000)).toLowerCase(),
      viewBox: text(viewBox, 60),
    });
  }
  return {
    id,
    label: text(value.label, 100) || id,
    license: text(value.license, 60),
    licenseUrl: typeof value.licenseUrl === 'string' && /^https:\/\//.test(value.licenseUrl) ? value.licenseUrl : null, // prettier-ignore
    code: text(value.code, 100) || `${id}:{name}`,
    // A comment never closes early: `--` cannot appear in it.
    attribution: text(value.attribution, 400).replace(/-{2,}/g, '-').replace(/[<>]/g, ''),
    viewBox: text(value.viewBox, 60) || '0 0 24 24',
    attrs,
    icons,
    byName: new Map(icons.map((icon) => [icon.name, icon])),
  };
}

/**
 * Adds a set the pickers of the page can show, or replaces one with the same id.
 *
 * @param {unknown} value
 * @returns {IconSet}
 */
export function registerIconSet(value) {
  const set = readIconSet(value);
  sets.set(set.id, set);
  loading.delete(set.id);
  return set;
}

/**
 * @param {string} id
 * @returns {IconSet | null} The set, once loaded or registered.
 */
export function iconSet(id) {
  return sets.get(id) ?? null;
}

/**
 * Loads a built-in set from dist/vendor/icons/, once per page.
 *
 * @param {string} id
 * @returns {Promise<IconSet>}
 */
export function loadIconSet(id) {
  const ready = sets.get(id);
  if (ready) return Promise.resolve(ready);
  const pending = loading.get(id);
  if (pending) return pending;
  if (!BUILT_IN.some((s) => s.id === id)) return Promise.reject(new Error(`Unknown icon set: ${id}`)); // prettier-ignore
  const base = getConfig().vendorUrl || defaultVendorUrl();
  const promise = import(
    /* @vite-ignore */ new URL(`icons/${id}.js`, base || location.href).href
  ).then(
    (module) => registerIconSet(module.default),
    (error) => {
      // A later picker may try again.
      loading.delete(id);
      throw error;
    },
  );
  loading.set(id, promise);
  return promise;
}

/**
 * Icons matching a search, the closest first. Every word must match a name or a keyword.
 *
 * @param {IconSet} set
 * @param {string} query
 * @returns {Icon[]}
 */
export function searchIcons(set, query) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return set.icons;
  /** @type {[Icon, number][]} */
  const found = [];
  for (const icon of set.icons) {
    const name = icon.name.toLowerCase();
    const label = icon.label.toLowerCase();
    let score = 0;
    for (const word of words) {
      if (name === word || label === word) score += 100;
      else if (name.startsWith(word) || label.startsWith(word)) score += 50;
      else if (name.includes(word) || label.includes(word)) score += 30;
      else if (icon.keywords.includes(word)) score += 10;
      else {
        score = -1;
        break;
      }
    }
    if (score > 0) found.push([icon, score - name.length / 100]);
  }
  return found.sort((a, b) => b[1] - a[1]).map(([icon]) => icon);
}

/**
 * The children of an icon, as `[tag, attributes, ...children]` trees.
 *
 * @param {Icon} icon
 * @returns {any[]}
 */
function nodesOf(icon) {
  return typeof icon.body === 'string' ? [['path', { d: icon.body }]] : icon.body;
}

/**
 * Draws an icon with DOM methods, keeping only allowed elements and attributes.
 *
 * @param {IconSet} set
 * @param {Icon} icon
 * @returns {SVGSVGElement}
 */
export function drawIcon(set, icon) {
  const svg = /** @type {SVGSVGElement} */ (document.createElementNS(SVG_NS, 'svg'));
  svg.setAttribute('viewBox', icon.viewBox || set.viewBox);
  for (const [k, v] of Object.entries(set.attrs)) svg.setAttribute(k, v);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  /**
   * @param {Element} parent
   * @param {any[]} nodes
   * @param {number} depth
   */
  const add = (parent, nodes, depth) => {
    for (const node of nodes) {
      if (!Array.isArray(node) || depth > 12) continue;
      const [tag, attrs, ...children] = node;
      if (!TAGS.has(tag)) continue;
      const el = document.createElementNS(SVG_NS, tag);
      if (isObject(attrs))
        for (const [k, v] of Object.entries(attrs)) {
          const value = typeof v === 'number' ? String(v) : v;
          if (ATTRS.has(k) && typeof value === 'string' && safeValue(k, value))
            el.setAttribute(k, value);
        }
      add(el, children, depth + 1);
      parent.append(el);
    }
  };
  add(svg, nodesOf(icon), 0);
  return svg;
}

/**
 * @param {string} value
 * @returns {string}
 */
const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); // prettier-ignore

/**
 * The SVG markup of an icon, to copy into a page or a design tool. Built from the same
 * allow-list as {@link drawIcon}, with every value escaped.
 *
 * @param {IconSet} set
 * @param {Icon} icon
 * @returns {string}
 */
export function iconSvg(set, icon) {
  /**
   * @param {any[]} nodes
   * @param {number} depth
   * @returns {string}
   */
  const write = (nodes, depth) =>
    nodes
      .filter((n) => Array.isArray(n) && TAGS.has(n[0]) && depth <= 12)
      .map(([tag, attrs, ...children]) => {
        const list = isObject(attrs) ? Object.entries(attrs).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v]).filter(([k, v]) => ATTRS.has(k) && typeof v === 'string' && safeValue(k, v)) : []; // prettier-ignore
        const open = `<${tag}${list.map(([k, v]) => ` ${k}="${escape(v)}"`).join('')}`;
        const inner = write(children, depth + 1);
        return inner ? `${open}>${inner}</${tag}>` : `${open}/>`;
      })
      .join('');
  const attrs = Object.entries(set.attrs)
    .map(([k, v]) => ` ${k}="${escape(v)}"`)
    .join('');
  const credit = set.attribution ? `<!-- ${set.attribution} -->` : '';
  return `<svg xmlns="${SVG_NS}" viewBox="${escape(icon.viewBox || set.viewBox)}"${attrs}>${credit}${write(nodesOf(icon), 0)}</svg>`; // prettier-ignore
}

/**
 * How a page writes an icon: `fa-solid fa-house`, `bi bi-house`, `fi fi-fr`.
 *
 * @param {IconSet} set
 * @param {Icon} icon
 * @returns {string}
 */
export function iconCode(set, icon) {
  return set.code.replace('{name}', icon.name);
}

/**
 * @param {string} value - `set:name`.
 * @returns {{ set: string, name: string } | null}
 */
export function parseValue(value) {
  const at = value.indexOf(':');
  if (at <= 0) return null;
  return { set: value.slice(0, at).trim(), name: value.slice(at + 1).trim() };
}
