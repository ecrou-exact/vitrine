// @ts-check
/**
 * User interface strings.
 *
 * Strings may contain `{name}` placeholders. They are always inserted with
 * `textContent`, never as HTML, so translations cannot inject markup.
 *
 * @module core/i18n
 */

/** @typedef {keyof typeof en} StringKey */
/** @typedef {Readonly<Record<StringKey, string>>} Strings */

const en = Object.freeze({
  copy: 'Copy',
  copyCode: 'Copy code',
  copied: 'Copied',
  copyFailed: 'Copy failed',
  copySource: 'Copy source',
  download: 'Download',
  search: 'Search',
  searchPlaceholder: 'Search…',
  searchNext: 'Next match',
  searchPrevious: 'Previous match',
  searchClose: 'Close search',
  searchCount: '{current} / {total}',
  searchCountCapped: '{current} / {total}+',
  searchNone: 'No matches',
  searchResults: '{total} matches',
  wrap: 'Toggle line wrap',
  showMore: 'Show all {count} lines',
  preview: 'Preview',
  source: 'Source',
  split: 'Split',
  swapPanes: 'Swap panes',
  stackPanes: 'Stack panes',
  syncScroll: 'Sync scrolling',
  tabs: 'View',
  actions: 'Actions',
  toc: 'Table of contents',
  anchor: 'Link to this section',
  table: 'Table',
  tree: 'Tree',
  raw: 'Raw',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  copyPath: 'Copy path',
  copyValue: 'Copy value',
  items: '{count} items',
  item: '1 item',
  keys: '{count} keys',
  key: '1 key',
  showMoreItems: 'Show {count} more',
  showFullString: 'Show full string ({count} characters)',
  truncated: 'Partially expanded: too many nodes.',
  loading: 'Loading…',
  errorTitle: 'Unable to display content',
  invalidJson: 'Invalid JSON at line {line}, column {column}: {message}.',
  invalidJsonRaw: 'Invalid JSON at line {line}, column {column} — showing raw text.',
  empty: 'Nothing to display',
  tooLarge: 'Content is too large ({size} characters, limit {limit}).',
  tooDeep: 'Nesting is too deep (limit {limit}).',
  tooComplex: 'This document is nested too deeply to display.',
  unserializable: 'This value cannot be converted to JSON (circular reference or BigInt).',
  highlightSkipped: 'Content is large: syntax highlighting is disabled.',
  loadFailed: 'Could not load "{url}": {reason}',
  remoteBlocked: 'Cross-origin URL blocked. Add the "allow-remote" attribute to allow it.',
  unsafeUrl: 'URL blocked: only http(s) URLs can be loaded.',
  timeout: 'Request timed out.',
  added: 'Added',
  removed: 'Removed',
  code: 'Code',
});

const fr = Object.freeze({
  copy: 'Copier',
  copyCode: 'Copier le code',
  copied: 'Copié',
  copyFailed: 'Échec de la copie',
  copySource: 'Copier la source',
  download: 'Télécharger',
  search: 'Rechercher',
  searchPlaceholder: 'Rechercher…',
  searchNext: 'Résultat suivant',
  searchPrevious: 'Résultat précédent',
  searchClose: 'Fermer la recherche',
  searchCount: '{current} / {total}',
  searchCountCapped: '{current} / {total}+',
  searchNone: 'Aucun résultat',
  searchResults: '{total} résultats',
  wrap: 'Activer/désactiver le retour à la ligne',
  showMore: 'Afficher les {count} lignes',
  preview: 'Aperçu',
  source: 'Source',
  split: 'Côte à côte',
  swapPanes: 'Inverser les panneaux',
  stackPanes: 'Empiler les panneaux',
  syncScroll: 'Synchroniser le défilement',
  tabs: 'Affichage',
  actions: 'Actions',
  toc: 'Table des matières',
  anchor: 'Lien vers cette section',
  table: 'Tableau',
  tree: 'Arbre',
  raw: 'Brut',
  expandAll: 'Tout déplier',
  collapseAll: 'Tout replier',
  copyPath: 'Copier le chemin',
  copyValue: 'Copier la valeur',
  items: '{count} éléments',
  item: '1 élément',
  keys: '{count} clés',
  key: '1 clé',
  showMoreItems: 'Afficher {count} de plus',
  showFullString: 'Afficher toute la chaîne ({count} caractères)',
  truncated: 'Dépliage partiel : trop de nœuds.',
  loading: 'Chargement…',
  errorTitle: 'Impossible d’afficher le contenu',
  invalidJson: 'JSON invalide à la ligne {line}, colonne {column} : {message}.',
  invalidJsonRaw: 'JSON invalide à la ligne {line}, colonne {column} — affichage du texte brut.',
  empty: 'Rien à afficher',
  tooLarge: 'Contenu trop volumineux ({size} caractères, limite {limit}).',
  tooDeep: 'Imbrication trop profonde (limite {limit}).',
  tooComplex: 'Ce document est trop imbriqué pour être affiché.',
  unserializable:
    'Cette valeur ne peut pas être convertie en JSON (référence circulaire ou BigInt).',
  highlightSkipped: 'Contenu volumineux : coloration syntaxique désactivée.',
  loadFailed: 'Impossible de charger « {url} » : {reason}',
  remoteBlocked:
    'URL d’une autre origine bloquée. Ajoutez l’attribut « allow-remote » pour l’autoriser.',
  unsafeUrl: 'URL bloquée : seules les URL http(s) peuvent être chargées.',
  timeout: 'Délai de la requête dépassé.',
  added: 'Ajouté',
  removed: 'Supprimé',
  code: 'Code',
});

/** @type {Map<string, Partial<Strings>>} */
const locales = new Map(
  /** @type {[string, Partial<Strings>][]} */ ([
    ['en', en],
    ['fr', fr],
  ]),
);

/**
 * Registers or extends a locale. Missing keys fall back to English.
 *
 * @since 0.1.0
 * @param {string} code - Locale code, e.g. `"de"` or `"pt-BR"`.
 * @param {Partial<Strings>} strings - Translated strings.
 *
 * @example
 * Vitrine.registerLocale('de', { copy: 'Kopieren', copied: 'Kopiert' });
 */
export function registerLocale(code, strings) {
  if (typeof code !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(code)) {
    throw new TypeError(`[vitrine] Invalid locale code "${code}".`);
  }
  /** @type {Record<string, string>} */
  const clean = {};
  for (const [key, value] of Object.entries(strings ?? {})) {
    if (Object.prototype.hasOwnProperty.call(en, key) && typeof value === 'string') {
      clean[key] = value.slice(0, 500);
    }
  }
  locales.set(code, Object.freeze({ ...(locales.get(code) ?? {}), ...clean }));
  for (const listener of localeListeners) listener();
}

/** @type {Set<() => void>} */
const localeListeners = new Set();

/**
 * Subscribes to locale registrations, so elements already on the page update.
 *
 * @param {() => void} listener
 * @returns {() => void} Unsubscribe function.
 */
export function onLocaleChange(listener) {
  localeListeners.add(listener);
  return () => localeListeners.delete(listener);
}

/**
 * Returns a translation function for a locale.
 * `"fr-CA"` falls back to `"fr"`, then to English.
 *
 * @param {string} code
 * @returns {(key: keyof Strings, params?: Record<string, string | number>) => string}
 */
export function translator(code) {
  const exact = locales.get(code);
  const base = locales.get(String(code).split('-')[0]);
  return (key, params) => {
    const template = exact?.[key] ?? base?.[key] ?? en[key] ?? String(key);
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
    );
  };
}

/**
 * Formats a number for display in the given locale.
 *
 * @param {number} value
 * @param {string} code
 * @returns {string}
 */
export function formatNumber(value, code) {
  try {
    return new Intl.NumberFormat(code).format(value);
  } catch {
    return String(value);
  }
}
