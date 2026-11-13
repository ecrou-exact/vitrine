// @ts-check
/**
 * Interface strings of <vt-treemap>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/treemap/strings
 */

export const en = Object.freeze({
  treemapMap: 'Map',
  treemapList: 'List',
  treemapItems: 'Items',
  treemapName: 'Name',
  treemapSize: 'Size',
  treemapShare: 'Share',
  treemapAll: 'All',
  treemapZoom: 'Zoom',
  treemapItem: '{name}, {size}, {percent}',
  treemapGroup: '{name}, {size}, {percent}, {count} items',
  treemapOwn: '(own size)',
  treemapMatches: 'Matches take {percent} of the total.',
  treemapNoMatch: 'No match.',
  treemapCopyCsv: 'Copy sizes as CSV',
  treemapInvalidEmpty: 'No data.',
  treemapInvalidNoSizes: 'No size was found.',
  treemapInvalidFormat:
    'Expected a JSON tree, an esbuild metafile, webpack stats, a list of paths and sizes, CSV or the output of du.',
  treemapInvalidJson: 'The JSON could not be read: {message}',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  treemapMap: 'Carte',
  treemapList: 'Liste',
  treemapItems: 'Éléments',
  treemapName: 'Nom',
  treemapSize: 'Taille',
  treemapShare: 'Part',
  treemapAll: 'Tout',
  treemapZoom: 'Zoom',
  treemapItem: '{name}, {size}, {percent}',
  treemapGroup: '{name}, {size}, {percent}, {count} éléments',
  treemapOwn: '(taille propre)',
  treemapMatches: 'Les résultats représentent {percent} du total.',
  treemapNoMatch: 'Aucun résultat.',
  treemapCopyCsv: 'Copier les tailles en CSV',
  treemapInvalidEmpty: 'Aucune donnée.',
  treemapInvalidNoSizes: 'Aucune taille trouvée.',
  treemapInvalidFormat:
    'Un arbre JSON, un metafile esbuild, des stats webpack, une liste de chemins et de tailles, du CSV ou la sortie de du est attendu.',
  treemapInvalidJson: 'Le JSON n’a pas pu être lu : {message}',
};
