// @ts-check
/**
 * ES module that defines only <vt-waterfall> (dist/esm/vt-waterfall.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-waterfall.js"></script>
 */
import { VtWaterfall } from '../components/waterfall/vt-waterfall.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-waterfall')) customElements.define('vt-waterfall', VtWaterfall);

export { VtWaterfall };
export * from './api.js';
