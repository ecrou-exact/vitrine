// @ts-check
/**
 * ES module that defines only <vt-tags> (dist/esm/vt-tags.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-tags.js"></script>
 */
import { VtTags } from '../components/tags/vt-tags.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-tags')) customElements.define('vt-tags', VtTags);

export { VtTags };
export * from './api.js';
