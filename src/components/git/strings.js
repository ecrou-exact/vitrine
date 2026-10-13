// @ts-check
/**
 * Interface strings of <vt-git>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/git/strings
 */

export const en = Object.freeze({
  gitInvalid: 'This history could not be read: {message}',
  gitCount: '{count} commits',
  gitHistory: 'Commit history',
  gitNoMatch: 'No commit to show.',
  gitBranches: 'Branches',
  gitAllBranches: 'All branches',
  gitDetails: 'Commit details',
  gitCloseDetails: 'Close details',
  gitCommit: 'Commit',
  gitCopyHash: 'Copy hash',
  gitParents: 'Parents',
  gitAuthor: 'Author',
  gitDate: 'Date',
  gitRefs: 'Refs',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  gitInvalid: 'Impossible de lire cet historique : {message}',
  gitCount: '{count} commits',
  gitHistory: 'Historique des commits',
  gitNoMatch: 'Aucun commit à afficher.',
  gitBranches: 'Branches',
  gitAllBranches: 'Toutes les branches',
  gitDetails: 'Détails du commit',
  gitCloseDetails: 'Fermer les détails',
  gitCommit: 'Commit',
  gitCopyHash: 'Copier le hash',
  gitParents: 'Parents',
  gitAuthor: 'Auteur',
  gitDate: 'Date',
  gitRefs: 'Références',
};
