// @ts-check
/**
 * Interface strings of <vt-heatmap>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/heatmap/strings
 */

export const en = Object.freeze({
  heatLess: 'Less',
  heatMore: 'More',
  heatLegend: 'Scale, from less to more',
  heatNoValue: 'no value',
  heatCell: '{label}: {value}',
  heatTotal: '{total} in all, most {max} on {day}',
  heatTotalMatrix: '{total} in all, most {max}',
  heatGrid: 'Values by day',
  heatGridMatrix: 'Values',
  heatCopyCsv: 'Copy as CSV',
  heatInvalidEmpty: 'No data.',
  heatInvalidFormat:
    'Expected dates and values (JSON or CSV: date,value), or two categories and a value (x,y,value).',
  heatInvalidNoValues: 'No date or value could be read.',
  heatInvalidJson: 'The JSON could not be read: {message}',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  heatLess: 'Moins',
  heatMore: 'Plus',
  heatLegend: 'Échelle, de moins à plus',
  heatNoValue: 'aucune valeur',
  heatCell: '{label} : {value}',
  heatTotal: '{total} au total, au plus {max} le {day}',
  heatTotalMatrix: '{total} au total, au plus {max}',
  heatGrid: 'Valeurs par jour',
  heatGridMatrix: 'Valeurs',
  heatCopyCsv: 'Copier en CSV',
  heatInvalidEmpty: 'Aucune donnée.',
  heatInvalidFormat:
    'Dates et valeurs attendues (JSON ou CSV : date,value), ou deux catégories et une valeur (x,y,value).',
  heatInvalidNoValues: 'Aucune date ni valeur n’a pu être lue.',
  heatInvalidJson: 'Le JSON n’a pas pu être lu : {message}',
};
