// @ts-check
/**
 * Interface strings of <vt-hash>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/hash/strings
 */

export const en = Object.freeze({
  hashTextBadge: 'Text',
  hashFile: 'File',
  hashText: 'Text, {size} in UTF-8',
  hashPrompt: 'Type or paste a text, or choose a file.',
  hashPlaceholder: 'Text to hash',
  hashBackToText: 'Hash the text instead',
  hashDrop: 'Drop a file here, or',
  hashChoose: 'choose a file',
  hashDropNow: 'Drop the file to hash it',
  hashFileNote: 'The file is read in this page and sent nowhere.',
  hashTooLarge: 'The file is too large ({size}; at most {limit}).',
  hashReadFailed: 'The file could not be read.',
  hashTable: 'Hashes',
  hashComputing: 'Computing…',
  hashUnavailable: 'Needs a secure page (HTTPS)',
  hashNoCrypto: 'This page is not secure (HTTPS or localhost): only MD5 can be computed.',
  hashWeak: 'Weak',
  hashWeakHint: 'Collisions can be made: use it to find a file, not to prove it was not changed.',
  hashFormat: 'Format',
  hashFormat_hex: 'Hexadecimal',
  hashFormat_upper: 'Hexadecimal, upper case',
  hashFormat_base64: 'Base64',
  hashFormat_sri: 'Subresource Integrity',
  hashCompare: 'Compare with a fingerprint',
  hashComparePlaceholder: 'A hash, an SRI value or a sha256sum line',
  hashMatch: 'Matches the {algorithm}.',
  hashMismatch: 'Does not match the {algorithm}: the content is different.',
  hashInvalid: 'Not a fingerprint: paste a hash in hexadecimal or base64.',
  hashUnknown: 'A {algorithm} fingerprint, which is not computed here.',
  hashCopyOne: 'Copy the {algorithm}',
  hashCopyAll: 'Copy all',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  hashTextBadge: 'Texte',
  hashFile: 'Fichier',
  hashText: 'Texte, {size} en UTF-8',
  hashPrompt: 'Saisissez ou collez un texte, ou choisissez un fichier.',
  hashPlaceholder: 'Texte à hacher',
  hashBackToText: 'Hacher le texte à la place',
  hashDrop: 'Déposez un fichier ici, ou',
  hashChoose: 'choisissez un fichier',
  hashDropNow: 'Déposez le fichier pour le hacher',
  hashFileNote: 'Le fichier est lu dans cette page et n’est envoyé nulle part.',
  hashTooLarge: 'Le fichier est trop gros ({size} ; au plus {limit}).',
  hashReadFailed: 'Le fichier n’a pas pu être lu.',
  hashTable: 'Empreintes',
  hashComputing: 'Calcul…',
  hashUnavailable: 'Demande une page sécurisée (HTTPS)',
  hashNoCrypto: 'Cette page n’est pas sécurisée (HTTPS ou localhost) : seul MD5 peut être calculé.',
  hashWeak: 'Faible',
  hashWeakHint: 'Des collisions peuvent être créées : pour retrouver un fichier, pas pour prouver qu’il n’a pas été modifié.', // prettier-ignore
  hashFormat: 'Format',
  hashFormat_hex: 'Hexadécimal',
  hashFormat_upper: 'Hexadécimal, majuscules',
  hashFormat_base64: 'Base64',
  hashFormat_sri: 'Subresource Integrity',
  hashCompare: 'Comparer avec une empreinte',
  hashComparePlaceholder: 'Une empreinte, une valeur SRI ou une ligne sha256sum',
  hashMatch: 'Correspond au {algorithm}.',
  hashMismatch: 'Ne correspond pas au {algorithm} : le contenu est différent.',
  hashInvalid: 'Ce n’est pas une empreinte : collez une empreinte en hexadécimal ou en base64.',
  hashUnknown: 'Une empreinte {algorithm}, qui n’est pas calculée ici.',
  hashCopyOne: 'Copier le {algorithm}',
  hashCopyAll: 'Tout copier',
};
