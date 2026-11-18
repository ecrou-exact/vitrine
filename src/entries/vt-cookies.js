// @ts-check
/**
 * ES module that defines only <vt-cookies> (dist/esm/vt-cookies.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-cookies.js"></script>
 */
import { VtCookies } from '../components/cookies/vt-cookies.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-cookies')) customElements.define('vt-cookies', VtCookies);

export { VtCookies };
export * from './api.js';
