// @ts-check
/**
 * ES module that defines only <vt-http> (dist/esm/vt-http.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-http.js"></script>
 */
import { VtHttp } from '../components/http/vt-http.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-http')) customElements.define('vt-http', VtHttp);

export { VtHttp };
export * from './api.js';
