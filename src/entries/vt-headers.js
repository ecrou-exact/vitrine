// @ts-check
/**
 * ES module that defines only <vt-headers> (dist/esm/vt-headers.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-headers.js"></script>
 */
import { VtHeaders } from '../components/headers/vt-headers.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-headers')) customElements.define('vt-headers', VtHeaders);

export { VtHeaders };
export * from './api.js';
