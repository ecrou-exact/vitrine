// @ts-check
/**
 * ES module that defines only <vt-treemap> (dist/esm/vt-treemap.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-treemap.js"></script>
 */
import { VtTreemap } from '../components/treemap/vt-treemap.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-treemap')) customElements.define('vt-treemap', VtTreemap);

export { VtTreemap };
export * from './api.js';
