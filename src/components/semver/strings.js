// @ts-check
/**
 * Interface strings of <vt-semver>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/semver/strings
 */

export const en = Object.freeze({
  semverRange: 'Range',
  semverRangePlaceholder: '^1.2.3, ~2.1, >=1.4 <2, 1.x || 2.x',
  semverTest: 'Test a version',
  semverTestPlaceholder: '1.4.2',
  semverInvalid: '“{near}” is not a version or a range term.',
  semverInvalidLong: 'The range is too long.',
  semverInvalidVersion: '“{version}” is not a semantic version (major.minor.patch).',
  semverReadsAs: 'Matches',
  semverEither: 'Either:',
  semverBounds: 'Versions {bounds}',
  semverAll: 'every version',
  semverAnd: 'and',
  semverPart_any: 'any version',
  semverPart_exact: 'exactly {from}',
  semverPart_caretMajor:
    '{from} or later, without a new major version (below {below}): minor and patch updates',
  semverPart_caretMinor: '{from} or later within {minor}.x (below {below}): before 1.0.0, a minor version may break, so ^ allows patches only', // prettier-ignore
  semverPart_caretPatch: 'exactly {from}: ^ on a 0.0.x version allows nothing else (below {below})',
  semverPart_tilde: '{from} or later within {minor}.x (below {below}): patch updates',
  semverPart_tildeMajor: '{from} or later within {major}.x (below {below})',
  semverPart_xMajor: 'any {major}.x version',
  semverPart_xMinor: 'any {minor}.x version',
  semverPart_gt: 'later than {version}',
  semverPart_gte: '{version} or later',
  semverPart_lt: 'earlier than {version}',
  semverPart_lte: '{version} or earlier',
  semverPart_hyphen: 'from {from} to {to}, both included',
  semverWarning_empty: '“{set}” can match no version: its bounds cross.',
  semverWarning_any:
    '“{set}” accepts every version, including future major versions that may break.',
  semverWarning_unbounded: '“{set}” has no upper bound: a future major version that breaks the API would be installed.', // prettier-ignore
  semverWarning_noLow: '“{set}” has no lower bound: very old versions match.',
  semverWarning_pinned: '“{set}” pins one version: no security fix is picked up without an edit.',
  semverWarning_caretZero: '“{set}”: below 1.0.0, ^ is narrower than it looks.',
  semverWarning_prerelease:
    '“{set}” names a pre-release: pre-releases of that version only also match.',
  semverResolves: 'Installs {version}',
  semverNoMatch: 'No version matches.',
  semverMatches: '{count} of {total} versions match',
  semverLatest: 'The latest version, {version}, is outside the range ({change} update).',
  semverLatestIn: 'The latest version, {version}, is in the range.',
  semverChange_major: 'major',
  semverChange_minor: 'minor',
  semverChange_patch: 'patch',
  semverChange_prerelease: 'pre-release',
  semverChange_none: 'no',
  semverVersions: 'Versions',
  semverVersionsMore: '{count} more versions',
  semverInvalidVersions: 'Not versions: {list}',
  semverMatch: 'matches',
  semverNoMatchOne: 'does not match',
  semverTestYes: '{version} matches the range.',
  semverTestNo: '{version} does not match the range.',
  semverTestPre: '{version} is a pre-release: it only matches when the range names a pre-release of {base}.', // prettier-ignore
  semverPrerelease: 'pre-release',
  semverTag: '{tag}',
  semverCapped: 'Only the first {count} versions are read.',
  semverCopyRange: 'Copy the range',
  semverCopyMatches: 'Copy the matches',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  semverRange: 'Plage',
  semverTest: 'Tester une version',
  semverInvalid: '« {near} » n’est ni une version ni un terme de plage.',
  semverInvalidLong: 'La plage est trop longue.',
  semverInvalidVersion: '« {version} » n’est pas une version sémantique (majeure.mineure.correctif).', // prettier-ignore
  semverReadsAs: 'Accepte',
  semverEither: 'Au choix :',
  semverBounds: 'Versions {bounds}',
  semverAll: 'toutes les versions',
  semverAnd: 'et',
  semverPart_any: 'n’importe quelle version',
  semverPart_exact: 'exactement {from}',
  semverPart_caretMajor: '{from} ou plus récente, sans nouvelle version majeure (avant {below}) : mises à jour mineures et correctifs', // prettier-ignore
  semverPart_caretMinor: '{from} ou plus récente dans {minor}.x (avant {below}) : avant 1.0.0, une version mineure peut tout casser, donc ^ n’accepte que les correctifs', // prettier-ignore
  semverPart_caretPatch: 'exactement {from} : ^ sur une version 0.0.x n’accepte rien d’autre (avant {below})', // prettier-ignore
  semverPart_tilde: '{from} ou plus récente dans {minor}.x (avant {below}) : correctifs',
  semverPart_tildeMajor: '{from} ou plus récente dans {major}.x (avant {below})',
  semverPart_xMajor: 'n’importe quelle version {major}.x',
  semverPart_xMinor: 'n’importe quelle version {minor}.x',
  semverPart_gt: 'plus récente que {version}',
  semverPart_gte: '{version} ou plus récente',
  semverPart_lt: 'plus ancienne que {version}',
  semverPart_lte: '{version} ou plus ancienne',
  semverPart_hyphen: 'de {from} à {to}, incluses',
  semverWarning_empty: '« {set} » n’accepte aucune version : ses bornes se croisent.',
  semverWarning_any: '« {set} » accepte toutes les versions, y compris de futures versions majeures qui peuvent tout casser.', // prettier-ignore
  semverWarning_unbounded: '« {set} » n’a pas de borne haute : une future version majeure incompatible serait installée.', // prettier-ignore
  semverWarning_noLow:
    '« {set} » n’a pas de borne basse : de très vieilles versions correspondent.',
  semverWarning_pinned: '« {set} » fige une version : aucun correctif de sécurité n’arrive sans modification.', // prettier-ignore
  semverWarning_caretZero: '« {set} » : avant 1.0.0, ^ est plus étroit qu’il n’y paraît.',
  semverWarning_prerelease: '« {set} » nomme une préversion : seules les préversions de cette version correspondent aussi.', // prettier-ignore
  semverResolves: 'Installe {version}',
  semverNoMatch: 'Aucune version ne correspond.',
  semverMatches: '{count} versions sur {total} correspondent',
  semverLatest: 'La dernière version, {version}, est hors de la plage (mise à jour {change}).',
  semverLatestIn: 'La dernière version, {version}, est dans la plage.',
  semverChange_major: 'majeure',
  semverChange_minor: 'mineure',
  semverChange_patch: 'de correctif',
  semverChange_prerelease: 'de préversion',
  semverChange_none: 'nulle',
  semverVersions: 'Versions',
  semverVersionsMore: '{count} versions de plus',
  semverInvalidVersions: 'Pas des versions : {list}',
  semverMatch: 'correspond',
  semverNoMatchOne: 'ne correspond pas',
  semverTestYes: '{version} correspond à la plage.',
  semverTestNo: '{version} ne correspond pas à la plage.',
  semverTestPre: '{version} est une préversion : elle ne correspond que si la plage nomme une préversion de {base}.', // prettier-ignore
  semverPrerelease: 'préversion',
  semverCapped: 'Seules les {count} premières versions sont lues.',
  semverCopyRange: 'Copier la plage',
  semverCopyMatches: 'Copier les versions',
};
