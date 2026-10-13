// @ts-check
/**
 * ES module that defines only <vt-regex> (dist/esm/vt-regex.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-regex.js"></script>
 */
import { VtRegex } from '../components/regex/vt-regex.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-regex')) customElements.define('vt-regex', VtRegex);

export { VtRegex };
export * from './api.js';
