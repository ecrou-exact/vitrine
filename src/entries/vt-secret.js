// @ts-check
/**
 * ES module that defines only <vt-secret> (dist/esm/vt-secret.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-secret.js"></script>
 */
import { VtSecret } from '../components/secret/vt-secret.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-secret')) customElements.define('vt-secret', VtSecret);

export { VtSecret };
export * from './api.js';
