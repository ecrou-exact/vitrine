// @ts-check
/**
 * ES module that defines only <vt-cert> (dist/esm/vt-cert.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-cert.js"></script>
 */
import { VtCert } from '../components/cert/vt-cert.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-cert')) customElements.define('vt-cert', VtCert);

export { VtCert };
export * from './api.js';
