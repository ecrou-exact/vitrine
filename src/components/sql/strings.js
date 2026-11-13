// @ts-check
/**
 * Interface strings of <vt-sql>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/sql/strings
 */

export const en = Object.freeze({
  sqlQuery: 'Query',
  sqlStatement: 'Statement {index}',
  sqlResult: 'Result of statement {index}',
  sqlRows: '{count} rows',
  sqlRow: '1 row',
  sqlRowsShown: '{shown} of {count} rows',
  sqlNoRows: 'No rows',
  sqlDuration: '{time}',
  sqlParams: 'Parameters',
  sqlError: 'Error',
  sqlNull: 'NULL',
  sqlFormat: 'Format the query',
  sqlAsWritten: 'Show the query as written',
  sqlCopyQuery: 'Copy query',
  sqlCopyCsv: 'Copy as CSV',
  sqlDownloadCsv: 'Download CSV',
  sqlShowRows: 'Show {count} more rows',
  sqlSortBy: 'Sort by {name}',
  sqlStatements: '{count} statements',
  sqlInvalid: 'This JSON could not be read as SQL results: {message}',
  sqlNotRun: 'Shown only: nothing is sent to a database.',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  sqlQuery: 'Requête',
  sqlStatement: 'Instruction {index}',
  sqlResult: 'Résultat de l’instruction {index}',
  sqlRows: '{count} lignes',
  sqlRow: '1 ligne',
  sqlRowsShown: '{shown} lignes sur {count}',
  sqlNoRows: 'Aucune ligne',
  sqlParams: 'Paramètres',
  sqlError: 'Erreur',
  sqlFormat: 'Mettre en forme la requête',
  sqlAsWritten: 'Afficher la requête telle qu’écrite',
  sqlCopyQuery: 'Copier la requête',
  sqlCopyCsv: 'Copier en CSV',
  sqlDownloadCsv: 'Télécharger le CSV',
  sqlShowRows: 'Afficher {count} lignes de plus',
  sqlSortBy: 'Trier par {name}',
  sqlStatements: '{count} instructions',
  sqlInvalid: 'Ce JSON n’a pas pu être lu comme des résultats SQL : {message}',
  sqlNotRun: 'Affichage seulement : rien n’est envoyé à une base de données.',
};
