// @ts-check
/**
 * ES module that defines only <vt-tree> (dist/esm/vt-tree.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-tree.js"></script>
 */
import { VtTree } from '../components/tree/vt-tree.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-tree')) customElements.define('vt-tree', VtTree);

export { VtTree };
export * from './api.js';
