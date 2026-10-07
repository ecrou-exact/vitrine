// @ts-check
/**
 * Vitrine — framework-free web components to display code, Markdown and JSON.
 *
 * @module vitrine
 * @since 0.1.0
 */

/* global __VITRINE_VERSION__ */

/**
 * Library version, injected at build time.
 * @type {string}
 */
export const version =
  // @ts-ignore -- replaced by esbuild `define`
  typeof __VITRINE_VERSION__ !== 'undefined' ? __VITRINE_VERSION__ : '0.0.0-dev';

/**
 * Registry of element tag names to their classes.
 * Components register themselves here as they are implemented.
 *
 * @type {Map<string, CustomElementConstructor>}
 */
export const registry = new Map();

/**
 * Defines every Vitrine custom element that is not already defined.
 * Safe to call multiple times.
 *
 * @since 0.1.0
 * @returns {string[]} The tag names that were defined by this call.
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
