// @ts-check
/**
 * ES module that defines only <vt-yara> (dist/esm/vt-yara.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-yara.js"></script>
 */
import { VtYara } from '../components/yara/vt-yara.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-yara')) customElements.define('vt-yara', VtYara);

export { VtYara };
export * from './api.js';
