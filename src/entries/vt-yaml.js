// @ts-check
/**
 * ES module that defines only <vt-yaml> (dist/esm/vt-yaml.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-yaml.js"></script>
 */
import { VtYaml } from '../components/yaml/vt-yaml.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-yaml')) customElements.define('vt-yaml', VtYaml);

export { VtYaml };
export * from './api.js';
