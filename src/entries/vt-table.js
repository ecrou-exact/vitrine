// @ts-check
/**
 * ES module that defines only <vt-table> (dist/esm/vt-table.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-table.js"></script>
 */
import { VtTable } from '../components/table/vt-table.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-table')) customElements.define('vt-table', VtTable);

export { VtTable };
export * from './api.js';
