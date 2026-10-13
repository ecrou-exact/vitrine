// @ts-check
/**
 * ES module that defines only <vt-git> (dist/esm/vt-git.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-git.js"></script>
 */
import { VtGit } from '../components/git/vt-git.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-git')) customElements.define('vt-git', VtGit);

export { VtGit };
export * from './api.js';
