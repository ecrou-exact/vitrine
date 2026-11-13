// @ts-check
/**
 * Interface strings of <vt-test-report>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/test-report/strings
 */

export const en = Object.freeze({
  testsCount: '{count} tests',
  testsOne: '1 test',
  testsPassed: 'Passed',
  testsFailed: 'Failed',
  testsErrors: 'Errors',
  testsSkipped: 'Skipped',
  testsAll: 'All',
  testsStatus: 'Status',
  testsSummaryPassed: 'All {count} tests passed',
  testsSummaryFailed: '{failed} of {count} tests failed',
  testsSummaryNone: 'No tests were run',
  testsBar: '{passed} passed, {failed} failed, {skipped} skipped',
  testsStatusPassed: 'passed',
  testsStatusFailed: 'failed',
  testsStatusError: 'error',
  testsStatusSkipped: 'skipped',
  testsFlaky: 'Flaky',
  testsFlakyNote: 'Failed, then passed when run again',
  testsUnnamedSuite: 'Tests',
  testsDetails: 'Show details',
  testsHideDetails: 'Hide details',
  testsOutput: 'Output',
  testsStderr: 'Errors written',
  testsSlowest: 'Slowest first',
  testsInOrder: 'In order',
  testsCopyFailures: 'Copy failures',
  testsNoMatch: 'No tests match.',
  testsShowMore: 'Show {count} more tests',
  testsInvalidEmpty: 'The report is empty.',
  testsInvalidFormat:
    'This is not a test report: expected JUnit XML, TAP, or JSON from Jest, Vitest or Mocha.',
  testsInvalidJunit:
    'This XML is not a JUnit report: its root must be <testsuites> or <testsuite>.',
  testsInvalid: 'The report could not be read: {message}',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  testsCount: '{count} tests',
  testsOne: '1 test',
  testsPassed: 'Réussis',
  testsFailed: 'Échoués',
  testsErrors: 'Erreurs',
  testsSkipped: 'Ignorés',
  testsAll: 'Tous',
  testsStatus: 'État',
  testsSummaryPassed: 'Les {count} tests ont réussi',
  testsSummaryFailed: '{failed} tests sur {count} ont échoué',
  testsSummaryNone: 'Aucun test n’a été lancé',
  testsBar: '{passed} réussis, {failed} échoués, {skipped} ignorés',
  testsStatusPassed: 'réussi',
  testsStatusFailed: 'échoué',
  testsStatusError: 'erreur',
  testsStatusSkipped: 'ignoré',
  testsFlaky: 'Instable',
  testsFlakyNote: 'A échoué, puis réussi en le relançant',
  testsUnnamedSuite: 'Tests',
  testsDetails: 'Afficher les détails',
  testsHideDetails: 'Masquer les détails',
  testsOutput: 'Sortie',
  testsStderr: 'Erreurs écrites',
  testsSlowest: 'Les plus lents d’abord',
  testsInOrder: 'Dans l’ordre',
  testsCopyFailures: 'Copier les échecs',
  testsNoMatch: 'Aucun test ne correspond.',
  testsShowMore: 'Afficher {count} tests de plus',
  testsInvalidEmpty: 'Le rapport est vide.',
  testsInvalidFormat:
    'Ce n’est pas un rapport de tests : JUnit XML, TAP, ou JSON de Jest, Vitest ou Mocha attendu.',
  testsInvalidJunit:
    'Ce XML n’est pas un rapport JUnit : sa racine doit être <testsuites> ou <testsuite>.',
  testsInvalid: 'Le rapport n’a pas pu être lu : {message}',
};
