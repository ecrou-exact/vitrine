// @ts-check
/**
 * ES module that defines only <vt-spinner> (dist/esm/vt-spinner.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-spinner.js"></script>
 */
import { VtSpinner } from '../components/spinner/vt-spinner.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-spinner')) customElements.define('vt-spinner', VtSpinner);

export { VtSpinner };
export * from './api.js';
