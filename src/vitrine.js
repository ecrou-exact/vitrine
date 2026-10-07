// @ts-check
/**
 * Vitrine — framework-free web components to display code, Markdown and JSON.
 *
 * This module holds the public API shared by the ES module and the classic script builds.
 *
 * @module vitrine
 * @since 0.1.0
 */
import { VtCode } from './components/code/vt-code.js';
import { VtCsv } from './components/csv/vt-csv.js';
import { VtDiff } from './components/diff/vt-diff.js';
import { VtTags } from './components/tags/vt-tags.js';
import { VtHttp } from './components/http/vt-http.js';
import { VtJson } from './components/json/vt-json.js';
import { VtLog } from './components/log/vt-log.js';
import { VtMarkdown } from './components/markdown/vt-markdown.js';
import { VtTerminal } from './components/terminal/vt-terminal.js';
import { VtTree } from './components/tree/vt-tree.js';
import { configure, getConfig } from './core/config.js';
import { EVENTS } from './core/events.js';
import { registerLocale } from './core/i18n.js';
import { listSyntaxThemes } from './core/syntax-themes.js';
import { BUILT_IN_THEMES, getTheme, listThemes, registerTheme } from './core/themes.js';

export {
  VtCode,
  VtCsv,
  VtDiff,
  VtTags,
  VtMarkdown,
  VtJson,
  VtTerminal,
  VtTree,
  VtHttp,
  VtLog,
  configure,
  getConfig,
  EVENTS,
  registerLocale,
  registerTheme,
  getTheme,
  listThemes,
  BUILT_IN_THEMES,
  listSyntaxThemes,
};

/* global __VITRINE_VERSION__ */

/**
 * Library version, injected at build time.
 * @type {string}
 */
export const version =
  // @ts-ignore -- replaced by esbuild `define`
  typeof __VITRINE_VERSION__ !== 'undefined' ? __VITRINE_VERSION__ : '0.0.0-dev';

/**
 * Element tag names and their classes.
 *
 * @type {ReadonlyMap<string, CustomElementConstructor>}
 */
export const registry = new Map(
  /** @type {[string, CustomElementConstructor][]} */ ([
    ['vt-code', VtCode],
    ['vt-markdown', VtMarkdown],
    ['vt-json', VtJson],
    ['vt-csv', VtCsv],
    ['vt-tags', VtTags],
    ['vt-diff', VtDiff],
    ['vt-terminal', VtTerminal],
    ['vt-tree', VtTree],
    ['vt-http', VtHttp],
    ['vt-log', VtLog],
  ]),
);

/** Maps `render()` types to tag names. */
const TYPES = /** @type {const} */ ({
  code: 'vt-code',
  markdown: 'vt-markdown',
  json: 'vt-json',
  csv: 'vt-csv',
  tags: 'vt-tags',
  diff: 'vt-diff',
  terminal: 'vt-terminal',
  tree: 'vt-tree',
  http: 'vt-http',
  log: 'vt-log',
});

/**
 * Defines every Vitrine custom element that is not already defined.
 * Safe to call several times, and safe when another copy of Vitrine already
 * defined the elements.
 *
 * @since 0.1.0
 * @returns {string[]} The tag names defined by this call.
 *
 * @example
 * import { defineAll } from './vitrine.esm.js';
 * defineAll();
 */
export function defineAll() {
  /** @type {string[]} */
  const defined = [];
  for (const [tag, ctor] of registry) {
    if (!customElements.get(tag)) {
      customElements.define(tag, ctor);
      defined.push(tag);
    }
  }
  return defined;
}

/**
 * @typedef {object} RenderOptions
 * @property {keyof typeof TYPES} type - Component type.
 * @property {string} [content] - Content to display (set as a property, never parsed as HTML).
 * @property {"simple"|"full"} [variant] - Feature preset.
 * @property {Record<string, string | number | boolean | null | undefined>} [options] -
 *   Attributes, in camelCase or kebab-case (`lineNumbers` or `line-numbers`).
 *   `true` sets an empty attribute, `false` sets `"false"`, `null`/`undefined` skip it.
 *   Event handler names (`onclick`…) are ignored.
 */

/**
 * Creates a Vitrine element, configures it and puts it in `target` (replacing its children).
 *
 * @since 0.1.0
 * @param {Element} target - Container element.
 * @param {RenderOptions} options
 * @returns {HTMLElement} The created element.
 *
 * @example
 * Vitrine.render(document.querySelector('#target'), {
 *   type: 'code',
 *   content: source,
 *   variant: 'full',
 *   options: { language: 'python', highlightLines: '2-3' },
 * });
 */
export function render(target, options) {
  if (!(target instanceof Element))
    throw new TypeError('[vitrine] render(): target must be an Element.');
  const tag = TYPES[/** @type {keyof typeof TYPES} */ (options?.type)];
  if (!tag) throw new TypeError(`[vitrine] render(): unknown type "${options?.type}".`);
  defineAll();
  const element = document.createElement(tag);
  if (options.variant) element.setAttribute('variant', options.variant);
  for (const [key, value] of Object.entries(options.options ?? {})) {
    const name = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    // Event handler attributes (onclick, onmouseover…) are never set. Vitrine's own
    // attributes that start with "on" contain a dash (on-invalid), handlers never do.
    if (!/^[a-z][a-z0-9-]*$/.test(name) || /^on[a-z]*$/.test(name)) continue;
    if (value === null || value === undefined) continue;
    element.setAttribute(name, value === true ? '' : String(value));
  }
  if (options.content !== undefined) /** @type {any} */ (element).content = options.content;
  target.replaceChildren(element);
  return element;
}
