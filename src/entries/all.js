// @ts-check
/**
 * ES module with every component (dist/esm/vitrine.js), sharing chunks with the
 * per-component modules. Call `defineAll()`.
 */
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));

export * from '../vitrine.js';
