// @ts-check
/**
 * ES module that defines only <vt-pivot> (dist/esm/vt-pivot.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-pivot.js"></script>
 */
import { VtPivot } from '../components/pivot/vt-pivot.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-pivot')) customElements.define('vt-pivot', VtPivot);

export { VtPivot };
export * from './api.js';
