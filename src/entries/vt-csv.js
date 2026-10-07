// @ts-check
/**
 * ES module that defines only <vt-csv> (dist/esm/vt-csv.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-csv.js"></script>
 */
import { VtCsv } from '../components/csv/vt-csv.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-csv')) customElements.define('vt-csv', VtCsv);

export { VtCsv };
export * from './api.js';
