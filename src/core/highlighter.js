// @ts-check
/**
 * highlight.js wrapper: bundled common languages, validated lazy loading of the others,
 * and sanitized DOM output.
 *
 * @module core/highlighter
 */
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import diff from 'highlight.js/lib/languages/diff';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import python from 'highlight.js/lib/languages/python';
import shell from 'highlight.js/lib/languages/shell';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { defaultLanguagesUrl, setDefaultLanguagesUrl } from './asset-urls.js';
import { getConfig } from './config.js';

export { setDefaultLanguagesUrl };
import { LANGUAGE_INDEX } from './language-index.js';
import { sanitizeHighlight } from './security.js';

/** Languages included in the main bundle. Keep in sync with scripts/languages.js. */
const BUNDLED = { bash, diff, javascript, json, markdown, plaintext, python, shell, xml, yaml };

for (const [name, definition] of Object.entries(BUNDLED)) hljs.registerLanguage(name, definition);
hljs.configure({ ignoreUnescapedHTML: true, throwUnescapedHTML: false });

/** Number of characters used for language detection. */
const DETECTION_SAMPLE = 4000;

/** @type {Map<string, string> | null} */
let aliases = null;

/** @type {Map<string, Promise<boolean>>} */
const pending = new Map();

/**
 * Maps a language name or alias to its canonical highlight.js name.
 *
 * @param {string | null | undefined} input - e.g. `"js"`, `"Python"`, `"html"`.
 * @returns {string | null} Canonical name, or `null` when unknown.
 */
export function resolveLanguage(input) {
  if (typeof input !== 'string') return null;
  const key = input.trim().toLowerCase();
  if (!key || key.length > 40) return null;
  if (Object.prototype.hasOwnProperty.call(LANGUAGE_INDEX, key)) return key;
  if (!aliases) {
    aliases = new Map();
    for (const [name, list] of Object.entries(LANGUAGE_INDEX)) {
      for (const alias of list.split(' '))
        if (alias && !aliases.has(alias)) aliases.set(alias, name);
    }
    aliases.set('text', 'plaintext');
    aliases.set('plain', 'plaintext');
  }
  return aliases.get(key) ?? null;
}

/**
 * Tells whether a language is registered and ready to use synchronously.
 *
 * @param {string} name - Canonical name.
 * @returns {boolean}
 */
export function isLanguageLoaded(name) {
  return Boolean(hljs.getLanguage(name));
}

/**
 * Loads a language on demand from `languages/<name>.js`.
 *
 * Only names present in the generated language index are ever turned into URLs.
 *
 * @param {string} name - Canonical name (see {@link resolveLanguage}).
 * @returns {Promise<boolean>} Whether the language is available.
 */
export function loadLanguage(name) {
  if (isLanguageLoaded(name)) return Promise.resolve(true);
  if (!Object.prototype.hasOwnProperty.call(LANGUAGE_INDEX, name)) return Promise.resolve(false);
  const existing = pending.get(name);
  if (existing) return existing;
  const promise = importLanguage(name);
  pending.set(name, promise);
  return promise;
}

/**
 * @param {string} name
 * @returns {Promise<boolean>}
 */
async function importLanguage(name) {
  const base = getConfig().languagesUrl || defaultLanguagesUrl();
  if (!base) return false;
  try {
    const url = new URL(
      `${name}.js`,
      new URL(base.endsWith('/') ? base : `${base}/`, document.baseURI),
    );
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const module = await import(/* @vite-ignore */ url.href);
    if (typeof module.default !== 'function') return false;
    hljs.registerLanguage(name, module.default);
    return true;
  } catch (error) {
    console.warn(`[vitrine] Could not load the "${name}" language.`, error);
    return false;
  }
}

/**
 * Detects the language of a text sample among the registered languages.
 *
 * @param {string} text
 * @returns {string} Canonical name, `"plaintext"` when unsure.
 */
export function detectLanguage(text) {
  const subset = hljs.listLanguages().filter((name) => name !== 'plaintext');
  const result = hljs.highlightAuto(text.slice(0, DETECTION_SAMPLE), subset);
  return result.language && result.relevance >= 3 ? result.language : 'plaintext';
}

/**
 * Highlights text with a registered language and returns sanitized DOM nodes.
 * Falls back to plain text when the language is not registered.
 *
 * @param {string} text
 * @param {string} language - Canonical, registered language name.
 * @returns {DocumentFragment}
 */
export function highlight(text, language) {
  if (language === 'plaintext' || !isLanguageLoaded(language)) {
    const fragment = document.createDocumentFragment();
    fragment.append(document.createTextNode(text));
    return fragment;
  }
  const result = hljs.highlight(text, { language, ignoreIllegals: true });
  return sanitizeHighlight(result.value);
}
