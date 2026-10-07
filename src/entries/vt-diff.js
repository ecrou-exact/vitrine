// @ts-check
/**
 * ES module that defines only <vt-diff> (dist/esm/vt-diff.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-diff.js"></script>
 */
import { VtDiff } from '../components/diff/vt-diff.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-diff')) customElements.define('vt-diff', VtDiff);

export { VtDiff };
export * from './api.js';
