// @ts-check
/**
 * Interface strings of <vt-math>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/math/strings
 */

export const en = Object.freeze({
  mathEquation: 'Equation {index}',
  mathEquations: '{count} equations',
  mathCopyTex: 'Copy TeX',
  mathCopyMathml: 'Copy MathML',
  mathError: 'This TeX could not be read: {message}',
  mathLoadFailed: 'The math renderer could not be loaded: the TeX is shown as it is written.',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  mathEquation: 'Équation {index}',
  mathEquations: '{count} équations',
  mathCopyTex: 'Copier le TeX',
  mathCopyMathml: 'Copier le MathML',
  mathError: 'Ce TeX n’a pas pu être lu : {message}',
  mathLoadFailed:
    'Le moteur de formules n’a pas pu être chargé : le TeX est affiché tel qu’il est écrit.',
};
