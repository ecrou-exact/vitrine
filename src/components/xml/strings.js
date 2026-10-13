// @ts-check
/**
 * Interface strings of <vt-xml>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/xml/strings
 */

export const en = Object.freeze({
  xmlInvalid: 'Invalid XML at line {line}, column {column}: {message}',
  xmlInvalidRaw: 'Invalid XML at line {line}, column {column}. Showing the text as written.',
  xmlValid: 'Valid XML',
  xmlTooDeep: 'The XML is nested deeper than {limit} levels.',
  xmlChildren: '{count} children',
  xmlChild: '1 child',
  xmlEntities: 'Entities declared in the DOCTYPE are not expanded: {names}.',
  xmlPretty: 'Indent',
  xmlAsWritten: 'As written',
  xmlCopyXpath: 'Copy XPath',
  xmlCopyNode: 'Copy node',
  xmlNamespace: 'Namespace: {uri}',
  xmlShowMore: 'Show {count} more',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  xmlInvalid: 'XML invalide ligne {line}, colonne {column} : {message}',
  xmlInvalidRaw: 'XML invalide ligne {line}, colonne {column}. Le texte est affiché tel quel.',
  xmlValid: 'XML valide',
  xmlTooDeep: 'Le XML est imbriqué sur plus de {limit} niveaux.',
  xmlChildren: '{count} enfants',
  xmlChild: '1 enfant',
  xmlEntities: 'Les entités déclarées dans le DOCTYPE ne sont pas développées : {names}.',
  xmlPretty: 'Indenter',
  xmlAsWritten: 'Tel quel',
  xmlCopyXpath: 'Copier le XPath',
  xmlCopyNode: 'Copier le nœud',
  xmlNamespace: 'Espace de noms : {uri}',
  xmlShowMore: 'Afficher {count} de plus',
};
