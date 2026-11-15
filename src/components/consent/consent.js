// @ts-check
/**
 * Cookie consent: categories, the choice stored with its date and version, Google Consent
 * Mode v2 signals, and the scripts and frames of the page held back until their category is
 * accepted.
 *
 * @module components/consent/consent
 */
import { isObject, safeLink, text } from '../../core/data.js';

/** Built-in categories, in order. `necessary` is always on. */
export const BUILT_IN = /** @type {const} */ ([
  'necessary',
  'preferences',
  'analytics',
  'marketing',
]);

/** Google Consent Mode v2 types each built-in category grants. */
export const CONSENT_MODE = /** @type {Record<string, string[]>} */ ({
  necessary: ['security_storage'],
  preferences: ['functionality_storage', 'personalization_storage'],
  analytics: ['analytics_storage'],
  marketing: ['ad_storage', 'ad_user_data', 'ad_personalization'],
});

/** Every Consent Mode type, so an update says all of them. */
const ALL_TYPES = [...new Set(Object.values(CONSENT_MODE).flat())];

/**
 * @typedef {object} Cookie
 * @property {string} name
 * @property {string} provider
 * @property {string} purpose
 * @property {string} duration
 */

/**
 * @typedef {object} Category
 * @property {string} id
 * @property {string} label - Empty: the built-in label.
 * @property {string} description - Empty: the built-in description.
 * @property {boolean} required
 * @property {string[]} consentMode - Consent Mode types it grants.
 * @property {Cookie[]} cookies
 */

/**
 * @typedef {object} Settings
 * @property {Category[]} categories
 * @property {string} title
 * @property {string} text
 * @property {string | null} policy
 * @property {string} version
 */

/**
 * @typedef {object} Choice
 * @property {string} id - Random id of this consent, for a log.
 * @property {string} date - ISO 8601.
 * @property {string} version - Version of the settings agreed to.
 * @property {Record<string, boolean>} categories
 * @property {'accept' | 'reject' | 'save' | 'gpc'} source
 */

const ID = /^[a-z][a-z0-9_-]{0,39}$/;

/**
 * @param {string} id
 * @returns {Category}
 */
function builtIn(id) {
  return { id, label: '', description: '', required: id === 'necessary', consentMode: CONSENT_MODE[id] ?? [], cookies: [] }; // prettier-ignore
}

/**
 * Reads the settings: `{ categories, title, text, policy, version }`, a list of categories,
 * or category ids. `necessary` is always there, first.
 *
 * @param {unknown} value
 * @param {string[]} [ids] - Category ids when no categories are given.
 * @returns {Settings}
 */
export function readSettings(value, ids = []) {
  const item = isObject(value) ? value : {};
  const list = Array.isArray(value) ? value : Array.isArray(item.categories) ? item.categories : ids.length ? ids : BUILT_IN; // prettier-ignore
  /** @type {Category[]} */
  const categories = [];
  for (const entry of list.slice(0, 20)) {
    const raw = typeof entry === 'string' ? { id: entry } : isObject(entry) ? entry : null;
    const id = text(raw?.id, 40).toLowerCase();
    if (!raw || !ID.test(id) || categories.some((c) => c.id === id)) continue;
    const base = builtIn(id);
    categories.push({
      id,
      label: text(raw.label, 100),
      description: text(raw.description, 1000),
      required: id === 'necessary' || raw.required === true,
      consentMode: Array.isArray(raw.consentMode) ? raw.consentMode.map((t) => text(t, 40)).filter((t) => /^[a-z_]+$/.test(t)) : base.consentMode, // prettier-ignore
      cookies: Array.isArray(raw.cookies)
        ? raw.cookies.slice(0, 100).filter(isObject).map((c) => ({ name: text(c.name, 100), provider: text(c.provider, 100), purpose: text(c.purpose, 500), duration: text(c.duration, 100) })).filter((c) => c.name) // prettier-ignore
        : [],
    });
  }
  if (!categories.some((c) => c.id === 'necessary')) categories.unshift(builtIn('necessary'));
  else categories.sort((a, b) => (a.id === 'necessary' ? -1 : b.id === 'necessary' ? 1 : 0));
  return {
    categories,
    title: text(item.title, 200),
    text: text(item.text, 2000),
    policy: safeLink(item.policy),
    version: text(item.version, 40),
  };
}

/**
 * @param {Settings} settings
 * @param {boolean | ((category: Category) => boolean)} on
 * @returns {Record<string, boolean>} A choice for every category; required ones are on.
 */
export function choose(settings, on) {
  return Object.fromEntries(settings.categories.map((c) => [c.id, c.required || (typeof on === 'function' ? on(c) : on)])); // prettier-ignore
}

/**
 * Reads a stored choice, if it is still valid: same version, not older than `days`.
 *
 * @param {string | null} raw
 * @param {Settings} settings
 * @param {{ version: string, days: number, now: number }} options
 * @returns {Choice | null}
 */
export function readChoice(raw, settings, options) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!isObject(value) || !isObject(value.categories)) return null;
    if (text(value.version, 40) !== options.version) return null;
    const date = Date.parse(text(value.date, 40));
    if (Number.isNaN(date) || date > options.now + 60000 || options.now - date > options.days * 86400000) return null; // prettier-ignore
    const stored = /** @type {Record<string, unknown>} */ (value.categories);
    // A category added since the choice was made is off until asked.
    const categories = choose(settings, (c) => stored[c.id] === true);
    const source = ['accept', 'reject', 'save', 'gpc'].includes(value.source) ? value.source : 'save'; // prettier-ignore
    return { id: text(value.id, 64), date: new Date(date).toISOString(), version: options.version, categories, source }; // prettier-ignore
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, boolean>} categories
 * @param {Choice['source']} source
 * @param {string} version
 * @param {number} now
 * @returns {Choice}
 */
export function makeChoice(categories, source, version, now) {
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(now);
  return { id, date: new Date(now).toISOString(), version, categories: { ...categories }, source };
}

/**
 * The `gtag('consent', 'update', …)` value of a choice.
 *
 * @param {Settings} settings
 * @param {Record<string, boolean>} categories
 * @returns {Record<string, 'granted' | 'denied'>}
 */
export function consentModeOf(settings, categories) {
  /** @type {Record<string, 'granted' | 'denied'>} */
  const out = Object.fromEntries(ALL_TYPES.map((t) => [t, 'denied']));
  for (const c of settings.categories) for (const type of c.consentMode) if (categories[c.id]) out[type] = 'granted'; // prettier-ignore
  return out;
}

/**
 * @param {Record<string, boolean>} categories
 * @returns {string} The value of the cookie servers read: accepted categories, separated by dots.
 */
export function cookieValue(categories) {
  return Object.entries(categories)
    .filter(([, on]) => on)
    .map(([id]) => id)
    .join('.');
}

/**
 * Turns on the scripts, frames and media of the page held back for categories now accepted:
 * `<script type="text/plain" data-consent="analytics">` becomes a script that runs, and
 * `data-src` of a frame, an image or a video becomes its `src`. An element held back for
 * several categories (`data-consent="analytics marketing"`) needs all of them.
 *
 * @param {ParentNode} root
 * @param {Record<string, boolean>} categories
 * @returns {number} Elements turned on.
 */
export function activate(root, categories) {
  let count = 0;
  for (const el of root.querySelectorAll(
    '[data-consent]:not([data-consent-on], [data-consent-refused])',
  )) {
    const needs = (el.getAttribute('data-consent') ?? '').split(/[\s,]+/).filter(Boolean);
    if (!needs.length || !needs.every((id) => categories[id] === true)) continue;
    el.setAttribute('data-consent-on', '');
    count += 1;
    if (el instanceof HTMLScriptElement) {
      try {
        const script = document.createElement('script');
        for (const attr of el.attributes) if (!['type', 'data-consent', 'data-consent-on', 'data-type'].includes(attr.name)) script.setAttribute(attr.name, attr.value); // prettier-ignore
        const type = el.getAttribute('data-type');
        if (type) script.type = type;
        // The nonce is hidden from attributes once parsed: it is copied from the property.
        if (el.nonce) script.nonce = el.nonce;
        if (!el.src && el.text) script.text = el.text;
        el.after(script);
      } catch {
        // Trusted Types refuse scripts made from strings: Vitrine does not lend its policy for
        // them. Such pages load their scripts themselves on the `vt-consent` event.
        el.removeAttribute('data-consent-on');
        el.setAttribute('data-consent-refused', '');
        count -= 1;
      }
    } else {
      // Addresses keep safe schemes only, as everywhere in Vitrine.
      const src = safeLink(el.getAttribute('data-src'));
      if (src) el.setAttribute('src', src);
      const srcset = el.getAttribute('data-srcset');
      if (srcset && !/javascript:|data:/i.test(srcset)) el.setAttribute('srcset', srcset);
    }
  }
  return count;
}
