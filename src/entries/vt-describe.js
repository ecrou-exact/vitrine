// @ts-check
/**
 * ES module that defines only <vt-describe> (dist/esm/vt-describe.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-describe.js"></script>
 */
import { VtDescribe } from '../components/describe/vt-describe.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-describe')) customElements.define('vt-describe', VtDescribe);

export { VtDescribe };
export * from './api.js';
