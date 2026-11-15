// @ts-check
/**
 * ES module that defines only <vt-advisories> (dist/esm/vt-advisories.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-advisories.js"></script>
 */
import { VtAdvisories } from '../components/advisories/vt-advisories.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-advisories')) customElements.define('vt-advisories', VtAdvisories);

export { VtAdvisories };
export * from './api.js';
