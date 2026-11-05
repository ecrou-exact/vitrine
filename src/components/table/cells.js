// @ts-check
/**
 * Cell displays of <vt-table>: badges, statuses, tags, progress bars, ratings, links,
 * images and avatars, code, relative dates, currencies, percents, sizes, colors and
 * JSON, with long text cut and a "See all" toggle. Everything is built with DOM APIs.
 *
 * @module components/table/cells
 */
import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { isEmpty, toBoolean, toNumber, toText, toTime } from './model.js';

/** Display kinds a column can use. */
export const DISPLAYS = /** @type {const} */ ([
  'text', 'number', 'badge', 'status', 'tags', 'progress', 'rating', 'link', 'email',
  'image', 'avatar', 'code', 'date', 'relative', 'currency', 'percent', 'bytes', 'color',
  'json', 'boolean',
]); // prettier-ignore

/** Colors of badges, statuses and tags. */
export const TONES = /** @type {const} */ ([
  'gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink',
]); // prettier-ignore

/** @typedef {typeof DISPLAYS[number]} Display */
/** @typedef {typeof TONES[number]} Tone */
/** @typedef {import('./model.js').Column} Column */
/** @typedef {import('./model.js').Row} Row */

/**
 * @typedef {object} CellContext
 * @property {(key: any, params?: Record<string, string | number>) => string} t
 * @property {string} locale
 * @property {boolean} expanded - "See all" was chosen for this cell.
 * @property {(() => void) | null} onToggle - Switches "See all" / "Show less".
 */

/**
 * Display kind of a column: `display`, else one matching its type.
 *
 * @param {Column} column
 * @returns {Display}
 */
export function displayOf(column) {
  const asked = /** @type {Display} */ (column.display);
  if (DISPLAYS.includes(asked)) return asked;
  if (column.type === 'url') return 'link';
  if (column.type === 'boolean') return 'boolean';
  if (column.type === 'number') return 'number';
  if (column.type === 'date') return 'date';
  return 'text';
}

/**
 * Text of a value as the column shows it (also searched, copied and exported).
 *
 * @param {Column} column
 * @param {unknown} value
 * @param {string} locale
 * @param {CellContext['t']} t
 * @returns {string}
 */
export function formatValue(column, value, locale, t) {
  if (isEmpty(value)) return '';
  const display = displayOf(column);
  const affix = (/** @type {string} */ text) =>
    `${column.prefix ?? ''}${text}${column.suffix ?? ''}`;
  const digits =
    typeof column.decimals === 'number' ? Math.max(0, Math.min(10, column.decimals)) : undefined;
  const number = (/** @type {Intl.NumberFormatOptions} */ options = {}) => {
    const n = toNumber(value);
    if (Number.isNaN(n)) return toText(value);
    try {
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits ?? 2,
        ...options,
      }).format(n);
    } catch {
      return String(n);
    }
  };
  switch (display) {
    case 'number':
      if (typeof value !== 'number' && !column.decimals && !column.prefix && !column.suffix)
        return toText(value);
      return affix(
        /** @type {any} */ (column).grouping === false
          ? String(toNumber(value))
          : number({ useGrouping: column.grouping !== false }),
      );
    case 'currency':
      return number({
        style: 'currency',
        currency: /^[A-Z]{3}$/.test(column.currency ?? '') ? column.currency : 'EUR',
      });
    case 'percent': {
      const n = toNumber(value);
      if (Number.isNaN(n)) return toText(value);
      return affix(
        new Intl.NumberFormat(locale, {
          style: 'percent',
          maximumFractionDigits: digits ?? 1,
        }).format(column.ratio ? n : n / 100),
      );
    }
    case 'bytes':
      return formatBytes(toNumber(value), locale);
    case 'date': {
      const time = toTime(value);
      if (Number.isNaN(time)) return toText(value);
      if (typeof value === 'string' && !column.dateStyle) return value;
      return formatDate(time, locale, column.dateStyle);
    }
    case 'relative': {
      const time = toTime(value);
      return Number.isNaN(time) ? toText(value) : relativeTime(time, locale);
    }
    case 'boolean': {
      const b = toBoolean(value);
      if (b === null) return toText(value);
      return b ? (column.trueLabel ?? t('tableYes')) : (column.falseLabel ?? t('tableNo'));
    }
    case 'rating': {
      const n = toNumber(value);
      return Number.isNaN(n) ? toText(value) : `${n}/${column.max ?? 5}`;
    }
    case 'progress': {
      const n = toNumber(value);
      return Number.isNaN(n) ? toText(value) : `${Math.round((n / (column.max || 100)) * 100)}%`;
    }
    case 'tags':
      return listOf(value).join(', ');
    case 'json':
      return toText(value);
    default:
      return affix(toText(value));
  }
}

/**
 * Builds the content of a cell.
 *
 * @param {Column} column
 * @param {unknown} value
 * @param {Row} row
 * @param {string} text - The display text (formatted).
 * @param {CellContext} ctx
 * @returns {Node}
 */
export function renderCell(column, value, row, text, ctx) {
  if (isEmpty(value) && displayOf(column) !== 'avatar')
    return h('span', { class: 'tb-blank', text: column.emptyText ?? '' });
  switch (displayOf(column)) {
    case 'badge':
    case 'status':
      return badges(column, listOf(value), ctx, displayOf(column) === 'status');
    case 'tags':
      return badges(column, listOf(value), ctx, false, column.maxItems ?? 3);
    case 'progress':
      return progress(column, value, text);
    case 'rating':
      return rating(column, value, text);
    case 'link':
    case 'email':
      return link(column, value, row, text);
    case 'image':
      return image(column, value, row, text);
    case 'avatar':
      return avatar(column, value, row, text);
    case 'code':
      return truncated(column, text, ctx, 'tb-code');
    case 'json':
      return truncated(column, text, ctx, 'tb-code tb-json', 80);
    case 'color':
      return color(text);
    case 'relative':
      return h('time', { class: 'tb-text', text, attrs: { title: dateTitle(value, ctx.locale) } });
    case 'boolean': {
      const b = toBoolean(value);
      if (b === null) return h('span', { class: 'tb-text', text });
      if (column.trueLabel || column.falseLabel)
        return h('span', { class: `tb-badge tone-${b ? 'green' : 'gray'}`, text });
      return h(
        'span',
        { class: `tb-bool ${b ? 'yes' : 'no'}` },
        icon(b ? 'check' : 'close'),
        h('span', { class: 'sr-only', text }),
      );
    }
    default:
      return truncated(column, text, ctx, 'tb-text');
  }
}

/**
 * Text cut after `maxLength` characters or `lines` lines, with "See all".
 *
 * @param {Column} column
 * @param {string} text
 * @param {CellContext} ctx
 * @param {string} className
 * @param {number} [defaultLength]
 * @returns {Node}
 */
function truncated(column, text, ctx, className, defaultLength) {
  const max = column.maxLength ?? defaultLength ?? 0;
  const lines = column.lines ?? 0;
  const long =
    (max > 0 && text.length > max) ||
    (lines > 0 && (text.split('\n').length > lines || text.length > lines * 70));
  if (ctx.expanded && !ctx.onToggle) return h('span', { class: className, text });
  if (!long || !ctx.onToggle) {
    const shown = long && max > 0 ? `${text.slice(0, max).trimEnd()}…` : text;
    return h('span', {
      class: className,
      text: shown,
      attrs: { title: text.length > 24 ? text.slice(0, 500) : null },
    });
  }
  const wrap = h('span', { class: `tb-more-wrap${ctx.expanded ? ' open' : ''}` });
  const shown = ctx.expanded || max <= 0 ? text : `${text.slice(0, max).trimEnd()}…`;
  const span = h('span', {
    class: `${className}${lines && !ctx.expanded ? ' tb-clamp' : ''}`,
    text: shown,
  });
  if (lines && !ctx.expanded) span.style.setProperty('--_lines', String(lines));
  wrap.append(span, seeAll(ctx));
  return wrap;
}

/**
 * @param {CellContext} ctx
 * @param {string} [label]
 * @returns {HTMLButtonElement}
 */
function seeAll(ctx, label) {
  return h('button', {
    class: 'tb-more',
    text: label ?? ctx.t(ctx.expanded ? 'tableShowLess' : 'tableSeeAll'),
    attrs: { type: 'button', tabindex: '-1', 'aria-expanded': String(ctx.expanded) },
    on: {
      click: (event) => {
        event.stopPropagation();
        ctx.onToggle?.();
      },
    },
  });
}

/**
 * Badges (one per value), colored by `colors` or by a hash of the value.
 *
 * @param {Column} column
 * @param {string[]} values
 * @param {CellContext} ctx
 * @param {boolean} dot - Status style: a colored dot before the text.
 * @param {number} [limit] - Values shown before "+N".
 * @returns {Node}
 */
function badges(column, values, ctx, dot, limit = Infinity) {
  const wrap = h('span', { class: 'tb-badges' });
  const max = ctx.expanded || !ctx.onToggle ? Infinity : limit;
  values.slice(0, max).forEach((value) => {
    const tone = toneOf(column, value);
    wrap.append(
      h(
        'span',
        { class: `tb-badge tone-${tone}${dot ? ' status' : ''}`, attrs: { title: value } },
        dot ? h('span', { class: 'tb-dot', attrs: { 'aria-hidden': 'true' } }) : null,
        h('span', { text: column.labels?.[value] ?? value }),
      ),
    );
  });
  if (values.length > limit && ctx.onToggle)
    wrap.append(seeAll(ctx, ctx.expanded ? ctx.t('tableShowLess') : `+${values.length - limit}`));
  return wrap;
}

/**
 * @param {Column} column
 * @param {string} value
 * @returns {Tone}
 */
export function toneOf(column, value) {
  const chosen = column.colors?.[value] ?? column.colors?.[value.toLowerCase()];
  if (chosen && TONES.includes(/** @type {Tone} */ (chosen))) return /** @type {Tone} */ (chosen);
  if (column.colors && !column.autoColors) return 'gray';
  let hash = 0;
  for (const ch of value.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return TONES[1 + (Math.abs(hash) % (TONES.length - 1))];
}

/**
 * @param {Column} column
 * @param {unknown} value
 * @param {string} text
 * @returns {Node}
 */
function progress(column, value, text) {
  const n = toNumber(value);
  const max = column.max || 100;
  const ratio = Number.isNaN(n) ? 0 : Math.max(0, Math.min(1, n / max));
  const thresholds = column.thresholds ?? [0.34, 0.67];
  const tone = column.colors
    ? 'teal'
    : ratio < thresholds[0]
      ? 'red'
      : ratio < thresholds[1]
        ? 'orange'
        : 'green';
  const bar = h('span', {
    class: `tb-progress tone-${column.tone ?? tone}`,
    attrs: { role: 'img', 'aria-label': text },
  });
  const fill = h('span', { class: 'tb-progress-fill' });
  fill.style.width = `${ratio * 100}%`;
  bar.append(fill);
  return h(
    'span',
    { class: 'tb-progress-wrap' },
    bar,
    h('span', { class: 'tb-progress-text', text, attrs: { 'aria-hidden': 'true' } }),
  );
}

/**
 * @param {Column} column
 * @param {unknown} value
 * @param {string} text
 * @returns {Node}
 */
function rating(column, value, text) {
  const n = toNumber(value);
  const max = Math.max(1, Math.min(10, column.max ?? 5));
  const wrap = h('span', {
    class: 'tb-rating',
    attrs: { role: 'img', 'aria-label': text, title: text },
  });
  for (let i = 1; i <= max; i += 1) {
    const star = h('span', {
      class: `tb-star${n >= i ? ' on' : n >= i - 0.5 ? ' half' : ''}`,
      text: '★',
      attrs: { 'aria-hidden': 'true' },
    });
    wrap.append(star);
  }
  return wrap;
}

/**
 * Link to `href` (a template like `/users/{id}`) or to the value itself. Only http(s),
 * mailto and relative URLs are kept.
 *
 * @param {Column} column
 * @param {unknown} value
 * @param {Row} row
 * @param {string} text
 * @returns {Node}
 */
function link(column, value, row, text) {
  const raw = column.href ? fillTemplate(column.href, row, true) : toText(value);
  const href =
    displayOf(column) === 'email' && !column.href ? safeHref(`mailto:${raw}`) : safeHref(raw);
  const label = column.linkText ? fillTemplate(column.linkText, row) : text;
  if (!href) return h('span', { class: 'tb-text', text: label });
  const external = /^https?:/i.test(href);
  return h('a', {
    class: 'tb-link',
    text: label,
    attrs: {
      href,
      target: external ? '_blank' : null,
      rel: external ? 'noopener noreferrer nofollow' : null,
      tabindex: '-1',
      title: label.length > 24 ? label : null,
    },
  });
}

/**
 * @param {Column} column
 * @param {unknown} value
 * @param {Row} row
 * @param {string} text
 * @returns {Node}
 */
function image(column, value, row, text) {
  const src = safeSrc(column.src ? fillTemplate(column.src, row, true) : toText(value));
  if (!src) return h('span', { class: 'tb-text', text });
  const img = h('img', {
    class: 'tb-image',
    attrs: {
      src,
      alt: column.alt ? fillTemplate(column.alt, row) : '',
      loading: 'lazy',
      decoding: 'async',
      referrerpolicy: 'no-referrer',
    },
  });
  if (column.size) img.style.setProperty('--_img', `${Math.max(12, Math.min(200, column.size))}px`);
  return img;
}

/**
 * Round picture (from `src`, a template) or initials, then the text.
 *
 * @param {Column} column
 * @param {unknown} value
 * @param {Row} row
 * @param {string} text
 * @returns {Node}
 */
function avatar(column, value, row, text) {
  const src = column.src ? safeSrc(fillTemplate(column.src, row, true)) : null;
  const initials = text
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const pic = h('span', {
    class: `tb-avatar tone-${toneOf({ ...column, colors: undefined }, text || '?')}`,
    attrs: { 'aria-hidden': 'true' },
  });
  if (src) {
    const img = h('img', {
      attrs: { src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' },
    });
    img.addEventListener('error', () => img.replaceWith(document.createTextNode(initials)));
    pic.append(img);
  } else pic.textContent = initials || '?';
  const subtitle = column.subtitle ? fillTemplate(column.subtitle, row) : '';
  return h(
    'span',
    { class: 'tb-person' },
    pic,
    h(
      'span',
      { class: 'tb-person-text' },
      h('span', { class: 'tb-text', text }),
      subtitle ? h('span', { class: 'tb-sub', text: subtitle }) : null,
    ),
  );
}

/**
 * @param {string} text
 * @returns {Node}
 */
function color(text) {
  const value = text.trim();
  const ok =
    /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ||
    /^(?:rgb|hsl|oklch)a?\([\d\s.,%/+-]+\)$/i.test(value);
  const swatch = h('span', { class: 'tb-swatch', attrs: { 'aria-hidden': 'true' } });
  if (ok) swatch.style.background = value;
  return h('span', { class: 'tb-color' }, swatch, h('span', { class: 'tb-code', text: value }));
}

/**
 * A value as a list: arrays as they are, strings split on commas.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function listOf(value) {
  if (Array.isArray(value)) return value.filter((v) => !isEmpty(v)).map(toText);
  if (isEmpty(value)) return [];
  return toText(value)
    .split(/\s*[,;|]\s*/)
    .filter(Boolean);
}

/**
 * Fills `{key}` placeholders with the row's values (URL-encoded for links).
 *
 * @param {string} template
 * @param {Row} row
 * @param {boolean} [encode] - URL-encode the values (links and images).
 * @returns {string}
 */
export function fillTemplate(template, row, encode = false) {
  return template.replace(/\{([\w.-]+)\}/g, (_, key) => {
    // Only the row's own values: `{constructor}` is not the source of a function.
    const text = Object.hasOwn(row, key) ? toText(row[key]) : '';
    return encode ? encodeURIComponent(text) : text;
  });
}

/**
 * Keeps http(s), mailto, tel and relative URLs.
 *
 * @param {string} value
 * @returns {string | null}
 */
export function safeHref(value) {
  const v = value.trim();
  // eslint-disable-next-line no-control-regex
  if (!v || /[\u0000-\u001f]/.test(v)) return null;
  if (/^(?:\/(?!\/)|\.{1,2}\/|#|\?)/.test(v) || !/^[a-z][a-z\d+.-]*:/i.test(v)) {
    return /^\/\//.test(v) ? null : v;
  }
  try {
    const url = new URL(v);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Image sources: http(s) and relative URLs only.
 *
 * @param {string} value
 * @returns {string | null}
 */
function safeSrc(value) {
  const href = safeHref(value);
  return href && !/^(?:mailto|tel):/i.test(href) ? href : null;
}

/**
 * @param {number} n
 * @param {string} locale
 * @returns {string}
 */
export function formatBytes(n, locale) {
  if (Number.isNaN(n)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let v = Math.abs(n);
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const text = new Intl.NumberFormat(locale, { maximumFractionDigits: v < 10 && i ? 1 : 0 }).format(
    v,
  );
  return `${n < 0 ? '-' : ''}${text} ${units[i]}`;
}

/**
 * @param {number} time
 * @param {string} locale
 * @param {string} [style]
 * @returns {string}
 */
function formatDate(time, locale, style) {
  const date = new Date(time);
  try {
    if (style === 'datetime')
      return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
    if (style === 'time') return date.toLocaleTimeString(locale, { timeStyle: 'short' });
    return date.toLocaleDateString(locale, { dateStyle: /** @type {any} */ (style) || 'medium' });
  } catch {
    return date.toISOString();
  }
}

/**
 * @param {unknown} value
 * @param {string} locale
 * @returns {string | null}
 */
function dateTitle(value, locale) {
  const time = toTime(value);
  return Number.isNaN(time) ? null : formatDate(time, locale, 'datetime');
}

/**
 * "3 days ago", "in 2 hours".
 *
 * @param {number} time
 * @param {string} locale
 * @param {number} [now]
 * @returns {string}
 */
export function relativeTime(time, locale, now = Date.now()) {
  const seconds = (time - now) / 1000;
  const units = /** @type {[Intl.RelativeTimeFormatUnit, number][]} */ ([
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ]);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size || unit === 'second')
      return format.format(Math.round(seconds / size), unit);
  }
  return '';
}
