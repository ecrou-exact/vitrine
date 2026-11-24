// @ts-check
/**
 * Interface strings of <vt-contrast>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/contrast/strings
 */

export const en = Object.freeze({
  contrastText: 'Text',
  contrastBackground: 'Background',
  contrastPick: 'Pick the {name} color',
  contrastSample: 'The quick brown fox jumps over the lazy dog.',
  contrastSampleLarge: 'Large text, 24 px or 18.66 px bold',
  contrastRatio: 'Contrast ratio',
  contrastRatioValue: '{ratio}:1',
  contrastCriterion: 'Criterion',
  contrastMinimum: 'Minimum',
  contrastResult: 'Result',
  contrastPass: 'Pass',
  contrastFail: 'Fail',
  contrastLevel_aaNormal: 'AA, normal text (1.4.3)',
  contrastLevel_aaLarge: 'AA, large text (1.4.3)',
  contrastLevel_aaaNormal: 'AAA, normal text (1.4.6)',
  contrastLevel_aaaLarge: 'AAA, large text (1.4.6)',
  contrastLevel_nonText: 'Interface and graphics (1.4.11)',
  contrastSuggest: 'Nearest text color for {level}: {color} ({ratio}:1)',
  contrastSuggestNone: 'No text color of this hue reaches {level} on this background.',
  contrastBlended: 'Transparent colors are laid over the background (and the background over white).', // prettier-ignore
  contrastInvalid: '“{color}” is not a CSS color.',
  contrastInvalidLines: 'Lines without a color: {list}',
  contrastEmpty: 'No colors. Write a text color and a background, such as “#333 on #fff”.',
  contrastPalette: 'Palette: text colors in rows, backgrounds in columns',
  contrastGridCell: '{fg} on {bg}: {ratio}:1, {grade}',
  contrastGrade_aaa: 'AAA',
  contrastGrade_aa: 'AA',
  contrastGrade_large: 'AA large only',
  contrastGrade_fail: 'fails',
  contrastPairs: '{count} pairs',
  contrastCopyColor: 'Copy {color}',
  contrastCopyReport: 'Copy the report',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  contrastText: 'Texte',
  contrastBackground: 'Fond',
  contrastPick: 'Choisir la couleur {name}',
  contrastSample: 'Portez ce vieux whisky au juge blond qui fume.',
  contrastSampleLarge: 'Grand texte, 24 px ou 18,66 px gras',
  contrastRatio: 'Rapport de contraste',
  contrastRatioValue: '{ratio}:1',
  contrastCriterion: 'Critère',
  contrastMinimum: 'Minimum',
  contrastResult: 'Résultat',
  contrastPass: 'Réussi',
  contrastFail: 'Échec',
  contrastLevel_aaNormal: 'AA, texte normal (1.4.3)',
  contrastLevel_aaLarge: 'AA, grand texte (1.4.3)',
  contrastLevel_aaaNormal: 'AAA, texte normal (1.4.6)',
  contrastLevel_aaaLarge: 'AAA, grand texte (1.4.6)',
  contrastLevel_nonText: 'Interface et graphiques (1.4.11)',
  contrastSuggest: 'Couleur de texte la plus proche pour {level} : {color} ({ratio}:1)',
  contrastSuggestNone: 'Aucune couleur de cette teinte n’atteint {level} sur ce fond.',
  contrastBlended: 'Les couleurs transparentes sont posées sur le fond (et le fond sur du blanc).',
  contrastInvalid: '« {color} » n’est pas une couleur CSS.',
  contrastInvalidLines: 'Lignes sans couleur : {list}',
  contrastEmpty: 'Aucune couleur. Écrivez une couleur de texte et un fond, par exemple « #333 on #fff ».', // prettier-ignore
  contrastPalette: 'Palette : couleurs de texte en lignes, fonds en colonnes',
  contrastGridCell: '{fg} sur {bg} : {ratio}:1, {grade}',
  contrastGrade_aaa: 'AAA',
  contrastGrade_aa: 'AA',
  contrastGrade_large: 'AA grand texte seulement',
  contrastGrade_fail: 'échec',
  contrastPairs: '{count} paires',
  contrastCopyColor: 'Copier {color}',
  contrastCopyReport: 'Copier le rapport',
};
