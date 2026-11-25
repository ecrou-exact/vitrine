// @ts-check
/**
 * Interface strings of <vt-flowtime>, registered by its module with `defineStrings()` so other
 * modules do not carry them. The standalone Flowtime API uses the English table by default.
 *
 * @module components/flowtime/strings
 */

export const en = Object.freeze({
  flowtimeLabel: 'Event timeline',
  flowtimeViews: 'View',
  flowtimeSearch: 'Search events…',
  flowtimeSearchLabel: 'Search events',
  flowtimeActions: 'Timeline actions',
  flowtimeDetails: 'Event details',
  flowtimeEarlier: 'Earlier',
  flowtimeLater: 'Later',
  flowtimeZoomIn: 'Zoom in',
  flowtimeZoomOut: 'Zoom out',
  flowtimeFit: 'Fit events',
  flowtimeTextSize: 'Text size',
  flowtimeNoMatch: 'No matching events',
  flowtimeEmpty: 'Your timeline starts here',
  flowtimeAllEvents: 'All events',
  flowtimeOutside: 'Events are outside this time range.',
  flowtimeClose: 'Close event inspector',
  flowtimeEdit: 'Edit event',
  flowtimeDelete: 'Delete event',
  flowtimeNotes: 'Notes',
  flowtimeNoNotes: 'No additional notes for this event.',
  flowtimeContext: 'Context',
  flowtimeUntil: 'Until {date}',
  flowtimeActivityLabel: 'Filter events by activity',
  flowtimeActivity: 'Event activity',
  flowtimeAllDates: 'All dates',
  flowtimeShowAllDates: 'Show all dates',
  flowtimeActivityPeriods: 'Event activity periods',
  flowtimeAnyDate: 'Any date',
  flowtimeViewFailed: 'Unable to open {view}. Please try again.',
  flowtimeRetry: 'Retry',
});

export const fr = {
  flowtimeLabel: 'Chronologie des événements',
  flowtimeViews: 'Vue',
  flowtimeSearch: 'Rechercher des événements…',
  flowtimeSearchLabel: 'Rechercher des événements',
  flowtimeActions: 'Actions de la chronologie',
  flowtimeDetails: "Détails de l'événement",
  flowtimeEarlier: 'Plus tôt',
  flowtimeLater: 'Plus tard',
  flowtimeZoomIn: 'Zoomer',
  flowtimeZoomOut: 'Dézoomer',
  flowtimeFit: 'Ajuster aux événements',
  flowtimeTextSize: 'Taille du texte',
  flowtimeNoMatch: 'Aucun événement ne correspond',
  flowtimeEmpty: 'Votre chronologie commence ici',
  flowtimeAllEvents: 'Tous les événements',
  flowtimeOutside: 'Les événements sont hors de cette période.',
  flowtimeClose: "Fermer l'inspecteur",
  flowtimeEdit: "Modifier l'événement",
  flowtimeDelete: "Supprimer l'événement",
  flowtimeNotes: 'Notes',
  flowtimeNoNotes: "Pas d'autres notes pour cet événement.",
  flowtimeContext: 'Contexte',
  flowtimeUntil: "Jusqu'au {date}",
  flowtimeActivityLabel: 'Filtrer les événements par activité',
  flowtimeActivity: 'Activité des événements',
  flowtimeAllDates: 'Toutes les dates',
  flowtimeShowAllDates: 'Afficher toutes les dates',
  flowtimeActivityPeriods: "Périodes d'activité",
  flowtimeAnyDate: 'Toute date',
  flowtimeViewFailed: "Impossible d'ouvrir {view}. Veuillez réessayer.",
  flowtimeRetry: 'Réessayer',
};

/**
 * English text of a key, used by the standalone Flowtime API when no translator is given.
 *
 * @param {string} key
 * @param {Record<string, string>} [params]
 * @returns {string}
 */
export function english(key, params) {
  const template = /** @type {Record<string, string>} */ (en)[key] ?? key;
  return params ? template.replace(/\{(\w+)\}/g, (m, name) => params[name] ?? m) : template;
}
