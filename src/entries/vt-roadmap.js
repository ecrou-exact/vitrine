// @ts-check
/**
 * ES module that defines only <vt-roadmap> (dist/esm/vt-roadmap.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-roadmap.js"></script>
 */
import { VtRoadmap } from '../components/roadmap/vt-roadmap.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-roadmap')) customElements.define('vt-roadmap', VtRoadmap);

export { VtRoadmap };
export * from './api.js';
