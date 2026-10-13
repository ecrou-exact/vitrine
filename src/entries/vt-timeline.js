// @ts-check
/**
 * ES module that defines only <vt-timeline> (dist/esm/vt-timeline.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-timeline.js"></script>
 */
import { VtTimeline } from '../components/timeline/vt-timeline.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-timeline')) customElements.define('vt-timeline', VtTimeline);

export { VtTimeline };
export * from './api.js';
