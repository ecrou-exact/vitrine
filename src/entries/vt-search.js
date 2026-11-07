// @ts-check
/**
 * ES module that defines only <vt-search> (dist/esm/vt-search.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-search.js"></script>
 */
import { VtSearch } from '../components/search/vt-search.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-search')) customElements.define('vt-search', VtSearch);

export { VtSearch };
export * from './api.js';
