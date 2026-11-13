// @ts-check
/**
 * Interface strings of <vt-diagram>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/diagram/strings
 */

export const en = Object.freeze({
  diagram: 'Diagram',
  diagramSource: 'Source',
  diagramDrawing: 'Drawing the diagram…',
  diagramCopySource: 'Copy source',
  diagramDownloadSvg: 'Download SVG',
  diagramErrorTitle: 'This diagram could not be drawn.',
  diagramLoadFailed: 'The diagram renderer could not be loaded: the source is shown instead.',
  diagramUnsafe: 'The drawing was refused by the sanitizer.',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  diagram: 'Diagramme',
  diagramSource: 'Source',
  diagramDrawing: 'Dessin du diagramme…',
  diagramCopySource: 'Copier la source',
  diagramDownloadSvg: 'Télécharger le SVG',
  diagramErrorTitle: 'Ce diagramme n’a pas pu être dessiné.',
  diagramLoadFailed:
    'Le moteur de diagrammes n’a pas pu être chargé : la source est affichée à la place.',
  diagramUnsafe: 'Le dessin a été refusé par le nettoyage.',
};
