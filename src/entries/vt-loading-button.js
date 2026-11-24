// @ts-check
/**
 * ES module that defines only <vt-loading-button> (dist/esm/vt-loading-button.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-loading-button.js"></script>
 */
import { VtLoadingButton } from '../components/loading-button/vt-loading-button.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-loading-button'))
  customElements.define('vt-loading-button', VtLoadingButton);

export { VtLoadingButton };
export * from './api.js';
