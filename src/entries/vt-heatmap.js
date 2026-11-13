// @ts-check
/**
 * ES module that defines only <vt-heatmap> (dist/esm/vt-heatmap.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-heatmap.js"></script>
 */
import { VtHeatmap } from '../components/heatmap/vt-heatmap.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-heatmap')) customElements.define('vt-heatmap', VtHeatmap);

export { VtHeatmap };
export * from './api.js';
