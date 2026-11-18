// @ts-check
/**
 * ES module that defines only <vt-loading-steps> (dist/esm/vt-loading-steps.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-loading-steps.js"></script>
 */
import { VtLoadingSteps } from '../components/loading-steps/vt-loading-steps.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-loading-steps'))
  customElements.define('vt-loading-steps', VtLoadingSteps);

export { VtLoadingSteps };
export * from './api.js';
