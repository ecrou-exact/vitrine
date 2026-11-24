// @ts-check
/**
 * ES module that defines only <vt-a11y> (dist/esm/vt-a11y.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-a11y.js"></script>
 */
import { VtA11y } from '../components/a11y/vt-a11y.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-a11y')) customElements.define('vt-a11y', VtA11y);

export { VtA11y };
export * from './api.js';
