// @ts-check
/**
 * ES module that defines only <vt-password> (dist/esm/vt-password.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-password.js"></script>
 */
import { VtPassword } from '../components/password/vt-password.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-password')) customElements.define('vt-password', VtPassword);

export { VtPassword };
export * from './api.js';
