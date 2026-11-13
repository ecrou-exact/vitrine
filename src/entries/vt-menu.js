// @ts-check
/**
 * ES module that defines only <vt-menu> (dist/esm/vt-menu.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-menu.js"></script>
 */
import { VtMenu } from '../components/menu/vt-menu.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-menu')) customElements.define('vt-menu', VtMenu);

export { VtMenu };
export * from './api.js';
