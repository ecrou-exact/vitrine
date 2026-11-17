// @ts-check
/**
 * ES module that defines only <vt-cvss> (dist/esm/vt-cvss.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-cvss.js"></script>
 */
import { VtCvss } from '../components/cvss/vt-cvss.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-cvss')) customElements.define('vt-cvss', VtCvss);

export { VtCvss };
export * from './api.js';
