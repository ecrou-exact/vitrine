// @ts-check
/**
 * Interface strings of <vt-licenses>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/licenses/strings
 */

export const en = Object.freeze({
  licensesByLicense: 'Licenses',
  licensesPackages: 'Packages',
  licensesFilter: 'Kind of license',
  licensesAll: 'All',
  licensesNotAllowed: 'Not allowed',
  licensesCount: '{count} packages',
  licensesOne: '1 package',
  licensesViolations: '{count} not allowed',
  licensesCategory_permissive: 'Permissive',
  licensesCategory_weak: 'Weak copyleft',
  licensesCategory_strong: 'Strong copyleft',
  licensesCategory_other: 'Other',
  licensesCategory_unknown: 'Unknown',
  licensesLicense: 'License',
  licensesKind: 'Kind',
  licensesPackage: 'Package',
  licensesVersion: 'Version',
  licensesGuessed: 'read from a license file, not declared',
  licensesShare: '{category}: {count} ({percent})',
  licensesAllowedAll: 'Every license is allowed.',
  licensesCopyCsv: 'Copy as CSV',
  licensesEmpty: 'No dependency.',
  licensesNoMatch: 'No dependency of this kind.',
  licensesShape: 'Expected a CycloneDX or SPDX SBOM, license-checker or pip-licenses JSON, or a list.', // prettier-ignore
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  licensesByLicense: 'Licences',
  licensesPackages: 'Paquets',
  licensesFilter: 'Type de licence',
  licensesAll: 'Toutes',
  licensesNotAllowed: 'Non autorisées',
  licensesCount: '{count} paquets',
  licensesOne: '1 paquet',
  licensesViolations: '{count} non autorisés',
  licensesCategory_permissive: 'Permissive',
  licensesCategory_weak: 'Copyleft faible',
  licensesCategory_strong: 'Copyleft fort',
  licensesCategory_other: 'Autre',
  licensesCategory_unknown: 'Inconnue',
  licensesLicense: 'Licence',
  licensesKind: 'Type',
  licensesPackage: 'Paquet',
  licensesGuessed: 'lue dans un fichier de licence, non déclarée',
  licensesAllowedAll: 'Toutes les licences sont autorisées.',
  licensesCopyCsv: 'Copier en CSV',
  licensesEmpty: 'Aucune dépendance.',
  licensesNoMatch: 'Aucune dépendance de ce type.',
  licensesShape: 'Un SBOM CycloneDX ou SPDX, du JSON de license-checker ou pip-licenses, ou une liste est attendu.', // prettier-ignore
};
