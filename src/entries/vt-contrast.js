// @ts-check
/**
 * ES module that defines only <vt-contrast> (dist/esm/vt-contrast.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-contrast.js"></script>
 */
import { VtContrast } from '../components/contrast/vt-contrast.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-contrast')) customElements.define('vt-contrast', VtContrast);

export { VtContrast };
export * from './api.js';
