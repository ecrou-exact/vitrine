// @ts-check
/**
 * ES module that defines only <vt-hex> (dist/esm/vt-hex.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-hex.js"></script>
 */
import { VtHex } from '../components/hex/vt-hex.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-hex')) customElements.define('vt-hex', VtHex);

export { VtHex };
export * from './api.js';
