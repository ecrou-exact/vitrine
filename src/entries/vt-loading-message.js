// @ts-check
/**
 * ES module that defines only <vt-loading-message> (dist/esm/vt-loading-message.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-loading-message.js"></script>
 */
import { VtLoadingMessage } from '../components/loading-message/vt-loading-message.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-loading-message'))
  customElements.define('vt-loading-message', VtLoadingMessage);

export { VtLoadingMessage };
export * from './api.js';
