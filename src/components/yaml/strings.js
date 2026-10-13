// @ts-check
/**
 * Interface strings of <vt-yaml>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/yaml/strings
 */

export const en = Object.freeze({
  yamlValid: 'Valid YAML',
  yamlInvalid: 'Invalid YAML at line {line}, column {column}: {message}.',
  yamlInvalidRaw: 'Invalid YAML at line {line}, column {column} — showing raw text.',
  yamlLoadFailed: 'The YAML reader could not be loaded: {message}',
  yamlCopyJson: 'Copy as JSON',
  yamlDocuments: '{count} documents',
  yamlAnchors: 'Anchors',
  yamlAnchorUses: '&{name} at line {line}, used {uses} times',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  yamlValid: 'YAML valide',
  yamlInvalid: 'YAML invalide à la ligne {line}, colonne {column} : {message}.',
  yamlInvalidRaw: 'YAML invalide à la ligne {line}, colonne {column} — affichage du texte brut.',
  yamlLoadFailed: 'Le lecteur YAML n’a pas pu être chargé : {message}',
  yamlCopyJson: 'Copier en JSON',
  yamlDocuments: '{count} documents',
  yamlAnchors: 'Ancres',
  yamlAnchorUses: '&{name} à la ligne {line}, utilisée {uses} fois',
};
