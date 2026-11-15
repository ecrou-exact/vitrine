// @ts-check
/**
 * Interface strings of <vt-lifecycle>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/lifecycle/strings
 */

export const en = Object.freeze({
  lifecycleTable: 'Table',
  lifecycleSchedule: 'Schedule',
  lifecycleVersion: 'Version',
  lifecycleStatus: 'Status',
  lifecycleReleased: 'Released',
  lifecycleActive: 'Active support',
  lifecycleSecurity: 'Security support',
  lifecycleLatest: 'Latest',
  lifecycleLts: 'LTS',
  lifecycleToday: 'Today',
  lifecycleStatus_upcoming: 'Upcoming',
  lifecycleStatus_active: 'Supported',
  lifecycleStatus_security: 'Security fixes only',
  lifecycleStatus_extended: 'Extended support',
  lifecycleStatus_eol: 'End of life',
  lifecycleUntil: 'until {date}',
  lifecycleEnded: 'ended {date}',
  lifecycleYes: 'Yes',
  lifecycleNo: 'No',
  lifecycleSupported: '{count} supported',
  lifecycleCheck_upcoming: '{version} belongs to {cycle}, released on {date}.',
  lifecycleCheck_active: '{version} is supported: bug and security fixes until {date}.',
  lifecycleCheck_activeOpen: '{version} is supported.',
  lifecycleCheck_security: '{version} gets security fixes only, until {date}.',
  lifecycleCheck_extended: '{version} reached its end of life on {date}; extended support goes on until {until}.', // prettier-ignore
  lifecycleCheck_eol: '{version} is no longer supported, since {date}.',
  lifecycleCheck_eolOpen: '{version} is no longer supported.',
  lifecycleCheckUnknown: 'No release cycle matches {version}.',
  lifecycleUpdate: 'The latest release of {cycle} is {latest}.',
  lifecycleRow: '{cycle}: {status}.',
  lifecycleShowEnded: 'Show {count} ended',
  lifecycleCopyCsv: 'Copy as CSV',
  lifecycleEmpty: 'No release cycle.',
  lifecycleShape: 'Expected endoflife.date JSON, or a list of release cycles.',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  lifecycleTable: 'Tableau',
  lifecycleSchedule: 'Calendrier',
  lifecycleVersion: 'Version',
  lifecycleStatus: 'État',
  lifecycleReleased: 'Sortie',
  lifecycleActive: 'Support actif',
  lifecycleSecurity: 'Support de sécurité',
  lifecycleLatest: 'Dernière',
  lifecycleToday: 'Aujourd’hui',
  lifecycleStatus_upcoming: 'À venir',
  lifecycleStatus_active: 'Supportée',
  lifecycleStatus_security: 'Correctifs de sécurité seulement',
  lifecycleStatus_extended: 'Support étendu',
  lifecycleStatus_eol: 'Fin de vie',
  lifecycleUntil: 'jusqu’au {date}',
  lifecycleEnded: 'terminé le {date}',
  lifecycleYes: 'Oui',
  lifecycleNo: 'Non',
  lifecycleSupported: '{count} supportées',
  lifecycleCheck_upcoming: '{version} appartient à {cycle}, qui sort le {date}.',
  lifecycleCheck_active: '{version} est supportée : correctifs et sécurité jusqu’au {date}.',
  lifecycleCheck_activeOpen: '{version} est supportée.',
  lifecycleCheck_security: '{version} ne reçoit que des correctifs de sécurité, jusqu’au {date}.',
  lifecycleCheck_extended: '{version} est en fin de vie depuis le {date} ; le support étendu dure jusqu’au {until}.', // prettier-ignore
  lifecycleCheck_eol: '{version} n’est plus supportée depuis le {date}.',
  lifecycleCheck_eolOpen: '{version} n’est plus supportée.',
  lifecycleCheckUnknown: 'Aucun cycle de version ne correspond à {version}.',
  lifecycleUpdate: 'La dernière version de {cycle} est {latest}.',
  lifecycleShowEnded: 'Afficher {count} terminées',
  lifecycleCopyCsv: 'Copier en CSV',
  lifecycleEmpty: 'Aucun cycle de version.',
  lifecycleShape: 'Du JSON d’endoflife.date, ou une liste de cycles de version, est attendu.',
};
