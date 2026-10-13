// @ts-check
/**
 * Interface strings of <vt-toml>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/toml/strings
 */

export const en = Object.freeze({
  tomlValid: 'Valid TOML',
  tomlInvalid: 'Invalid TOML at line {line}, column {column}: {message}.',
  tomlInvalidRaw: 'Invalid TOML at line {line}, column {column} — showing raw text.',
  tomlCopyJson: 'Copy as JSON',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  tomlValid: 'TOML valide',
  tomlInvalid: 'TOML invalide à la ligne {line}, colonne {column} : {message}.',
  tomlInvalidRaw: 'TOML invalide à la ligne {line}, colonne {column} — affichage du texte brut.',
  tomlCopyJson: 'Copier en JSON',
};
