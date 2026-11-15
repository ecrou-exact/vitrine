// @ts-check
/**
 * ES module that defines only <vt-lifecycle> (dist/esm/vt-lifecycle.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-lifecycle.js"></script>
 */
import { VtLifecycle } from '../components/lifecycle/vt-lifecycle.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-lifecycle')) customElements.define('vt-lifecycle', VtLifecycle);

export { VtLifecycle };
export * from './api.js';
