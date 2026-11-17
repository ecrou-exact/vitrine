// @ts-check
/**
 * Interface strings of <vt-headers>, registered by its module with `defineStrings()`
 * so other modules do not carry them. Findings are `hdr_<id>`.
 *
 * @module components/headers/strings
 */

export const en = Object.freeze({
  hdrGrade: 'Grade {grade}',
  hdrSummary: '{bad} problems, {warn} warnings',
  hdrNotFetched: 'Read from the text only: nothing is fetched or sent.',
  hdrNone: 'No HTTP header found. Paste response headers, `curl -I` output or a Content-Security-Policy.', // prettier-ignore
  hdrFindings: 'Findings',
  hdrPolicy: 'Content-Security-Policy',
  hdrDirective: 'Directive',
  hdrSources: 'Sources',
  hdrHeaders: 'Headers ({count})',
  hdrName: 'Name',
  hdrValue: 'Value',
  hdrCopyReport: 'Copy report',
  hdrLevel_bad: 'Problem',
  hdrLevel_warn: 'Warning',
  hdrLevel_info: 'Note',
  hdrLevel_ok: 'Passed',
  hdr_hstsMissing:
    'No Strict-Transport-Security: browsers may reach the site over plain HTTP first.',
  hdr_hstsInvalid: 'Strict-Transport-Security has no max-age, so browsers ignore it.',
  hdr_hstsShort: 'HSTS lasts {days} days: use at least 180 days (max-age=15552000).',
  hdr_hstsOk: 'HTTPS is enforced for {days} days.',
  hdr_cspMissing: 'No Content-Security-Policy: injected scripts run without limit.',
  hdr_cspReportOnly: 'The policy is only reported (Report-Only): nothing is blocked.',
  hdr_cspNoScriptSrc: 'Neither script-src nor default-src: scripts from anywhere are allowed.',
  hdr_cspUnsafeInline: "'unsafe-inline' allows inline scripts: use nonces or hashes.",
  hdr_cspUnsafeEval: "'unsafe-eval' allows eval() and new Function().",
  hdr_cspWildcard: 'Scripts allowed from {source}: any site of it can serve a script.',
  hdr_cspObjectSrc: "object-src is not 'none': plugins may load content.",
  hdr_cspBaseUri: 'No base-uri: an injected <base> can redirect relative scripts.',
  hdr_cspOk: 'The policy restricts scripts, plugins and the base URL.',
  hdr_framingMissing: 'Neither X-Frame-Options nor frame-ancestors: the page can be framed (clickjacking).', // prettier-ignore
  hdr_xfoAllowFrom: 'X-Frame-Options ALLOW-FROM is ignored by browsers: use frame-ancestors.',
  hdr_xfoInvalid: 'X-Frame-Options accepts only DENY or SAMEORIGIN.',
  hdr_framingOk: 'Framing by other sites is restricted.',
  hdr_xctoMissing: 'No X-Content-Type-Options: nosniff, browsers may guess content types.',
  hdr_xctoInvalid: 'X-Content-Type-Options accepts only nosniff.',
  hdr_xctoOk: 'Content types are not guessed (nosniff).',
  hdr_referrerMissing: 'No Referrer-Policy: browsers use strict-origin-when-cross-origin.',
  hdr_referrerUnsafe: 'Referrer-Policy {value} sends full URLs to other sites.',
  hdr_referrerOk: 'Referrer-Policy: {value}.',
  hdr_permissionsMissing: 'No Permissions-Policy: camera, microphone and others are left to defaults.', // prettier-ignore
  hdr_permissionsOk: 'Browser features are restricted with Permissions-Policy.',
  hdr_coopMissing: 'No Cross-Origin-Opener-Policy: windows opened from other sites keep a reference.', // prettier-ignore
  hdr_coopOk: 'Cross-Origin-Opener-Policy isolates the browsing context.',
  hdr_cookieSecure: 'Cookie {name} is not Secure: it may be sent over plain HTTP.',
  hdr_cookieHttpOnly: 'Cookie {name} is not HttpOnly: scripts can read it.',
  hdr_cookieSameSite: 'Cookie {name} has no SameSite: browsers use Lax.',
  hdr_cookieSameSiteNone: 'Cookie {name} is SameSite=None without Secure: browsers reject it.',
  hdr_cookieHostPrefix: 'Cookie {name} needs Secure, Path=/ and no Domain for its __Host- prefix.',
  hdr_cookieSecurePrefix: 'Cookie {name} needs Secure for its __Secure- prefix.',
  hdr_cookieOk: 'Cookie {name} is Secure, HttpOnly and SameSite.',
  hdr_corsCredentials: 'Access-Control-Allow-Origin * with credentials: browsers refuse it, and it shows a misconfiguration.', // prettier-ignore
  hdr_corsWildcard: 'Any site can read these responses (Access-Control-Allow-Origin: *).',
  hdr_corsNull: 'Access-Control-Allow-Origin: null trusts sandboxed frames and local files.',
  hdr_serverVersion: 'Server tells its version ({value}): it helps attackers pick exploits.',
  hdr_poweredBy: 'The response names its software ({value}).',
  hdr_xxssEnabled: 'X-XSS-Protection is obsolete and can cause leaks: remove it or set it to 0.',
  hdr_hpkp: 'Public-Key-Pins is obsolete and ignored by browsers.',
  hdr_expectCt: 'Expect-CT is obsolete and ignored by browsers.',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  hdrGrade: 'Note {grade}',
  hdrSummary: '{bad} problèmes, {warn} avertissements',
  hdrNotFetched: 'Lu depuis le texte seulement : rien n’est téléchargé ni envoyé.',
  hdrNone: 'Aucun en-tête HTTP trouvé. Collez les en-têtes d’une réponse, la sortie de `curl -I` ou une Content-Security-Policy.', // prettier-ignore
  hdrFindings: 'Résultats',
  hdrDirective: 'Directive',
  hdrSources: 'Sources',
  hdrHeaders: 'En-têtes ({count})',
  hdrName: 'Nom',
  hdrValue: 'Valeur',
  hdrCopyReport: 'Copier le rapport',
  hdrLevel_bad: 'Problème',
  hdrLevel_warn: 'Avertissement',
  hdrLevel_info: 'Remarque',
  hdrLevel_ok: 'Correct',
  hdr_hstsMissing: 'Pas de Strict-Transport-Security : les navigateurs peuvent d’abord joindre le site en HTTP.', // prettier-ignore
  hdr_hstsInvalid: 'Strict-Transport-Security n’a pas de max-age : les navigateurs l’ignorent.',
  hdr_hstsShort: 'HSTS dure {days} jours : utilisez au moins 180 jours (max-age=15552000).',
  hdr_hstsOk: 'HTTPS est imposé pendant {days} jours.',
  hdr_cspMissing: 'Pas de Content-Security-Policy : un script injecté s’exécute sans limite.',
  hdr_cspReportOnly: 'La politique est seulement signalée (Report-Only) : rien n’est bloqué.',
  hdr_cspNoScriptSrc: 'Ni script-src ni default-src : les scripts de n’importe où sont permis.',
  hdr_cspUnsafeInline: "'unsafe-inline' permet les scripts en ligne : utilisez des nonces ou des empreintes.", // prettier-ignore
  hdr_cspUnsafeEval: "'unsafe-eval' permet eval() et new Function().",
  hdr_cspWildcard: 'Scripts permis depuis {source} : n’importe quel site concerné peut servir un script.', // prettier-ignore
  hdr_cspObjectSrc: "object-src n’est pas 'none' : des plugins peuvent charger du contenu.",
  hdr_cspBaseUri:
    'Pas de base-uri : une balise <base> injectée peut détourner les scripts relatifs.',
  hdr_cspOk: 'La politique limite les scripts, les plugins et l’URL de base.',
  hdr_framingMissing: 'Ni X-Frame-Options ni frame-ancestors : la page peut être intégrée dans un cadre (clickjacking).', // prettier-ignore
  hdr_xfoAllowFrom: 'X-Frame-Options ALLOW-FROM est ignoré par les navigateurs : utilisez frame-ancestors.', // prettier-ignore
  hdr_xfoInvalid: 'X-Frame-Options n’accepte que DENY ou SAMEORIGIN.',
  hdr_framingOk: 'L’intégration par d’autres sites est limitée.',
  hdr_xctoMissing: 'Pas de X-Content-Type-Options: nosniff : les navigateurs peuvent deviner les types.', // prettier-ignore
  hdr_xctoInvalid: 'X-Content-Type-Options n’accepte que nosniff.',
  hdr_xctoOk: 'Les types de contenu ne sont pas devinés (nosniff).',
  hdr_referrerMissing: 'Pas de Referrer-Policy : les navigateurs utilisent strict-origin-when-cross-origin.', // prettier-ignore
  hdr_referrerUnsafe: 'Referrer-Policy {value} envoie les URL complètes aux autres sites.',
  hdr_referrerOk: 'Referrer-Policy : {value}.',
  hdr_permissionsMissing: 'Pas de Permissions-Policy : caméra, micro et autres restent aux valeurs par défaut.', // prettier-ignore
  hdr_permissionsOk: 'Les fonctions du navigateur sont limitées par Permissions-Policy.',
  hdr_coopMissing: 'Pas de Cross-Origin-Opener-Policy : les fenêtres ouvertes par d’autres sites gardent une référence.', // prettier-ignore
  hdr_coopOk: 'Cross-Origin-Opener-Policy isole le contexte de navigation.',
  hdr_cookieSecure: 'Le cookie {name} n’est pas Secure : il peut partir en HTTP.',
  hdr_cookieHttpOnly: 'Le cookie {name} n’est pas HttpOnly : les scripts peuvent le lire.',
  hdr_cookieSameSite: 'Le cookie {name} n’a pas de SameSite : les navigateurs utilisent Lax.',
  hdr_cookieSameSiteNone: 'Le cookie {name} est SameSite=None sans Secure : les navigateurs le refusent.', // prettier-ignore
  hdr_cookieHostPrefix: 'Le cookie {name} doit être Secure, Path=/ et sans Domain pour son préfixe __Host-.', // prettier-ignore
  hdr_cookieSecurePrefix: 'Le cookie {name} doit être Secure pour son préfixe __Secure-.',
  hdr_cookieOk: 'Le cookie {name} est Secure, HttpOnly et SameSite.',
  hdr_corsCredentials: 'Access-Control-Allow-Origin * avec identifiants : les navigateurs le refusent, et cela trahit une erreur de configuration.', // prettier-ignore
  hdr_corsWildcard: 'N’importe quel site peut lire ces réponses (Access-Control-Allow-Origin: *).',
  hdr_corsNull: 'Access-Control-Allow-Origin: null fait confiance aux cadres isolés et aux fichiers locaux.', // prettier-ignore
  hdr_serverVersion: 'Le serveur donne sa version ({value}) : cela aide à choisir un exploit.',
  hdr_poweredBy: 'La réponse nomme son logiciel ({value}).',
  hdr_xxssEnabled: 'X-XSS-Protection est obsolète et peut causer des fuites : supprimez-le ou mettez 0.', // prettier-ignore
  hdr_hpkp: 'Public-Key-Pins est obsolète et ignoré par les navigateurs.',
  hdr_expectCt: 'Expect-CT est obsolète et ignoré par les navigateurs.',
};
