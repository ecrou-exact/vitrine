// @ts-check
/**
 * ES module that defines only <vt-install> (dist/esm/vt-install.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-install.js"></script>
 */
import { VtInstall } from '../components/install/vt-install.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-install')) customElements.define('vt-install', VtInstall);

export { VtInstall };
export * from './api.js';
