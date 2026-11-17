// @ts-check
/**
 * Interface strings of <vt-ioc>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/ioc/strings
 */

export const en = Object.freeze({
  iocCount: '{count} indicators',
  iocCountOne: '1 indicator',
  iocNone: 'No indicator found.',
  iocCapped: 'Only the first {count} indicators are shown.',
  iocAll: 'All',
  iocFilter: 'Indicator types',
  iocValue: 'Indicator',
  iocSeen: 'Seen',
  iocLine: 'Line',
  iocNoteHeader: 'Note',
  iocDefanged:
    'Defanged: links and addresses cannot be opened by accident. Nothing is resolved or fetched.',
  iocDefang: 'Defang',
  iocRefang: 'Show as found',
  iocCopyList: 'Copy list',
  iocCopyCsv: 'CSV',
  iocCopyStix: 'STIX',
  iocCopyMisp: 'MISP',
  iocType_url: 'URLs',
  iocType_domain: 'Domains',
  iocType_ipv4: 'IPv4 addresses',
  iocType_ipv6: 'IPv6 addresses',
  iocType_email: 'E-mail addresses',
  iocType_md5: 'MD5',
  iocType_sha1: 'SHA-1',
  iocType_sha256: 'SHA-256',
  iocType_sha512: 'SHA-512',
  iocType_cve: 'CVE',
  iocType_attack: 'ATT&CK techniques',
  iocNote_private: 'Private',
  iocNote_loopback: 'Loopback',
  'iocNote_link-local': 'Link-local',
  iocNote_shared: 'Shared (CGNAT)',
  iocNote_multicast: 'Multicast',
  iocNote_reserved: 'Reserved or documentation',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  iocCount: '{count} indicateurs',
  iocCountOne: '1 indicateur',
  iocNone: 'Aucun indicateur trouvé.',
  iocCapped: 'Seuls les {count} premiers indicateurs sont affichés.',
  iocAll: 'Tous',
  iocFilter: 'Types d’indicateurs',
  iocValue: 'Indicateur',
  iocSeen: 'Vu',
  iocLine: 'Ligne',
  iocNoteHeader: 'Note',
  iocDefanged:
    'Neutralisés : liens et adresses ne peuvent pas être ouverts par accident. Rien n’est résolu ni téléchargé.',
  iocDefang: 'Neutraliser',
  iocRefang: 'Afficher tels quels',
  iocCopyList: 'Copier la liste',
  iocType_url: 'URL',
  iocType_domain: 'Domaines',
  iocType_ipv4: 'Adresses IPv4',
  iocType_ipv6: 'Adresses IPv6',
  iocType_email: 'Adresses e-mail',
  iocType_attack: 'Techniques ATT&CK',
  iocNote_private: 'Privée',
  iocNote_loopback: 'Boucle locale',
  'iocNote_link-local': 'Lien local',
  iocNote_shared: 'Partagée (CGNAT)',
  iocNote_multicast: 'Multidiffusion',
  iocNote_reserved: 'Réservée ou documentation',
};
