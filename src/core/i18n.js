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
  edit: 'Edit',
  splitView: 'Side by side',
  unifiedView: 'Unified',
  diffStats: '+{added} −{removed}',
  diffSimplified: 'Many changes: the comparison is simplified to removed and added blocks.',
  noDifferences: 'No differences',
  previousChange: 'Previous change',
  nextChange: 'Next change',
  changePosition: '{current} of {total}',
  changeTotal: '{count} changes',
  terminal: 'Terminal',
  command: 'Command',
  copyCommand: 'Copy command',
  copyCommands: 'Copy commands',
  replay: 'Replay',
  showMoreLines: 'Show {count} more lines',
  files: 'Files',
  copyTree: 'Copy tree',
  treeStats: '{folders} folders, {files} files',
  invalidTree: 'This tree could not be read: {message}',
  treeTruncated: 'Only the first {limit} entries are shown.',
  status_added: 'added',
  status_removed: 'removed',
  status_modified: 'modified',
  status_highlighted: 'highlighted',
  httpExchange: 'Exchange',
  httpRequest: 'Request',
  httpResponse: 'Response',
  httpBody: 'Body',
  httpHeaders: 'Headers',
  httpQuery: 'Query',
  httpNone: 'None',
  httpNoBody: 'No body',
  copyUrl: 'Copy URL',
  codeLanguage: 'Language',
  showSecrets: 'Show secrets',
  hideSecrets: 'Hide secrets',
  secretsShown: 'Secrets shown',
  secretsHidden: 'Secrets hidden',
  secretsInCode: 'Credentials are masked in this code. Replace them with your own.',
  invalidHttp: 'This HTTP message could not be read: {message}',
  log: 'Log',
  followLog: 'Follow new lines',
  levelToggle: 'Show or hide {level} entries',
  logNoMatch: 'No entry matches the filters.',
  chartView: 'Chart',
  legend: 'Legend',
  seriesToggle: 'Show or hide {name}',
  copyData: 'Copy data',
  chartSummary: '{type} with {series} series and {points} points.',
  chartRange: '{name} from {min} to {max}',
  chart_line: 'Line chart',
  chart_area: 'Area chart',
  chart_bar: 'Bar chart',
  chart_pie: 'Donut chart',
  chartError: 'This data could not be charted: {message}',
  chartTruncated: 'Only the first 5,000 points of each series are shown.',
  chartLoadFailed: 'The chart library could not be loaded: {message}',
  openapiInvalid: 'This API description could not be read: {message}',
  openapiYamlFailed: 'The YAML reader could not be loaded: {message}',
  openapiTruncated: 'Only the first 2,000 endpoints are shown.',
  openapiServers: 'Servers',
  openapiAuth: 'Authentication',
  openapiEndpoints: 'Endpoints',
  openapiTags: 'Tags',
  openapiAllTags: 'All',
  openapiNoMatch: 'No endpoint matches.',
  openapiDeprecated: 'deprecated',
  openapiParameters: 'Parameters',
  openapiName: 'Name',
  openapiIn: 'In',
  openapiType: 'Type',
  openapiDescription: 'Description',
  openapiRequired: 'required',
  openapiRequestBody: 'Request body',
  openapiResponses: 'Responses',
  openapiExample: 'Example',
  openapiExampleValue: 'Example',
  unchangedLines: 'Show {count} unchanged lines',
  copyPatch: 'Copy patch',
  changes: 'Changes',
  original: 'Original',
  modified: 'Modified',
  patch: 'Patch',
  tags: 'Tags',
  noTags: 'No tags',
  addTag: 'Add a tag',
  tagPlaceholder: 'tag',
  suggestions: 'Suggestions',
  createTag: 'Create "{tag}"',
  removeTag: 'Remove {tag}',
  tagAdded: '{tag} added',
  tagRemoved: '{tag} removed',
  pressAgainToRemove: 'Press Backspace again to remove {tag}',
  tagDuplicate: '{tag} is already selected.',
  tagDisabled: '{tag} cannot be selected.',
  tagLimit: 'You can select up to {max} tags.',
  tagNotAllowed: '{tag} is not in the list.',
  tagTooLong: '{tag} is too long.',
  tagInvalid: '{tag} is not a valid tag.',
  tagRefused: '{tag} was refused.',
  tagsRequired: 'Select at least one tag.',
  tagCount: '{count} tags',
  tagCountOne: '1 tag',
  tagCountMax: '{count} / {max} tags',
  browseTags: 'Browse all tags',
  otherTags: 'Other',
  clearTags: 'Remove all tags',
  filterTags: 'Filter tags',
  tagsFound: '{count} tags',
  invalidTags: 'The tags must be a JSON array, or an object with "value" and "options".',
  rowsRange: 'Rows {from}–{to} of {total}',
  noRows: 'No rows',
  firstPage: 'First page',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  lastPage: 'Last page',
  sortBy: 'Sort by {name}',
  column: 'Column {n}',
  rowNumber: 'Row',
  csvStatus: '{rows} rows × {columns} columns',
  csvUnclosed: 'Unclosed quote starting at line {line}.',
  tooManyColumns: 'Only the first {limit} columns are shown.',
  matchingRows: '{count} matching rows',
  undo: 'Undo',
  redo: 'Redo',
  fullscreen: 'Full screen',
  exitFullscreen: 'Exit full screen',
  stopEditing: 'Stop editing',
  editor: 'Editor',
  validJson: 'Valid JSON',
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
  edit: 'Modifier',
  splitView: 'Côte à côte',
  unifiedView: 'Unifié',
  diffStats: '+{added} −{removed}',
  diffSimplified:
    'Beaucoup de changements : la comparaison est simplifiée en blocs retirés et ajoutés.',
  noDifferences: 'Aucune différence',
  previousChange: 'Modification précédente',
  nextChange: 'Modification suivante',
  changePosition: '{current} sur {total}',
  changeTotal: 'Modifications : {count}',
  terminal: 'Terminal',
  command: 'Commande',
  copyCommand: 'Copier la commande',
  copyCommands: 'Copier les commandes',
  replay: 'Rejouer',
  showMoreLines: 'Afficher {count} lignes de plus',
  files: 'Fichiers',
  copyTree: "Copier l'arborescence",
  treeStats: '{folders} dossiers, {files} fichiers',
  invalidTree: 'Impossible de lire cette arborescence : {message}',
  treeTruncated: 'Seules les {limit} premières entrées sont affichées.',
  status_added: 'ajouté',
  status_removed: 'supprimé',
  status_modified: 'modifié',
  status_highlighted: 'mis en évidence',
  httpExchange: 'Échange',
  httpRequest: 'Requête',
  httpResponse: 'Réponse',
  httpBody: 'Corps',
  httpHeaders: 'En-têtes',
  httpQuery: 'Paramètres',
  httpNone: 'Aucun',
  httpNoBody: 'Pas de corps',
  copyUrl: "Copier l'URL",
  codeLanguage: 'Langage',
  showSecrets: 'Afficher les secrets',
  hideSecrets: 'Masquer les secrets',
  secretsShown: 'Secrets affichés',
  secretsHidden: 'Secrets masqués',
  secretsInCode: 'Les identifiants sont masqués dans ce code. Remplacez-les par les vôtres.',
  invalidHttp: 'Impossible de lire ce message HTTP : {message}',
  log: 'Journal',
  followLog: 'Suivre les nouvelles lignes',
  levelToggle: 'Afficher ou masquer les entrées {level}',
  logNoMatch: 'Aucune entrée ne correspond aux filtres.',
  chartView: 'Graphique',
  legend: 'Légende',
  seriesToggle: 'Afficher ou masquer {name}',
  copyData: 'Copier les données',
  chartSummary: '{type} avec {series} séries et {points} points.',
  chartRange: '{name} de {min} à {max}',
  chart_line: 'Graphique en courbes',
  chart_area: 'Graphique en aires',
  chart_bar: 'Graphique en barres',
  chart_pie: 'Graphique en anneau',
  chartError: 'Impossible de tracer ces données : {message}',
  chartTruncated: 'Seuls les 5 000 premiers points de chaque série sont affichés.',
  chartLoadFailed: 'Impossible de charger la bibliothèque de graphiques : {message}',
  openapiInvalid: 'Impossible de lire cette description d’API : {message}',
  openapiYamlFailed: 'Impossible de charger le lecteur YAML : {message}',
  openapiTruncated: 'Seuls les 2 000 premiers points d’accès sont affichés.',
  openapiServers: 'Serveurs',
  openapiAuth: 'Authentification',
  openapiEndpoints: 'Points d’accès',
  openapiTags: 'Tags',
  openapiAllTags: 'Tous',
  openapiNoMatch: 'Aucun point d’accès ne correspond.',
  openapiDeprecated: 'obsolète',
  openapiParameters: 'Paramètres',
  openapiName: 'Nom',
  openapiIn: 'Emplacement',
  openapiType: 'Type',
  openapiDescription: 'Description',
  openapiRequired: 'requis',
  openapiRequestBody: 'Corps de la requête',
  openapiResponses: 'Réponses',
  openapiExample: 'Exemple',
  openapiExampleValue: 'Exemple',
  unchangedLines: 'Afficher {count} lignes inchangées',
  copyPatch: 'Copier le patch',
  changes: 'Modifications',
  original: 'Original',
  modified: 'Modifié',
  patch: 'Patch',
  tags: 'Tags',
  noTags: 'Aucun tag',
  addTag: 'Ajouter un tag',
  tagPlaceholder: 'tag',
  suggestions: 'Suggestions',
  createTag: 'Créer « {tag} »',
  removeTag: 'Retirer {tag}',
  tagAdded: '{tag} ajouté',
  tagRemoved: '{tag} retiré',
  pressAgainToRemove: 'Appuyez de nouveau sur Retour arrière pour retirer {tag}',
  tagDuplicate: '{tag} est déjà sélectionné.',
  tagDisabled: '{tag} ne peut pas être sélectionné.',
  tagLimit: 'Vous pouvez sélectionner jusqu’à {max} tags.',
  tagNotAllowed: '{tag} n’est pas dans la liste.',
  tagTooLong: '{tag} est trop long.',
  tagInvalid: '{tag} n’est pas un tag valide.',
  tagRefused: '{tag} a été refusé.',
  tagsRequired: 'Sélectionnez au moins un tag.',
  tagCount: '{count} tags',
  tagCountOne: '1 tag',
  tagCountMax: '{count} / {max} tags',
  browseTags: 'Parcourir tous les tags',
  otherTags: 'Autres',
  clearTags: 'Retirer tous les tags',
  filterTags: 'Filtrer les tags',
  tagsFound: '{count} tags',
  invalidTags: 'Les tags doivent être un tableau JSON, ou un objet avec « value » et « options ».',
  rowsRange: 'Lignes {from}–{to} sur {total}',
  noRows: 'Aucune ligne',
  firstPage: 'Première page',
  previousPage: 'Page précédente',
  nextPage: 'Page suivante',
  lastPage: 'Dernière page',
  sortBy: 'Trier par {name}',
  column: 'Colonne {n}',
  rowNumber: 'Ligne',
  csvStatus: '{rows} lignes × {columns} colonnes',
  csvUnclosed: 'Guillemet non fermé à partir de la ligne {line}.',
  tooManyColumns: 'Seules les {limit} premières colonnes sont affichées.',
  matchingRows: '{count} lignes correspondantes',
  undo: 'Annuler',
  redo: 'Rétablir',
  fullscreen: 'Plein écran',
  exitFullscreen: 'Quitter le plein écran',
  stopEditing: 'Terminer la modification',
  editor: 'Éditeur',
  validJson: 'JSON valide',
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
