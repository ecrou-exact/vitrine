// @ts-check
/**
 * ES module that defines only <vt-notebook> (dist/esm/vt-notebook.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-notebook.js"></script>
 */
import { VtNotebook } from '../components/notebook/vt-notebook.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-notebook')) customElements.define('vt-notebook', VtNotebook);

export { VtNotebook };
export * from './api.js';
