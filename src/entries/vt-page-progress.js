// @ts-check
/**
 * ES module that defines only <vt-page-progress> (dist/esm/vt-page-progress.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-page-progress.js"></script>
 */
import { VtPageProgress } from '../components/page-progress/vt-page-progress.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-page-progress'))
  customElements.define('vt-page-progress', VtPageProgress);

export { VtPageProgress };
export * from './api.js';
