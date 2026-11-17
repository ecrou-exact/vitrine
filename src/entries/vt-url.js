// @ts-check
/**
 * ES module that defines only <vt-url> (dist/esm/vt-url.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-url.js"></script>
 */
import { VtUrl } from '../components/url/vt-url.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-url')) customElements.define('vt-url', VtUrl);

export { VtUrl };
export * from './api.js';
