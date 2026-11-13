// @ts-check
/**
 * ES module that defines only <vt-sql> (dist/esm/vt-sql.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-sql.js"></script>
 */
import { VtSql } from '../components/sql/vt-sql.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-sql')) customElements.define('vt-sql', VtSql);

export { VtSql };
export * from './api.js';
