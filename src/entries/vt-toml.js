// @ts-check
/**
 * ES module that defines only <vt-toml> (dist/esm/vt-toml.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-toml.js"></script>
 */
import { VtToml } from '../components/toml/vt-toml.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-toml')) customElements.define('vt-toml', VtToml);

export { VtToml };
export * from './api.js';
