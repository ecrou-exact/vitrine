// @ts-check
/**
 * Site search: an index of pages or records read from JSON, and a ranking that forgives case,
 * accents and one typo, with the places of the matches to highlight them.
 *
 * Positions are counted in code points, so text with emoji or accents is cut where it should.
 *
 * @module components/search/engine
 */
import { firstText, isObject, safeLink, text } from '../../core/data.js';

/**
 * @typedef {object} SearchEntry
 * @property {string} id - Unique: a UUID, a slug, or the address.
 * @property {string} title
 * @property {string} url - Empty when the address comes from `url-template`.
 * @property {string} section - Group shown above the result.
 * @property {string} content - Text searched and shown as an extract.
 * @property {string[]} keywords - Searched, never shown.
 * @property {boolean} featured - Suggested before anything is typed.
 */

/** @typedef {[number, number][]} Ranges */

/**
 * @typedef {object} SearchResult
 * @property {SearchEntry} entry
 * @property {number} score
 * @property {Ranges} title - Matches in the title.
 * @property {string} extract - Part of the content around the first match.
 * @property {Ranges} extractRanges - Matches in the extract.
 */

/** Entries read from one index. */
export const MAX_ENTRIES = 20000;
/** Characters of content searched per entry. */
const MAX_CONTENT = 5000;
/** Characters of an extract. */
const EXTRACT = 140;
/** Words of a query. */
const MAX_WORDS = 8;

/**
 * Lower case without accents, one code point for one code point, so positions stay the same.
 *
 * @param {string} value
 * @returns {string[]}
 */
export function foldChars(value) {
  return Array.from(value, foldChar);
}

/** Folded characters other than ASCII, worked out once. */
const FOLDED_CHARS = new Map();

/**
 * @param {string} char - One code point.
 * @returns {string} One code point.
 */
function foldChar(char) {
  const code = char.charCodeAt(0);
  if (code < 128) return code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : char;
  let folded = FOLDED_CHARS.get(char);
  if (folded === undefined) {
    const plain = char.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    folded = (Array.from(plain)[0] ?? char).toLowerCase();
    if (FOLDED_CHARS.size < 5000) FOLDED_CHARS.set(char, folded);
  }
  return folded;
}

/**
 * @param {string} value
 * @returns {string}
 */
export function fold(value) {
  // Plain ASCII, most indexes: the same result without a look at each character.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(value)) return value.toLowerCase();
  return foldChars(value).join('');
}

/**
 * @param {string} query
 * @returns {string[]} The words of a query, folded.
 */
export function words(query) {
  return fold(query)
    .split(/[\s,;:/|"'()[\]{}<>]+/)
    .filter(Boolean)
    .slice(0, MAX_WORDS);
}

/**
 * Reads an index: a list of entries, or an object with `entries` (also `items`, `pages`,
 * `results`, `documents`, `hits`).
 *
 * @param {string} source
 * @returns {{ ok: true, entries: SearchEntry[] } | { ok: false, error: 'json' | 'shape', message: string }}
 */
export function parseIndex(source) {
  if (!source.trim()) return { ok: true, entries: [] };
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(source);
  } catch (error) {
    return { ok: false, error: 'json', message: error instanceof Error ? error.message : '' };
  }
  const keys = ['entries', 'items', 'pages', 'results', 'documents', 'hits'];
  const list = Array.isArray(data) ? data : isObject(data) ? keys.map((key) => data[key]).find(Array.isArray) : null; // prettier-ignore
  if (!list)
    return { ok: false, error: 'shape', message: keys.map((key) => `"${key}"`).join(', ') };
  /** @type {SearchEntry[]} */
  const entries = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const item of list) {
    if (entries.length >= MAX_ENTRIES) break;
    const entry = isObject(item) ? readEntry(item) : null;
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  return { ok: true, entries };
}

/**
 * @param {Record<string, any>} item
 * @returns {SearchEntry | null}
 */
function readEntry(item) {
  const title = firstText(item, ['title', 'name', 'label', 't'], 300);
  if (!title) return null;
  const url = safeLink(item.url ?? item.href ?? item.link ?? item.u) ?? '';
  const id = firstText(item, ['id', 'uuid', 'slug', 'key', 'objectID'], 200) || url || title;
  const keywords = Array.isArray(item.keywords ?? item.tags) ? (item.keywords ?? item.tags) : [];
  return {
    id,
    title,
    url,
    section: firstText(item, ['section', 'group', 'category', 'type', 'p'], 100),
    content: firstText(
      item,
      ['content', 'description', 'summary', 'excerpt', 'text', 'body'],
      MAX_CONTENT,
    ),
    keywords: keywords
      .slice(0, 50)
      .map((/** @type {unknown} */ k) => text(k, 100))
      .filter(Boolean),
    featured: item.featured === true,
  };
}

/**
 * Whether two words are one edit apart (a letter added, removed, changed or two swapped).
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function oneEdit(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/**
 * Where every occurrence of some words is in a text.
 *
 * @param {string[]} folded - The text, folded, one code point per item.
 * @param {string[]} wanted
 * @returns {Ranges} Sorted, merged ranges.
 */
function findRanges(folded, wanted) {
  const haystack = folded.join('');
  // Index of each code point in the string, to turn string positions into code points.
  /** @type {number[]} */
  const at = [];
  folded.forEach((char, index) => {
    for (let k = 0; k < char.length; k += 1) at.push(index);
  });
  /** @type {Ranges} */
  const ranges = [];
  for (const word of wanted) {
    for (
      let from = haystack.indexOf(word);
      from !== -1 && ranges.length < 200;
      from = haystack.indexOf(word, from + word.length)
    ) {
      ranges.push([at[from], at[from + word.length - 1] + 1]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  /** @type {Ranges} */
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/**
 * @param {string} title - Folded.
 * @param {string[]} parts - Its words.
 * @param {string} word
 * @returns {number} How well a word matches a title: whole word, start of a word, inside, or
 *   one typo away from a word.
 */
function titleScore(title, parts, word) {
  if (parts.includes(word)) return 10;
  if (parts.some((part) => part.startsWith(word))) return 8;
  if (title.includes(word)) return 5;
  if (word.length >= 4 && parts.some((part) => oneEdit(part, word) || (part.length > word.length && oneEdit(part.slice(0, word.length), word)))) return 3; // prettier-ignore
  return 0;
}

/**
 * @typedef {{ title: string, parts: string[], keywords: string, section: string, content: string }} Folded
 */

/** @type {WeakMap<SearchEntry, Folded>} The folded text of entries, kept while they live. */
const FOLDED = new WeakMap();

/**
 * The text of an entry folded for searching, worked out the first time only: a search as you
 * type does not fold the whole index again at each key.
 *
 * @param {SearchEntry} entry
 * @returns {Folded}
 */
function foldedOf(entry) {
  let folded = FOLDED.get(entry);
  if (!folded) {
    const title = fold(entry.title);
    folded = {
      title,
      parts: title.split(/[^\p{L}\p{N}]+/u).filter(Boolean),
      keywords: fold(entry.keywords.join(' ')),
      section: fold(entry.section),
      content: fold(entry.content),
    };
    FOLDED.set(entry, folded);
  }
  return folded;
}

/**
 * Scores an entry: every word must be found somewhere.
 *
 * @param {SearchEntry} entry
 * @param {string[]} wanted
 * @returns {number} 0 when a word is missing.
 */
export function scoreEntry(entry, wanted) {
  const { title, parts, keywords, section, content } = foldedOf(entry);
  let total = 0;
  for (const word of wanted) {
    const best = Math.max(
      titleScore(title, parts, word),
      keywords.includes(word) ? 6 : 0,
      section.includes(word) ? 3 : 0,
      content.includes(word) ? 2 : 0,
    );
    if (!best) return 0;
    total += best;
  }
  if (wanted.length > 1 && title.includes(wanted.join(' '))) total += 5;
  // Shorter titles first when the rest is equal, then suggested entries.
  return total + (entry.featured ? 1 : 0) - title.length / 500;
}

/**
 * An extract of the content around the first match, cut on spaces.
 *
 * @param {string} content
 * @param {string[]} wanted
 * @returns {{ extract: string, ranges: Ranges }}
 */
export function extractOf(content, wanted) {
  const chars = Array.from(content);
  const folded = foldChars(content);
  const all = findRanges(folded, wanted);
  if (!chars.length) return { extract: '', ranges: [] };
  const anchor = all.length ? all[0][0] : 0;
  let start = Math.max(0, anchor - 40);
  while (start > 0 && start > anchor - 60 && chars[start - 1] !== ' ') start -= 1;
  let end = Math.min(chars.length, start + EXTRACT);
  while (end < chars.length && end < start + EXTRACT + 20 && chars[end] !== ' ') end += 1;
  const lead = start > 0 ? '…' : '';
  const tail = end < chars.length ? '…' : '';
  const shift = lead ? 1 - start : -start;
  const ranges = all
    .filter(([s, e]) => s >= start && e <= end)
    .map(/** @returns {[number, number]} */ ([s, e]) => [s + shift, e + shift]);
  return { extract: `${lead}${chars.slice(start, end).join('').trim()}${tail}`, ranges };
}

/**
 * Searches an index.
 *
 * @param {SearchEntry[]} entries
 * @param {string} query
 * @param {number} [limit]
 * @returns {SearchResult[]} Best first.
 */
export function searchIndex(entries, query, limit = 12) {
  const wanted = words(query);
  if (!wanted.length) return [];
  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, wanted) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry, score }) => toResult(entry, score, wanted));
}

/**
 * @param {SearchEntry} entry
 * @param {number} score
 * @param {string[]} wanted
 * @returns {SearchResult}
 */
export function toResult(entry, score, wanted) {
  const { extract, ranges } = extractOf(entry.content, wanted);
  return {
    entry,
    score,
    title: findRanges(foldChars(entry.title), wanted),
    extract,
    extractRanges: ranges,
  };
}

/**
 * The address of an entry: its own, else `template` with `{id}` replaced.
 *
 * @param {SearchEntry} entry
 * @param {string | null} template
 * @returns {string | null}
 */
export function entryUrl(entry, template) {
  if (entry.url) return entry.url;
  if (!template || !template.includes('{id}')) return null;
  return safeLink(template.replace(/\{id\}/g, encodeURIComponent(entry.id)));
}
