// @ts-check
/**
 * ES module that defines only <vt-status> (dist/esm/vt-status.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-status.js"></script>
 */
import { VtStatus } from '../components/status/vt-status.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-status')) customElements.define('vt-status', VtStatus);

export { VtStatus };
export * from './api.js';
