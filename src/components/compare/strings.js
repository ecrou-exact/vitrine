// @ts-check
/**
 * Interface strings of <vt-compare>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/compare/strings
 */

export const en = Object.freeze({
  compareFilter: 'Show',
  compareAll: 'All',
  compareChanges: 'Changes',
  compareAdded: 'Added',
  compareRemoved: 'Removed',
  compareChanged: 'Changed',
  compareSame: 'Unchanged',
  compareStatus: 'Status',
  compareRows: 'Rows compared',
  compareBefore: 'before',
  compareAfter: 'after',
  compareByKey: 'Rows are paired by {key}.',
  compareByPosition: 'Rows are paired by position: no column identifies them.',
  compareFieldsAdded: 'New columns: {fields}.',
  compareFieldsRemoved: 'Removed columns: {fields}.',
  compareDuplicates: '{count} rows repeat a key: they are paired in order.',
  compareNone: 'No difference.',
  compareNoRow: 'No row.',
  compareTruncated: 'Only the first {count} rows are shown.',
  compareSummary: '{added} added, {removed} removed, {changed} changed',
  compareCopyCsv: 'Copy the differences as CSV',
  compareInvalidEmpty: 'No data to compare: give the two datasets.',
  compareInvalidFormat: 'Expected CSV with a header row, or JSON: a list of objects.',
  compareInvalidJson: 'The JSON could not be read: {message}',
  compareInvalidSide: '{side}: {message}',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  compareFilter: 'Afficher',
  compareAll: 'Tout',
  compareChanges: 'Différences',
  compareAdded: 'Ajoutées',
  compareRemoved: 'Supprimées',
  compareChanged: 'Modifiées',
  compareSame: 'Identiques',
  compareStatus: 'État',
  compareRows: 'Lignes comparées',
  compareBefore: 'avant',
  compareAfter: 'après',
  compareByKey: 'Les lignes sont appariées par {key}.',
  compareByPosition: 'Les lignes sont appariées par position : aucune colonne ne les identifie.',
  compareFieldsAdded: 'Nouvelles colonnes : {fields}.',
  compareFieldsRemoved: 'Colonnes supprimées : {fields}.',
  compareDuplicates: '{count} lignes répètent une clé : elles sont appariées dans l’ordre.',
  compareNone: 'Aucune différence.',
  compareNoRow: 'Aucune ligne.',
  compareTruncated: 'Seules les {count} premières lignes sont affichées.',
  compareSummary: '{added} ajoutées, {removed} supprimées, {changed} modifiées',
  compareCopyCsv: 'Copier les différences en CSV',
  compareInvalidEmpty: 'Rien à comparer : donnez les deux jeux de données.',
  compareInvalidFormat: 'CSV avec une ligne d’en-tête, ou JSON (une liste d’objets) attendu.',
  compareInvalidJson: 'Le JSON n’a pas pu être lu : {message}',
  compareInvalidSide: '{side} : {message}',
};
