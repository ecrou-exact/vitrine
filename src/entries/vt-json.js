// @ts-check
/**
 * ES module that defines only <vt-json> (dist/esm/vt-json.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-json.js"></script>
 */
import { VtJson } from '../components/json/vt-json.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-json')) customElements.define('vt-json', VtJson);

export { VtJson };
export * from './api.js';
