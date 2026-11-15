// @ts-check
/**
 * ES module that defines only <vt-changelog> (dist/esm/vt-changelog.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-changelog.js"></script>
 */
import { VtChangelog } from '../components/changelog/vt-changelog.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-changelog')) customElements.define('vt-changelog', VtChangelog);

export { VtChangelog };
export * from './api.js';
