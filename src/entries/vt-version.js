// @ts-check
/**
 * ES module that defines only <vt-version> (dist/esm/vt-version.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-version.js"></script>
 */
import { VtVersion } from '../components/version/vt-version.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-version')) customElements.define('vt-version', VtVersion);

export { VtVersion };
export * from './api.js';
