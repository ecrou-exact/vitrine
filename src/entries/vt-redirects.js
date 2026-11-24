// @ts-check
/**
 * ES module that defines only <vt-redirects> (dist/esm/vt-redirects.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-redirects.js"></script>
 */
import { VtRedirects } from '../components/redirects/vt-redirects.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-redirects')) customElements.define('vt-redirects', VtRedirects);

export { VtRedirects };
export * from './api.js';
