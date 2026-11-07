// @ts-check
/**
 * Questions and answers read from JSON.
 *
 * @module components/faq/model
 */
import { firstText, parseList } from '../../core/data.js';

/**
 * @typedef {object} FaqItem
 * @property {string} id - Unique, usable in a link: `#id`.
 * @property {string} question
 * @property {string} answer
 * @property {string} category
 */

/**
 * @param {string} value
 * @returns {string} Lower-case words joined by dashes.
 */
export function slug(value) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * @param {string} source
 * @returns {{ ok: true, items: FaqItem[] } | { ok: false, error: 'json' | 'shape', message: string }}
 */
export function parseFaq(source) {
  const result = parseList(source, ['items', 'faq', 'faqs', 'questions']);
  if (!result.ok) return result;
  /** @type {Set<string>} */
  const used = new Set();
  /** @type {FaqItem[]} */
  const items = [];
  for (const item of result.items) {
    const question = firstText(item, ['question', 'q', 'title'], 500);
    if (!question) continue;
    const base = slug(firstText(item, ['id'], 80) || question) || `question-${items.length + 1}`;
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    items.push({
      id,
      question,
      answer: firstText(item, ['answer', 'a', 'text', 'content'], 20000),
      category: firstText(item, ['category', 'group', 'topic'], 100),
    });
  }
  return { ok: true, items };
}

/**
 * @param {FaqItem[]} items
 * @param {string} query
 * @param {string | null} category
 * @returns {FaqItem[]} Items of a category that hold every word of a query.
 */
export function filterFaq(items, query, category) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (category !== null && item.category !== category) return false;
    const haystack = `${item.question}\n${item.answer}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * The questions as schema.org FAQPage data, to put in the page for search engines.
 *
 * @param {FaqItem[]} items
 * @returns {Record<string, unknown>}
 */
export function faqStructuredData(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}
