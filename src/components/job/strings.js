// @ts-check
/**
 * Interface strings of <vt-job>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/job/strings
 */

export const en = Object.freeze({
  jobInvalid: 'This job could not be read: {message}',
  jobProgress: 'Job progress',
  jobInProgress: 'In progress',
  jobSteps: '{done} of {total} steps',
  jobNoSteps: 'No steps yet.',
  jobNoMatch: 'No log line matches.',
  jobNoLog: 'No output.',
  jobCopyLog: 'Copy log',
  jobAnnounce: 'Job {status}',
  jobAnnounceStep: 'Running: {step}',
  jobStatusQueued: 'Queued',
  jobStatusRunning: 'Running',
  jobStatusSuccess: 'Succeeded',
  jobStatusFailure: 'Failed',
  jobStatusCancelled: 'Cancelled',
  jobStatusSkipped: 'Skipped',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  jobInvalid: 'Impossible de lire ce job : {message}',
  jobProgress: 'Progression du job',
  jobInProgress: 'En cours',
  jobSteps: '{done} étapes sur {total}',
  jobNoSteps: 'Aucune étape pour l’instant.',
  jobNoMatch: 'Aucune ligne de log ne correspond.',
  jobNoLog: 'Aucune sortie.',
  jobCopyLog: 'Copier le log',
  jobAnnounce: 'Job {status}',
  jobAnnounceStep: 'En cours : {step}',
  jobStatusQueued: 'En attente',
  jobStatusRunning: 'En cours',
  jobStatusSuccess: 'Réussi',
  jobStatusFailure: 'Échoué',
  jobStatusCancelled: 'Annulé',
  jobStatusSkipped: 'Ignoré',
};
