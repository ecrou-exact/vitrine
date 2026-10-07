// @ts-check
/**
 * Entry point for the classic `<script>` build: exposes the global
 * `Vitrine` namespace and defines all elements automatically.
 */
import * as Vitrine from './index.js';

/** @type {any} */ (globalThis).Vitrine = Vitrine;
Vitrine.defineAll();
