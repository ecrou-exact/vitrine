// @ts-check
/**
 * ES module that defines only <vt-jwt> (dist/esm/vt-jwt.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-jwt.js"></script>
 */
import { VtJwt } from '../components/jwt/vt-jwt.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-jwt')) customElements.define('vt-jwt', VtJwt);

export { VtJwt };
export * from './api.js';
