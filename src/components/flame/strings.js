// @ts-check
/**
 * Interface strings of <vt-flame>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/flame/strings
 */

export const en = Object.freeze({
  flameGraph: 'Flame graph',
  flameFunctions: 'Functions',
  flameFunction: 'Function',
  flameSelf: 'Self',
  flameTotal: 'Total',
  flameFrames: 'Frames of the profile',
  flameZoom: 'Zoom',
  flameReset: 'All',
  flameFrame: '{name}, {total} ({percent}), self {self}',
  flameSamples: '{count} samples',
  flameSample: '1 sample',
  flameMatches: '{percent} of the time in frames that match',
  flameCopyFolded: 'Copy as folded stacks',
  flameNoMatch: 'No frames match.',
  flameInvalidEmpty: 'No profile.',
  flameInvalidFormat:
    'Expected folded stacks (a;b;c 12), a CPU profile (.cpuprofile) or a JSON tree { name, value, children }.',
  flameInvalidNoSamples: 'This profile has no samples.',
  flameInvalidJson: 'The JSON could not be read: {message}',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  flameGraph: 'Flame graph',
  flameFunctions: 'Fonctions',
  flameFunction: 'Fonction',
  flameSelf: 'Propre',
  flameTotal: 'Total',
  flameFrames: 'Cadres du profil',
  flameZoom: 'Zoom',
  flameReset: 'Tout',
  flameFrame: '{name}, {total} ({percent}), propre {self}',
  flameSamples: '{count} échantillons',
  flameSample: '1 échantillon',
  flameMatches: '{percent} du temps dans les cadres qui correspondent',
  flameCopyFolded: 'Copier en piles repliées',
  flameNoMatch: 'Aucun cadre ne correspond.',
  flameInvalidEmpty: 'Aucun profil.',
  flameInvalidFormat:
    'Piles repliées (a;b;c 12), un profil CPU (.cpuprofile) ou un arbre JSON { name, value, children } attendu.',
  flameInvalidNoSamples: 'Ce profil n’a aucun échantillon.',
  flameInvalidJson: 'Le JSON n’a pas pu être lu : {message}',
};
