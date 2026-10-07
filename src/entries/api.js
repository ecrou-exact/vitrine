// @ts-check
/**
 * Public API without any component, shared by the per-component modules
 * (configuration, themes and locales are the same for every element on the page).
 *
 * @module entries/api
 */
export { configure, getConfig } from '../core/config.js';
export { EVENTS } from '../core/events.js';
export { registerLocale } from '../core/i18n.js';
export { BUILT_IN_THEMES, getTheme, listThemes, registerTheme } from '../core/themes.js';
export { listSyntaxThemes } from '../core/syntax-themes.js';
