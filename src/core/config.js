// @ts-check
/**
 * Global configuration shared by every Vitrine element.
 *
 * Values set here act as defaults: attributes on an element always win.
 *
 * @module core/config
 */

/**
 * @typedef {object} VitrineConfig
 * @property {string} theme - Default theme name, or `"auto"` to follow `prefers-color-scheme`.
 * @property {string} lightTheme - Theme used by `"auto"` when the user prefers a light scheme.
 * @property {string} darkTheme - Theme used by `"auto"` when the user prefers a dark scheme.
 * @property {string} lang - Default UI locale (e.g. `"en"`, `"fr"`).
 * @property {number} maxSize - Maximum content length, in characters. Larger content is refused.
 * @property {number} highlightLimit - Content longer than this (in characters) is shown without
 *   syntax highlighting, to keep the page responsive.
 * @property {number} maxDepth - Maximum nesting depth accepted by the JSON parser.
 * @property {number} fetchTimeout - Timeout for `src` requests, in milliseconds.
 * @property {string} languagesUrl - Base URL of the lazy-loaded highlight.js language files.
 *   Empty means "next to the Vitrine script".
 */

/** @type {Readonly<VitrineConfig>} */
export const DEFAULT_CONFIG = Object.freeze({
  theme: 'auto',
  lightTheme: 'light',
  darkTheme: 'dark',
  lang: 'en',
  maxSize: 2 * 1024 * 1024,
  highlightLimit: 300_000,
  maxDepth: 512,
  fetchTimeout: 15_000,
  languagesUrl: '',
});

/** Hard ceilings that configuration cannot exceed. */
const CEILINGS = Object.freeze({
  maxSize: 50 * 1024 * 1024,
  highlightLimit: 5 * 1024 * 1024,
  maxDepth: 10_000,
  fetchTimeout: 120_000,
});

/** @type {VitrineConfig} */
const current = { ...DEFAULT_CONFIG };

/** @typedef {(changed: Set<keyof VitrineConfig>) => void} ConfigListener */

/** @type {Set<ConfigListener>} */
const listeners = new Set();

/**
 * Returns a read-only snapshot of the current configuration.
 *
 * @returns {Readonly<VitrineConfig>}
 */
export function getConfig() {
  return Object.freeze({ ...current });
}

/**
 * Updates the global configuration. Unknown keys and invalid values are ignored
 * (a warning is logged), so a typo never breaks the page.
 *
 * Connected elements re-render with the new values. They reload their content (and
 * fetch `src` again) only when `maxSize` changes, since it decides what may be shown.
 *
 * @since 0.1.0
 * @param {Partial<VitrineConfig>} options
 * @returns {Readonly<VitrineConfig>} The resulting configuration.
 *
 * @example
 * Vitrine.configure({ theme: 'sepia', lang: 'fr', maxSize: 500_000 });
 */
export function configure(options) {
  if (!options || typeof options !== 'object') return getConfig();
  const before = { ...current };
  for (const [key, value] of Object.entries(options)) {
    applyOption(key, value);
  }
  const changed = new Set(
    /** @type {(keyof VitrineConfig)[]} */ (Object.keys(current)).filter(
      (key) => current[key] !== before[key],
    ),
  );
  if (changed.size) for (const listener of listeners) listener(changed);
  return getConfig();
}

/**
 * Validates and applies a single option.
 *
 * @param {string} key
 * @param {unknown} value
 */
function applyOption(key, value) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key)) {
    console.warn(`[vitrine] Unknown configuration option "${key}".`);
    return;
  }
  const k = /** @type {keyof VitrineConfig} */ (key);
  const expected = typeof DEFAULT_CONFIG[k];
  if (expected === 'number') {
    const ceiling = CEILINGS[/** @type {keyof typeof CEILINGS} */ (k)];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      console.warn(`[vitrine] Option "${key}" must be a positive number.`);
      return;
    }
    /** @type {any} */ (current)[k] = Math.min(Math.floor(value), ceiling ?? value);
    return;
  }
  if (typeof value !== 'string' || value.length > 2048) {
    console.warn(`[vitrine] Option "${key}" must be a string.`);
    return;
  }
  /** @type {any} */ (current)[k] = value.trim();
}

/**
 * Restores the default configuration. Mainly useful in tests.
 */
export function resetConfig() {
  Object.assign(current, DEFAULT_CONFIG);
  const all = new Set(/** @type {(keyof VitrineConfig)[]} */ (Object.keys(DEFAULT_CONFIG)));
  for (const listener of listeners) listener(all);
}

/**
 * Subscribes to configuration changes.
 *
 * @param {ConfigListener} listener - Receives the names of the options that changed.
 * @returns {() => void} Unsubscribe function.
 */
export function onConfigChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
