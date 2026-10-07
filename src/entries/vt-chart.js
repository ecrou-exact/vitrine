// @ts-check
/**
 * ES module that defines only <vt-chart> (dist/esm/vt-chart.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-chart.js"></script>
 */
import { VtChart } from '../components/chart/vt-chart.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-chart')) customElements.define('vt-chart', VtChart);

export { VtChart };
export * from './api.js';
