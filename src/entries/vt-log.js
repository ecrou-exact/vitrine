// @ts-check
/**
 * ES module that defines only <vt-log> (dist/esm/vt-log.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-log.js"></script>
 */
import { VtLog } from '../components/log/vt-log.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-log')) customElements.define('vt-log', VtLog);

export { VtLog };
export * from './api.js';
