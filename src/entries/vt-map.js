// @ts-check
/**
 * ES module that defines only <vt-map> (dist/esm/vt-map.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-map.js"></script>
 */
import { VtMap } from '../components/map/vt-map.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-map')) customElements.define('vt-map', VtMap);

export { VtMap };
export * from './api.js';
