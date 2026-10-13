// @ts-check
/**
 * Interface strings of <vt-env>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/env/strings
 */

export const en = Object.freeze({
  env: 'Configuration',
  envKey: 'Key',
  envValue: 'Value',
  envEmpty: 'empty',
  envSecret: 'Secret value, masked',
  envNoMatch: 'No entry matches the search.',
  envInvalid: '{count} lines could not be read (first: line {line}).',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  env: 'Configuration',
  envKey: 'Clé',
  envValue: 'Valeur',
  envEmpty: 'vide',
  envSecret: 'Valeur secrète, masquée',
  envNoMatch: 'Aucune entrée ne correspond à la recherche.',
  envInvalid: '{count} lignes n’ont pas pu être lues (première : ligne {line}).',
};
