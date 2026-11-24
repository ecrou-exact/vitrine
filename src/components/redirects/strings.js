// @ts-check
/**
 * Interface strings of <vt-redirects>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/redirects/strings
 */

export const en = Object.freeze({
  redirectsCount: '{count} redirects',
  redirectsNone: 'No redirect',
  redirectsSites: 'Sites: {count}',
  redirectsFinal: 'Ends at',
  redirectsTotalTime: 'in {time} ms',
  redirectsNotFetched: 'Read only: nothing is fetched.',
  redirectsChain: 'Redirect chain',
  redirectsStart: 'Start',
  redirectsUnknownUrl: '(URL not known)',
  redirectsStatusUnknown: 'not seen',
  redirectsKind_permanent: 'permanent',
  redirectsKind_temporary: 'temporary',
  redirectsKind_other: 'redirect',
  redirectsKind_meta: 'meta refresh',
  redirectsKind_script: 'JavaScript',
  redirectsOtherHost: 'other host',
  redirectsOtherSite: 'other site',
  redirectsDowngrade: 'HTTPS → HTTP',
  redirectsUpgrade: 'HTTP → HTTPS',
  redirectsAdded: 'Adds {params}',
  redirectsTracking: 'tracking',
  redirectsLoop: 'back to a URL already visited',
  redirectsCopyFinal: 'Copy the final URL',
  redirectsCopyChain: 'Chain',
  redirectsInvalidEmpty: 'No redirect chain.',
  redirectsInvalidFormat:
    'No redirect chain found: paste a HAR file, curl -sIL output, JSON or one URL per line.',
  redirectsInvalidJson: 'The JSON cannot be read: {detail}',
  redirectsLevel_bad: 'Error',
  redirectsLevel_warn: 'Warning',
  redirectsLevel_info: 'Note',
  redirectsIssue_loop: 'The chain loops: a browser would stop with “too many redirects”.',
  redirectsIssue_downgrade:
    'A redirect leaves HTTPS for plain HTTP: what follows can be read and changed on the way.',
  redirectsIssue_tooLong:
    '{count} redirects: each one costs a round trip, and browsers stop after 20.',
  redirectsIssue_endsError: 'The chain ends with an error.',
  redirectsIssue_unfinished: 'The last page was not captured.',
  redirectsIssue_sites: 'The chain goes through {count} sites.',
});

/** @type {Readonly<Record<keyof typeof en, string>>} */
export const fr = Object.freeze({
  redirectsCount: '{count} redirections',
  redirectsNone: 'Aucune redirection',
  redirectsSites: 'Sites : {count}',
  redirectsFinal: 'Arrive sur',
  redirectsTotalTime: 'en {time} ms',
  redirectsNotFetched: 'Lecture seule : rien n’est chargé.',
  redirectsChain: 'Chaîne de redirections',
  redirectsStart: 'Départ',
  redirectsUnknownUrl: '(URL inconnue)',
  redirectsStatusUnknown: 'non vu',
  redirectsKind_permanent: 'permanente',
  redirectsKind_temporary: 'temporaire',
  redirectsKind_other: 'redirection',
  redirectsKind_meta: 'meta refresh',
  redirectsKind_script: 'JavaScript',
  redirectsOtherHost: 'autre hôte',
  redirectsOtherSite: 'autre site',
  redirectsDowngrade: 'HTTPS → HTTP',
  redirectsUpgrade: 'HTTP → HTTPS',
  redirectsAdded: 'Ajoute {params}',
  redirectsTracking: 'suivi',
  redirectsLoop: 'retour à une URL déjà visitée',
  redirectsCopyFinal: 'Copier l’URL finale',
  redirectsCopyChain: 'Chaîne',
  redirectsInvalidEmpty: 'Aucune chaîne de redirections.',
  redirectsInvalidFormat:
    'Aucune chaîne de redirections trouvée : collez un fichier HAR, une sortie curl -sIL, du JSON ou une URL par ligne.',
  redirectsInvalidJson: 'Le JSON ne peut pas être lu : {detail}',
  redirectsLevel_bad: 'Erreur',
  redirectsLevel_warn: 'Avertissement',
  redirectsLevel_info: 'Remarque',
  redirectsIssue_loop:
    'La chaîne boucle : un navigateur s’arrêterait avec « trop de redirections ».',
  redirectsIssue_downgrade:
    'Une redirection quitte HTTPS pour HTTP : la suite peut être lue et modifiée en chemin.',
  redirectsIssue_tooLong:
    '{count} redirections : chacune coûte un aller-retour, et les navigateurs s’arrêtent après 20.',
  redirectsIssue_endsError: 'La chaîne se termine par une erreur.',
  redirectsIssue_unfinished: 'La dernière page n’a pas été capturée.',
  redirectsIssue_sites: 'La chaîne passe par {count} sites.',
});
