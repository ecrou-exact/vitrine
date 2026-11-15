// @ts-check
/**
 * ES module that defines only <vt-access-log> (dist/esm/vt-access-log.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-access-log.js"></script>
 */
import { VtAccessLog } from '../components/access-log/vt-access-log.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-access-log')) customElements.define('vt-access-log', VtAccessLog);

export { VtAccessLog };
export * from './api.js';
