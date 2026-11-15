// @ts-check
/**
 * ES module that defines only <vt-icon-picker> (dist/esm/vt-icon-picker.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-icon-picker.js"></script>
 */
import { VtIconPicker, registerIconSet } from '../components/icon-picker/vt-icon-picker.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-icon-picker')) customElements.define('vt-icon-picker', VtIconPicker);

export { VtIconPicker, registerIconSet };
export * from './api.js';
