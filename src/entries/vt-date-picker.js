// @ts-check
/**
 * ES module that defines only <vt-date-picker> (dist/esm/vt-date-picker.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-date-picker.js"></script>
 */
import { VtDatePicker } from '../components/date-picker/vt-date-picker.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-date-picker')) customElements.define('vt-date-picker', VtDatePicker);

export { VtDatePicker };
export * from './api.js';
