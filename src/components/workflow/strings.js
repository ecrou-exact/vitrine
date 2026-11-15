// @ts-check
/**
 * Interface strings of <vt-workflow>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/workflow/strings
 */

export const en = Object.freeze({
  workflowStatus_queued: 'Queued',
  workflowStatus_running: 'In progress',
  workflowStatus_success: 'Success',
  workflowStatus_failure: 'Failed',
  workflowStatus_cancelled: 'Cancelled',
  workflowStatus_skipped: 'Skipped',
  workflowRun: 'Workflow run',
  workflowGraph: 'Jobs',
  workflowJob: '{name}: {status}',
  workflowCounts: '{success} succeeded, {failure} failed, {running} in progress',
  workflowTrigger: 'Event',
  workflowBranch: 'Branch',
  workflowCommit: 'Commit',
  workflowBy: 'by {actor}',
  workflowDuration: 'Total duration',
  workflowStarted: 'Started {time}',
  workflowNeeds: 'Needs {jobs}',
  workflowRunner: 'Runner: {runner}',
  workflowSteps: 'Steps of {name}',
  workflowOpen: 'Open the job',
  workflowNoLog: 'No log for this step.',
  workflowNoSteps: 'No steps.',
  workflowTruncated: 'Only the first {count} lines are shown.',
  workflowChoose: 'Choose a job to see its steps and logs.',
  workflowCopyLog: 'Copy the log',
  workflowShape: 'Expected a workflow run with "jobs" (GitHub Actions, GitLab, or your own JSON).',
  workflowEmpty: 'This run has no jobs.',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  workflowStatus_queued: 'En attente',
  workflowStatus_running: 'En cours',
  workflowStatus_success: 'Réussi',
  workflowStatus_failure: 'Échoué',
  workflowStatus_cancelled: 'Annulé',
  workflowStatus_skipped: 'Ignoré',
  workflowRun: 'Exécution du workflow',
  workflowGraph: 'Jobs',
  workflowCounts: '{success} réussis, {failure} échoués, {running} en cours',
  workflowTrigger: 'Événement',
  workflowBranch: 'Branche',
  workflowCommit: 'Commit',
  workflowBy: 'par {actor}',
  workflowDuration: 'Durée totale',
  workflowStarted: 'Démarré {time}',
  workflowNeeds: 'Attend {jobs}',
  workflowRunner: 'Runner : {runner}',
  workflowSteps: 'Étapes de {name}',
  workflowOpen: 'Ouvrir le job',
  workflowNoLog: 'Pas de journal pour cette étape.',
  workflowNoSteps: 'Aucune étape.',
  workflowTruncated: 'Seules les {count} premières lignes sont affichées.',
  workflowChoose: 'Choisissez un job pour voir ses étapes et ses journaux.',
  workflowCopyLog: 'Copier le journal',
  workflowShape: 'Une exécution de workflow avec "jobs" (GitHub Actions, GitLab, ou votre JSON) est attendue.', // prettier-ignore
  workflowEmpty: 'Cette exécution n’a aucun job.',
};
