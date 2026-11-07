// @ts-check
/**
 * ES module that defines only <vt-gallery> (dist/esm/vt-gallery.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-gallery.js"></script>
 */
import { VtGallery } from '../components/gallery/vt-gallery.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-gallery')) customElements.define('vt-gallery', VtGallery);

export { VtGallery };
export * from './api.js';
