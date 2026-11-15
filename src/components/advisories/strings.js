// @ts-check
/**
 * Interface strings of <vt-advisories>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/advisories/strings
 */

export const en = Object.freeze({
  advisoriesFilter: 'Severity',
  advisoriesAll: 'All',
  advisoriesCount: '{count} advisories',
  advisoriesOne: '1 advisory',
  advisoriesSeverity_critical: 'Critical',
  advisoriesSeverity_high: 'High',
  advisoriesSeverity_moderate: 'Moderate',
  advisoriesSeverity_low: 'Low',
  advisoriesSeverity_unknown: 'Unknown',
  advisoriesScore: 'CVSS {score}',
  advisoriesAffects: '{name} {range}',
  advisoriesInstalled: 'installed: {version}',
  advisoriesFixed: 'fixed in {version}',
  advisoriesNoFix: 'no fix yet',
  advisoriesPublished: 'Published {date}',
  advisoriesVector: 'Attack: {AV} · complexity {AC} · privileges {PR} · user interaction {UI} · scope {S}', // prettier-ignore
  advisoriesWeakness: 'Weakness',
  advisoriesRead: 'Read the advisory',
  advisoriesNone: 'No known vulnerability.',
  advisoriesNoMatch: 'No advisory of this severity.',
  advisoriesCopy: 'Copy as a Markdown table',
  advisoriesShape: 'Expected OSV records, npm audit, osv-scanner or GitHub advisories JSON.',
  advisoriesWord_network: 'network',
  advisoriesWord_adjacent: 'adjacent network',
  advisoriesWord_local: 'local',
  advisoriesWord_physical: 'physical',
  advisoriesWord_low: 'low',
  advisoriesWord_high: 'high',
  advisoriesWord_none: 'none',
  advisoriesWord_required: 'required',
  advisoriesWord_unchanged: 'unchanged',
  advisoriesWord_changed: 'changed',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  advisoriesFilter: 'Gravité',
  advisoriesAll: 'Toutes',
  advisoriesCount: '{count} alertes',
  advisoriesOne: '1 alerte',
  advisoriesSeverity_critical: 'Critique',
  advisoriesSeverity_high: 'Élevée',
  advisoriesSeverity_moderate: 'Moyenne',
  advisoriesSeverity_low: 'Faible',
  advisoriesSeverity_unknown: 'Inconnue',
  advisoriesInstalled: 'installée : {version}',
  advisoriesFixed: 'corrigée en {version}',
  advisoriesNoFix: 'pas encore de correctif',
  advisoriesPublished: 'Publiée le {date}',
  advisoriesVector: 'Attaque : {AV} · complexité {AC} · privilèges {PR} · interaction {UI} · portée {S}', // prettier-ignore
  advisoriesWeakness: 'Faiblesse',
  advisoriesRead: 'Lire l’alerte',
  advisoriesNone: 'Aucune vulnérabilité connue.',
  advisoriesNoMatch: 'Aucune alerte de cette gravité.',
  advisoriesCopy: 'Copier en tableau Markdown',
  advisoriesShape: 'Du JSON OSV, npm audit, osv-scanner ou d’alertes GitHub est attendu.',
  advisoriesWord_network: 'réseau',
  advisoriesWord_adjacent: 'réseau adjacent',
  advisoriesWord_local: 'locale',
  advisoriesWord_physical: 'physique',
  advisoriesWord_low: 'faible',
  advisoriesWord_high: 'élevée',
  advisoriesWord_none: 'aucun',
  advisoriesWord_required: 'requise',
  advisoriesWord_unchanged: 'inchangée',
  advisoriesWord_changed: 'changée',
};
