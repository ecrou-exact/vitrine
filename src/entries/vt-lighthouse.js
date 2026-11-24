// @ts-check
/**
 * ES module that defines only <vt-lighthouse> (dist/esm/vt-lighthouse.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-lighthouse.js"></script>
 */
import { VtLighthouse } from '../components/lighthouse/vt-lighthouse.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-lighthouse')) customElements.define('vt-lighthouse', VtLighthouse);

export { VtLighthouse };
export * from './api.js';
