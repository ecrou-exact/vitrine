// @ts-check
/**
 * ES module that defines only <vt-ioc> (dist/esm/vt-ioc.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-ioc.js"></script>
 */
import { VtIoc } from '../components/ioc/vt-ioc.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-ioc')) customElements.define('vt-ioc', VtIoc);

export { VtIoc };
export * from './api.js';
