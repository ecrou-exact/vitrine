// @ts-check
/**
 * ES module that defines only <vt-openapi> (dist/esm/vt-openapi.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-openapi.js"></script>
 */
import { VtOpenapi } from '../components/openapi/vt-openapi.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-openapi')) customElements.define('vt-openapi', VtOpenapi);

export { VtOpenapi };
export * from './api.js';
