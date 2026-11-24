// @ts-check
/**
 * ES module that defines only <vt-progress-ring> (dist/esm/vt-progress-ring.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-progress-ring.js"></script>
 */
import { VtProgressRing } from '../components/progress-ring/vt-progress-ring.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-progress-ring'))
  customElements.define('vt-progress-ring', VtProgressRing);

export { VtProgressRing };
export * from './api.js';
