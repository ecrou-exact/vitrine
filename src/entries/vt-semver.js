// @ts-check
/**
 * ES module that defines only <vt-semver> (dist/esm/vt-semver.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-semver.js"></script>
 */
import { VtSemver } from '../components/semver/vt-semver.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-semver')) customElements.define('vt-semver', VtSemver);

export { VtSemver };
export * from './api.js';
