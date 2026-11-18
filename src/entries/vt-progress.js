// @ts-check
/**
 * ES module that defines only <vt-progress> (dist/esm/vt-progress.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-progress.js"></script>
 */
import { VtProgress } from '../components/progress/vt-progress.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-progress')) customElements.define('vt-progress', VtProgress);

export { VtProgress };
export * from './api.js';
