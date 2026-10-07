// @ts-check
/**
 * Classic `<script>` entry point: exposes the global `Vitrine` namespace and defines
 * all elements automatically.
 */
import { setDefaultLanguagesUrl } from './core/highlighter.js';
import { setDefaultSyntaxThemesUrl } from './core/syntax-themes.js';
import { setDefaultVendorUrl } from './core/asset-urls.js';
import * as Vitrine from './vitrine.js';

const script = document.currentScript;
if (script instanceof HTMLScriptElement && script.src) {
  setDefaultLanguagesUrl(new URL('./languages/', script.src).href);
  setDefaultSyntaxThemesUrl(new URL('./syntax-themes/', script.src).href);
  setDefaultVendorUrl(new URL('./vendor/', script.src).href);
}

/** @type {any} */ (globalThis).Vitrine = Object.freeze({ ...Vitrine });
Vitrine.defineAll();
