// @ts-check
/**
 * ES module that defines only <vt-upload> (dist/esm/vt-upload.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-upload.js"></script>
 */
import { VtUpload } from '../components/upload/vt-upload.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-upload')) customElements.define('vt-upload', VtUpload);

export { VtUpload };
export * from './api.js';
