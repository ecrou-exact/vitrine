// @ts-check
/**
 * ES module that defines only <vt-terminal> (dist/esm/vt-terminal.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@1/dist/esm/vt-terminal.js"></script>
 */
import { VtTerminal } from '../components/terminal/vt-terminal.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-terminal')) customElements.define('vt-terminal', VtTerminal);

export { VtTerminal };
export * from './api.js';
