// @ts-check
/**
 * Interface strings of <vt-cookies>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/cookies/strings
 */

export const en = Object.freeze({
  cookiesCount: '{count} cookies',
  cookiesThird: 'Third-party: {count}',
  cookiesSession: 'Session: {count}',
  cookiesIssues: '{bad} errors, {warn} warnings',
  cookiesSite: 'Compared with {site}',
  cookiesNotSent: 'Read only: nothing is sent or stored.',
  cookiesName: 'Name',
  cookiesValue: 'Value',
  cookiesScope: 'Domain and path',
  cookiesExpires: 'Expires',
  cookiesFlags: 'Flags',
  cookiesParty: 'Party',
  cookiesParty_first: 'First',
  cookiesParty_third: 'Third',
  cookiesPartyUnknown: '—',
  cookiesSessionLabel: 'Session',
  cookiesExpired: 'Expired',
  cookiesHostOnly: 'host only',
  cookiesSubdomains: 'and subdomains',
  cookiesNoName: '(no name)',
  cookiesFlagMissing: 'no {flag}',
  cookiesSetBy: 'Set by {url}',
  cookiesIssuesOnly: 'Show cookies with issues only',
  cookiesShowAll: 'Show every cookie',
  cookiesShowValues: 'Show values',
  cookiesHideValues: 'Hide values',
  cookiesValuesShown: 'Values shown',
  cookiesValuesHidden: 'Values hidden',
  cookiesCopyJson: 'JSON',
  cookiesCopyHeader: 'Copy as a Cookie header',
  cookiesNone: 'No cookie to show.',
  cookiesInvalidEmpty: 'No cookies.',
  cookiesInvalidFormat:
    'No cookie found: paste Set-Cookie headers, a Cookie header, a cookies.txt file, JSON or a HAR file.',
  cookiesInvalidJson: 'The JSON cannot be read: {detail}',
  cookiesLevel_bad: 'Error',
  cookiesLevel_warn: 'Warning',
  cookiesLevel_info: 'Note',
  cookiesIssue_hostPrefix:
    'The __Host- prefix requires Secure, Path=/ and no Domain: browsers reject this cookie.',
  cookiesIssue_foreignDomain:
    'Its Domain ({domain}) is not the host that set it ({setter}) nor a parent of it: browsers reject this cookie.',
  cookiesIssue_securePrefix: 'The __Secure- prefix requires Secure: browsers reject this cookie.',
  cookiesIssue_noneInsecure: 'SameSite=None requires Secure: browsers reject this cookie.',
  cookiesIssue_notSecure: 'Without Secure, the cookie is also sent over plain HTTP.',
  cookiesIssue_sessionReadable:
    'This looks like a session or a credential, and without HttpOnly any script on the page can read it.',
  cookiesIssue_scriptReadable: 'Without HttpOnly, scripts on the page can read it.',
  cookiesIssue_noSameSite: 'No SameSite: most browsers treat it as Lax.',
  cookiesIssue_tooLong: 'Its lifetime is over 400 days: browsers shorten it to 400 days.',
  cookiesIssue_tooLarge: 'Name and value exceed 4096 bytes: browsers ignore it.',
  cookiesIssue_deletion: 'Already expired: this deletes the cookie with this name.',
  cookiesIssue_wideDomain: 'The Domain attribute shares it with every subdomain of {domain}.',
  cookiesIssue_thirdPartyPersistent:
    'A third-party cookie kept for more than 30 days: often used to follow visitors across sites.',
});

/** @type {Readonly<Record<keyof typeof en, string>>} */
export const fr = Object.freeze({
  cookiesCount: '{count} cookies',
  cookiesThird: 'Tiers : {count}',
  cookiesSession: 'De session : {count}',
  cookiesIssues: '{bad} erreurs, {warn} avertissements',
  cookiesSite: 'Comparés avec {site}',
  cookiesNotSent: 'Lecture seule : rien n’est envoyé ni enregistré.',
  cookiesName: 'Nom',
  cookiesValue: 'Valeur',
  cookiesScope: 'Domaine et chemin',
  cookiesExpires: 'Expiration',
  cookiesFlags: 'Attributs',
  cookiesParty: 'Partie',
  cookiesParty_first: 'Propre',
  cookiesParty_third: 'Tiers',
  cookiesPartyUnknown: '—',
  cookiesSessionLabel: 'Session',
  cookiesExpired: 'Expiré',
  cookiesHostOnly: 'hôte seul',
  cookiesSubdomains: 'et sous-domaines',
  cookiesNoName: '(sans nom)',
  cookiesFlagMissing: 'sans {flag}',
  cookiesSetBy: 'Posé par {url}',
  cookiesIssuesOnly: 'Ne montrer que les cookies à problème',
  cookiesShowAll: 'Montrer tous les cookies',
  cookiesShowValues: 'Montrer les valeurs',
  cookiesHideValues: 'Masquer les valeurs',
  cookiesValuesShown: 'Valeurs affichées',
  cookiesValuesHidden: 'Valeurs masquées',
  cookiesCopyJson: 'JSON',
  cookiesCopyHeader: 'Copier comme en-tête Cookie',
  cookiesNone: 'Aucun cookie à afficher.',
  cookiesInvalidEmpty: 'Aucun cookie.',
  cookiesInvalidFormat:
    'Aucun cookie trouvé : collez des en-têtes Set-Cookie, un en-tête Cookie, un fichier cookies.txt, du JSON ou un fichier HAR.',
  cookiesInvalidJson: 'Le JSON ne peut pas être lu : {detail}',
  cookiesLevel_bad: 'Erreur',
  cookiesLevel_warn: 'Avertissement',
  cookiesLevel_info: 'Remarque',
  cookiesIssue_hostPrefix:
    'Le préfixe __Host- exige Secure, Path=/ et aucun Domain : les navigateurs refusent ce cookie.',
  cookiesIssue_foreignDomain:
    'Son Domain ({domain}) n’est ni l’hôte qui l’a posé ({setter}) ni un parent : les navigateurs refusent ce cookie.',
  cookiesIssue_securePrefix:
    'Le préfixe __Secure- exige Secure : les navigateurs refusent ce cookie.',
  cookiesIssue_noneInsecure: 'SameSite=None exige Secure : les navigateurs refusent ce cookie.',
  cookiesIssue_notSecure: 'Sans Secure, le cookie est aussi envoyé en HTTP non chiffré.',
  cookiesIssue_sessionReadable:
    'Il ressemble à une session ou à un identifiant, et sans HttpOnly n’importe quel script de la page peut le lire.',
  cookiesIssue_scriptReadable: 'Sans HttpOnly, les scripts de la page peuvent le lire.',
  cookiesIssue_noSameSite: 'Pas de SameSite : la plupart des navigateurs le traitent comme Lax.',
  cookiesIssue_tooLong: 'Sa durée dépasse 400 jours : les navigateurs la ramènent à 400 jours.',
  cookiesIssue_tooLarge: 'Nom et valeur dépassent 4096 octets : les navigateurs l’ignorent.',
  cookiesIssue_deletion: 'Déjà expiré : il supprime le cookie de ce nom.',
  cookiesIssue_wideDomain: 'L’attribut Domain le partage avec tous les sous-domaines de {domain}.',
  cookiesIssue_thirdPartyPersistent:
    'Un cookie tiers conservé plus de 30 jours : souvent utilisé pour suivre les visiteurs d’un site à l’autre.',
});
