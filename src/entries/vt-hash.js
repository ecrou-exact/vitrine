// @ts-check
/**
 * ES module that defines only <vt-hash> (dist/esm/vt-hash.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-hash.js"></script>
 */
import { VtHash } from '../components/hash/vt-hash.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-hash')) customElements.define('vt-hash', VtHash);

export { VtHash };
export * from './api.js';
