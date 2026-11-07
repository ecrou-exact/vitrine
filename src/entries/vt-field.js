// @ts-check
/**
 * ES module that defines only <vt-field> (dist/esm/vt-field.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-field.js"></script>
 */
import { VtField } from '../components/field/vt-field.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-field')) customElements.define('vt-field', VtField);

export { VtField };
export * from './api.js';
