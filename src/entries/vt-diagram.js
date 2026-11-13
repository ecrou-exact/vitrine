// @ts-check
/**
 * ES module that defines only <vt-diagram> (dist/esm/vt-diagram.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-diagram.js"></script>
 */
import { VtDiagram } from '../components/diagram/vt-diagram.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-diagram')) customElements.define('vt-diagram', VtDiagram);

export { VtDiagram };
export * from './api.js';
