// @ts-check
/**
 * Files of <vt-upload>: sizes written as people write them, the `accept` rules of
 * `<input type="file">`, why a file is refused, and the kind of a file for its icon.
 *
 * @module components/upload/files
 */

const UNITS = /** @type {Record<string, number>} */ ({
  b: 1,
  k: 1e3,
  kb: 1e3,
  ko: 1e3,
  kib: 1024,
  m: 1e6,
  mb: 1e6,
  mo: 1e6,
  mib: 1024 ** 2,
  g: 1e9,
  gb: 1e9,
  go: 1e9,
  gib: 1024 ** 3,
});

/**
 * @param {unknown} value - `5MB`, `500 KB`, `1.5 MiB`, `2Mo`, or a number of bytes.
 * @returns {number} Bytes, or 0 when it cannot be read.
 */
export function parseSize(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*([a-z]*)\s*$/i.exec(String(value ?? ''));
  if (!match) return 0;
  const unit = UNITS[(match[2] || 'b').toLowerCase()];
  if (!unit) return 0;
  const bytes = Math.floor(Number(match[1].replace(',', '.')) * unit);
  return Number.isFinite(bytes) && bytes > 0 ? Math.min(bytes, Number.MAX_SAFE_INTEGER) : 0;
}

/**
 * @param {number} bytes
 * @param {string} [locale]
 * @returns {string} "1.2 MB", in the units of the interface (powers of 1000).
 */
export function formatSize(bytes, locale = 'en') {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'];
  let value = Math.max(0, bytes);
  let index = 0;
  while (value >= 1000 && index < units.length - 1) {
    value /= 1000;
    index += 1;
  }
  try {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: units[index],
      unitDisplay: index === 0 ? 'long' : 'short',
      maximumFractionDigits: value < 10 && index > 0 ? 1 : 0,
    }).format(value);
  } catch {
    return `${Math.round(value * 10) / 10} ${['B', 'kB', 'MB', 'GB'][index]}`;
  }
}

/**
 * @param {string | null} accept - As on `<input type="file">`: `image/*,.pdf,application/json`.
 * @returns {string[]} The rules, in lower case.
 */
export function parseAccept(accept) {
  return String(accept ?? '')
    .split(',')
    .map((rule) => rule.trim().toLowerCase())
    .filter((rule) => /^(\.[\w.+-]+|[\w.+-]+\/(\*|[\w.+-]+))$/.test(rule))
    .slice(0, 100);
}

/**
 * Whether a file matches the `accept` rules, as the browser does: by extension, by type, or
 * by a family of types (`image/*`).
 *
 * @param {{ name: string, type: string }} file
 * @param {string[]} rules
 * @returns {boolean}
 */
export function accepts(file, rules) {
  if (!rules.length) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

/**
 * @typedef {object} FileRules
 * @property {string[]} accept
 * @property {number} maxSize - Bytes, 0 for no limit.
 * @property {number} minSize - Bytes.
 */

/**
 * Why a file is refused, or `''`.
 *
 * @param {{ name: string, type: string, size: number }} file
 * @param {FileRules} rules
 * @returns {'' | 'type' | 'tooLarge' | 'tooSmall' | 'empty'}
 */
export function checkFile(file, rules) {
  if (!accepts(file, rules.accept)) return 'type';
  if (file.size === 0) return 'empty';
  if (rules.maxSize && file.size > rules.maxSize) return 'tooLarge';
  if (rules.minSize && file.size < rules.minSize) return 'tooSmall';
  return '';
}

/**
 * The rules written for people: "PDF, PNG or JPG".
 *
 * @param {string[]} rules
 * @returns {string[]}
 */
export function acceptNames(rules) {
  const names = rules.map((rule) => {
    if (rule.startsWith('.')) return rule.slice(1).toUpperCase();
    if (rule.endsWith('/*')) return rule.charAt(0).toUpperCase() + rule.slice(1, -2);
    const sub = rule.split('/')[1] ?? rule;
    return (SUBTYPES[sub] ?? sub).toUpperCase();
  });
  return [...new Set(names)];
}

/** Usual names of some types. */
const SUBTYPES = /** @type {Record<string, string>} */ ({
  jpeg: 'jpg',
  'svg+xml': 'svg',
  plain: 'txt',
  'vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'vnd.ms-excel': 'xls',
  msword: 'doc',
  'x-zip-compressed': 'zip',
});

/**
 * @param {{ name: string, type: string }} file
 * @returns {'image' | 'video' | 'audio' | 'pdf' | 'text' | 'archive' | 'file'}
 */
export function fileKind(file) {
  const type = (file.type || '').toLowerCase();
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (/zip|tar|gzip|rar|7z/.test(type) || ['zip', 'tar', 'gz', 'rar', '7z'].includes(ext))
    return 'archive';
  if (
    type.startsWith('text/') ||
    /json|xml|yaml|csv/.test(type) ||
    ['txt', 'md', 'csv', 'json', 'xml', 'yml', 'yaml', 'log'].includes(ext)
  )
    // prettier-ignore
    return 'text';
  return 'file';
}

/** Images shown as a thumbnail: types every browser draws, and not too large to read. */
export const PREVIEW_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];
export const PREVIEW_MAX = 8e6;
