// @ts-check
/**
 * ES module that defines only <vt-contributors> (dist/esm/vt-contributors.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-contributors.js"></script>
 */
import { VtContributors } from '../components/contributors/vt-contributors.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-contributors'))
  customElements.define('vt-contributors', VtContributors);

export { VtContributors };
export * from './api.js';
