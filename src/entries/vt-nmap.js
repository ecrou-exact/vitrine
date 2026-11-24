// @ts-check
/**
 * ES module that defines only <vt-nmap> (dist/esm/vt-nmap.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-nmap.js"></script>
 */
import { VtNmap } from '../components/nmap/vt-nmap.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-nmap')) customElements.define('vt-nmap', VtNmap);

export { VtNmap };
export * from './api.js';
