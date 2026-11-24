// @ts-check
/**
 * ES module that defines only <vt-skeleton> (dist/esm/vt-skeleton.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-skeleton.js"></script>
 */
import { VtSkeleton } from '../components/skeleton/vt-skeleton.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-skeleton')) customElements.define('vt-skeleton', VtSkeleton);

export { VtSkeleton };
export * from './api.js';
