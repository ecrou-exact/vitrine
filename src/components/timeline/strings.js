// @ts-check
/**
 * Interface strings of <vt-timeline>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/timeline/strings
 */

export const en = Object.freeze({
  timelineInvalid: 'These events could not be read: {message}',
  timelineCount: '{count} events',
  timelineNoMatch: 'No event matches.',
  timelineKinds: 'Kinds',
  timelineAll: 'All',
  timelineNewest: 'Newest first',
  timelineOldest: 'Oldest first',
  timelineCopyJson: 'Copy as JSON',
  timelineMore: 'Show more',
  timelineLess: 'Show less',
  timelineKindInfo: 'Info',
  timelineKindSuccess: 'Success',
  timelineKindWarning: 'Warning',
  timelineKindDanger: 'Danger',
  timelineKindRelease: 'Release',
  timelineKindNeutral: 'Other',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  timelineInvalid: 'Impossible de lire ces événements : {message}',
  timelineCount: '{count} événements',
  timelineNoMatch: 'Aucun événement ne correspond.',
  timelineKinds: 'Types',
  timelineAll: 'Tous',
  timelineNewest: 'Plus récents d’abord',
  timelineOldest: 'Plus anciens d’abord',
  timelineCopyJson: 'Copier en JSON',
  timelineMore: 'Afficher plus',
  timelineLess: 'Afficher moins',
  timelineKindInfo: 'Info',
  timelineKindSuccess: 'Succès',
  timelineKindWarning: 'Avertissement',
  timelineKindDanger: 'Danger',
  timelineKindRelease: 'Version',
  timelineKindNeutral: 'Autre',
};
