// @ts-check
/**
 * ES module that defines only <vt-sbom> (dist/esm/vt-sbom.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-sbom.js"></script>
 */
import { VtSbom } from '../components/sbom/vt-sbom.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-sbom')) customElements.define('vt-sbom', VtSbom);

export { VtSbom };
export * from './api.js';
