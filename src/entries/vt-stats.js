// @ts-check
/**
 * ES module that defines only <vt-stats> (dist/esm/vt-stats.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-stats.js"></script>
 */
import { VtStats } from '../components/stats/vt-stats.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-stats')) customElements.define('vt-stats', VtStats);

export { VtStats };
export * from './api.js';
