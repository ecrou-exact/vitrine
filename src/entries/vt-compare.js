// @ts-check
/**
 * ES module that defines only <vt-compare> (dist/esm/vt-compare.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-compare.js"></script>
 */
import { VtCompare } from '../components/compare/vt-compare.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-compare')) customElements.define('vt-compare', VtCompare);

export { VtCompare };
export * from './api.js';
