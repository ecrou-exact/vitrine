// @ts-check
/**
 * Interface strings of <vt-pivot>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/pivot/strings
 */

export const en = Object.freeze({
  pivotRows: 'Rows',
  pivotColumns: 'Columns',
  pivotValues: 'Values',
  pivotAggregate: 'Aggregate',
  pivotNone: '(none)',
  pivotTotal: 'Total',
  pivotEmptyKey: '(empty)',
  pivotSettings: 'Pivot settings',
  pivotTable: 'Pivot table',
  pivotAgg_sum: 'Sum',
  pivotAgg_count: 'Count',
  pivotAgg_avg: 'Average',
  pivotAgg_min: 'Minimum',
  pivotAgg_max: 'Maximum',
  pivotAgg_distinct: 'Distinct values',
  pivotOf: '{aggregate} of {field}',
  pivotRecords: '{count} records',
  pivotCellLabel: '{value}, {row}, {column}',
  pivotTruncated: 'Only the first {count} values of a field are shown.',
  pivotCopyCsv: 'Copy as CSV',
  pivotInvalidEmpty: 'No data.',
  pivotInvalidFormat: 'Expected CSV with a header row, or JSON: a list of objects.',
  pivotInvalidJson: 'The JSON could not be read: {message}',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  pivotRows: 'Lignes',
  pivotColumns: 'Colonnes',
  pivotValues: 'Valeurs',
  pivotAggregate: 'Calcul',
  pivotNone: '(aucune)',
  pivotTotal: 'Total',
  pivotEmptyKey: '(vide)',
  pivotSettings: 'Réglages du tableau croisé',
  pivotTable: 'Tableau croisé',
  pivotAgg_sum: 'Somme',
  pivotAgg_count: 'Nombre',
  pivotAgg_avg: 'Moyenne',
  pivotAgg_min: 'Minimum',
  pivotAgg_max: 'Maximum',
  pivotAgg_distinct: 'Valeurs distinctes',
  pivotOf: '{aggregate} de {field}',
  pivotRecords: '{count} enregistrements',
  pivotCellLabel: '{value}, {row}, {column}',
  pivotTruncated: 'Seules les {count} premières valeurs d’un champ sont affichées.',
  pivotCopyCsv: 'Copier en CSV',
  pivotInvalidEmpty: 'Aucune donnée.',
  pivotInvalidFormat: 'CSV avec une ligne d’en-tête, ou JSON (une liste d’objets) attendu.',
  pivotInvalidJson: 'Le JSON n’a pas pu être lu : {message}',
};
