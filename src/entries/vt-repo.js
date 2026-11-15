// @ts-check
/**
 * ES module that defines only <vt-repo> (dist/esm/vt-repo.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-repo.js"></script>
 */
import { VtRepo } from '../components/repo/vt-repo.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-repo')) customElements.define('vt-repo', VtRepo);

export { VtRepo };
export * from './api.js';
