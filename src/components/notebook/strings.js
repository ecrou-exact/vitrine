// @ts-check
/**
 * Interface strings of <vt-notebook>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/notebook/strings
 */

export const en = Object.freeze({
  nbIn: 'In [{count}]:',
  nbInEmpty: 'In [ ]:',
  nbOut: 'Out [{count}]:',
  nbCells: '{count} cells',
  nbCell: 'Cell {index}',
  nbCodeCell: 'Code cell {index}',
  nbOutput: 'Output',
  nbCopyCell: 'Copy cell',
  nbCopyScript: 'Copy code',
  nbShowCode: 'Show code',
  nbHideCode: 'Hide code',
  nbCodeHidden: 'Code hidden',
  nbShowOutput: 'Show output',
  nbOutputHidden: 'Output hidden',
  nbStderr: 'Error output',
  nbWidget: 'Interactive widget, shown as text: nothing runs here.',
  nbImage: 'Output image',
  nbNoOutput: 'This output has no type that can be shown.',
  nbInvalidEmpty: 'The notebook is empty.',
  nbInvalidFormat: 'This is not a Jupyter notebook: expected the JSON of an .ipynb file.',
  nbInvalidJson: 'The notebook is not valid JSON: {message}',
  nbNotRun: 'Shown only: no code is run.',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  nbIn: 'Entrée [{count}] :',
  nbInEmpty: 'Entrée [ ] :',
  nbOut: 'Sortie [{count}] :',
  nbCells: '{count} cellules',
  nbCell: 'Cellule {index}',
  nbCodeCell: 'Cellule de code {index}',
  nbOutput: 'Sortie',
  nbCopyCell: 'Copier la cellule',
  nbCopyScript: 'Copier le code',
  nbShowCode: 'Afficher le code',
  nbHideCode: 'Masquer le code',
  nbCodeHidden: 'Code masqué',
  nbShowOutput: 'Afficher la sortie',
  nbOutputHidden: 'Sortie masquée',
  nbStderr: 'Sortie d’erreur',
  nbWidget: 'Widget interactif, affiché en texte : rien ne s’exécute ici.',
  nbImage: 'Image de sortie',
  nbNoOutput: 'Cette sortie n’a aucun type qui puisse être affiché.',
  nbInvalidEmpty: 'Le carnet est vide.',
  nbInvalidFormat: 'Ce n’est pas un carnet Jupyter : le JSON d’un fichier .ipynb est attendu.',
  nbInvalidJson: 'Le carnet n’est pas du JSON valide : {message}',
  nbNotRun: 'Affichage seulement : aucun code n’est exécuté.',
};
