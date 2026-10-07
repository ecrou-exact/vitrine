// @ts-check
/**
 * Classic `<script>` entry point: exposes the global `Vitrine` namespace and defines
 * all elements automatically.
 */
import { setDefaultLanguagesUrl } from './core/highlighter.js';
import * as Vitrine from './vitrine.js';

const script = document.currentScript;
if (script instanceof HTMLScriptElement && script.src) {
  setDefaultLanguagesUrl(new URL('./languages/', script.src).href);
}

/** @type {any} */ (globalThis).Vitrine = Object.freeze({ ...Vitrine });
Vitrine.defineAll();
