// @ts-check
/**
 * ES module that defines only <vt-typing> (dist/esm/vt-typing.js). Code shared with other
 * components is split into common chunks and loaded once.
 *
 * @example
 * <script type="module" src="https://cdn.jsdelivr.net/gh/ecrou-exact/vitrine@0/dist/esm/vt-typing.js"></script>
 */
import { VtTyping } from '../components/typing/vt-typing.js';
import { useAssetsFrom } from './assets.js';

useAssetsFrom(new URL('../', import.meta.url));
if (!customElements.get('vt-typing')) customElements.define('vt-typing', VtTyping);

export { VtTyping };
export * from './api.js';
