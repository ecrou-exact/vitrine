// @ts-check
/**
 * ES module entry point. Elements are not defined automatically: call `defineAll()`.
 *
 * @module vitrine/esm
 */
import { setDefaultLanguagesUrl } from './core/highlighter.js';
import { setDefaultSyntaxThemesUrl } from './core/syntax-themes.js';

setDefaultLanguagesUrl(new URL('./languages/', import.meta.url).href);
setDefaultSyntaxThemesUrl(new URL('./syntax-themes/', import.meta.url).href);

export * from './vitrine.js';
