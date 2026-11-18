// @ts-check
/**
 * ES module that defines only <vt-loading-overlay> (dist/esm/vt-loading-overlay.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-loading-overlay.js"></script>
 */
import { VtLoadingOverlay } from '../components/loading-overlay/vt-loading-overlay.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-loading-overlay'))
  customElements.define('vt-loading-overlay', VtLoadingOverlay);

export { VtLoadingOverlay };
export * from './api.js';
