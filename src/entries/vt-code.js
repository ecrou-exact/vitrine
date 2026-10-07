// @ts-check
/**
 * ES module that defines only <vt-code> (dist/esm/vt-code.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-code.js"></script>
 */
import { VtCode } from '../components/code/vt-code.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-code')) customElements.define('vt-code', VtCode);

export { VtCode };
export * from './api.js';
