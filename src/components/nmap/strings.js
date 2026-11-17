// @ts-check
/**
 * Interface strings of <vt-nmap>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/nmap/strings
 */

export const en = Object.freeze({
  nmapHosts: '{up} of {total} hosts up',
  nmapOpen: 'Open ports: {count}',
  nmapRiskyCount: 'Risky services exposed: {count}',
  nmapElapsed: 'in {seconds} s',
  nmapCommand: 'Command',
  nmapPort: 'Port',
  nmapState: 'State',
  nmapService: 'Service',
  nmapVersion: 'Version',
  nmapNoPorts: 'No port to show.',
  nmapHostScripts: 'Host scripts',
  nmapScripts: 'Scripts ({count})',
  nmapRisky: 'Exposed',
  nmapRiskyHint: 'This service is risky to expose to the Internet.',
  nmapTls: 'TLS',
  nmapLatency: 'Latency {value}',
  nmapMac: 'MAC {mac}',
  nmapOs: 'OS: {os}',
  nmapShowAll: 'Show closed and filtered ports',
  nmapShowOpen: 'Show open ports only',
  nmapCopyCsv: 'CSV',
  nmapCopyHosts: 'Copy hosts with open ports',
  nmapInvalidEmpty: 'No Nmap output.',
  nmapInvalidFormat: 'Not Nmap output: paste XML (-oX), normal (-oN) or grepable (-oG) output.',
  nmapInvalidXml: 'The XML cannot be read: {detail}',
  nmapStatus_up: 'Up',
  nmapStatus_down: 'Down',
  nmapState_open: 'Open',
  nmapState_closed: 'Closed',
  nmapState_filtered: 'Filtered',
  'nmapState_open|filtered': 'Open or filtered',
  'nmapState_closed|filtered': 'Closed or filtered',
  nmapState_unfiltered: 'Unfiltered',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  nmapHosts: '{up} hôtes actifs sur {total}',
  nmapOpen: 'Ports ouverts : {count}',
  nmapRiskyCount: 'Services risqués exposés : {count}',
  nmapElapsed: 'en {seconds} s',
  nmapCommand: 'Commande',
  nmapPort: 'Port',
  nmapState: 'État',
  nmapService: 'Service',
  nmapVersion: 'Version',
  nmapNoPorts: 'Aucun port à afficher.',
  nmapHostScripts: 'Scripts de l’hôte',
  nmapScripts: 'Scripts ({count})',
  nmapRisky: 'Exposé',
  nmapRiskyHint: 'Ce service est risqué s’il est exposé sur Internet.',
  nmapLatency: 'Latence {value}',
  nmapOs: 'Système : {os}',
  nmapShowAll: 'Afficher les ports fermés et filtrés',
  nmapShowOpen: 'Afficher seulement les ports ouverts',
  nmapCopyHosts: 'Copier les hôtes avec des ports ouverts',
  nmapInvalidEmpty: 'Aucune sortie Nmap.',
  nmapInvalidFormat:
    'Ce n’est pas une sortie Nmap : collez la sortie XML (-oX), normale (-oN) ou grepable (-oG).',
  nmapInvalidXml: 'Le XML ne peut pas être lu : {detail}',
  nmapStatus_up: 'Actif',
  nmapStatus_down: 'Inactif',
  nmapState_open: 'Ouvert',
  nmapState_closed: 'Fermé',
  nmapState_filtered: 'Filtré',
  'nmapState_open|filtered': 'Ouvert ou filtré',
  'nmapState_closed|filtered': 'Fermé ou filtré',
  nmapState_unfiltered: 'Non filtré',
};
