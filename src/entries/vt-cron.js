// @ts-check
/**
 * ES module that defines only <vt-cron> (dist/esm/vt-cron.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-cron.js"></script>
 */
import { VtCron } from '../components/cron/vt-cron.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-cron')) customElements.define('vt-cron', VtCron);

export { VtCron };
export * from './api.js';
