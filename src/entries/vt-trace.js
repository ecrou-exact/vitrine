// @ts-check
/**
 * ES module that defines only <vt-trace> (dist/esm/vt-trace.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-trace.js"></script>
 */
import { VtTrace } from '../components/trace/vt-trace.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-trace')) customElements.define('vt-trace', VtTrace);

export { VtTrace };
export * from './api.js';
