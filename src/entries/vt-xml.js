// @ts-check
/**
 * ES module that defines only <vt-xml> (dist/esm/vt-xml.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-xml.js"></script>
 */
import { VtXml } from '../components/xml/vt-xml.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-xml')) customElements.define('vt-xml', VtXml);

export { VtXml };
export * from './api.js';
