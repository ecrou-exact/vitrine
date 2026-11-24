// @ts-check
/**
 * Interface strings of the loading indicators, registered with `defineStrings()` by their
 * shared base so other modules do not carry them.
 *
 * @module components/loading/strings
 */

export const en = Object.freeze({
  loadingLabel: 'Loading',
  loadingProgressLabel: 'Progress',
  loadingPageLabel: 'Page loading',
  loadingPercent: '{percent}%',
  loadingFraction: '{value} of {max}',
  loadingCancel: 'Cancel',
  loadingDone: 'Done',
  loadingFailed: 'Failed',
  loadingComplete: 'Complete',
  loadingElapsed: '{time} elapsed',
  loadingSlow: 'This is taking longer than usual…',
  loadingTyping: '{name} is typing…',
  loadingTypingTwo: '{names} are typing…',
  loadingTypingSomeone: 'Someone is typing…',
  loadingTypingMany: '{count} people are typing…',
  loadingStepOf: 'Step {current} of {total}',
  loadingStepsDone: '{done} of {total} done',
  loadingStepsTitle: 'Tasks',
  loadingStatus_pending: 'Pending',
  loadingStatus_running: 'Running',
  loadingStatus_done: 'Done',
  loadingStatus_error: 'Failed',
  loadingStatus_skipped: 'Skipped',
  loadingStatus_warning: 'Done with warnings',
});

/** @type {Readonly<Record<keyof typeof en, string>>} */
export const fr = Object.freeze({
  loadingLabel: 'Chargement',
  loadingProgressLabel: 'Progression',
  loadingPageLabel: 'Chargement de la page',
  loadingPercent: '{percent} %',
  loadingFraction: '{value} sur {max}',
  loadingCancel: 'Annuler',
  loadingDone: 'Terminé',
  loadingFailed: 'Échec',
  loadingComplete: 'Terminé',
  loadingElapsed: '{time} écoulées',
  loadingSlow: 'Cela prend plus de temps que d’habitude…',
  loadingTyping: '{name} est en train d’écrire…',
  loadingTypingTwo: '{names} sont en train d’écrire…',
  loadingTypingSomeone: 'Quelqu’un est en train d’écrire…',
  loadingTypingMany: '{count} personnes sont en train d’écrire…',
  loadingStepOf: 'Étape {current} sur {total}',
  loadingStepsDone: '{done} sur {total} terminées',
  loadingStepsTitle: 'Tâches',
  loadingStatus_pending: 'En attente',
  loadingStatus_running: 'En cours',
  loadingStatus_done: 'Terminée',
  loadingStatus_error: 'Échec',
  loadingStatus_skipped: 'Ignorée',
  loadingStatus_warning: 'Terminée avec des avertissements',
});
