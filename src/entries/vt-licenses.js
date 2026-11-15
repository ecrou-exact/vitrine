// @ts-check
/**
 * ES module that defines only <vt-licenses> (dist/esm/vt-licenses.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-licenses.js"></script>
 */
import { VtLicenses } from '../components/licenses/vt-licenses.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-licenses')) customElements.define('vt-licenses', VtLicenses);

export { VtLicenses };
export * from './api.js';
