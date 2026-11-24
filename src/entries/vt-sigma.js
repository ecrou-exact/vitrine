// @ts-check
/**
 * ES module that defines only <vt-sigma> (dist/esm/vt-sigma.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-sigma.js"></script>
 */
import { VtSigma } from '../components/sigma/vt-sigma.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-sigma')) customElements.define('vt-sigma', VtSigma);

export { VtSigma };
export * from './api.js';
