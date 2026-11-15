// @ts-check
/**
 * ES module that defines only <vt-download> (dist/esm/vt-download.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-download.js"></script>
 */
import { VtDownload } from '../components/download/vt-download.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-download')) customElements.define('vt-download', VtDownload);

export { VtDownload };
export * from './api.js';
