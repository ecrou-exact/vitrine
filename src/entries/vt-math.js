// @ts-check
/**
 * ES module that defines only <vt-math> (dist/esm/vt-math.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-math.js"></script>
 */
import { VtMath } from '../components/math/vt-math.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-math')) customElements.define('vt-math', VtMath);

export { VtMath };
export * from './api.js';
