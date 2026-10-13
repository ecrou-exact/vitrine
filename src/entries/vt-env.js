// @ts-check
/**
 * ES module that defines only <vt-env> (dist/esm/vt-env.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-env.js"></script>
 */
import { VtEnv } from '../components/env/vt-env.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-env')) customElements.define('vt-env', VtEnv);

export { VtEnv };
export * from './api.js';
