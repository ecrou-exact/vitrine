// @ts-check
/**
 * ES module that defines only <vt-dockerfile> (dist/esm/vt-dockerfile.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-dockerfile.js"></script>
 */
import { VtDockerfile } from '../components/dockerfile/vt-dockerfile.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-dockerfile')) customElements.define('vt-dockerfile', VtDockerfile);

export { VtDockerfile };
export * from './api.js';
