// @ts-check
/**
 * ES module that defines only <vt-flame> (dist/esm/vt-flame.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-flame.js"></script>
 */
import { VtFlame } from '../components/flame/vt-flame.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-flame')) customElements.define('vt-flame', VtFlame);

export { VtFlame };
export * from './api.js';
